#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OUTPUT_DIR = process.env.GEM_OPS_OUTPUT_DIR || "artifacts/gem-ops";
const OPS_REPORT = process.env.GEM_OPS_REPORT || path.join(OUTPUT_DIR, "latest.json");
const COST_REPORT = process.env.GEM_OPS_COST_GUARD_REPORT || path.join(OUTPUT_DIR, "cost-guard.json");
const REMEDIATION_REPORT = process.env.GEM_OPS_REMEDIATION_REPORT || path.join(OUTPUT_DIR, "remediation-plan.json");
const AUDIT_REPORT = process.env.GEM_OPS_AUDIT_SUMMARY || path.join(OUTPUT_DIR, "audit-summary.json");

async function readOptional(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function evaluate(ops, cost, remediation, audit) {
  const reasons = [];
  const blockers = [];
  const warnings = [];

  if (!ops) blockers.push("Operational sentinel report is missing.");
  if (!cost) warnings.push("Build-cost guard report is missing.");
  if (!remediation) warnings.push("Remediation plan is missing.");
  if (!audit) warnings.push("Audit integrity evidence is missing.");

  const opsState = ops?.overallState || "NOT_AVAILABLE";
  const costState = cost?.overallState || "NOT_AVAILABLE";
  const auditIntegrity = audit?.integrity || "NOT_AVAILABLE";
  const p0 = remediation?.priorityCounts?.P0 ?? 0;
  const p1 = remediation?.priorityCounts?.P1 ?? 0;
  const p2 = remediation?.priorityCounts?.P2 ?? 0;
  const p3 = remediation?.priorityCounts?.P3 ?? 0;

  if (["CRITICAL", "ACTION_REQUIRED"].includes(opsState)) {
    blockers.push(`Operational state is ${opsState}.`);
  }
  if (["BUILD_FAILURE", "CAPACITY_BLOCKED"].includes(costState)) {
    blockers.push(`Build-cost state is ${costState}.`);
  }
  if (auditIntegrity === "FAILED") blockers.push("Audit ledger integrity is FAILED.");
  if (p0 > 0) blockers.push(`${p0} P0 remediation task(s) remain open.`);
  if (p1 > 0) blockers.push(`${p1} P1 remediation task(s) remain open.`);

  if (opsState === "DEGRADED") warnings.push("Operational state is DEGRADED.");
  if (["COST_PRESSURE", "DUPLICATE_BUILD_SURFACE", "INSPECTION_LIMITED"].includes(costState)) {
    warnings.push(`Build-cost state is ${costState}.`);
  }
  if (audit && !["VALID", "FAILED"].includes(auditIntegrity)) {
    warnings.push(`Audit integrity state is ${auditIntegrity}.`);
  }
  if ((ops?.counts?.skipped ?? 0) > 0) warnings.push(`${ops.counts.skipped} target(s) have limited inspection scope.`);
  if (p2 > 0) warnings.push(`${p2} P2 remediation task(s) remain open.`);
  if (p3 > 0) warnings.push(`${p3} P3 remediation/review task(s) remain open.`);

  let state = "READY_FOR_REVIEW";
  if (blockers.length) state = "HOLD";
  else if (warnings.length) state = "REVIEW_REQUIRED";

  reasons.push(...blockers, ...warnings);
  if (!reasons.length) reasons.push("No release blockers or review warnings were detected by the current evidence set.");

  return {
    state,
    blockers,
    warnings,
    reasons,
    authority: "ADVISE_ONLY",
    mergeAllowedAutomatically: false,
    deploymentAllowedAutomatically: false,
    paidUpgradeAllowedAutomatically: false,
  };
}

function markdown(report) {
  const lines = [
    "# GEM Cloud Operations Release Readiness",
    "",
    `- **Decision:** ${report.decision.state}`,
    `- **Generated:** ${report.generatedAt}`,
    `- **Operational state:** ${report.inputs.operationalState}`,
    `- **Build-cost state:** ${report.inputs.costState}`,
    `- **Audit integrity:** ${report.inputs.auditIntegrity}`,
    `- **Open P0/P1:** ${report.inputs.p0}/${report.inputs.p1}`,
    `- **Authority:** ${report.decision.authority}`,
    `- **Automatic merge/deploy:** FORBIDDEN`,
    "",
  ];

  if (report.decision.blockers.length) {
    lines.push("## Blockers", "", ...report.decision.blockers.map((item) => `- ${item}`), "");
  }
  if (report.decision.warnings.length) {
    lines.push("## Review warnings", "", ...report.decision.warnings.map((item) => `- ${item}`), "");
  }
  if (!report.decision.blockers.length && !report.decision.warnings.length) {
    lines.push("The evidence set is suitable to move to human review. This is not merge authorization.", "");
  }

  return lines.join("\n");
}

async function main() {
  const [ops, cost, remediation, audit] = await Promise.all([
    readOptional(OPS_REPORT),
    readOptional(COST_REPORT),
    readOptional(REMEDIATION_REPORT),
    readOptional(AUDIT_REPORT),
  ]);
  const decision = evaluate(ops, cost, remediation, audit);
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    inputs: {
      operationalState: ops?.overallState || "NOT_AVAILABLE",
      costState: cost?.overallState || "NOT_AVAILABLE",
      auditIntegrity: audit?.integrity || "NOT_AVAILABLE",
      auditHead: audit?.headHash || null,
      p0: remediation?.priorityCounts?.P0 ?? 0,
      p1: remediation?.priorityCounts?.P1 ?? 0,
      p2: remediation?.priorityCounts?.P2 ?? 0,
      p3: remediation?.priorityCounts?.P3 ?? 0,
      sentinelGeneratedAt: ops?.generatedAt || null,
      costGeneratedAt: cost?.generatedAt || null,
      remediationGeneratedAt: remediation?.generatedAt || null,
      auditUpdatedAt: audit?.updatedAt || null,
    },
    decision,
  };

  const publicSummary = {
    schemaVersion: 2,
    generatedAt: report.generatedAt,
    state: decision.state,
    blockers: decision.blockers.length,
    warnings: decision.warnings.length,
    auditIntegrity: report.inputs.auditIntegrity,
    authority: decision.authority,
    automaticMergeAllowed: false,
    automaticDeploymentAllowed: false,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, "release-readiness.json"), JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(path.join(OUTPUT_DIR, "release-readiness.md"), markdown(report) + "\n");
  await fs.writeFile(path.join(OUTPUT_DIR, "release-readiness-summary.json"), JSON.stringify(publicSummary, null, 2) + "\n");
  console.log(markdown(report));
}

main().catch((error) => {
  console.error(`[gem-ops-release-readiness] fatal: ${error?.stack || error}`);
  process.exitCode = 1;
});
