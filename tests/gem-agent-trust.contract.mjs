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
const server = read("server/index.ts");
const api = read("api/index.ts");
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

includes(server, 'registerGemOpsReviewRoutes(app)');
includes(sentinelWorkflow, "node --check scripts/gem-ops-review-package.mjs");
includes(sentinelWorkflow, "Generate evidence-bound operator review package");
includes(sentinelWorkflow, "node scripts/gem-ops-review-package.mjs");
includes(sentinelWorkflow, "review-package-summary.json");
includes(sentinelWorkflow, "execution authority NONE");
includes(reviewPackage, 'path.join(OUTPUT_DIR, "review-package-summary.json")');
includes(reviewPackage, 'executionAuthority: "NONE"');

includes(server, 'res.setHeader("X-Request-Id", requestId)');
includes(server, 'status >= 500 ? "Internal Server Error"');
excludes(server, "capturedJsonResponse", "API response bodies must not be copied into request logs");

assert.equal(pkg.scripts["agent:test"], "node tests/gem-agent-trust.contract.mjs");
assert.ok(pkg.scripts["ops:test"].includes("gem-agent-trust.contract.mjs"));

console.log("GEM agent trust contract: PASS");
