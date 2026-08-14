import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

process.env.AGENT_ALLOW_COMMANDS_WITH_SECRET_FILES = "true";

const { executeTool } = await import("../server/agent/tools");

const secretRead = await executeTool("read_file", { path: ".env" });
assert.equal(secretRead.ok, false, "Secret-bearing environment files must be denied");
if (!secretRead.ok) {
  assert.equal(secretRead.error.code, "TOOL_ERROR");
  assert.match(secretRead.error.message, /secret-bearing files/i);
}

const privateFetch = await executeTool("fetch_url", {
  url: "http://127.0.0.1:1",
  maxBytes: 1024,
});
assert.equal(privateFetch.ok, false, "Loopback network access must be denied");
if (!privateFetch.ok) {
  assert.match(privateFetch.error.message, /private|loopback|local/i);
}

const missingScript = `.gem-agent-missing-${process.pid}.js`;
const failedCommand = await executeTool("run_command", {
  cmd: "node",
  args: [missingScript],
  cwd: ".",
  timeoutMs: 5000,
  env: {},
});
assert.equal(failedCommand.ok, false, "Non-zero subprocess exits must be failures");
if (!failedCommand.ok) {
  assert.equal(failedCommand.error.code, "COMMAND_FAILED");
}

const versionCommand = await executeTool("run_command", {
  cmd: "node",
  args: ["--version"],
  cwd: ".",
  timeoutMs: 5000,
  env: {},
});
assert.equal(versionCommand.ok, true, "Allowlisted validation commands should run");

const tempRel = `.gem-agent-safe-io-${process.pid}.txt`;
try {
  const written = await executeTool("write_file", {
    path: tempRel,
    content: "GEM_SAFE_IO_TEST",
    createDirs: true,
  });
  assert.equal(written.ok, true, "Safe workspace writes should succeed");

  const readBack = await executeTool("read_file", {
    path: tempRel,
    maxBytes: 4096,
  });
  assert.equal(readBack.ok, true, "Safe workspace reads should succeed");
  if (readBack.ok) {
    assert.match(JSON.stringify(readBack.data), /GEM_SAFE_IO_TEST/);
  }
} finally {
  await fs.rm(path.resolve(process.cwd(), tempRel), { force: true });
}

const memoryFile = path.resolve(
  process.cwd(),
  `.gem-agent-memory-test-${process.pid}.json`,
);
process.env.AGENT_MEMORY_FILE = memoryFile;
try {
  const memory = await import(`../server/agent/memory?test=${Date.now()}`);
  memory.addMemoryEntry(
    "result",
    "api_key=TOPSECRET123 password=SUPERSECRET456 sk-example-secret-token-123456",
    "test context",
    "test-goal",
  );
  const rawMemory = await fs.readFile(memoryFile, "utf8");
  assert.doesNotMatch(rawMemory, /TOPSECRET123/);
  assert.doesNotMatch(rawMemory, /SUPERSECRET456/);
  assert.doesNotMatch(rawMemory, /sk-example-secret-token-123456/);
  assert.match(rawMemory, /\[REDACTED\]/);
} finally {
  await fs.rm(memoryFile, { force: true });
}

delete process.env.REDIS_URL;
const { createAgentQueue } = await import("../server/agent/queue");
assert.throws(
  () => createAgentQueue(),
  /REDIS_URL is required/,
  "Queued autonomy must fail closed when Redis is not configured",
);

console.log("GEM agent runtime smoke: PASS");
