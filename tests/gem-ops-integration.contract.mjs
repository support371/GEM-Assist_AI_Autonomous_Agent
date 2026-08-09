import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function text(file) {
  return fs.readFile(file, "utf8");
}

const [
  serverIndex,
  routes,
  auditRoutes,
  dashboard,
  navigation,
  sentinelWorkflow,
  releaseGateWorkflow,
  packageJson,
] = await Promise.all([
  text("server/index.ts"),
  text("server/gem-ops/routes.ts"),
  text("server/gem-ops/audit-routes.ts"),
  text("client/screens/OpsScreen.tsx"),
  text("client/navigation/MainTabNavigator.tsx"),
  text(".github/workflows/gem-cloud-ops-sentinel.yml"),
  text(".github/workflows/gem-cloud-ops-release-gate.yml"),
  text("package.json"),
]);

assert.match(serverIndex, /import \{ registerGemOpsRoutes \} from "\.\/gem-ops\/routes"/);
assert.match(serverIndex, /import \{ registerGemOpsAuditRoutes \} from "\.\/gem-ops\/audit-routes"/);
assert.match(serverIndex, /registerGemOpsRoutes\(app\)/);
assert.match(serverIndex, /registerGemOpsAuditRoutes\(app\)/);

for (const route of [
  "/api/ops/capabilities",
  "/api/ops/summary",
  "/api/ops/cost-summary",
  "/api/ops/remediation-summary",
  "/api/ops/release-readiness",
  "/api/ops/history",
  "/api/ops/details",
  "/api/ops/cost-details",
  "/api/ops/remediation-details",
  "/api/ops/release-readiness-details",
  "/api/ops/history-details",
  "/api/ops/refresh",
]) {
  assert.ok(routes.includes(route), `missing route ${route}`);
}
for (const route of ["/api/ops/audit-summary", "/api/ops/audit-details"]) {
  assert.ok(auditRoutes.includes(route), `missing audit route ${route}`);
}

assert.match(routes, /liveMutationEnabled: false/);
assert.match(routes, /automaticPaidUpgradeAllowed: false/);
assert.match(routes, /remediationAuthority: "PREPARE_ONLY"/);
assert.match(routes, /releaseDecisionAuthority: "ADVISE_ONLY"/);
assert.match(routes, /GEM_OPS_ALLOW_REFRESH/);
assert.match(routes, /GEM_OPS_DASHBOARD_TOKEN/);
assert.match(routes, /timingSafeEqual/);
assert.match(auditRoutes, /GEM_OPS_DASHBOARD_TOKEN/);
assert.match(auditRoutes, /timingSafeEqual/);

for (const route of [
  "/api/ops/summary",
  "/api/ops/cost-summary",
  "/api/ops/remediation-summary",
  "/api/ops/release-readiness",
  "/api/ops/history",
  "/api/ops/audit-summary",
  "/api/ops/capabilities",
]) {
  assert.ok(dashboard.includes(route), `dashboard missing ${route}`);
}
assert.match(dashboard, /Release readiness/);
assert.match(dashboard, /Operational trend/);
assert.match(dashboard, /Audit integrity/);
assert.match(dashboard, /Automatic paid upgrade/);
assert.match(navigation, /OpsTab/);
assert.match(navigation, /OpsScreen/);

assert.match(sentinelWorkflow, /cron: "0 7 \* \* \*"/);
assert.match(sentinelWorkflow, /gem-ops-cost-guard\.mjs/);
assert.match(sentinelWorkflow, /gem-ops-remediation-plan\.mjs/);
assert.match(sentinelWorkflow, /gem-ops-release-readiness\.mjs/);
assert.match(sentinelWorkflow, /gem-ops-history\.mjs/);
assert.match(sentinelWorkflow, /gem-ops-audit-ledger\.mjs/);
assert.match(sentinelWorkflow, /GEM_OPS_AUDIT_VERIFY_ONLY: "true"/);
assert.match(sentinelWorkflow, /Verify cached audit integrity/);
assert.match(sentinelWorkflow, /contents: read/);

assert.doesNotMatch(releaseGateWorkflow, /^\s*push:/m);
assert.match(releaseGateWorkflow, /types: \[ready_for_review\]/);
assert.match(releaseGateWorkflow, /Production authority audit/);
assert.match(releaseGateWorkflow, /ADVISE_ONLY/);
assert.match(releaseGateWorkflow, /PREPARE_ONLY/);
assert.match(releaseGateWorkflow, /gem-ops-audit-ledger\.mjs/);
assert.match(releaseGateWorkflow, /Audit ledger integrity is FAILED/);

const pkg = JSON.parse(packageJson);
for (const script of [
  "ops:check",
  "ops:cost",
  "ops:plan",
  "ops:audit:verify",
  "ops:readiness",
  "ops:history",
  "ops:audit",
  "ops:all",
  "ops:test",
]) {
  assert.equal(typeof pkg.scripts?.[script], "string", `missing package script ${script}`);
}
assert.match(pkg.scripts["ops:audit:verify"], /--verify-only/);
assert.match(pkg.scripts["ops:all"], /^npm run ops:audit:verify/);
assert.match(pkg.scripts["ops:all"], /ops:history/);
assert.match(pkg.scripts["ops:all"], /ops:audit/);
assert.match(pkg.scripts["ops:test"], /gem-ops-audit-ledger\.smoke\.mjs/);

console.log("GEM Ops integration contract passed");
