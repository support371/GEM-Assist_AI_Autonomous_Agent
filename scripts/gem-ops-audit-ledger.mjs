#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OUTPUT_DIR = process.env.GEM_OPS_OUTPUT_DIR || "artifacts/gem-ops";
const LEDGER_PATH = process.env.GEM_OPS_AUDIT_LEDGER || ".gem-ops-cache/audit-ledger.json";
const MAX_EVENTS = Math.max(10, Number(process.env.GEM_OPS_AUDIT_LIMIT || 90));
const VERIFY_ONLY = process.env.GEM_OPS_AUDIT_VERIFY_ONLY === "true";

async function readOptional(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashEvent(payload) {
  return crypto.createHash("sha256").update(canonicalize(payload)).digest("hex");
}

function eventPayload(event) {
  const { eventHash: _eventHash, ...payload } = event;
  return payload;
}

function validateLedger(events) {
  let previousHash = "GENESIS";
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.previousHash !== previousHash) {
      return { valid: false, failedIndex: index, reason: "previous_hash_mismatch" };
    }
    const expectedHash = hashEvent(eventPayload(event));
    if (event.eventHash !== expectedHash) {
      return { valid: false, failedIndex: index, reason: "event_hash_mismatch" };
    }
    previousHash = event.eventHash;
  }
  return { valid: true, failedIndex: null, reason: null };
}

function compactEvent({ ops, cost, remediation, readiness, history, previousHash }) {
  return {
    schemaVersion: 1,
    sequence: 0,
    recordedAt: new Date().toISOString(),
    sourceGeneratedAt:
      ops?.generatedAt || cost?.generatedAt || remediation?.generatedAt || readiness?.generatedAt || null,
    previousHash,
    operational: {
      state: ops?.overallState || "NOT_AVAILABLE",
      checked: ops?.counts?.checked ?? 0,
      failed: ops?.counts?.failed ?? 0,
      degraded: ops?.counts?.degraded ?? 0,
      skipped: ops?.counts?.skipped ?? 0,
      remoteRequests: ops?.execution?.remoteRequests ?? ops?.remoteRequests ?? 0,
    },
    cost: {
      state: cost?.overallState || "NOT_AVAILABLE",
      rateLimitedContexts: cost?.totals?.rateLimitedContexts ?? 0,
      duplicateContexts: cost?.totals?.duplicateContexts ?? 0,
      automaticPaidUpgradeAllowed: cost?.automaticPaidUpgradeAllowed ?? false,
    },
    remediation: {
      authority: remediation?.executionAuthority || "NOT_AVAILABLE",
      totalTasks: remediation?.tasks?.length ?? remediation?.totalTasks ?? 0,
      p0: remediation?.priorityCounts?.P0 ?? remediation?.counts?.P0 ?? 0,
      p1: remediation?.priorityCounts?.P1 ?? remediation?.counts?.P1 ?? 0,
    },
    release: {
      state: readiness?.decision?.state || readiness?.state || "NOT_AVAILABLE",
      authority: readiness?.decision?.authority || readiness?.authority || "NOT_AVAILABLE",
      automaticMergeAllowed:
        readiness?.decision?.mergeAllowedAutomatically ?? readiness?.automaticMergeAllowed ?? false,
      automaticDeploymentAllowed:
        readiness?.decision?.deploymentAllowedAutomatically ?? readiness?.automaticDeploymentAllowed ?? false,
    },
    trend: history?.trend || "NOT_AVAILABLE",
  };
}

function publicSummary({ integrity, events, appended, verifyOnly }) {
  const latest = events.at(-1) || null;
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    integrity: integrity.valid ? "VALID" : "FAILED",
    eventCount: events.length,
    appended,
    verifyOnly,
    headHash: latest?.eventHash ? latest.eventHash.slice(0, 16) : null,
    failedIndex: integrity.failedIndex,
    failureReason: integrity.reason,
    latest: latest
      ? {
          sequence: latest.sequence,
          sourceGeneratedAt: latest.sourceGeneratedAt,
          operationalState: latest.operational?.state,
          costState: latest.cost?.state,
          releaseState: latest.release?.state,
          trend: latest.trend,
        }
      : null,
  };
}

async function main() {
  const [ops, cost, remediation, readiness, history, existing] = await Promise.all([
    readOptional(path.join(OUTPUT_DIR, "latest.json")),
    readOptional(path.join(OUTPUT_DIR, "cost-guard.json")),
    readOptional(path.join(OUTPUT_DIR, "remediation-plan.json")),
    readOptional(path.join(OUTPUT_DIR, "release-readiness.json")),
    readOptional(path.join(OUTPUT_DIR, "history-summary.json")),
    readOptional(LEDGER_PATH),
  ]);

  const currentEvents = Array.isArray(existing?.events) ? existing.events : [];
  const integrity = validateLedger(currentEvents);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(LEDGER_PATH), { recursive: true });

  if (!integrity.valid || VERIFY_ONLY) {
    const summary = publicSummary({
      integrity,
      events: currentEvents,
      appended: false,
      verifyOnly: VERIFY_ONLY,
    });
    await fs.writeFile(path.join(OUTPUT_DIR, "audit-summary.json"), JSON.stringify(summary, null, 2) + "\n");
    console.log(
      `GEM audit ledger ${summary.integrity}: events=${summary.eventCount}; verifyOnly=${VERIFY_ONLY}`,
    );
    return;
  }

  const previousHash = currentEvents.at(-1)?.eventHash || "GENESIS";
  const event = compactEvent({ ops, cost, remediation, readiness, history, previousHash });
  const sourceKey = event.sourceGeneratedAt || event.recordedAt;
  const duplicate = currentEvents.some((item) => item.sourceGeneratedAt === sourceKey);

  if (!duplicate) {
    event.sequence = (currentEvents.at(-1)?.sequence || 0) + 1;
    event.eventHash = hashEvent(eventPayload(event));
  }

  const nextEvents = duplicate ? currentEvents : [...currentEvents, event];
  const retained = nextEvents.slice(-MAX_EVENTS);

  // Re-anchor a truncated retained window so it remains independently verifiable.
  if (retained.length && retained[0].previousHash !== "GENESIS") {
    let previous = "GENESIS";
    for (let index = 0; index < retained.length; index += 1) {
      retained[index] = { ...retained[index], previousHash: previous };
      retained[index].eventHash = hashEvent(eventPayload(retained[index]));
      previous = retained[index].eventHash;
    }
  }

  const finalIntegrity = validateLedger(retained);
  const ledger = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    maxEvents: MAX_EVENTS,
    events: retained,
  };
  const summary = publicSummary({
    integrity: finalIntegrity,
    events: retained,
    appended: !duplicate,
    verifyOnly: false,
  });

  await fs.writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
  await fs.writeFile(path.join(OUTPUT_DIR, "audit-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(
    `GEM audit ledger ${summary.integrity}: events=${summary.eventCount}; head=${summary.headHash}; appended=${summary.appended}`,
  );
}

main().catch((error) => {
  console.error(`[gem-ops-audit] fatal: ${error?.stack || error}`);
  process.exitCode = 1;
});
