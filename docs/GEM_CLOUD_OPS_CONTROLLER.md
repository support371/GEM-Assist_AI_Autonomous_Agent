# GEM Cloud Operations Controller

## Purpose

The GEM Cloud Operations Controller is the PC-independent operational monitoring layer for the GEM ecosystem. It is designed to keep producing useful, low-cost operational intelligence while the local Windows workstation is unavailable.

This first build intentionally performs read-only inspection only. It does not merge code, deploy applications, rotate secrets, alter DNS, provision paid infrastructure, change authentication ownership, execute financial actions, place orders, enable withdrawals, or perform destructive operations.

## Current build

The controller currently contains:

1. `config/gem-ops.targets.json` — controlled inventory of public endpoints and priority repositories.
2. `scripts/gem-ops-sentinel.mjs` — dependency-free Node.js sentinel that checks endpoint status, latency, repository state, configured branches, and previous-run delta.
3. `tests/gem-ops-sentinel.smoke.mjs` — local deterministic smoke test that does not rely on external services.
4. `.github/workflows/gem-cloud-ops-sentinel.yml` — scheduled GitHub Actions execution at 07:00 UTC / 08:00 WAT, plus manual dispatch.
5. GitHub Actions cache — small previous-state snapshot so the controller reports changes instead of repeatedly treating every run as a fresh inspection.
6. Workflow artifacts and GitHub Step Summary — JSON and Markdown operational reports retained for review.

## Cost-control design

The controller is deliberately lightweight:

- no paid Manus Cloud Computer dependency;
- no always-on server requirement;
- no database requirement for the first monitoring phase;
- no third-party package installation for the sentinel;
- bounded HTTP timeout;
- bounded concurrency;
- no retry loops;
- no autonomous repair loops;
- delta-oriented reporting;
- 14-day report artifact retention;
- small cached state rather than persistent compute.

GitHub-hosted workflow usage remains subject to the repository/account's GitHub Actions allowance. The controller itself never attempts to upgrade plans or provision billable resources.

## Operational state model

Each target is classified as:

- `healthy`
- `failed`
- `skipped`

The overall controller state is:

- `HEALTHY` — no failed checks;
- `DEGRADED` — medium/low target failure;
- `ACTION_REQUIRED` — high-criticality target failure;
- `CRITICAL` — critical target failure.

Private repositories that the workflow token cannot access are reported as `skipped`, not falsely reported as healthy or failed.

## Security controls

The scheduled workflow grants only:

- `contents: read`
- `actions: write` only for its state-cache operation

The runtime contains no production-write logic.

The monitoring configuration includes an explicit billing guard and keeps financial/crypto systems observational. A connectivity problem must never cause the monitor to enable trading, withdrawals, or any other execution capability.

## Current monitored surface

Initial targets cover the main GEM website, portal/admin domains, the GEM Enterprise preview, Crypto Signal frontend/API, BTCC read-only monitor, and priority repositories including GEM Enterprise, Crypto Signal, fintech microservices, the autonomous-agent project, and Mystery MCP.

This inventory should be expanded only when the target is confirmed to belong to the architecture and the check provides operational value.

## Planned next phases

### Phase 2 — CI/deployment intelligence

Add targeted GitHub Actions status, pull-request readiness, deployment-state and security-alert collectors using authenticated connectors where available.

### Phase 3 — Controller API and dashboard

Expose the latest controller state through the existing agent backend and render a GEM operations dashboard showing current health, change history, blockers, approval-required actions, and access limitations.

### Phase 4 — Safe remediation preparation

Allow the controller to prepare patches, commands, or draft pull requests for detected failures while keeping consequential production actions behind explicit approval gates.

### Phase 5 — Cross-platform orchestration

Connect Vercel, Cloudflare, Supabase, Base44, Replit, Azure DevOps, and other approved cloud systems into the same state model. Local Windows work remains a separate execution node and is queued until the workstation is available.

## Activation policy

The scheduled workflow should remain on a feature branch/draft pull request until reviewed. After approval and merge to the default branch, the daily cron becomes the cloud-side recurring sentinel. Manual workflow execution should be used first to establish the real operating cost and false-positive rate before increasing scope or frequency.
