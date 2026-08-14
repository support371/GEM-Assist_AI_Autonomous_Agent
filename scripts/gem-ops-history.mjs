#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OUTPUT_DIR = process.env.GEM_OPS_OUTPUT_DIR || "artifacts/gem-ops";
const HISTORY_PATH = process.env.GEM_OPS_HISTORY || ".gem-ops-cache/history.json";
const MAX_ENTRIES = Math.max(1, Number(process.env.GEM_OPS_HISTORY_LIMIT || 30));
const PUBLIC_WINDOW = Math.min(14, Math.max(1, Number(process.env.GEM_OPS_HISTORY_PUBLIC_WINDOW || 7)));

async function readOptional(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function out(name) {
  return path.join(OUTPUT_DIR, name);
}

function normalizeHistory(value) {
  if (!value || !Array.isArray(value.entries)) return { schemaVersion: 1, entries: [] };
  return { schemaVersion: 1, entries: value.entries };
}

function makeEntry(ops, cost, remediation, readiness) {
  const generatedAt =
    ops?.generatedAt || cost?.generatedAt || remediation?.generatedAt || readiness?.generatedAt || new Date().toISOString();
  return {
    runKey: generatedAt,
    generatedAt,
    operationalState: ops?.overallState || "NOT_AVAILABLE",
    checked: ops?.counts?.checked ?? 0,
    failed: ops?.counts?.failed ?? 0,
    degraded: ops?.counts?.degraded ?? 0,
    skipped: ops?.counts?.skipped ?? 0,
    materialChanges: ops?.delta?.materialChanges?.length ?? ops?.materialChanges ?? 0,
    remoteRequests: ops?.execution?.remoteRequests ?? ops?.remoteRequests ?? 0,
    costState: cost?.overallState || "NOT_AVAILABLE",
    rateLimitedContexts: cost?.totals?.rateLimitedContexts ?? 0,
    duplicateContexts: cost?.totals?.duplicateContexts ?? 0,
    remediationTasks: remediation?.tasks?.length ?? remediation?.totalTasks ?? 0,
    p0: remediation?.priorityCounts?.P0 ?? remediation?.counts?.P0 ?? 0,
    p1: remediation?.priorityCounts?.P1 ?? remediation?.counts?.P1 ?? 0,
    releaseState: readiness?.decision?.state || readiness?.state || "NOT_AVAILABLE",
  };
}

function trend(entries) {
  if (entries.length < 2) return "INSUFFICIENT_HISTORY";
  const recent = entries.slice(-3);
  const bad = (entry) =>
    ["CRITICAL", "ACTION_REQUIRED"].includes(entry.operationalState) ||
    ["BUILD_FAILURE", "CAPACITY_BLOCKED"].includes(entry.costState) ||
    entry.p0 > 0 ||
    entry.p1 > 0;
  if (recent.every(bad)) return "PERSISTENT_RISK";
  if (bad(recent.at(-1)) && !bad(recent.at(-2))) return "DETERIORATING";
  if (!bad(recent.at(-1)) && bad(recent.at(-2))) return "RECOVERING";
  if (recent.every((entry) => !bad(entry))) return "STABLE";
  return "MIXED";
}

async function main() {
  const [ops, cost, remediation, readiness, existing] = await Promise.all([
    readOptional(out("latest.json")),
    readOptional(out("cost-guard.json")),
    readOptional(out("remediation-plan.json")),
    readOptional(out("release-readiness.json")),
    readOptional(HISTORY_PATH),
  ]);

  const history = normalizeHistory(existing);
  const entry = makeEntry(ops, cost, remediation, readiness);
  const withoutDuplicate = history.entries.filter((item) => item.runKey !== entry.runKey);
  const entries = [...withoutDuplicate, entry]
    .sort((a, b) => String(a.generatedAt).localeCompare(String(b.generatedAt)))
    .slice(-MAX_ENTRIES);

  const payload = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    maxEntries: MAX_ENTRIES,
    entries,
  };

  const recent = entries.slice(-PUBLIC_WINDOW);
  const publicSummary = {
    schemaVersion: 1,
    updatedAt: payload.updatedAt,
    retainedRuns: entries.length,
    publicWindow: PUBLIC_WINDOW,
    trend: trend(entries),
    latest: recent.at(-1) || null,
    recent: recent.map((item) => ({
      generatedAt: item.generatedAt,
      operationalState: item.operationalState,
      costState: item.costState,
      releaseState: item.releaseState,
      failed: item.failed,
      degraded: item.degraded,
      rateLimitedContexts: item.rateLimitedContexts,
      duplicateContexts: item.duplicateContexts,
      p0: item.p0,
      p1: item.p1,
    })),
  };

  await fs.mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(HISTORY_PATH, JSON.stringify(payload, null, 2) + "\n");
  await fs.writeFile(out("history-summary.json"), JSON.stringify(publicSummary, null, 2) + "\n");

  console.log(
    `GEM operations history updated: ${entries.length}/${MAX_ENTRIES} runs retained; trend=${publicSummary.trend}`,
  );
}

main().catch((error) => {
  console.error(`[gem-ops-history] fatal: ${error?.stack || error}`);
  process.exitCode = 1;
});
