import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

const GATEWAY_CREDITS_URL = "https://ai-gateway.vercel.sh/v1/credits";

export const config = {
  maxDuration: 10,
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function safeAmount(value: unknown): string | null {
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);

  if ((req.method || "GET").toUpperCase() !== "GET") {
    sendJson(res, 405, { error: "Method not allowed", requestId });
    return;
  }

  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const directOpenAI = Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  );
  const result: Record<string, unknown> = {
    runtime: "vercel-node",
    generatedAt: new Date().toISOString(),
    deploymentRevision: process.env.VERCEL_GIT_COMMIT_SHA || null,
    directOpenAIConfigured: directOpenAI,
    vercelOidcAvailable: Boolean(oidcToken),
    aiGatewayAutomaticUse: false,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    redisConfigured: Boolean(process.env.REDIS_URL),
    requestId,
    secretsExposed: false,
  };

  if (!oidcToken) {
    result.aiGatewayCredits = {
      reachable: false,
      authenticated: false,
      balance: null,
      totalUsed: null,
      reason: "VERCEL_OIDC_TOKEN is not available to this deployment.",
    };
    sendJson(res, 200, result);
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(GATEWAY_CREDITS_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${oidcToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      // Never surface opaque upstream bodies from an authenticated billing endpoint.
    }

    result.aiGatewayCredits = {
      reachable: true,
      authenticated: response.ok,
      status: response.status,
      balance: response.ok ? safeAmount(body.balance) : null,
      totalUsed: response.ok ? safeAmount(body.total_used) : null,
      automaticSpendEnabledByGem: false,
    };
  } catch {
    result.aiGatewayCredits = {
      reachable: false,
      authenticated: false,
      balance: null,
      totalUsed: null,
      reason: "Gateway credit probe failed without exposing provider details.",
    };
  }

  sendJson(res, 200, result);
}
