import OpenAI from "openai";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

type RequestLike = IncomingMessage & {
  body?: unknown;
};

type ResponseLike = ServerResponse & {
  status?: (code: number) => ResponseLike;
  json?: (body: unknown) => void;
};

type ChatStorageModule = typeof import("../server/replit_integrations/chat/storage");

const CHAT_MODEL = process.env.AI_AGENT_CHAT_MODEL || "gpt-5.2";
const QUALITY_MODE = process.env.AI_AGENT_QUALITY_MODE || "balanced";
const MAX_COMPLETION_TOKENS = Math.max(
  512,
  Math.min(16384, Number(process.env.AI_AGENT_MAX_COMPLETION_TOKENS || 8192)),
);
const MAX_CONTEXT_MESSAGES = Math.max(
  4,
  Math.min(80, Number(process.env.AI_AGENT_MAX_CONTEXT_MESSAGES || 40)),
);
const MAX_CONTEXT_CHARS = Math.max(
  8_000,
  Math.min(200_000, Number(process.env.AI_AGENT_MAX_CONTEXT_CHARS || 80_000)),
);
const MAX_BODY_BYTES = 1_000_000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_EXPENSIVE_REQUESTS = Math.max(
  4,
  Math.min(100, Number(process.env.AI_AGENT_RATE_LIMIT || 20)),
);

let storagePromise: Promise<ChatStorageModule> | null = null;
let openAIClient: OpenAI | null = null;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function aiApiKey(): string | undefined {
  return (
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    undefined
  );
}

function runtimeState() {
  const database = Boolean(process.env.DATABASE_URL);
  const ai = Boolean(aiApiKey());
  const redis = Boolean(process.env.REDIS_URL);

  return {
    database,
    ai,
    redis,
    chatReady: database && ai,
    inlineAgentReady: ai,
    queuedAgentDependenciesReady: database && ai && redis,
    queuedAutonomousAgentReady: false,
    queuedAgentReason:
      "The Vercel request runtime does not prove that a separate long-running BullMQ worker is active.",
  };
}

function requestId(req: RequestLike): string {
  const supplied = req.headers["x-request-id"];
  const value = Array.isArray(supplied) ? supplied[0] : supplied;
  return value && /^[A-Za-z0-9._:-]{1,96}$/.test(value) ? value : randomUUID();
}

function setRequestHeaders(res: ResponseLike, traceId: string) {
  res.setHeader("X-Request-Id", traceId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(res: ResponseLike, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sendSse(res: ResponseLike, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function getOpenAI(): OpenAI {
  if (openAIClient) return openAIClient;
  const apiKey = aiApiKey();
  if (!apiKey) throw new Error("AI provider is not configured in this deployment");

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;
  openAIClient = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  return openAIClient;
}

async function getStorage() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Database dependency is not configured");
  }
  storagePromise ??= import("../server/replit_integrations/chat/storage");
  const module = await storagePromise;
  return module.chatStorage;
}

async function readJsonBody(req: RequestLike): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === "object") {
    return req.body as Record<string, unknown>;
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function normalizedPath(req: RequestLike): string {
  const origin = `https://${req.headers.host || "localhost"}`;
  const parsed = new URL(req.url || "/", origin);
  const routedPath = parsed.searchParams.get("path");
  if (routedPath !== null) {
    return `/api/${routedPath.replace(/^\/+/, "")}`.replace(/\/+$/, "") || "/api";
  }
  return parsed.pathname.replace(/\/+$/, "") || "/";
}

function parseConversationId(pathname: string): number | null {
  const match = pathname.match(/^\/api\/conversations\/(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseMessageConversationId(pathname: string): number | null {
  const match = pathname.match(/^\/api\/conversations\/(\d+)\/messages$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function deterministicTitle(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) return "New Chat";
  return compact.split(" ").slice(0, 5).join(" ").slice(0, 60) || "New Chat";
}

function unavailablePayload(feature: string, traceId: string) {
  const state = runtimeState();
  const missing: string[] = [];
  if ((feature === "chat" || feature === "conversations") && !state.database) {
    missing.push("database");
  }
  if ((feature === "chat" || feature === "inline-agent" || feature === "queued-agent") && !state.ai) {
    missing.push("AI provider");
  }
  if (feature === "queued-agent" && !state.redis) missing.push("Redis");
  if (feature === "queued-agent") missing.push("verified background worker");

  return {
    error: "Runtime dependency unavailable",
    feature,
    missing: [...new Set(missing)],
    retryable: true,
    requestId: traceId,
    secretsExposed: false,
  };
}

function remoteKey(req: RequestLike): string {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (forwardedValue?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown").slice(0, 128);
}

function allowExpensiveRequest(req: RequestLike): boolean {
  const now = Date.now();
  const key = remoteKey(req);
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_MAX_EXPENSIVE_REQUESTS) return false;
  current.count += 1;
  if (rateBuckets.size > 2_000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }
  return true;
}

function trimConversationMessages(
  messages: Array<{ role: string; content: string }>,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const selected: Array<{ role: string; content: string }> = [];
  let chars = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (selected.length >= MAX_CONTEXT_MESSAGES) break;
    const message = messages[index];
    const content = String(message.content || "");
    if (selected.length > 0 && chars + content.length > MAX_CONTEXT_CHARS) break;
    selected.push({ role: message.role, content });
    chars += content.length;
  }

  return selected.reverse().map((message) => ({
    role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: message.content,
  }));
}

async function createChatCompletion(
  traceId: string,
  body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
) {
  return getOpenAI().chat.completions.create(body, {
    headers: { "X-Client-Request-Id": traceId },
  });
}

async function createChatStream(
  traceId: string,
  body: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
) {
  return getOpenAI().chat.completions.create(body, {
    headers: { "X-Client-Request-Id": traceId },
  });
}

const GEM_SYSTEM_PROMPT = `You are GEM Autonomous Agent, a high-performance senior software-engineering and operations assistant. Deliver complete, usable work with explicit verification. Distinguish observed execution from proposals. Never claim that a deployment, repository write, test, secret change, financial action, DNS change, database mutation, trade, withdrawal, or external-system mutation occurred unless direct evidence in the current run proves it. Treat consequential production actions as approval-gated. Protect secrets and private data. Prefer deterministic checks and concise evidence over confidence theater. When something cannot be verified, say exactly what remains unverified.`;

async function handleConversationMessage(
  req: RequestLike,
  res: ResponseLike,
  conversationId: number,
  traceId: string,
) {
  const state = runtimeState();
  if (!state.chatReady) {
    sendJson(res, 503, unavailablePayload("chat", traceId));
    return;
  }
  if (!allowExpensiveRequest(req)) {
    sendJson(res, 429, { error: "AI request rate limit reached", retryable: true, requestId: traceId });
    return;
  }

  const body = await readJsonBody(req);
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    sendJson(res, 400, { error: "Message content is required", requestId: traceId });
    return;
  }
  if (content.length > 50_000) {
    sendJson(res, 413, { error: "Message is too large", requestId: traceId });
    return;
  }

  const storage = await getStorage();
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    sendJson(res, 404, { error: "Conversation not found", requestId: traceId });
    return;
  }

  await storage.createMessage(conversationId, "user", content);
  const existingMessages = await storage.getMessagesByConversation(conversationId);

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  sendSse(res, {
    status: "generating",
    step: "Building a verified response…",
    requestId: traceId,
    tasks: [
      { id: "1", name: "Analyze request", status: "complete" },
      { id: "2", name: "Generate solution", status: "running" },
      { id: "3", name: "Evidence check", status: "pending" },
    ],
    currentTaskId: "2",
  });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: GEM_SYSTEM_PROMPT },
    ...trimConversationMessages(existingMessages),
  ];

  const stream = await createChatStream(traceId, {
    model: CHAT_MODEL,
    messages,
    stream: true,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
  });

  let fullResponse = "";
  for await (const chunk of stream) {
    if (res.destroyed) break;
    const delta = chunk.choices[0]?.delta?.content || "";
    if (!delta) continue;
    fullResponse += delta;
    sendSse(res, { content: delta });
  }

  if (fullResponse.trim()) {
    await storage.createMessage(conversationId, "assistant", fullResponse);
  }

  if (existingMessages.length === 1) {
    const title = deterministicTitle(content);
    await storage.updateConversationTitle(conversationId, title);
    sendSse(res, { titleUpdate: title });
  }

  sendSse(res, {
    tasks: [
      { id: "1", name: "Analyze request", status: "complete" },
      { id: "2", name: "Generate solution", status: "complete" },
      { id: "3", name: "Evidence check", status: "complete" },
    ],
  });
  sendSse(res, { done: true, status: "complete", requestId: traceId });
  res.end();
}

async function handleInlineAgent(
  req: RequestLike,
  res: ResponseLike,
  traceId: string,
) {
  if (!runtimeState().inlineAgentReady) {
    sendJson(res, 503, unavailablePayload("inline-agent", traceId));
    return;
  }
  if (!allowExpensiveRequest(req)) {
    sendJson(res, 429, { error: "AI request rate limit reached", retryable: true, requestId: traceId });
    return;
  }

  const body = await readJsonBody(req);
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (!goal) {
    sendJson(res, 400, { error: "Goal is required", requestId: traceId });
    return;
  }
  if (goal.length > 20_000) {
    sendJson(res, 413, { error: "Goal is too large", requestId: traceId });
    return;
  }

  const prompt = `Goal: ${goal}\n\nReturn ONLY JSON with this shape:\n{"plan":["step 1","step 2"],"answer":"complete result","verification":{"confidence":0,"evidence":["..."],"unverified":["..."]}}\n\nUse at most 8 plan steps. This inline mode has reasoning capability but no external tool execution. Never claim an action was executed. Give the strongest useful answer possible within that boundary.`;

  const completion = await createChatCompletion(traceId, {
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: GEM_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: Math.min(MAX_COMPLETION_TOKENS, 6000),
  });

  const raw = completion.choices[0]?.message?.content?.trim() || "";
  let result: unknown;
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    result = JSON.parse(fenced || raw);
  } catch {
    result = {
      plan: [],
      answer: raw,
      verification: {
        confidence: null,
        evidence: [],
        unverified: ["Structured verification output could not be parsed."],
      },
    };
  }

  sendJson(res, 200, {
    mode: "inline-safe-reasoning",
    executionAuthority: "NONE",
    externalToolsExecuted: false,
    model: CHAT_MODEL,
    qualityMode: QUALITY_MODE,
    requestId: traceId,
    result,
  });
}

function opsFallback(pathname: string) {
  const generatedAt = new Date().toISOString();
  if (pathname === "/api/ops/capabilities") {
    return {
      mode: "read-only",
      pcIndependent: true,
      liveMutationEnabled: false,
      remediationAuthority: "PREPARE_ONLY",
      releaseDecisionAuthority: "ADVISE_ONLY",
      automaticPaidUpgradeAllowed: false,
      runtime: runtimeState(),
      message: "Vercel preview API bridge is active. Scheduled controller state activates after the protected default-branch release gate.",
    };
  }
  if (pathname === "/api/ops/summary") {
    return {
      schemaVersion: 2,
      generatedAt,
      overallState: "NOT_INITIALIZED",
      counts: { checked: 0, healthy: 0, degraded: 0, failed: 0, skipped: 0 },
      materialChanges: 0,
      resolved: 0,
      remoteRequests: 0,
      billingGuard: "never-provision-paid-resources",
      message: "Preview API is online; persisted scheduled sentinel state is not active on this draft branch.",
    };
  }
  if (pathname === "/api/ops/cost-summary") {
    return {
      schemaVersion: 1,
      generatedAt,
      overallState: "NOT_INITIALIZED",
      repositoriesChecked: 0,
      requestsUsed: 0,
      totals: { vercelContexts: 0, rateLimitedContexts: 0, duplicateContexts: 0 },
      automaticUpgradeAllowed: false,
      message: "Cost guard awaits a persisted controller cycle.",
    };
  }
  if (pathname === "/api/ops/remediation-summary") {
    return {
      schemaVersion: 2,
      generatedAt,
      sourceOverallState: "NOT_INITIALIZED",
      sourceCostState: "NOT_INITIALIZED",
      executionAuthority: "PREPARE_ONLY",
      totalTasks: 0,
      operationalTasks: 0,
      costTasks: 0,
      counts: { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 },
      message: "No persisted remediation cycle exists in this preview runtime.",
    };
  }
  if (pathname === "/api/ops/release-readiness") {
    return {
      schemaVersion: 1,
      generatedAt,
      state: "NOT_INITIALIZED",
      blockers: 0,
      warnings: 0,
      authority: "ADVISE_ONLY",
      automaticMergeAllowed: false,
      automaticDeploymentAllowed: false,
      message: "Draft preview is not production activation evidence.",
    };
  }
  if (pathname === "/api/ops/history") {
    return {
      schemaVersion: 1,
      updatedAt: generatedAt,
      retainedRuns: 0,
      publicWindow: 7,
      trend: "NOT_INITIALIZED",
      latest: null,
      recent: [],
      message: "No persisted scheduled history exists in this preview runtime.",
    };
  }
  if (pathname === "/api/ops/audit-summary") {
    return {
      schemaVersion: 1,
      updatedAt: generatedAt,
      integrity: "NOT_INITIALIZED",
      eventCount: 0,
      appended: false,
      headHash: null,
      failedIndex: null,
      failureReason: null,
      latest: null,
      message: "Audit ledger will be populated by the protected controller cycle.",
    };
  }
  if (pathname === "/api/ops/operator-review") {
    return {
      schemaVersion: 1,
      generatedAt,
      eligibleForReview: false,
      executionAuthority: "NONE",
      approvalRecorded: false,
      packageDigest: null,
      expiresAt: null,
      message: "An evidence-bound review package will be generated by the protected controller cycle.",
    };
  }
  return null;
}

export const config = {
  maxDuration: 60,
};

export default async function handler(req: RequestLike, res: ResponseLike) {
  const traceId = requestId(req);
  setRequestHeaders(res, traceId);
  const pathname = normalizedPath(req);
  const method = (req.method || "GET").toUpperCase();

  try {
    if (method === "GET" && pathname === "/api/runtime/health") {
      const state = runtimeState();
      sendJson(res, 200, {
        status: state.chatReady ? "ready" : state.inlineAgentReady ? "partial" : "degraded",
        runtime: "vercel-node",
        generatedAt: new Date().toISOString(),
        dependencies: state,
        modelConfigured: CHAT_MODEL,
        qualityMode: QUALITY_MODE,
        contextLimits: { messages: MAX_CONTEXT_MESSAGES, characters: MAX_CONTEXT_CHARS },
        requestId: traceId,
        secretsExposed: false,
        message: state.chatReady
          ? "Core conversation and streamed AI response runtime is configured."
          : "Web runtime is online, but one or more private dependencies still need deployment configuration.",
      });
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/ops/")) {
      const payload = opsFallback(pathname);
      if (payload) {
        sendJson(res, 200, payload);
        return;
      }
    }

    if (pathname === "/api/conversations") {
      if (!runtimeState().database) {
        sendJson(res, 503, unavailablePayload("conversations", traceId));
        return;
      }
      const storage = await getStorage();
      if (method === "GET") {
        sendJson(res, 200, await storage.getAllConversations());
        return;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const title =
          typeof body.title === "string" && body.title.trim()
            ? body.title.trim().slice(0, 120)
            : "New Chat";
        sendJson(res, 201, await storage.createConversation(title));
        return;
      }
    }

    const messageConversationId = parseMessageConversationId(pathname);
    if (messageConversationId !== null && method === "POST") {
      await handleConversationMessage(req, res, messageConversationId, traceId);
      return;
    }

    const conversationId = parseConversationId(pathname);
    if (conversationId !== null) {
      if (!runtimeState().database) {
        sendJson(res, 503, unavailablePayload("conversations", traceId));
        return;
      }
      const storage = await getStorage();
      if (method === "GET") {
        const conversation = await storage.getConversation(conversationId);
        if (!conversation) {
          sendJson(res, 404, { error: "Conversation not found", requestId: traceId });
          return;
        }
        const messages = await storage.getMessagesByConversation(conversationId);
        sendJson(res, 200, { ...conversation, messages });
        return;
      }
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
        if (!title) {
          sendJson(res, 400, { error: "Conversation title is required", requestId: traceId });
          return;
        }
        const updated = await storage.updateConversationTitle(conversationId, title);
        if (!updated) {
          sendJson(res, 404, { error: "Conversation not found", requestId: traceId });
          return;
        }
        sendJson(res, 200, updated);
        return;
      }
      if (method === "DELETE") {
        await storage.deleteConversation(conversationId);
        res.statusCode = 204;
        res.end();
        return;
      }
    }

    if (pathname === "/api/agent/inline" && method === "POST") {
      await handleInlineAgent(req, res, traceId);
      return;
    }

    if (pathname === "/api/agent/tools" && method === "GET") {
      const state = runtimeState();
      sendJson(res, 200, {
        executionMode: "preview-safe",
        available: [
          "conversation",
          "streamed_ai_response",
          "inline_safe_reasoning",
          "code_generation",
          "web_preview",
        ],
        inlineAgentReady: state.inlineAgentReady,
        queuedAgentDependenciesReady: state.queuedAgentDependenciesReady,
        queuedAutonomousAgentReady: state.queuedAutonomousAgentReady,
        productionMutation: false,
        requestId: traceId,
        message: state.queuedAgentDependenciesReady
          ? "Queue dependencies are present, but a separate active worker still requires verification."
          : "Core streamed chat and inline reasoning do not require Redis. The queued background worker remains separately gated.",
      });
      return;
    }

    if (pathname.startsWith("/api/agent")) {
      sendJson(res, 503, unavailablePayload("queued-agent", traceId));
      return;
    }

    sendJson(res, 404, { error: "API route not found", path: pathname, requestId: traceId });
  } catch (error) {
    const bodyTooLarge = error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE";
    console.error(`Vercel API bridge request ${traceId} failed`, error);

    if (res.headersSent) {
      try {
        sendSse(res, {
          error: "Runtime request failed",
          requestId: traceId,
          done: true,
          status: "failed",
        });
        res.end();
      } catch {
        res.end();
      }
      return;
    }

    sendJson(res, bodyTooLarge ? 413 : 500, {
      error: bodyTooLarge ? "Request body is too large" : "Runtime request failed",
      requestId: traceId,
      retryable: !bodyTooLarge,
    });
  }
}
