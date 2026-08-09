import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

async function runCase(name, { ops, cost, remediation, audit, expectedState }) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `gem-ops-readiness-${name}-`));
  const outputDir = path.join(tmp, "out");
  await fs.mkdir(outputDir, { recursive: true });

  const opsPath = path.join(tmp, "ops.json");
  const costPath = path.join(tmp, "cost.json");
  const remediationPath = path.join(tmp, "remediation.json");
  const auditPath = path.join(tmp, "audit.json");
  await fs.writeFile(opsPath, JSON.stringify(ops));
  await fs.writeFile(costPath, JSON.stringify(cost));
  await fs.writeFile(remediationPath, JSON.stringify(remediation));
  await fs.writeFile(auditPath, JSON.stringify(audit));

  const child = spawn(process.execPath, ["scripts/gem-ops-release-readiness.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GEM_OPS_OUTPUT_DIR: outputDir,
      GEM_OPS_REPORT: opsPath,
      GEM_OPS_COST_GUARD_REPORT: costPath,
      GEM_OPS_REMEDIATION_REPORT: remediationPath,
      GEM_OPS_AUDIT_SUMMARY: auditPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
  child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 0, `${name} failed: ${stderr}\n${stdout}`);

  const report = JSON.parse(await fs.readFile(path.join(outputDir, "release-readiness.json"), "utf8"));
  const summary = JSON.parse(await fs.readFile(path.join(outputDir, "release-readiness-summary.json"), "utf8"));
  assert.equal(report.decision.state, expectedState);
  assert.equal(report.decision.mergeAllowedAutomatically, false);
  assert.equal(report.decision.deploymentAllowedAutomatically, false);
  assert.equal(summary.automaticMergeAllowed, false);
  assert.equal(summary.automaticDeploymentAllowed, false);
  assert.equal(summary.auditIntegrity, audit.integrity);
}

const validAudit = { integrity: "VALID", headHash: "0123456789abcdef" };

await runCase("healthy", {
  ops: { overallState: "HEALTHY", counts: { skipped: 0 } },
  cost: { overallState: "HEALTHY" },
  remediation: { priorityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 } },
  audit: validAudit,
  expectedState: "READY_FOR_REVIEW",
});

await runCase("cost-pressure", {
  ops: { overallState: "HEALTHY", counts: { skipped: 0 } },
  cost: { overallState: "COST_PRESSURE" },
  remediation: { priorityCounts: { P0: 0, P1: 0, P2: 1, P3: 0 } },
  audit: validAudit,
  expectedState: "REVIEW_REQUIRED",
});

await runCase("hold", {
  ops: { overallState: "ACTION_REQUIRED", counts: { skipped: 0 } },
  cost: { overallState: "CAPACITY_BLOCKED" },
  remediation: { priorityCounts: { P0: 0, P1: 1, P2: 0, P3: 0 } },
  audit: validAudit,
  expectedState: "HOLD",
});

await runCase("audit-integrity-failure", {
  ops: { overallState: "HEALTHY", counts: { skipped: 0 } },
  cost: { overallState: "HEALTHY" },
  remediation: { priorityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 } },
  audit: { integrity: "FAILED", headHash: "bad-head" },
  expectedState: "HOLD",
});

console.log("GEM Ops release-readiness smoke test passed");
