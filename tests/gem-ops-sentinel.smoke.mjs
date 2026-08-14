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
let degraded = true;

const server = http.createServer((req, res) => {
  if (req.url === "/ok") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.url === "/dynamic") {
    res.writeHead(degraded ? 503 : 200, { "content-type": "text/plain" });
    res.end(degraded ? "unavailable" : "recovered");
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Unable to bind smoke-test server");
const base = `http://127.0.0.1:${address.port}`;

await fs.writeFile(
  configPath,
  JSON.stringify(
    {
      version: 2,
      policy: {
        mode: "read-only",
        timeoutMs: 2000,
        maxConcurrency: 2,
        failWorkflowOnCritical: false,
        maxRemoteRequestsPerRun: 10,
        maxRetriesPerTarget: 0,
        billingGuard: "never-provision-paid-resources",
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
          id: "dynamic-target",
          name: "Dynamic target",
          url: `${base}/dynamic`,
          criticality: "medium",
          expectedStatus: [200],
        },
      ],
      repositories: [],
      vercel: { teamId: "test-team", projects: [] },
    },
    null,
    2,
  ),
  "utf8",
);

async function runSentinel() {
  const child = spawn(process.execPath, ["scripts/gem-ops-sentinel.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GEM_OPS_CONFIG: configPath,
      GEM_OPS_OUTPUT_DIR: outputDir,
      GEM_OPS_PREVIOUS_STATE: previousState,
      VERCEL_TOKEN: "",
      GITHUB_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
  child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 0, `sentinel failed: ${stderr}\n${stdout}`);
  return JSON.parse(await fs.readFile(path.join(outputDir, "latest.json"), "utf8"));
}

try {
  const first = await runSentinel();
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.counts.checked, 2);
  assert.equal(first.counts.healthy, 1);
  assert.equal(first.counts.degraded, 0);
  assert.equal(first.counts.failed, 1);
  assert.equal(first.counts.skipped, 0);
  assert.equal(first.overallState, "DEGRADED");
  assert.equal(first.delta.firstRun, true);
  assert.equal(first.execution.maxRemoteRequests, 10);
  assert.equal(first.execution.remoteRequests, 2);

  degraded = false;
  const second = await runSentinel();
  assert.equal(second.counts.healthy, 2);
  assert.equal(second.counts.failed, 0);
  assert.equal(second.overallState, "HEALTHY");
  assert.equal(second.delta.firstRun, false);
  assert.equal(second.delta.resolved.length, 1);
  assert.equal(second.delta.resolved[0].id, "dynamic-target");

  const publicSummary = JSON.parse(
    await fs.readFile(path.join(outputDir, "public-summary.json"), "utf8"),
  );
  assert.equal(publicSummary.overallState, "HEALTHY");
  assert.equal(publicSummary.counts.checked, 2);
  assert.equal(publicSummary.billingGuard, "never-provision-paid-resources");
  assert.ok(await fs.stat(path.join(outputDir, "latest.md")));
  assert.ok(await fs.stat(previousState));

  console.log("GEM Ops Sentinel smoke test passed");
} finally {
  server.close();
}
