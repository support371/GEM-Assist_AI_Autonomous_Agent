import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gem-ops-cost-guard-test-"));
const configPath = path.join(tmp, "targets.json");
const fixturePath = path.join(tmp, "fixture.json");
const outputDir = path.join(tmp, "out");

await fs.writeFile(
  configPath,
  JSON.stringify(
    {
      policy: {
        billingGuard: "never-provision-paid-resources",
        maxCostGuardRequestsPerRun: 10,
      },
      repositories: [
        {
          name: "support371/example",
          branch: "main",
          visibility: "public",
        },
      ],
    },
    null,
    2,
  ),
);

await fs.writeFile(
  fixturePath,
  JSON.stringify(
    {
      repositories: {
        "support371/example": {
          revision: "0123456789abcdef",
          statuses: [
            {
              context: "Vercel – primary",
              state: "success",
              target_url: "https://vercel.example/ready",
            },
            {
              context: "Vercel – duplicate-one",
              state: "failure",
              target_url: "https://vercel.example?upgradeToPro=build-rate-limit",
            },
            {
              context: "Vercel – duplicate-two",
              state: "failure",
              target_url: "https://vercel.example?upgradeToPro=build-rate-limit",
            },
          ],
        },
      },
    },
    null,
    2,
  ),
);

const child = spawn(process.execPath, ["scripts/gem-ops-cost-guard.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    GEM_OPS_CONFIG: configPath,
    GEM_OPS_COST_GUARD_FIXTURE: fixturePath,
    GEM_OPS_OUTPUT_DIR: outputDir,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
const code = await new Promise((resolve) => child.on("close", resolve));

assert.equal(code, 0, `cost guard failed: ${stderr}\n${stdout}`);
const report = JSON.parse(await fs.readFile(path.join(outputDir, "cost-guard.json"), "utf8"));
const summary = JSON.parse(await fs.readFile(path.join(outputDir, "cost-guard-summary.json"), "utf8"));

assert.equal(report.fixtureMode, true);
assert.equal(report.requestsUsed, 0);
assert.equal(report.overallState, "COST_PRESSURE");
assert.equal(report.results.length, 1);
assert.equal(report.results[0].successfulContexts, 1);
assert.equal(report.results[0].rateLimitedContexts, 2);
assert.equal(report.results[0].duplicateContexts, 2);
assert.equal(report.automaticPaidUpgradeAllowed, false);
assert.equal(summary.automaticUpgradeAllowed, false);
assert.equal(summary.totals.rateLimitedContexts, 2);
assert.ok((await fs.stat(path.join(outputDir, "cost-guard.md"))).isFile());

console.log("GEM Ops cost guard smoke test passed");
