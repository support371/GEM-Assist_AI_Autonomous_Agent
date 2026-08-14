import fs from "node:fs";
import assert from "node:assert/strict";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function includes(source, needle, message) {
  assert.ok(source.includes(needle), message || `Expected source to include: ${needle}`);
}

function excludes(source, needle, message) {
  assert.ok(!source.includes(needle), message || `Expected source not to include: ${needle}`);
}

const engine = read("server/agent/engine.ts");
const tools = read("server/agent/tools.ts");
const types = read("server/agent/types.ts");
const memory = read("server/agent/memory.ts");
const redis = read("server/agent/redis.ts");
const queue = read("server/agent/queue.ts");
const worker = read("server/agent/worker.ts");
const server = read("server/index.ts");
const api = read("api/index.ts");
const runtimeProbe = read("api/runtime-probe.ts");
const vercel = JSON.parse(read("vercel.json"));
const sentinelWorkflow = read(".github/workflows/gem-cloud-ops-sentinel.yml");
const reviewPackage = read("scripts/gem-ops-review-package.mjs");
const pkg = JSON.parse(read("package.json"));

includes(engine, "if (result.ok)", "Agent engine must consume ToolResult.ok");
excludes(engine, "result.success", "Legacy ToolOutput.success contract must not be used by the engine");
excludes(engine, "result.result", "Legacy ToolOutput.result contract must not be used by the engine");
includes(tools, "export const toolRegistry", "Tool registry must be exported for engine capability discovery");
includes(tools, "export function getToolDescriptions", "Tool descriptions must be exported for planning");

includes(engine, 'trustMode: "fail-closed"');
includes(engine, "Verification response could not be validated");
includes(engine, "minReflectionConfidence");
includes(engine, "Stopping to prevent cascading unsupported work");
includes(engine, "goal.id", "Resumed goals must preserve the original goal identity");
includes(engine, "details: result.error.details ?? null", "Tool failures should preserve bounded diagnostics for repair quality");
includes(types, 'trustMode: "fail-closed"');

includes(engine, "maxToolCallsPerTask");
includes(engine, "maxPlanTasks");
includes(engine, "ToolName.safeParse");
includes(engine, "toolRegistry.has");
includes(engine, "Never claim a tool, write, test, deployment, or external action happened unless its observation proves it");

includes(tools, "assertSafeFilePath");
includes(tools, "isSensitivePath");
includes(tools, "workspaceContainsSensitiveFiles");
includes(tools, 'code: "SENSITIVE_WORKSPACE"');
includes(tools, "safeChildEnvironment");
includes(tools, 'shell: false');
includes(tools, "assertPublicUrl");
includes(tools, "lookup(hostname");
includes(tools, "isPrivateAddress");
includes(tools, "metadata.google.internal");
includes(tools, 'code: "COMMAND_FAILED"');
excludes(tools, 'new Set(["npm", "pnpm", "yarn", "node", "npx"', "npx must not be in the command allowlist");
excludes(tools, '"grep"', "grep must not bypass sensitive-file filtering");

const textExtensionsBlock = tools.match(/const SAFE_TEXT_EXTENSIONS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
assert.ok(textExtensionsBlock, "SAFE_TEXT_EXTENSIONS block must exist");
excludes(textExtensionsBlock, '.env', "Environment files must not be included in searchable text extensions");

includes(memory, "sanitizeText");
includes(memory, "[REDACTED]");
includes(memory, "fs.renameSync(temporary, MEMORY_FILE)");
includes(memory, "mode: 0o600");
includes(memory, "MAX_ENTRIES");
includes(memory, "MAX_GOALS");

includes(redis, "isRedisConfigured");
includes(redis, "lazyConnect: true");
includes(redis, "enableOfflineQueue: false");
includes(queue, "REDIS_URL is required before autonomous jobs can be queued");
includes(queue, "jobId: agentId");
includes(worker, "REDIS_URL is required before the queued autonomous worker can start");
includes(worker, "updateChain");
includes(worker, "await updateChain");
includes(worker, "WORKER_CONCURRENCY");

includes(api, 'res.setHeader("X-Request-Id", traceId)');
includes(api, '"X-Client-Request-Id": traceId');
includes(api, "MAX_CONTEXT_MESSAGES");
includes(api, "MAX_CONTEXT_CHARS");
includes(api, "MAX_BODY_BYTES");
includes(api, "allowExpensiveRequest");
includes(api, 'pathname === "/api/agent/inline"');
includes(api, 'mode: "inline-safe-reasoning"');
includes(api, 'executionAuthority: "NONE"');
includes(api, "externalToolsExecuted: false");
includes(api, "queuedAutonomousAgentReady: false");
includes(api, 'error: "Runtime request failed"');
excludes(api, "message: error instanceof Error ? error.message", "Provider errors must not be echoed to clients");

includes(runtimeProbe, "VERCEL_OIDC_TOKEN");
includes(runtimeProbe, "GATEWAY_CREDITS_URL");
includes(runtimeProbe, "aiGatewayAutomaticUse");
includes(runtimeProbe, "automaticSpendEnabledByGem: false");
excludes(runtimeProbe, "apiKeyString", "Provider probe must never emit a credential");

includes(server, "setupAgentControlProtection");
includes(server, "GEM_AGENT_API_TOKEN");
includes(server, "X-GEM-Agent-Token");
includes(server, "timingSafeEqual");
includes(server, 'registerGemOpsReviewRoutes(app)');
includes(server, 'res.setHeader("X-Request-Id", requestId)');
includes(server, 'status >= 500 ? "Internal Server Error"');
excludes(server, "capturedJsonResponse", "API response bodies must not be copied into request logs");

includes(sentinelWorkflow, "node --check scripts/gem-ops-review-package.mjs");
includes(sentinelWorkflow, "Generate evidence-bound operator review package");
includes(sentinelWorkflow, "node scripts/gem-ops-review-package.mjs");
includes(sentinelWorkflow, "review-package-summary.json");
includes(sentinelWorkflow, "execution authority NONE");
includes(reviewPackage, 'path.join(OUTPUT_DIR, "review-package-summary.json")');
includes(reviewPackage, 'executionAuthority: "NONE"');

assert.equal(pkg.scripts["agent:test"], "node tests/gem-agent-trust.contract.mjs");
assert.ok(pkg.scripts["ops:test"].includes("gem-agent-trust.contract.mjs"));
assert.ok(vercel.buildCommand.includes("npm run agent:test"));
assert.ok(vercel.buildCommand.includes("tsc -p tsconfig.agent.json"));
assert.ok(
  vercel.rewrites.some(
    (rewrite) =>
      rewrite.source === "/api/runtime/provider-probe" &&
      rewrite.destination === "/api/runtime-probe",
  ),
  "Vercel runtime provider probe must bypass the generic API rewrite",
);

console.log("GEM agent trust contract: PASS");
