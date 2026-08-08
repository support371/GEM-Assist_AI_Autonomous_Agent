import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gem-ops-remediation-test-"));
const reportPath = path.join(tmp, "latest.json");
const outputDir = path.join(tmp, "out");

await fs.writeFile(
  reportPath,
  JSON.stringify(
    {
      generatedAt: "2026-08-08T00:00:00.000Z",
      overallState: "ACTION_REQUIRED",
      results: [
        {
          kind: "repository",
          id: "support371/example",
          name: "support371/example",
          state: "failed",
          criticality: "high",
          evidence: "CI workflow concluded failure",
          ci: { workflowConclusion: "failure" },
        },
        {
          kind: "http",
          id: "public-site",
          name: "Public site",
          state: "healthy",
          criticality: "critical",
          evidence: "HTTP 200",
        },
        {
          kind: "vercel",
          id: "prj_example",
          name: "Example deployment",
          state: "skipped",
          criticality: "medium",
          evidence: "VERCEL_TOKEN not configured",
        },
      ],
    },
    null,
    2,
  ),
  "utf8",
);

const child = spawn(process.execPath, ["scripts/gem-ops-remediation-plan.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    GEM_OPS_REPORT: reportPath,
    GEM_OPS_OUTPUT_DIR: outputDir,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
const exitCode = await new Promise((resolve) => child.on("close", resolve));

assert.equal(exitCode, 0, `planner failed: ${stderr}\n${stdout}`);
const plan = JSON.parse(await fs.readFile(path.join(outputDir, "remediation-plan.json"), "utf8"));
assert.equal(plan.executionAuthority, "PREPARE_ONLY");
assert.equal(plan.destructiveActionsAllowed, false);
assert.equal(plan.tasks.length, 2);
assert.equal(plan.tasks[0].priority, "P1");
assert.equal(plan.tasks[0].source.kind, "repository");
assert.ok(plan.tasks[0].approvalRequiredFor.includes("merge"));
assert.equal(plan.tasks[1].priority, "P3");
assert.ok(await fs.stat(path.join(outputDir, "remediation-plan.md")));

console.log("GEM Ops remediation planner smoke test passed");
