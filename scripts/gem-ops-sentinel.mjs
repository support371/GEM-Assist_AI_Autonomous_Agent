#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CONFIG_PATH = process.env.GEM_OPS_CONFIG || "config/gem-ops.targets.json";
const OUTPUT_DIR = process.env.GEM_OPS_OUTPUT_DIR || "artifacts/gem-ops";
const PREVIOUS_STATE = process.env.GEM_OPS_PREVIOUS_STATE || ".gem-ops-cache/latest.json";
const USER_AGENT = "GEM-Cloud-Ops-Sentinel/2.0";

const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
let remoteRequests = 0;
let maxRemoteRequests = 40;

function nowIso() {
  return new Date().toISOString();
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function summarizeStatus(results) {
  const failures = results.filter((r) => r.state === "failed");
  const degraded = results.filter((r) => r.state === "degraded");
  if (failures.some((r) => r.criticality === "critical")) return "CRITICAL";
  if (failures.some((r) => r.criticality === "high")) return "ACTION_REQUIRED";
  if (failures.length || degraded.length) return "DEGRADED";
  return "HEALTHY";
}

function consumeRequestBudget(url) {
  remoteRequests += 1;
  if (remoteRequests > maxRemoteRequests) {
    const error = new Error(`Remote request budget exceeded (${maxRemoteRequests}) while requesting ${url}`);
    error.code = "REQUEST_BUDGET_EXCEEDED";
    throw error;
  }
}

async function timedFetch(url, options = {}, timeoutMs = 12000) {
  consumeRequestBudget(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "manual",
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json, text/html;q=0.9, */*;q=0.8",
        ...(options.headers || {}),
      },
    });
    return { response, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

async function checkHttp(target, timeoutMs, maxRetries) {
  const expected = target.expectedStatus || [200];
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const { response, latencyMs } = await timedFetch(target.url, { method: "GET" }, timeoutMs);
      const ok = expected.includes(response.status);
      const retryable = response.status >= 500;
      if (!ok && retryable && attempt < maxRetries) continue;
      return {
        kind: "http",
        id: target.id,
        name: target.name,
        target: target.url,
        criticality: target.criticality || "medium",
        state: ok ? "healthy" : "failed",
        statusCode: response.status,
        latencyMs,
        observedAt: nowIso(),
        fingerprint: `http:${response.status}`,
        evidence: ok
          ? `HTTP ${response.status} in ${latencyMs}ms`
          : `Unexpected HTTP ${response.status}; expected ${expected.join(", ")}`,
      };
    } catch (error) {
      lastError = error;
      if (error?.code === "REQUEST_BUDGET_EXCEEDED") break;
      if (attempt < maxRetries) continue;
    }
  }

  return {
    kind: "http",
    id: target.id,
    name: target.name,
    target: target.url,
    criticality: target.criticality || "medium",
    state: "failed",
    observedAt: nowIso(),
    fingerprint: "http:error",
    evidence:
      lastError?.name === "AbortError"
        ? `Timed out after ${timeoutMs}ms`
        : String(lastError?.message || lastError || "Unknown HTTP failure"),
  };
}

async function githubApi(pathname, timeoutMs) {
  const headers = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return timedFetch(`https://api.github.com${pathname}`, { headers }, timeoutMs);
}

async function inspectCi(owner, name, branchName, sha, timeoutMs) {
  const ci = {
    combinedStatus: "unknown",
    workflowStatus: "unknown",
    workflowConclusion: "unknown",
    workflowName: null,
    workflowUrl: null,
  };

  if (!sha) return ci;

  try {
    const statusRequest = await githubApi(`/repos/${owner}/${name}/commits/${sha}/status`, timeoutMs);
    if (statusRequest.response.ok) {
      const status = await statusRequest.response.json();
      ci.combinedStatus = status.state || "unknown";
    }
  } catch {
    // CI metadata is supplementary; repository availability remains authoritative.
  }

  try {
    const actionsRequest = await githubApi(
      `/repos/${owner}/${name}/actions/runs?branch=${encodeURIComponent(branchName)}&per_page=1`,
      timeoutMs,
    );
    if (actionsRequest.response.ok) {
      const actions = await actionsRequest.response.json();
      const run = actions.workflow_runs?.[0];
      if (run) {
        ci.workflowStatus = run.status || "unknown";
        ci.workflowConclusion = run.conclusion || "pending";
        ci.workflowName = run.name || null;
        ci.workflowUrl = run.html_url || null;
      }
    }
  } catch {
    // Keep unknown rather than turning missing CI metadata into a false outage.
  }

  return ci;
}

function ciState(ci) {
  if (["failure", "error"].includes(ci.combinedStatus)) return "failed";
  if (["failure", "timed_out", "startup_failure", "action_required"].includes(ci.workflowConclusion)) return "failed";
  if (["queued", "in_progress", "waiting", "pending"].includes(ci.workflowStatus)) return "degraded";
  return "healthy";
}

async function checkRepository(repo, timeoutMs) {
  const [owner, name] = repo.name.split("/");
  if (!owner || !name) {
    return {
      kind: "repository",
      id: repo.name,
      name: repo.name,
      criticality: repo.criticality || "medium",
      state: "failed",
      observedAt: nowIso(),
      fingerprint: "repo:invalid",
      evidence: "Invalid owner/repository name",
    };
  }

  try {
    const { response, latencyMs } = await githubApi(`/repos/${owner}/${name}`, timeoutMs);
    if (response.status === 404 && repo.visibility === "private") {
      return {
        kind: "repository",
        id: repo.name,
        name: repo.name,
        criticality: repo.criticality || "medium",
        state: "skipped",
        observedAt: nowIso(),
        fingerprint: "repo:private-unreachable",
        evidence: "Private repository not reachable by this workflow token; connector or scoped read token required",
      };
    }
    if (!response.ok) {
      return {
        kind: "repository",
        id: repo.name,
        name: repo.name,
        criticality: repo.criticality || "medium",
        state: "failed",
        observedAt: nowIso(),
        fingerprint: `repo:http-${response.status}`,
        evidence: `GitHub repository API returned HTTP ${response.status}`,
      };
    }

    const metadata = await response.json();
    const branchName = repo.branch || metadata.default_branch;
    let branchState = "healthy";
    let branchEvidence = `default=${metadata.default_branch}`;
    let revision = null;

    if (branchName) {
      const branch = await githubApi(`/repos/${owner}/${name}/branches/${encodeURIComponent(branchName)}`, timeoutMs);
      if (!branch.response.ok) {
        branchState = "failed";
        branchEvidence = `Configured branch ${branchName} returned HTTP ${branch.response.status}`;
      } else {
        const branchData = await branch.response.json();
        revision = branchData.commit?.sha || null;
        branchEvidence = `branch=${branchName} sha=${revision?.slice(0, 12) || "unknown"}`;
      }
    }

    const ci = repo.inspectCi && revision ? await inspectCi(owner, name, branchName, revision, timeoutMs) : null;
    const derivedCiState = ci ? ciState(ci) : "healthy";
    const state = metadata.archived || branchState === "failed" || derivedCiState === "failed"
      ? "failed"
      : derivedCiState === "degraded"
        ? "degraded"
        : "healthy";

    const ciEvidence = ci
      ? `; CI combined=${ci.combinedStatus}, workflow=${ci.workflowStatus}/${ci.workflowConclusion}`
      : "";

    return {
      kind: "repository",
      id: repo.name,
      name: repo.name,
      target: metadata.html_url,
      criticality: repo.criticality || "medium",
      state,
      observedAt: nowIso(),
      latencyMs,
      defaultBranch: metadata.default_branch,
      branch: branchName,
      revision,
      archived: Boolean(metadata.archived),
      pushedAt: metadata.pushed_at,
      ci,
      fingerprint: `repo:${state}:${revision || "unknown"}:${ci?.combinedStatus || "na"}:${ci?.workflowConclusion || "na"}`,
      evidence: metadata.archived
        ? "Repository is archived"
        : `${branchEvidence}; pushed=${metadata.pushed_at || "unknown"}${ciEvidence}`,
    };
  } catch (error) {
    return {
      kind: "repository",
      id: repo.name,
      name: repo.name,
      criticality: repo.criticality || "medium",
      state: "failed",
      observedAt: nowIso(),
      fingerprint: "repo:error",
      evidence: error?.name === "AbortError" ? `Timed out after ${timeoutMs}ms` : String(error?.message || error),
    };
  }
}

async function checkVercelProject(project, teamId, timeoutMs) {
  if (!process.env.VERCEL_TOKEN) {
    return {
      kind: "vercel",
      id: project.id,
      name: project.name,
      criticality: project.criticality || "medium",
      state: "skipped",
      observedAt: nowIso(),
      fingerprint: "vercel:no-token",
      evidence: "VERCEL_TOKEN not configured; authenticated deployment-state inspection skipped",
    };
  }

  try {
    const params = new URLSearchParams({
      projectId: project.id,
      teamId,
      limit: "5",
    });
    if (project.target) params.set("target", project.target);

    const { response, latencyMs } = await timedFetch(
      `https://api.vercel.com/v7/deployments?${params.toString()}`,
      {
        headers: {
          authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
          accept: "application/json",
        },
      },
      timeoutMs,
    );

    if (!response.ok) {
      return {
        kind: "vercel",
        id: project.id,
        name: project.name,
        criticality: project.criticality || "medium",
        state: "failed",
        observedAt: nowIso(),
        fingerprint: `vercel:http-${response.status}`,
        evidence: `Vercel deployments API returned HTTP ${response.status}`,
      };
    }

    const payload = await response.json();
    const deployments = payload.deployments || [];
    if (!deployments.length) {
      return {
        kind: "vercel",
        id: project.id,
        name: project.name,
        criticality: project.criticality || "medium",
        state: project.allowNoProductionDeployment ? "skipped" : "failed",
        observedAt: nowIso(),
        fingerprint: "vercel:no-deployment",
        evidence: project.allowNoProductionDeployment
          ? `No ${project.target || "matching"} deployment found; allowed by configuration`
          : `No ${project.target || "matching"} deployment found`,
      };
    }

    const latest = deployments[0];
    const latestReady = deployments.find((d) => (d.state || d.readyState) === "READY");
    const latestState = latest.state || latest.readyState || "UNKNOWN";
    const hardFailure = ["ERROR", "BLOCKED"].includes(latestState);
    const noReady = !latestReady;
    const state = hardFailure && noReady ? "failed" : hardFailure ? "degraded" : "healthy";

    return {
      kind: "vercel",
      id: project.id,
      name: project.name,
      criticality: project.criticality || "medium",
      state,
      observedAt: nowIso(),
      latencyMs,
      deploymentId: latest.id || latest.uid || null,
      deploymentState: latestState,
      deploymentUrl: latest.url ? `https://${latest.url}` : null,
      deploymentCreatedAt: latest.created || latest.createdAt || null,
      latestReadyDeploymentId: latestReady?.id || latestReady?.uid || null,
      revision: latest.meta?.githubCommitSha || null,
      branch: latest.meta?.githubCommitRef || null,
      fingerprint: `vercel:${state}:${latest.id || latest.uid || "unknown"}:${latestState}`,
      evidence: `latest=${latestState}${latest.meta?.githubCommitRef ? ` branch=${latest.meta.githubCommitRef}` : ""}${latest.meta?.githubCommitSha ? ` sha=${latest.meta.githubCommitSha.slice(0, 12)}` : ""}`,
    };
  } catch (error) {
    return {
      kind: "vercel",
      id: project.id,
      name: project.name,
      criticality: project.criticality || "medium",
      state: "failed",
      observedAt: nowIso(),
      fingerprint: "vercel:error",
      evidence: error?.name === "AbortError" ? `Timed out after ${timeoutMs}ms` : String(error?.message || error),
    };
  }
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker));
  return out;
}

function buildDelta(current, previous) {
  if (!previous?.results) return { firstRun: true, materialChanges: [], resolved: [] };
  const before = new Map(previous.results.map((r) => [`${r.kind}:${r.id}`, r]));
  const after = new Map(current.map((r) => [`${r.kind}:${r.id}`, r]));
  const changes = [];
  const resolved = [];

  for (const item of current) {
    const key = `${item.kind}:${item.id}`;
    const prior = before.get(key);
    if (!prior) {
      changes.push({ id: item.id, kind: item.kind, change: "new_target", from: null, to: item.state });
      continue;
    }

    if (prior.state !== item.state || prior.statusCode !== item.statusCode) {
      const change = {
        id: item.id,
        kind: item.kind,
        change: "state_changed",
        from: prior.state,
        to: item.state,
        previousStatusCode: prior.statusCode,
        statusCode: item.statusCode,
      };
      changes.push(change);
      if (["failed", "degraded"].includes(prior.state) && item.state === "healthy") resolved.push(change);
      continue;
    }

    const priorRevision = prior.revision || prior.deploymentId || null;
    const currentRevision = item.revision || item.deploymentId || null;
    if (priorRevision && currentRevision && priorRevision !== currentRevision) {
      changes.push({
        id: item.id,
        kind: item.kind,
        change: "revision_changed",
        from: String(priorRevision).slice(0, 12),
        to: String(currentRevision).slice(0, 12),
      });
    }
  }

  for (const [key, prior] of before) {
    if (!after.has(key)) {
      changes.push({ id: prior.id, kind: prior.kind, change: "target_removed", from: prior.state, to: null });
    }
  }

  return { firstRun: false, materialChanges: changes, resolved };
}

function recommendedAction(item) {
  if (item.state === "skipped") return "Grant only the minimum read scope if deeper inspection is needed; otherwise leave skipped.";
  if (item.kind === "vercel") return "Inspect the latest deployment and build/runtime logs; do not redeploy until the failure is understood.";
  if (item.kind === "repository" && item.ci) return "Inspect the failing CI workflow/check and prepare a branch-scoped fix; do not merge automatically.";
  if (item.kind === "http") return "Validate deployment health, DNS/routing, authentication boundary, and upstream runtime logs.";
  return "Inspect evidence and prepare a bounded remediation plan.";
}

function publicSummary(report) {
  return {
    schemaVersion: report.schemaVersion,
    generatedAt: report.generatedAt,
    overallState: report.overallState,
    counts: report.counts,
    materialChanges: report.delta.materialChanges.length,
    resolved: report.delta.resolved.length,
    remoteRequests: report.execution.remoteRequests,
    billingGuard: report.policy?.billingGuard,
  };
}

function markdown(report) {
  const failures = report.results
    .filter((r) => r.state === "failed")
    .sort((a, b) => severityRank[b.criticality] - severityRank[a.criticality]);
  const degraded = report.results
    .filter((r) => r.state === "degraded")
    .sort((a, b) => severityRank[b.criticality] - severityRank[a.criticality]);
  const skipped = report.results.filter((r) => r.state === "skipped");
  const changed = report.delta.materialChanges;
  const lines = [
    "# GEM Cloud Operations Sentinel",
    "",
    `- **Overall state:** ${report.overallState}`,
    `- **Run mode:** read-only delta inspection`,
    `- **Observed:** ${report.generatedAt}`,
    `- **Targets checked:** ${report.results.length}`,
    `- **Failures:** ${failures.length}`,
    `- **Degraded:** ${degraded.length}`,
    `- **Skipped/limited access:** ${skipped.length}`,
    `- **Material changes:** ${changed.length}`,
    `- **Remote requests used:** ${report.execution.remoteRequests}/${report.execution.maxRemoteRequests}`,
    "",
  ];

  if (!failures.length && !degraded.length && !changed.length) {
    lines.push("## Result", "", "No material operational change detected.", "");
  }

  if (failures.length || degraded.length) {
    lines.push("## Findings", "");
    for (const item of [...failures, ...degraded]) {
      lines.push(
        `- **${item.state.toUpperCase()} / ${item.criticality.toUpperCase()} — ${item.name}:** ${item.evidence}`,
        `  - Next: ${recommendedAction(item)}`,
      );
    }
    lines.push("");
  }

  if (changed.length) {
    lines.push("## Delta", "");
    for (const item of changed) {
      lines.push(`- ${item.kind}/${item.id}: ${item.change} — ${item.from ?? "new"} → ${item.to ?? "removed"}`);
    }
    lines.push("");
  }

  if (report.delta.resolved.length) {
    lines.push("## Resolved", "");
    for (const item of report.delta.resolved) lines.push(`- ${item.kind}/${item.id}: ${item.from} → ${item.to}`);
    lines.push("");
  }

  if (skipped.length) {
    lines.push("## Access limitations", "");
    for (const item of skipped) lines.push(`- ${item.name}: ${item.evidence}`);
    lines.push("");
  }

  lines.push(
    "## Guardrails",
    "",
    "Read-only checks only. No deployments, merges, secret changes, financial execution, paid-resource provisioning, DNS changes, database mutations, or destructive actions are performed by this sentinel.",
    "",
  );

  return lines.join("\n");
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  if (!config) throw new Error(`Unable to read ${CONFIG_PATH}`);

  const timeoutMs = Number(config.policy?.timeoutMs || 12000);
  const concurrency = Number(config.policy?.maxConcurrency || 4);
  const maxRetries = Number(config.policy?.maxRetriesPerTarget || 0);
  maxRemoteRequests = Number(config.policy?.maxRemoteRequestsPerRun || 40);
  const previous = await readJson(PREVIOUS_STATE);

  const httpTargets = config.httpTargets || [];
  const repositories = config.repositories || [];
  const vercelProjects = config.vercel?.projects || [];

  const httpResults = await mapLimited(httpTargets, concurrency, (target) => checkHttp(target, timeoutMs, maxRetries));
  const repoResults = await mapLimited(repositories, concurrency, (repo) => checkRepository(repo, timeoutMs));
  const vercelResults = await mapLimited(vercelProjects, concurrency, (project) =>
    checkVercelProject(project, config.vercel?.teamId, timeoutMs),
  );

  const results = [...httpResults, ...repoResults, ...vercelResults];
  const delta = buildDelta(results, previous);
  const generatedAt = nowIso();

  const report = {
    schemaVersion: 2,
    generatedAt,
    overallState: summarizeStatus(results),
    policy: config.policy,
    providerContext: {
      supabaseProject: config.supabase?.projectName || null,
      supabaseProjectRef: config.supabase?.projectRef || null,
      vercelTeamConfigured: Boolean(config.vercel?.teamId),
      vercelAuthenticated: Boolean(process.env.VERCEL_TOKEN),
      githubAuthenticated: Boolean(process.env.GITHUB_TOKEN),
    },
    execution: {
      remoteRequests,
      maxRemoteRequests,
      timeoutMs,
      maxConcurrency: concurrency,
      maxRetriesPerTarget: maxRetries,
    },
    counts: {
      checked: results.length,
      healthy: results.filter((r) => r.state === "healthy").length,
      degraded: results.filter((r) => r.state === "degraded").length,
      failed: results.filter((r) => r.state === "failed").length,
      skipped: results.filter((r) => r.state === "skipped").length,
    },
    delta,
    results,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(PREVIOUS_STATE), { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.md");
  const publicPath = path.join(OUTPUT_DIR, "public-summary.json");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  await fs.writeFile(mdPath, markdown(report) + "\n", "utf8");
  await fs.writeFile(publicPath, JSON.stringify(publicSummary(report), null, 2) + "\n", "utf8");
  await fs.writeFile(PREVIOUS_STATE, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(markdown(report));

  const hasCritical = results.some((r) => r.state === "failed" && r.criticality === "critical");
  if (hasCritical && config.policy?.failWorkflowOnCritical === true) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[gem-ops] fatal: ${error?.stack || error}`);
  process.exitCode = 1;
});
