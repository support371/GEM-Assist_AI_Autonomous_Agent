# GEM Cloud Operations Controller

## Purpose

The GEM Cloud Operations Controller is the PC-independent operational control plane for the GEM ecosystem. It continues bounded, low-cost operational inspection while the local workstation is unavailable; separates application faults from infrastructure/quota pressure; prepares remediation; advises release readiness; preserves bounded history; and provides a verifiable hash-linked audit trail without requiring an always-on paid server.

The controller is deliberately non-destructive. It does not automatically merge code, deploy or roll back applications, rotate secrets, alter DNS, mutate databases, disconnect provider integrations, purchase capacity, upgrade subscriptions, execute financial actions, place orders, enable withdrawals, or perform destructive operations.

## Architecture

### 1. Controlled inventory and collection

`config/gem-ops.targets.json` is the controlled service inventory. It covers GEM Enterprise public/portal/admin endpoints, GEM Assist Enterprise, Crypto Signal frontend and Worker, BTCC read-only monitoring, selected protected Supabase Edge Function probes, priority GitHub repositories/branches, and selected Vercel project metadata.

`scripts/gem-ops-sentinel.mjs` performs bounded read-only collection:

- HTTP status and latency;
- GitHub repository and configured branch state;
- combined commit status and latest GitHub Actions workflow state;
- optional authenticated Vercel deployment-state inspection when `VERCEL_TOKEN` is deliberately supplied;
- previous-run state comparison;
- revision/deployment change detection;
- recovery/resolution detection;
- public-safe and detailed reports.

Optional missing provider credentials are represented as `skipped` rather than invented success.

### 2. Cost and quota guard

`scripts/gem-ops-cost-guard.mjs` separates deployment failures from avoidable build/quota consumption using a separate small GitHub request budget. It detects duplicate Vercel status contexts, successful contexts coexisting with rate-limited duplicates, capacity-blocked contexts, non-quota build failures and inspection limitations.

States are `HEALTHY`, `DUPLICATE_BUILD_SURFACE`, `COST_PRESSURE`, `CAPACITY_BLOCKED`, `BUILD_FAILURE`, and `INSPECTION_LIMITED`.

`automaticPaidUpgradeAllowed` is always false. A quota or rate-limit signal is evidence for consolidation or waiting, not authority to purchase a plan.

### 3. Prepare-only remediation

`scripts/gem-ops-remediation-plan.mjs` converts operational and cost-governance findings into a deterministic P0-P4 queue.

Execution authority is `PREPARE_ONLY`. The planner can define containment, evidence gathering, responsible subsystem, smallest safe corrective direction, validation and rollback preparation. Merge, deployment, rollback, provider disconnection, production linkage changes, secret/DNS/database mutation, financial execution and paid-resource activation remain approval-required.

### 4. Hash-linked audit integrity

`scripts/gem-ops-audit-ledger.mjs` creates a bounded SHA-256 hash chain across controller runs. Each compact event records aggregate operational state, cost state, remediation authority and priorities, release decision, trend, source run timestamp and the previous event hash.

Controls include:

- canonical event hashing;
- `previousHash` chaining from `GENESIS`;
- bounded default retention of 90 events;
- re-anchoring of a truncated retained window so the bounded window remains independently verifiable;
- idempotency per source controller run;
- tamper detection for both event content and chain linkage;
- `GEM_OPS_AUDIT_VERIFY_ONLY=true` to verify cached history without appending an event;
- public-safe output exposing only integrity, event count and a truncated ledger-head hash;
- token-protected access to the detailed ledger.

The scheduled controller verifies the restored audit chain before collecting new operational evidence. If the audit chain is invalid, the verification step fails closed and release readiness also classifies `FAILED` audit integrity as a release blocker.

### 5. Release-readiness advice

`scripts/gem-ops-release-readiness.mjs` combines operational state, build-cost state, remediation priority and audit integrity into one deterministic release decision:

- `READY_FOR_REVIEW` — no current controller blockers or warnings and audit integrity is valid;
- `REVIEW_REQUIRED` — degraded, cost-pressure, access-limited or medium-priority evidence remains;
- `HOLD` — critical/action-required operations, capacity/build blockers, P0/P1 remediation, or failed audit integrity.

Its authority is `ADVISE_ONLY`. `READY_FOR_REVIEW` is not merge permission. Automatic merge, deployment and paid upgrades remain false in every state.

### 6. Bounded history and trend

`scripts/gem-ops-history.mjs` records a compact local history after each controller cycle without making additional network requests. Default retention is 30 runs, with a smaller public dashboard window.

Trend states are `INSUFFICIENT_HISTORY`, `STABLE`, `RECOVERING`, `MIXED`, `DETERIORATING`, and `PERSISTENT_RISK`.

### 7. Controller API and dashboard

`server/gem-ops/routes.ts` exposes public-safe controller state:

- `GET /api/ops/capabilities`;
- `GET /api/ops/summary`;
- `GET /api/ops/cost-summary`;
- `GET /api/ops/remediation-summary`;
- `GET /api/ops/release-readiness`;
- `GET /api/ops/history`.

`server/gem-ops/audit-routes.ts` adds:

- `GET /api/ops/audit-summary`;
- token-protected `GET /api/ops/audit-details`.

Other detailed routes require `X-GEM-Ops-Token` with timing-safe comparison:

- `GET /api/ops/details`;
- `GET /api/ops/cost-details`;
- `GET /api/ops/remediation-details`;
- `GET /api/ops/release-readiness-details`;
- `GET /api/ops/history-details`.

`POST /api/ops/refresh` remains disabled unless `GEM_OPS_ALLOW_REFRESH=true` in a trusted runtime and a valid operations token is supplied. It accepts no arbitrary command or script path.

`client/screens/OpsScreen.tsx` is exposed as an Operations tab. It shows operational state, request usage, release readiness, bounded trend, audit integrity and ledger head, Vercel quota pressure, remediation priorities, provider coverage and explicit authority locks. It contains no secret-entry, merge, deployment, billing-upgrade, trading or destructive controls.

## Cost-control envelope

The routine controller deliberately avoids open-ended agent behavior:

- no LLM required for routine health checks;
- maximum sentinel remote-request budget: 40 by current configuration;
- separate build-cost-guard request budget: 10;
- bounded concurrency and request timeout;
- bounded retry count;
- no recursive repair loop;
- no paid Manus Cloud Computer dependency;
- no always-on local PC dependency;
- no database required for controller state;
- compact cached history and audit state;
- scheduled job hard timeout.

The billing policy remains `never-provision-paid-resources`.

## Scheduled execution

`.github/workflows/gem-cloud-ops-sentinel.yml` is prepared for manual dispatch and daily execution at `07:00 UTC / 08:00 WAT` once present on the default branch.

The intended sequence is:

1. validate controller syntax;
2. run deterministic controller tests;
3. restore bounded controller state;
4. verify cached audit integrity in verify-only mode;
5. run sentinel;
6. run build-cost guard;
7. generate prepare-only remediation;
8. evaluate release readiness using audit integrity;
9. record bounded history;
10. append the new hash-linked audit event;
11. emit public-safe/private summaries;
12. save bounded controller state.

Detailed operational artifacts and the detailed audit ledger are not exposed from a public-repository context.

## Release gate

`.github/workflows/gem-cloud-ops-release-gate.yml` validates deterministic controller tests, TypeScript/server integration, audit-integrity contracts and production-authority invariants. To avoid wasting runner/build capacity during active branch construction, it does not trigger on every push. It is limited to manual execution and the pull request `ready_for_review` transition.

A prior release-gate attempt created jobs that terminated before executing steps and returned no usable job logs. That event is treated as an external runner/account execution limitation, not as evidence that controller tests failed. The branch remains gated until executable release-validation evidence is available.

## Current deployment-cost observation

Recent branch revisions have demonstrated the cost-pressure condition the controller is designed to classify: multiple Vercel contexts are attached to one revision, successful contexts can coexist with redundant contexts that report `build-rate-limit`. This is deployment-capacity/cost-governance evidence, not automatically an application-code failure.

The controller does not automatically upgrade Vercel, delete projects, disconnect Git integrations or choose a production deployment. Those actions require explicit ownership confirmation and approval because removing the wrong integration could remove the authoritative deployment path.

## Security boundaries

1. Routine collection is read-only.
2. Missing optional credentials produce `skipped`, not invented success.
3. Detailed reports, history and audit ledger are protected from public API exposure.
4. Detailed API routes require timing-safe operations-token comparison.
5. Remote refresh is disabled by default.
6. Remote refresh accepts no arbitrary command path.
7. Remediation is `PREPARE_ONLY`.
8. Release readiness is `ADVISE_ONLY`.
9. Audit-chain failure is fail-closed for release readiness.
10. Financial/crypto targets remain observational and fail-closed.
11. No health failure can enable trading, withdrawal or financial execution.
12. No monitoring/quota failure can trigger a paid-resource purchase.
13. Provider disconnection/deletion remains approval-gated.

## Supabase advisor handling

Security-advisor findings are evidence for review, not instructions for automatic schema mutation. An RLS-enabled table with no public policy can be intentional for service-role-only data. The controller therefore does not automatically create policies or expose private tables. Database remediation must validate the intended access model table by table before mutation.

## Deterministic test suite

The branch contains dependency-light deterministic coverage for:

- sentinel health/failure/recovery and request accounting;
- cost-guard duplicate/rate-limit classification with fixture mode;
- remediation priorities and approval boundaries;
- release-readiness READY/REVIEW/HOLD decisions including failed audit integrity;
- bounded history retention and trend calculation;
- audit hash-chain linkage, idempotency and tamper detection;
- end-to-end static integration across Express registration, audit/API routes, dashboard calls, navigation, scheduler, release gate and package commands.

`npm run ops:test` runs the full deterministic controller suite. `npm run ops:all` executes the fixed operational cycle including audit append.

## Rollout status

Implemented on `feat/gem-cloud-ops-controller`:

- endpoint/repository delta sentinel;
- GitHub CI and optional Vercel deployment intelligence;
- Supabase protected endpoint reachability surface;
- build-cost/rate-limit guard;
- deterministic operational + cost remediation queue;
- hash-linked audit integrity layer;
- audit-gated release-readiness advice;
- bounded history/trend;
- secured controller API and audit routes;
- application Operations dashboard;
- daily scheduler definition;
- manual/ready-review release gate;
- authority and integration contract tests.

Still deliberately outside autonomous authority:

- merging PR #8;
- production deployment/promotion;
- Vercel project/Git-integration cleanup;
- paid plan activation;
- secret/DNS/database mutation;
- automatic patch commits or production self-healing;
- authenticated Cloudflare/Base44/Replit/Azure collectors where a free approved runtime/permission path is not currently available;
- Windows/local-PC execution while the workstation is offline.

## Activation policy

The controller remains on a draft pull request. Scheduled execution becomes active from the default branch only after executable release validation and explicit merge authorization. Preview/status integrations may react to feature-branch commits, but the controller itself does not promote those builds, purchase capacity or activate production changes.
