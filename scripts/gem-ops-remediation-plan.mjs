#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPORT_PATH = process.env.GEM_OPS_REPORT || "artifacts/gem-ops/latest.json";
const OUTPUT_DIR = process.env.GEM_OPS_OUTPUT_DIR || "artifacts/gem-ops";
const COST_GUARD_PATH = process.env.GEM_OPS_COST_GUARD_REPORT || path.join(OUTPUT_DIR, "cost-guard.json");

const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };

async function readRequiredReport() {
  try {
    return JSON.parse(await fs.readFile(REPORT_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read GEM operations report at ${REPORT_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readOptionalJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
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

function costPriority(state) {
  if (state === "BUILD_FAILURE") return "P1";
  if (state === "CAPACITY_BLOCKED") return "P2";
  if (state === "COST_PRESSURE") return "P2";
  if (["DUPLICATE_BUILD_SURFACE", "INSPECTION_LIMITED"].includes(state)) return "P3";
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
    category: "operational",
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

function createCostTask(item, index) {
  return {
    id: `GEM-COST-${String(index + 1).padStart(3, "0")}`,
    priority: costPriority(item.state),
    category: "cost-governance",
    state: item.state,
    criticality: item.state === "BUILD_FAILURE" ? "high" : "medium",
    source: {
      kind: "build-cost",
      id: item.repository,
      name: item.repository,
    },
    owner: "Deployment Cost Governance",
    evidence: item.finding,
    objective: "Reduce avoidable build/deployment consumption without purchasing capacity or weakening release controls.",
    containment: [
      "Do not upgrade a plan or purchase build capacity automatically.",
      "Identify which deployment context is authoritative and which contexts are redundant.",
      "Preserve at least one validated deployment path before any integration cleanup is approved.",
    ],
    safeAutomaticWork: [
      "read commit status contexts",
      "count successful, failed, duplicate and rate-limited deployment contexts",
      "map each context to its repository revision",
      "prepare a duplicate-integration cleanup plan",
      "estimate which retries can be avoided",
    ],
    approvalRequiredFor: [
      "disconnecting a Vercel/Git integration",
      "deleting a deployment project",
      "changing a production project linkage",
      "upgrading or purchasing a paid plan",
      "manual redeploy or rollback",
    ],
    executionAuthority: "PREPARE_ONLY",
    metrics: {
      vercelContexts: item.vercelContexts,
      successfulContexts: item.successfulContexts,
      failedContexts: item.failedContexts,
      rateLimitedContexts: item.rateLimitedContexts,
      duplicateContexts: item.duplicateContexts,
    },
  };
}

function summarizePriorities(tasks) {
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const task of tasks) counts[task.priority] += 1;
  return counts;
}

function markdown(plan) {
  const lines = [
    "# GEM Operations Remediation Plan",
    "",
    `- **Generated:** ${plan.generatedAt}`,
    `- **Operational source state:** ${plan.sourceOverallState}`,
    `- **Build-cost state:** ${plan.sourceCostState}`,
    `- **Open tasks:** ${plan.tasks.length}`,
    `- **Cost-governance tasks:** ${plan.costTaskCount}`,
    `- **Execution authority:** PREPARE_ONLY`,
    "",
  ];

  if (!plan.tasks.length) {
    lines.push("No degraded, failed, access-limited, or cost-governance targets require remediation planning.", "");
  }

  for (const task of plan.tasks) {
    lines.push(
      `## ${task.priority} — ${task.source.name}`,
      "",
      `- **Category:** ${task.category}`,
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
  const report = await readRequiredReport();
  const costGuard = await readOptionalJson(COST_GUARD_PATH);
  const actionable = (report.results || []).filter((item) =>
    ["failed", "degraded", "skipped"].includes(item.state),
  );
  const costActionable = (costGuard?.results || []).filter((item) => item.state !== "HEALTHY");

  const operationalTasks = actionable.map(createTask);
  const costTasks = costActionable.map(createCostTask);
  const tasks = [...operationalTasks, ...costTasks]
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  const priorityCounts = summarizePriorities(tasks);

  const plan = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: report.generatedAt || null,
    sourceOverallState: report.overallState || "UNKNOWN",
    sourceCostState: costGuard?.overallState || "NOT_AVAILABLE",
    executionAuthority: "PREPARE_ONLY",
    destructiveActionsAllowed: false,
    paidResourceActivationAllowed: false,
    priorityCounts,
    operationalTaskCount: operationalTasks.length,
    costTaskCount: costTasks.length,
    tasks,
  };

  const publicSummary = {
    schemaVersion: 2,
    generatedAt: plan.generatedAt,
    sourceOverallState: plan.sourceOverallState,
    sourceCostState: plan.sourceCostState,
    executionAuthority: plan.executionAuthority,
    totalTasks: tasks.length,
    operationalTasks: operationalTasks.length,
    costTasks: costTasks.length,
    counts: priorityCounts,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, "remediation-plan.json"), JSON.stringify(plan, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(OUTPUT_DIR, "remediation-plan.md"), markdown(plan) + "\n", "utf8");
  await fs.writeFile(path.join(OUTPUT_DIR, "remediation-summary.json"), JSON.stringify(publicSummary, null, 2) + "\n", "utf8");
  console.log(markdown(plan));
}

main().catch((error) => {
  console.error(`[gem-ops-remediation] fatal: ${error?.stack || error}`);
  process.exitCode = 1;
});
