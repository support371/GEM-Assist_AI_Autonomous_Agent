#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OUTPUT_DIR = process.env.GEM_OPS_OUTPUT_DIR || "artifacts/gem-ops";
const REVIEW_TTL_MINUTES = Math.max(5, Number(process.env.GEM_OPS_REVIEW_TTL_MINUTES || 60));

const evidenceFiles = [
  "latest.json",
  "cost-guard.json",
  "remediation-plan.json",
  "release-readiness.json",
  "history-summary.json",
  "audit-summary.json",
];

async function readOptional(name) {
  try {
    return JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, name), "utf8"));
  } catch {
    return null;
  }
}

async function digestFile(name) {
  try {
    const bytes = await fs.readFile(path.join(OUTPUT_DIR, name));
    return {
      name,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    };
  } catch {
    return { name, sha256: null, bytes: 0 };
  }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestObject(value) {
  return crypto.createHash("sha256").update(stable(value)).digest("hex");
}

function eligibility(readiness, audit) {
  const readinessState = readiness?.decision?.state || readiness?.state || "NOT_AVAILABLE";
  const auditIntegrity = audit?.integrity || "NOT_AVAILABLE";
  const reasons = [];

  if (readinessState === "HOLD") reasons.push("Release readiness is HOLD.");
  if (readinessState === "NOT_AVAILABLE") reasons.push("Release readiness evidence is missing.");
  if (auditIntegrity !== "VALID") reasons.push(`Audit integrity is ${auditIntegrity}.`);

  return {
    state: reasons.length ? "NOT_ELIGIBLE" : "READY_FOR_OPERATOR_REVIEW",
    eligible: reasons.length === 0,
    reasons,
  };
}

function publicSummary(pkg) {
  return {
    schemaVersion: 1,
    generatedAt: pkg.generatedAt,
    expiresAt: pkg.expiresAt,
    state: pkg.eligibility.state,
    eligible: pkg.eligibility.eligible,
    releaseState: pkg.releaseState,
    auditIntegrity: pkg.auditIntegrity,
    remediationTasks: pkg.remediationTasks,
    packageDigest: pkg.packageDigest.slice(0, 16),
    executionAuthority: "NONE",
  };
}

function markdown(pkg) {
  const lines = [
    "# GEM Operator Review Package",
    "",
    `- **State:** ${pkg.eligibility.state}`,
    `- **Generated:** ${pkg.generatedAt}`,
    `- **Expires:** ${pkg.expiresAt}`,
    `- **Release state:** ${pkg.releaseState}`,
    `- **Audit integrity:** ${pkg.auditIntegrity}`,
    `- **Remediation tasks:** ${pkg.remediationTasks}`,
    `- **Evidence digest:** ${pkg.evidenceDigest}`,
    `- **Package digest:** ${pkg.packageDigest}`,
    `- **Execution authority:** NONE`,
    "",
  ];

  if (pkg.eligibility.reasons.length) {
    lines.push("## Review blockers", "", ...pkg.eligibility.reasons.map((r) => `- ${r}`), "");
  } else {
    lines.push(
      "## Operator boundary",
      "",
      "This package is eligible for operator review only. It is not an approval, merge instruction, deployment instruction, billing authorization, or financial-execution authorization.",
      "",
    );
  }

  lines.push(
    "## Bound evidence",
    "",
    ...pkg.evidence.map((item) => `- ${item.name}: ${item.sha256 || "MISSING"}`),
    "",
  );
  return lines.join("\n");
}

async function main() {
  const [ops, cost, remediation, readiness, history, audit] = await Promise.all([
    readOptional("latest.json"),
    readOptional("cost-guard.json"),
    readOptional("remediation-plan.json"),
    readOptional("release-readiness.json"),
    readOptional("history-summary.json"),
    readOptional("audit-summary.json"),
  ]);
  const evidence = await Promise.all(evidenceFiles.map(digestFile));
  const evidenceDigest = digestObject(evidence);
  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + REVIEW_TTL_MINUTES * 60_000);
  const reviewEligibility = eligibility(readiness, audit);

  const packageCore = {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttlMinutes: REVIEW_TTL_MINUTES,
    releaseState: readiness?.decision?.state || readiness?.state || "NOT_AVAILABLE",
    releaseAuthority: readiness?.decision?.authority || readiness?.authority || "NOT_AVAILABLE",
    auditIntegrity: audit?.integrity || "NOT_AVAILABLE",
    auditHead: audit?.headHash || null,
    operationalState: ops?.overallState || "NOT_AVAILABLE",
    costState: cost?.overallState || "NOT_AVAILABLE",
    trend: history?.trend || "NOT_AVAILABLE",
    remediationTasks: remediation?.tasks?.length ?? remediation?.totalTasks ?? 0,
    p0: remediation?.priorityCounts?.P0 ?? remediation?.counts?.P0 ?? 0,
    p1: remediation?.priorityCounts?.P1 ?? remediation?.counts?.P1 ?? 0,
    eligibility: reviewEligibility,
    evidence,
    evidenceDigest,
    executionAuthority: "NONE",
    approvalRecorded: false,
    automaticMergeAllowed: false,
    automaticDeploymentAllowed: false,
    automaticPaidUpgradeAllowed: false,
    financialExecutionAllowed: false,
  };
  const pkg = { ...packageCore, packageDigest: digestObject(packageCore) };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, "review-package.json"), JSON.stringify(pkg, null, 2) + "\n");
  await fs.writeFile(path.join(OUTPUT_DIR, "review-package.md"), markdown(pkg) + "\n");
  await fs.writeFile(
    path.join(OUTPUT_DIR, "review-package-summary.json"),
    JSON.stringify(publicSummary(pkg), null, 2) + "\n",
  );

  console.log(markdown(pkg));
}

main().catch((error) => {
  console.error(`[gem-ops-review-package] fatal: ${error?.stack || error}`);
  process.exitCode = 1;
});
