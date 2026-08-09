# GEM Cloud Operations Controller

## Purpose

The GEM Cloud Operations Controller is the PC-independent operational control plane for the GEM ecosystem. It is designed to keep producing bounded, low-cost operational intelligence while the local Windows workstation is unavailable, distinguish application failures from infrastructure/quota pressure, prepare remediation, advise release readiness, and preserve a small operational history without requiring an always-on paid server.

The controller is deliberately non-destructive. It does not automatically merge code, deploy or roll back applications, rotate secrets, alter DNS, mutate databases, disconnect provider integrations, purchase capacity, upgrade subscriptions, execute financial actions, place orders, enable withdrawals, or perform destructive operations.

## Implemented architecture

The controller now consists of seven cooperating layers.

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

`scripts/gem-ops-cost-guard.mjs` separates deployment failures from avoidable build/quota consumption. It uses a separate small GitHub request budget and detects:

- duplicate Vercel status/deployment contexts attached to the same revision;
- successful contexts coexisting with rate-limited duplicate contexts;
- capacity-blocked contexts;
- non-quota build failures;
- inspection limitations.

Its state model is:

- `HEALTHY`;
- `DUPLICATE_BUILD_SURFACE`;
- `COST_PRESSURE`;
- `CAPACITY_BLOCKED`;
- `BUILD_FAILURE`;
- `INSPECTION_LIMITED`.

`automaticPaidUpgradeAllowed` is always false. A rate limit is evidence for consolidation or waiting, not authority to purchase a plan.

### 3. Prepare-only remediation

`scripts/gem-ops-remediation-plan.mjs` converts operational and cost-governance findings into a deterministic P0-P4 queue.

Execution authority is `PREPARE_ONLY`. The planner can define containment, evidence gathering, responsible subsystem, smallest safe corrective direction, validation and rollback preparation. It marks merge, deployment, rollback, provider disconnection, production linkage changes, secret/DNS/database mutation, financial execution and paid-resource activation as approval-required.

Cost-pressure findings become explicit cost-governance tasks instead of being confused with application defects.

### 4. Release-readiness advice

`scripts/gem-ops-release-readiness.mjs` combines operational state, build-cost state and remediation priority into one deterministic release decision:

- `READY_FOR_REVIEW` — no current controller blockers/warnings;
- `REVIEW_REQUIRED` — degraded, cost-pressure, access-limited or medium-priority evidence remains;
- `HOLD` — critical/action-required operations, capacity/build blockers or P0/P1 remediation remains.

Its authority is `ADVISE_ONLY`. `READY_FOR_REVIEW` is not merge permission. Automatic merge, deployment and paid upgrades remain false for every decision state.

### 5. Bounded history and trend

`scripts/gem-ops-history.mjs` records a compact local history after each controller cycle without making additional network requests.

Default retention is 30 runs, with a smaller public dashboard window. The trend model is:

- `INSUFFICIENT_HISTORY`;
- `STABLE`;
- `RECOVERING`;
- `MIXED`;
- `DETERIORATING`;
- `PERSISTENT_RISK`.

This allows recurring problems to be distinguished from one-off failures while keeping storage and compute bounded.

### 6. Controller API

`server/gem-ops/routes.ts` is registered directly from the existing Express application and exposes public-safe controller state:

- `GET /api/ops/capabilities`;
- `GET /api/ops/summary`;
- `GET /api/ops/cost-summary`;
- `GET /api/ops/remediation-summary`;
- `GET /api/ops/release-readiness`;
- `GET /api/ops/history`.

Detailed routes require `X-GEM-Ops-Token` using timing-safe comparison:

- `GET /api/ops/details`;
- `GET /api/ops/cost-details`;
- `GET /api/ops/remediation-details`;
- `GET /api/ops/release-readiness-details`;
- `GET /api/ops/history-details`.

`POST /api/ops/refresh` remains disabled unless `GEM_OPS_ALLOW_REFRESH=true` in a trusted runtime and a valid operations token is supplied. It accepts no arbitrary script/command argument. Its fixed sequence is sentinel -> cost guard -> remediation -> readiness -> history.

### 7. GEM Operations dashboard

`client/screens/OpsScreen.tsx` is exposed as an Operations tab in the existing application. The dashboard shows:

- operational health and delta metrics;
- request usage and billing guard;
- release-readiness state, blockers and warnings;
- bounded operational trend;
- Vercel duplicate/rate-limit pressure;
- remediation priority and cost-governance counts;
- provider surface;
- explicit authority locks.

The screen has no secret-entry, merge, deployment, billing-upgrade, trading or destructive control.

## Cost-control envelope

The routine controller deliberately avoids open-ended agent behavior:

- no LLM required for routine health checks;
- maximum sentinel remote-request budget: 40 by current configuration;
- separate build-cost-guard request budget: 10;
- bounded concurrency;
- per-request timeout;
- bounded retry count;
- no recursive repair loop;
- no paid Manus Cloud Computer dependency;
- no always-on local PC dependency;
- no database required for controller state;
- compact cached state/history;
- scheduled job hard timeout.

The billing policy remains `never-provision-paid-resources`.

## Scheduled execution

`.github/workflows/gem-cloud-ops-sentinel.yml` is prepared for manual dispatch and daily execution at `07:00 UTC / 08:00 WAT` once the workflow exists on the default branch.

The intended sequence is:

1. validate controller syntax;
2. run deterministic controller tests;
3. restore bounded prior state/history;
4. run sentinel;
5. run build-cost guard;
6. generate prepare-only remediation;
7. evaluate release readiness;
8. record bounded history;
9. emit public-safe/private summaries;
10. save bounded controller state.

Detailed operational artifacts are not exposed from a public repository context.

## Release gate

`.github/workflows/gem-cloud-ops-release-gate.yml` validates deterministic controller tests, TypeScript/server integration and production-authority invariants. To avoid wasting runner/build capacity during active branch construction, it does not trigger on every push. It is limited to manual execution and the pull request `ready_for_review` transition.

A prior release-gate attempt created jobs that terminated before executing steps and returned no usable job logs. That event is therefore treated as an external runner/account execution limitation, not as evidence that controller tests failed. The branch remains gated until executable validation evidence is available.

## Current deployment-cost observation

The current branch head has demonstrated the exact condition the cost guard is designed to classify: multiple Vercel contexts are attached to one revision, two contexts currently report successful deployment status while three redundant contexts report `build-rate-limit`. That combination is `COST_PRESSURE`, not proof of an application build failure.

The controller does not automatically upgrade Vercel, delete projects, disconnect Git integrations or choose a production deployment. Those actions require explicit ownership confirmation and approval because removing the wrong integration could remove the authoritative deployment path.

## Security boundaries

1. Routine collection is read-only.
2. Missing optional credentials produce `skipped`, not invented success.
3. Detailed reports/history are protected from public API exposure.
4. Detailed API routes require a timing-safe operations token comparison.
5. Remote refresh is disabled by default.
6. Remote refresh can execute only fixed controller scripts.
7. Remediation is `PREPARE_ONLY`.
8. Release readiness is `ADVISE_ONLY`.
9. Financial/crypto targets remain observational and fail-closed.
10. No health failure can enable trading, withdrawal or financial execution.
11. No monitoring/quota failure can trigger a paid-resource purchase.
12. Provider disconnection/deletion remains approval-gated.

## Supabase advisor handling

Security-advisor findings are evidence for review, not instructions for automatic schema mutation. An RLS-enabled table with no public policy can be intentional for service-role-only data. The controller therefore does not automatically create policies or expose private tables. Database remediation must validate the intended access model table by table before mutation.

## Deterministic test suite

The branch contains dependency-light deterministic coverage for:

- sentinel health/failure/recovery and request accounting;
- cost-guard duplicate/rate-limit classification with fixture mode;
- remediation priorities and approval boundaries;
- release-readiness READY/REVIEW/HOLD decisions;
- bounded history retention and trend calculation;
- end-to-end static integration contract across Express registration, API routes, dashboard calls, navigation, scheduler, release gate and package commands.

`npm run ops:test` runs the full deterministic controller suite. `npm run ops:all` executes the fixed operational cycle in order.

## Current rollout status

Implemented on `feat/gem-cloud-ops-controller`:

- endpoint/repository delta sentinel;
- GitHub CI and optional Vercel deployment intelligence;
- Supabase protected endpoint reachability surface;
- build-cost/rate-limit guard;
- deterministic operational + cost remediation queue;
- release-readiness advice;
- bounded history/trend;
- secured controller API;
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
