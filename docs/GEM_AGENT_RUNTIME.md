# GEM Autonomous Agent Runtime

## Purpose

GEM Autonomous Agent is designed to complete bounded engineering and operations tasks with verifiable evidence. High performance does not mean unrestricted authority: the agent is optimized to inspect, reason, use approved workspace tools, validate results, and stop when evidence is insufficient.

## Execution model

The agent runs a staged control loop:

1. **Plan** — produce the smallest complete plan, capped by `maxPlanTasks`.
2. **Execute** — work one task at a time with a bounded `maxToolCallsPerTask` budget.
3. **Observe** — feed actual tool results back into the execution stage.
4. **Verify** — independently evaluate whether the task objective is supported by evidence.
5. **Retry** — retry only within the configured retry ceiling when verification does not meet the confidence threshold.
6. **Stop fail-closed** — a task that cannot be verified stops the goal rather than allowing unsupported work to cascade.

The default model is configurable with `AI_AGENT_MODEL` or `AI_AGENT_CHAT_MODEL`. The runtime records the model, tool-call count, completed/failed tasks, average verification confidence, and the `fail-closed` trust mode in agent state.

## Trust boundaries

### Files

Agent filesystem operations stay inside `AGENT_WORKSPACE_ROOT`. Secret-bearing files are not readable, writable, patchable, searchable, or included in file-tree output. This includes real `.env` variants, private keys, credential/token files, and common cloud/SSH credential locations. Template environment files such as `.env.example` remain usable for development documentation.

### Network

`fetch_url` allows only public HTTP(S) destinations. URL credentials, loopback addresses, private networks, link-local ranges, multicast/reserved ranges, local hostnames, and cloud metadata hosts are blocked. Redirect destinations are revalidated before they are followed.

### Commands

Command execution uses `shell: false`, a narrow command allowlist, restricted package-manager actions, blocked Node evaluation/preload flags, and a sanitized child environment. API keys, tokens, passwords, database URLs, Redis URLs, cookies, and other ambient process secrets are not inherited by child commands.

By default, command execution is disabled when secret-bearing files are detected inside the workspace. `AGENT_ALLOW_COMMANDS_WITH_SECRET_FILES=true` is an explicit local-runtime override and should not be enabled in unattended or shared environments.

A non-zero process exit code is a failed tool result, not a successful execution with an error hidden in stdout/stderr.

## Verification policy

Malformed or unparsable verification output is a failure, not an assumed success. When reflection is enabled, task completion requires both a positive verification decision and the configured minimum confidence. The default confidence threshold is 70%.

The agent never treats a proposed action as an executed action. Deployment, repository mutation, secret rotation, billing changes, financial operations, DNS changes, database mutations, trading, and withdrawals require separate authority and direct execution evidence.

## Cloud runtime layers

The deployed application has two distinct runtime layers:

- **Core streamed chat** — requires database + AI provider connectivity and can operate without Redis.
- **Queued autonomous worker** — additionally requires Redis and an active worker process for resumable background goals and event streaming.

The Vercel runtime bridge and the queued worker must be validated independently. A healthy web page is not sufficient evidence that the queued autonomous worker is operational.

## Operations-controller integration

The protected controller cycle is:

`audit verify -> sentinel -> cost guard -> remediation plan -> release readiness -> bounded history -> audit append -> operator review package`

The scheduled workflow generates the evidence-bound operator review package on every completed cycle. The package remains `executionAuthority: NONE`; it is evidence for an operator decision, not self-granted production authority.

## Required release evidence

Before calling the full agent production-ready, capture all of the following:

- deterministic controller and agent trust tests pass;
- TypeScript/build validation passes;
- deployed `/api/runtime/health` confirms required private dependencies without exposing their values;
- conversation create/read/update/delete works;
- streamed AI response completes and persists;
- queued worker accepts a bounded goal when Redis/worker runtime is enabled;
- a tool-using goal demonstrates real observation -> verification behavior;
- a deliberately failing command is classified as failure;
- a deliberately malformed verification result is not accepted as success;
- operator-review package generation completes after audit append;
- no paid upgrade or production authority change is required merely to pass validation.
