# GEM Cloud Operations Controller

## Purpose

The GEM Cloud Operations Controller is the PC-independent operational control plane for the GEM ecosystem. It keeps producing bounded, low-cost operational intelligence while the local Windows workstation is unavailable and converts detected failures into a prepare-only remediation queue.

The current controller is intentionally non-destructive. It does not merge code, deploy applications, roll back production, rotate secrets, alter DNS, mutate databases, provision paid infrastructure, change authentication ownership, execute financial actions, place orders, enable withdrawals, or perform destructive operations.

## Implemented architecture

The branch now contains four cooperating layers.

### 1. Inventory and collection

`config/gem-ops.targets.json` is the controlled service inventory. It currently describes:

- GEM Enterprise public, portal and admin endpoints;
- GEM Assist Enterprise deployment;
- Crypto Signal frontend and Cloudflare Worker;
- BTCC read-only monitor;
- protected GEM Supabase Edge Function probes;
- priority GitHub repositories and branches;
- Vercel project metadata for GEM Enterprise, Crypto Signal and GEM Assist Enterprise;
- the current GEM Supabase project context.

`scripts/gem-ops-sentinel.mjs` performs the actual read-only collection. It supports:

- HTTP status and latency checks;
- GitHub repository and branch state;
- combined commit status and latest GitHub Actions workflow state;
- authenticated Vercel deployment-state inspection when `VERCEL_TOKEN` is supplied;
- graceful `skipped` classification when optional provider credentials are unavailable;
- previous-run state comparison;
- revision/deployment change detection;
- recovery/resolution detection;
- public-safe and detailed report generation.

### 2. Cost and execution envelope

Every sentinel run is bounded by configuration rather than open-ended agent behavior:

- maximum remote-request budget;
- maximum concurrency;
- per-request timeout;
- bounded retry count;
- no recursive repair loop;
- no LLM requirement for routine monitoring;
- no paid cloud-computer dependency;
- no always-on local PC dependency;
- no required database for controller state;
- small cached previous-state snapshot.

The default billing policy is `never-provision-paid-resources`. The controller can observe failures caused by billing or quota conditions, but it does not purchase capacity, upgrade subscriptions or create a financial commitment.

### 3. Remediation preparation

`scripts/gem-ops-remediation-plan.mjs` converts failed, degraded and access-limited findings into a deterministic queue using priorities `P0` through `P4`.

Its execution authority is permanently represented as `PREPARE_ONLY`. It can specify containment, evidence gathering, likely ownership, patch preparation and validation/rollback preparation. It explicitly marks merge, deploy, rollback, secret rotation, DNS mutation, database mutation, financial execution and paid-resource activation as approval-required actions.

The planner writes:

- `remediation-plan.json` — detailed queue;
- `remediation-plan.md` — human-readable queue;
- `remediation-summary.json` — public-safe priority counts without target names or evidence.

### 4. Controller API and UI

`server/gem-ops/routes.ts` exposes the controller through the existing application backend:

- `GET /api/ops/capabilities` — public-safe capability/guardrail metadata;
- `GET /api/ops/summary` — public-safe operational aggregate;
- `GET /api/ops/remediation-summary` — public-safe remediation priority aggregate;
- `GET /api/ops/details` — detailed report protected by `X-GEM-Ops-Token`;
- `GET /api/ops/remediation-details` — detailed remediation plan protected by the same token;
- `POST /api/ops/refresh` — fixed read-only sentinel + planner execution, disabled unless `GEM_OPS_ALLOW_REFRESH=true` and an operations token is valid.

The refresh endpoint accepts no arbitrary command or user-controlled script argument. It invokes only the fixed controller scripts and remains disabled by default.

`client/screens/OpsScreen.tsx` adds a GEM Operations dashboard to the application. It displays overall health, checked/healthy/degraded/failed/skipped counts, material changes, resolved findings, remote-request usage, billing guard, provider coverage and the P0-P3 prepare-only remediation queue. The screen exposes no secret-entry or production-mutation controls.

## Scheduled execution

`.github/workflows/gem-cloud-ops-sentinel.yml` is configured for:

- manual dispatch;
- daily execution at 07:00 UTC / 08:00 WAT after activation on the default branch;
- Node syntax validation;
- deterministic sentinel and remediation-planner smoke tests;
- cached previous-state restoration;
- sentinel execution;
- remediation-plan generation;
- public-safe step summary when the repository is public;
- detailed report artifact only when the repository is private;
- bounded eight-minute job timeout.

The workflow requests only read-oriented repository/action permissions. Vercel inspection is optional and uses `VERCEL_TOKEN` only if a scoped secret is deliberately supplied.

## State model

Individual targets can be:

- `healthy` — the expected operational condition is observed;
- `degraded` — service is available but CI/deployment state needs review;
- `failed` — an expected availability, branch, CI or deployment condition failed;
- `skipped` — the target cannot be inspected with the current minimum read scope or inspection is intentionally optional.

Overall state is:

- `HEALTHY` — no failed/degraded checks;
- `DEGRADED` — lower-severity failure or degraded condition;
- `ACTION_REQUIRED` — high-criticality failure;
- `CRITICAL` — critical target failure.

`NOT_INITIALIZED` is returned by the API before a report exists in the running application environment. It is intentionally not represented as healthy.

## Security boundaries

The controller follows these boundaries:

1. Routine collection is read-only.
2. Missing optional credentials produce `skipped`, not invented success.
3. Detailed reports are not published in public workflow summaries.
4. Detailed API routes require a timing-safe token comparison.
5. Remote refresh is disabled unless explicitly enabled in a trusted runtime.
6. Remote refresh can execute only fixed controller scripts.
7. Financial and crypto targets remain observational and fail-closed.
8. No alert or health failure can enable trading, withdrawal or financial-execution capability.
9. No monitoring failure can trigger a paid-resource purchase.
10. Consequential remediation remains approval-gated.

## Supabase security-advisor handling

Security-advisor findings are evidence for review, not instructions for automatic schema mutation. In particular, an RLS-enabled table with no public policy can be intentional for service-role-only data. The controller therefore does not automatically create RLS policies or expose currently private tables. Any future database remediation must first validate the intended access model table by table.

## Test coverage

`tests/gem-ops-sentinel.smoke.mjs` verifies:

- health and failure classification;
- bounded remote-request accounting;
- first-run behavior;
- recovery detection on a subsequent run;
- public-safe summary output.

`tests/gem-ops-remediation-plan.smoke.mjs` verifies:

- prepare-only authority;
- destructive-action lock;
- priority calculation;
- approval boundaries;
- public-safe remediation counts.

These tests use deterministic local fixtures and do not depend on production services.

## Current rollout status

Completed in this branch:

- Phase 1 — endpoint/repository sentinel and delta memory;
- Phase 2 — CI and Vercel deployment intelligence;
- Phase 3 — controller API and application dashboard;
- Phase 4A — deterministic prepare-only remediation queue;
- Phase 5A — GitHub, HTTP, Vercel and Supabase surface integration.

Still deliberately gated:

- automatic patch commits or draft-PR generation from a detected incident;
- Cloudflare account-level authenticated telemetry beyond public endpoint checks;
- Base44/Replit/Azure DevOps authenticated collectors where an approved connector/runtime is not yet wired into this controller;
- production mutation and self-healing;
- Windows/local-PC execution while the workstation is offline.

## Activation policy

The controller remains on `feat/gem-cloud-ops-controller` in a draft pull request. Scheduled execution becomes active from the default branch only after review and explicit merge authorization. Until that point, preview builds and branch validation may run through already-connected CI/deployment integrations, but the controller itself does not promote or activate production changes.
