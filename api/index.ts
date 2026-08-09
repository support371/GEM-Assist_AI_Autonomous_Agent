import OpenAI from "openai";
import type { IncomingMessage, ServerResponse } from "node:http";

type RequestLike = IncomingMessage & {
  body?: unknown;
};

type ResponseLike = ServerResponse & {
  status?: (code: number) => ResponseLike;
  json?: (body: unknown) => void;
};

type ChatStorageModule = typeof import("../server/replit_integrations/chat/storage");

const CHAT_MODEL = process.env.AI_AGENT_CHAT_MODEL || "gpt-5.2";
const MAX_COMPLETION_TOKENS = Math.max(
  512,
  Math.min(16384, Number(process.env.AI_AGENT_MAX_COMPLETION_TOKENS || 8192)),
);

let storagePromise: Promise<ChatStorageModule> | null = null;
let openAIClient: OpenAI | null = null;

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
    queuedAutonomousAgentReady: database && ai && redis,
  };
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
  if (!apiKey) {
    throw new Error("AI provider is not configured in this deployment");
  }

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;
  openAIClient = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  return openAIClient;
}

async function getStorage() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured in this deployment");
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
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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
  const words = compact.split(" ").slice(0, 5).join(" ");
  return words.slice(0, 60) || "New Chat";
}

function unavailablePayload(feature: string) {
  const state = runtimeState();
  const missing: string[] = [];
  if (!state.database) missing.push("database");
  if (!state.ai) missing.push("AI provider");
  if (feature === "queued-agent" && !state.redis) missing.push("Redis/worker queue");

  return {
    error: "Runtime dependency unavailable",
    feature,
    missing,
    retryable: true,
    message:
      missing.length > 0
        ? `This preview is missing: ${missing.join(", ")}. No secret values are exposed.`
        : "The requested runtime feature is not available in this deployment.",
  };
}

async function handleConversationMessage(
  req: RequestLike,
  res: ResponseLike,
  conversationId: number,
) {
  const state = runtimeState();
  if (!state.chatReady) {
    sendJson(res, 503, unavailablePayload("chat"));
    return;
  }

  const body = await readJsonBody(req);
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    sendJson(res, 400, { error: "Message content is required" });
    return;
  }
  if (content.length > 50_000) {
    sendJson(res, 413, { error: "Message is too large" });
    return;
  }

  const storage = await getStorage();
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    sendJson(res, 404, { error: "Conversation not found" });
    return;
  }

  await storage.createMessage(conversationId, "user", content);
  const existingMessages = await storage.getMessagesByConversation(conversationId);

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const tasks = [
    { id: "1", name: "Analyze request", status: "complete" },
    { id: "2", name: "Generate solution", status: "running" },
    { id: "3", name: "Finalize", status: "pending" },
  ];
  sendSse(res, {
    status: "generating",
    step: "Building the response…",
    tasks,
    currentTaskId: "2",
  });

  const systemPrompt = `You are GEM Autonomous Agent, a senior software-engineering assistant. Produce complete, usable work rather than placeholders. Be precise about what was actually executed versus what is only proposed. Never claim that a deployment, repository write, secret change, financial action, or external system mutation happened unless there is direct execution evidence. Keep consequential production changes approval-gated.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...existingMessages.map((message) => ({
      role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: message.content,
    })),
  ];

  const stream = await getOpenAI().chat.completions.create({
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
      { id: "3", name: "Finalize", status: "complete" },
    ],
  });
  sendSse(res, { done: true, status: "complete" });
  res.end();
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
  return null;
}

export const config = {
  maxDuration: 60,
};

export default async function handler(req: RequestLike, res: ResponseLike) {
  const pathname = normalizedPath(req);
  const method = (req.method || "GET").toUpperCase();

  try {
    if (method === "GET" && pathname === "/api/runtime/health") {
      const state = runtimeState();
      sendJson(res, 200, {
        status: state.chatReady ? "ready" : "degraded",
        runtime: "vercel-node",
        generatedAt: new Date().toISOString(),
        dependencies: state,
        modelConfigured: CHAT_MODEL,
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
        sendJson(res, 503, unavailablePayload("conversations"));
        return;
      }
      const storage = await getStorage();
      if (method === "GET") {
        sendJson(res, 200, await storage.getAllConversations());
        return;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        const title = typeof body.title === "string" && body.title.trim()
          ? body.title.trim().slice(0, 120)
          : "New Chat";
        sendJson(res, 201, await storage.createConversation(title));
        return;
      }
    }

    const messageConversationId = parseMessageConversationId(pathname);
    if (messageConversationId !== null && method === "POST") {
      await handleConversationMessage(req, res, messageConversationId);
      return;
    }

    const conversationId = parseConversationId(pathname);
    if (conversationId !== null) {
      if (!runtimeState().database) {
        sendJson(res, 503, unavailablePayload("conversations"));
        return;
      }
      const storage = await getStorage();
      if (method === "GET") {
        const conversation = await storage.getConversation(conversationId);
        if (!conversation) {
          sendJson(res, 404, { error: "Conversation not found" });
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
          sendJson(res, 400, { error: "Conversation title is required" });
          return;
        }
        const updated = await storage.updateConversationTitle(conversationId, title);
        if (!updated) {
          sendJson(res, 404, { error: "Conversation not found" });
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

    if (pathname === "/api/agent/tools" && method === "GET") {
      sendJson(res, 200, {
        executionMode: "preview-safe",
        available: ["conversation", "streamed_ai_response", "code_generation", "web_preview"],
        queuedAutonomousAgentReady: runtimeState().queuedAutonomousAgentReady,
        productionMutation: false,
        message: runtimeState().redis
          ? "Redis is configured; background-worker activation remains separately gated."
          : "Background queue/worker is not configured in this Vercel preview. Core streamed chat does not require Redis.",
      });
      return;
    }

    if (pathname.startsWith("/api/agent")) {
      sendJson(res, 503, unavailablePayload("queued-agent"));
      return;
    }

    sendJson(res, 404, { error: "API route not found", path: pathname });
  } catch (error) {
    console.error("Vercel API bridge error:", error);
    if (res.headersSent) {
      try {
        sendSse(res, {
          error: error instanceof Error ? error.message : "Runtime request failed",
          done: true,
          status: "failed",
        });
        res.end();
      } catch {
        res.end();
      }
      return;
    }
    sendJson(res, 500, {
      error: "Runtime request failed",
      message: error instanceof Error ? error.message : "Unknown runtime error",
    });
  }
}
