#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPORT_PATH = process.env.GEM_OPS_REPORT || "artifacts/gem-ops/latest.json";
const OUTPUT_DIR = process.env.GEM_OPS_OUTPUT_DIR || "artifacts/gem-ops";

const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };

async function readReport() {
  try {
    return JSON.parse(await fs.readFile(REPORT_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read GEM operations report at ${REPORT_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function priorityFor(item) {
  if (item.state === "failed" && item.criticality === "critical") return "P0";
  if (item.state === "failed" && item.criticality === "high") return "P1";
  if (item.state === "failed") return "P2";
  if (item.state === "degraded" && ["critical", "high"].includes(item.criticality)) return "P1";
  if (item.state === "degraded") return "P2";
  if (item.state === "skipped") return "P3";
  return "P4";
}

function containmentFor(item) {
  if (item.kind === "repository" && item.ci) {
    return [
      "Freeze automatic merge/deploy for the affected branch until CI evidence is understood.",
      "Inspect the exact failed workflow/check and its logs.",
      "Prepare a branch-scoped patch and validation plan; do not merge automatically.",
    ];
  }
  if (item.kind === "vercel") {
    return [
      "Keep the last known READY deployment serving traffic where available.",
      "Inspect build/runtime logs for the affected deployment.",
      "Prepare a corrective deployment only after root cause is verified.",
    ];
  }
  if (item.kind === "http") {
    return [
      "Confirm the failure from a second bounded read-only probe.",
      "Inspect DNS/routing, authentication boundary and upstream deployment health.",
      "Avoid configuration mutation until the failing layer is identified.",
    ];
  }
  return ["Preserve current production state and gather additional read-only evidence."];
}

function ownerFor(item) {
  if (item.kind === "repository") return "Engineering / CI";
  if (item.kind === "vercel") return "Deployment Operations";
  if (item.kind === "http") return "Platform Operations";
  return "GEM Operations";
}

function approvalBoundary(item) {
  const actions = [
    "merge",
    "deploy",
    "rollback",
    "secret rotation",
    "DNS mutation",
    "database mutation",
    "financial execution",
    "paid-resource activation",
  ];
  if (item.kind === "repository") actions.unshift("push to protected/default branch");
  return actions;
}

function createTask(item, index) {
  const priority = priorityFor(item);
  return {
    id: `GEM-OPS-${String(index + 1).padStart(3, "0")}`,
    priority,
    state: item.state,
    criticality: item.criticality,
    source: { kind: item.kind, id: item.id, name: item.name },
    owner: ownerFor(item),
    evidence: item.evidence,
    objective: item.state === "skipped"
      ? "Decide whether the missing read scope is required; do not broaden access by default."
      : "Identify root cause and prepare the smallest safe remediation without modifying production.",
    containment: containmentFor(item),
    safeAutomaticWork: [
      "read logs and status metadata",
      "compare current state with previous known-good state",
      "identify the responsible revision/deployment",
      "prepare patch or configuration diff",
      "prepare validation and rollback procedure",
    ],
    approvalRequiredFor: approvalBoundary(item),
    executionAuthority: "PREPARE_ONLY",
  };
}

function markdown(plan) {
  const lines = [
    "# GEM Operations Remediation Plan",
    "",
    `- **Generated:** ${plan.generatedAt}`,
    `- **Source state:** ${plan.sourceOverallState}`,
    `- **Open tasks:** ${plan.tasks.length}`,
    `- **Execution authority:** PREPARE_ONLY`,
    "",
  ];

  if (!plan.tasks.length) {
    lines.push("No degraded, failed, or access-limited targets require remediation planning.", "");
  }

  for (const task of plan.tasks) {
    lines.push(
      `## ${task.priority} — ${task.source.name}`,
      "",
      `- **State:** ${task.state}`,
      `- **Owner:** ${task.owner}`,
      `- **Evidence:** ${task.evidence}`,
      `- **Objective:** ${task.objective}`,
      "- **Containment / diagnosis:**",
      ...task.containment.map((item) => `  - ${item}`),
      "- **Automatic work allowed:**",
      ...task.safeAutomaticWork.map((item) => `  - ${item}`),
      "- **Approval required before:**",
      ...task.approvalRequiredFor.map((item) => `  - ${item}`),
      "",
    );
  }

  return lines.join("\n");
}

async function main() {
  const report = await readReport();
  const actionable = (report.results || []).filter((item) =>
    ["failed", "degraded", "skipped"].includes(item.state),
  );

  const tasks = actionable
    .map(createTask)
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

  const plan = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: report.generatedAt || null,
    sourceOverallState: report.overallState || "UNKNOWN",
    executionAuthority: "PREPARE_ONLY",
    destructiveActionsAllowed: false,
    tasks,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, "remediation-plan.json"), JSON.stringify(plan, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(OUTPUT_DIR, "remediation-plan.md"), markdown(plan) + "\n", "utf8");
  console.log(markdown(plan));
}

main().catch((error) => {
  console.error(`[gem-ops-remediation] fatal: ${error?.stack || error}`);
  process.exitCode = 1;
});
