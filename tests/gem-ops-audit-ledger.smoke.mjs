import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gem-ops-audit-test-"));
const outputDir = path.join(tmp, "out");
const ledgerPath = path.join(tmp, "cache", "audit-ledger.json");
await fs.mkdir(outputDir, { recursive: true });

async function writeEvidence(generatedAt, state = "HEALTHY") {
  await fs.writeFile(
    path.join(outputDir, "latest.json"),
    JSON.stringify({
      generatedAt,
      overallState: state,
      counts: { checked: 5, failed: state === "HEALTHY" ? 0 : 1, degraded: 0, skipped: 0 },
      execution: { remoteRequests: 4 },
    }),
  );
  await fs.writeFile(
    path.join(outputDir, "cost-guard.json"),
    JSON.stringify({
      generatedAt,
      overallState: "HEALTHY",
      automaticPaidUpgradeAllowed: false,
      totals: { rateLimitedContexts: 0, duplicateContexts: 0 },
    }),
  );
  await fs.writeFile(
    path.join(outputDir, "remediation-plan.json"),
    JSON.stringify({
      generatedAt,
      executionAuthority: "PREPARE_ONLY",
      priorityCounts: { P0: 0, P1: 0 },
      tasks: [],
    }),
  );
  await fs.writeFile(
    path.join(outputDir, "release-readiness.json"),
    JSON.stringify({
      generatedAt,
      decision: {
        state: "READY_FOR_REVIEW",
        authority: "ADVISE_ONLY",
        mergeAllowedAutomatically: false,
        deploymentAllowedAutomatically: false,
      },
    }),
  );
  await fs.writeFile(
    path.join(outputDir, "history-summary.json"),
    JSON.stringify({ updatedAt: generatedAt, trend: "STABLE" }),
  );
}

async function runAudit() {
  const child = spawn(process.execPath, ["scripts/gem-ops-audit-ledger.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GEM_OPS_OUTPUT_DIR: outputDir,
      GEM_OPS_AUDIT_LEDGER: ledgerPath,
      GEM_OPS_AUDIT_LIMIT: "10",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
  child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 0, `audit run failed: ${stderr}\n${stdout}`);
  return { stdout, stderr };
}

await writeEvidence("2026-08-09T08:00:00.000Z");
await runAudit();
let ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8"));
let summary = JSON.parse(await fs.readFile(path.join(outputDir, "audit-summary.json"), "utf8"));
assert.equal(ledger.events.length, 1);
assert.equal(ledger.events[0].previousHash, "GENESIS");
assert.equal(ledger.events[0].eventHash.length, 64);
assert.equal(summary.integrity, "VALID");
assert.equal(summary.appended, true);

// Same source run is idempotent.
await runAudit();
ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8"));
summary = JSON.parse(await fs.readFile(path.join(outputDir, "audit-summary.json"), "utf8"));
assert.equal(ledger.events.length, 1);
assert.equal(summary.appended, false);

await writeEvidence("2026-08-10T08:00:00.000Z");
await runAudit();
ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8"));
assert.equal(ledger.events.length, 2);
assert.equal(ledger.events[1].previousHash, ledger.events[0].eventHash);

// Tampering must be detected and must not append another event.
ledger.events[0].operational.state = "TAMPERED";
await fs.writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
await writeEvidence("2026-08-11T08:00:00.000Z");
await runAudit();
summary = JSON.parse(await fs.readFile(path.join(outputDir, "audit-summary.json"), "utf8"));
assert.equal(summary.integrity, "FAILED");
assert.equal(summary.appended, false);
assert.equal(summary.failedIndex, 0);

console.log("GEM Ops audit ledger smoke test passed");
