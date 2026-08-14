# GEM Operator Review Boundary

## Purpose

The operator-review layer binds a prospective decision to an exact evidence snapshot without granting the controller authority to execute that decision.

`scripts/gem-ops-review-package.mjs` produces `review-package.json`, `review-package.md`, and a public-safe summary after the scheduled controller has completed collection, cost classification, remediation planning, release advice, history recording, and audit append.

## Evidence binding

The package computes SHA-256 digests for:

- `latest.json` — operational evidence;
- `cost-guard.json` — cost/quota evidence;
- `remediation-plan.json` — proposed prepare-only work;
- `release-readiness.json` — release advice;
- `history-summary.json` — bounded trend evidence;
- `audit-summary.json` — audit-chain integrity/head evidence.

Those file digests are combined into an `evidenceDigest`, and the complete package core is bound by `packageDigest`.

A later approval mechanism must reference the exact full `packageDigest`; it must never approve a floating branch name, a mutable dashboard view, or an unbound text instruction.

## Eligibility

`READY_FOR_OPERATOR_REVIEW` means only that:

- release readiness is not `HOLD`; and
- audit integrity is `VALID`.

`NOT_ELIGIBLE` means the package must not be used as the basis for a consequential approval.

`REVIEW_REQUIRED` release state can still produce a review-eligible package because its purpose is to present warnings to the human operator, not to bypass them.

## Expiration

The default review-package lifetime is 60 minutes. Expiration is evidence that the package should be regenerated before any later approval decision because repository, deployment, quota, service-health, remediation or audit state may have changed.

## Authority

Every generated package has:

- `executionAuthority: NONE`;
- `approvalRecorded: false`;
- `automaticMergeAllowed: false`;
- `automaticDeploymentAllowed: false`;
- `automaticPaidUpgradeAllowed: false`;
- `financialExecutionAllowed: false`.

Generating or viewing a review package is not equivalent to approval.

## Future approval-record contract

If an approval-record capability is added later, it should require all of the following:

1. an unexpired full `packageDigest`;
2. explicit operator identity and authorization scope;
3. an enumerated action from a narrow allowlist;
4. exact target repository/project/environment;
5. exact revision or deployment identifier;
6. explicit acknowledgment of warnings from the bound package;
7. a short approval validity window;
8. append-only/hash-linked approval audit evidence;
9. one-time idempotency semantics;
10. post-action verification and a separately recorded result.

The approval record itself should not execute actions. Execution should remain a separate adapter with its own authorization and validation boundary.

## Permanently separate financial boundary

General software/deployment review packages must never confer trading, withdrawal, custody, payment, or other financial-execution authority. Financial execution requires a separate domain-specific control plane and approvals even if the infrastructure release package is otherwise valid.
