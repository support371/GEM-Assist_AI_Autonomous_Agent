import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gem-ops-history-test-"));
const outputDir = path.join(tmp, "out");
const historyPath = path.join(tmp, "cache", "history.json");
await fs.mkdir(outputDir, { recursive: true });

async function writeRun(index, state, costState, releaseState) {
  const generatedAt = `2026-08-${String(index).padStart(2, "0")}T08:00:00.000Z`;
  await fs.writeFile(
    path.join(outputDir, "latest.json"),
    JSON.stringify({
      generatedAt,
      overallState: state,
      counts: { checked: 5, failed: state === "HEALTHY" ? 0 : 1, degraded: 0, skipped: 0 },
      delta: { materialChanges: [] },
      execution: { remoteRequests: 3 },
    }),
  );
  await fs.writeFile(
    path.join(outputDir, "cost-guard.json"),
    JSON.stringify({
      generatedAt,
      overallState: costState,
      totals: { rateLimitedContexts: costState === "HEALTHY" ? 0 : 2, duplicateContexts: 2 },
    }),
  );
  await fs.writeFile(
    path.join(outputDir, "remediation-plan.json"),
    JSON.stringify({
      generatedAt,
      priorityCounts: { P0: 0, P1: state === "HEALTHY" ? 0 : 1 },
      tasks: state === "HEALTHY" ? [] : [{ id: "x" }],
    }),
  );
  await fs.writeFile(
    path.join(outputDir, "release-readiness.json"),
    JSON.stringify({ generatedAt, decision: { state: releaseState } }),
  );

  const child = spawn(process.execPath, ["scripts/gem-ops-history.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GEM_OPS_OUTPUT_DIR: outputDir,
      GEM_OPS_HISTORY: historyPath,
      GEM_OPS_HISTORY_LIMIT: "3",
      GEM_OPS_HISTORY_PUBLIC_WINDOW: "2",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
  child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 0, `history run failed: ${stderr}\n${stdout}`);
}

await writeRun(1, "ACTION_REQUIRED", "CAPACITY_BLOCKED", "HOLD");
await writeRun(2, "HEALTHY", "HEALTHY", "READY_FOR_REVIEW");
await writeRun(3, "HEALTHY", "HEALTHY", "READY_FOR_REVIEW");
await writeRun(4, "HEALTHY", "HEALTHY", "READY_FOR_REVIEW");

const history = JSON.parse(await fs.readFile(historyPath, "utf8"));
const summary = JSON.parse(await fs.readFile(path.join(outputDir, "history-summary.json"), "utf8"));
assert.equal(history.entries.length, 3);
assert.equal(history.entries[0].generatedAt.startsWith("2026-08-02"), true);
assert.equal(summary.retainedRuns, 3);
assert.equal(summary.recent.length, 2);
assert.equal(summary.trend, "STABLE");
assert.equal(summary.latest.releaseState, "READY_FOR_REVIEW");

console.log("GEM Ops history smoke test passed");
