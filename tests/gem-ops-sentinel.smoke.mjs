import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gem-ops-test-"));
const configPath = path.join(tmp, "targets.json");
const outputDir = path.join(tmp, "out");
const previousState = path.join(tmp, "cache", "latest.json");

const server = http.createServer((req, res) => {
  if (req.url === "/ok") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(503, { "content-type": "text/plain" });
  res.end("unavailable");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Unable to bind smoke-test server");
const base = `http://127.0.0.1:${address.port}`;

await fs.writeFile(
  configPath,
  JSON.stringify(
    {
      version: 1,
      policy: {
        mode: "read-only",
        timeoutMs: 2000,
        maxConcurrency: 2,
        failWorkflowOnCritical: false,
      },
      httpTargets: [
        {
          id: "healthy-target",
          name: "Healthy target",
          url: `${base}/ok`,
          criticality: "high",
          expectedStatus: [200],
        },
        {
          id: "degraded-target",
          name: "Degraded target",
          url: `${base}/down`,
          criticality: "medium",
          expectedStatus: [200],
        },
      ],
      repositories: [],
    },
    null,
    2,
  ),
  "utf8",
);

const child = spawn(process.execPath, ["scripts/gem-ops-sentinel.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    GEM_OPS_CONFIG: configPath,
    GEM_OPS_OUTPUT_DIR: outputDir,
    GEM_OPS_PREVIOUS_STATE: previousState,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
const exitCode = await new Promise((resolve) => child.on("close", resolve));
server.close();

assert.equal(exitCode, 0, `sentinel failed: ${stderr}\n${stdout}`);
const report = JSON.parse(await fs.readFile(path.join(outputDir, "latest.json"), "utf8"));
assert.equal(report.counts.checked, 2);
assert.equal(report.counts.healthy, 1);
assert.equal(report.counts.failed, 1);
assert.equal(report.counts.skipped, 0);
assert.equal(report.overallState, "DEGRADED");
assert.equal(report.delta.firstRun, true);
assert.ok(await fs.stat(path.join(outputDir, "latest.md")));
assert.ok(await fs.stat(previousState));

console.log("GEM Ops Sentinel smoke test passed");
