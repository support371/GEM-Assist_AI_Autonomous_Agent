import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

async function runCase(name, { releaseState, auditIntegrity, expectedState }) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `gem-ops-review-${name}-`));
  const outputDir = path.join(tmp, "out");
  await fs.mkdir(outputDir, { recursive: true });
  const generatedAt = "2026-08-09T08:00:00.000Z";

  const files = {
    "latest.json": { generatedAt, overallState: "HEALTHY" },
    "cost-guard.json": { generatedAt, overallState: "HEALTHY" },
    "remediation-plan.json": {
      generatedAt,
      priorityCounts: { P0: 0, P1: 0 },
      tasks: [],
    },
    "release-readiness.json": {
      generatedAt,
      decision: { state: releaseState, authority: "ADVISE_ONLY" },
    },
    "history-summary.json": { updatedAt: generatedAt, trend: "STABLE" },
    "audit-summary.json": {
      updatedAt: generatedAt,
      integrity: auditIntegrity,
      headHash: "0123456789abcdef",
    },
  };

  for (const [file, value] of Object.entries(files)) {
    await fs.writeFile(path.join(outputDir, file), JSON.stringify(value, null, 2) + "\n");
  }

  const child = spawn(process.execPath, ["scripts/gem-ops-review-package.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GEM_OPS_OUTPUT_DIR: outputDir,
      GEM_OPS_REVIEW_TTL_MINUTES: "30",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
  child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 0, `${name} failed: ${stderr}\n${stdout}`);

  const pkg = JSON.parse(await fs.readFile(path.join(outputDir, "review-package.json"), "utf8"));
  const summary = JSON.parse(await fs.readFile(path.join(outputDir, "review-package-summary.json"), "utf8"));
  assert.equal(pkg.eligibility.state, expectedState);
  assert.equal(pkg.executionAuthority, "NONE");
  assert.equal(pkg.approvalRecorded, false);
  assert.equal(pkg.automaticMergeAllowed, false);
  assert.equal(pkg.automaticDeploymentAllowed, false);
  assert.equal(pkg.automaticPaidUpgradeAllowed, false);
  assert.equal(pkg.financialExecutionAllowed, false);
  assert.equal(pkg.evidence.length, 6);
  assert.equal(pkg.evidence.every((e) => typeof e.sha256 === "string" && e.sha256.length === 64), true);
  assert.equal(pkg.packageDigest.length, 64);
  assert.equal(summary.packageDigest.length, 16);
}

await runCase("eligible", {
  releaseState: "READY_FOR_REVIEW",
  auditIntegrity: "VALID",
  expectedState: "READY_FOR_OPERATOR_REVIEW",
});

await runCase("review-required", {
  releaseState: "REVIEW_REQUIRED",
  auditIntegrity: "VALID",
  expectedState: "READY_FOR_OPERATOR_REVIEW",
});

await runCase("hold", {
  releaseState: "HOLD",
  auditIntegrity: "VALID",
  expectedState: "NOT_ELIGIBLE",
});

await runCase("audit-failed", {
  releaseState: "READY_FOR_REVIEW",
  auditIntegrity: "FAILED",
  expectedState: "NOT_ELIGIBLE",
});

console.log("GEM Ops review package smoke test passed");
