#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CONFIG_PATH = process.env.GEM_OPS_CONFIG || "config/gem-ops.targets.json";
const OUTPUT_DIR = process.env.GEM_OPS_OUTPUT_DIR || "artifacts/gem-ops";
const PREVIOUS_STATE = process.env.GEM_OPS_PREVIOUS_STATE || ".gem-ops-cache/latest.json";
const USER_AGENT = "GEM-Cloud-Ops-Sentinel/1.0";

const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };

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
  if (failures.some((r) => r.criticality === "critical")) return "CRITICAL";
  if (failures.some((r) => r.criticality === "high")) return "ACTION_REQUIRED";
  if (failures.length) return "DEGRADED";
  return "HEALTHY";
}

async function timedFetch(url, options = {}, timeoutMs = 12000) {
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
        accept: "application/vnd.github+json, text/html;q=0.9, */*;q=0.8",
        ...(options.headers || {}),
      },
    });
    return { response, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

async function checkHttp(target, timeoutMs) {
  try {
    const { response, latencyMs } = await timedFetch(target.url, { method: "GET" }, timeoutMs);
    const expected = target.expectedStatus || [200];
    const ok = expected.includes(response.status);
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
      evidence: ok
        ? `HTTP ${response.status} in ${latencyMs}ms`
        : `Unexpected HTTP ${response.status}; expected ${expected.join(", ")}`,
    };
  } catch (error) {
    return {
      kind: "http",
      id: target.id,
      name: target.name,
      target: target.url,
      criticality: target.criticality || "medium",
      state: "failed",
      observedAt: nowIso(),
      evidence: error?.name === "AbortError" ? `Timed out after ${timeoutMs}ms` : String(error?.message || error),
    };
  }
}

async function githubApi(pathname, timeoutMs) {
  const headers = {};
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return timedFetch(`https://api.github.com${pathname}`, { headers }, timeoutMs);
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
        evidence: "Private repository not reachable by this workflow token; connector or scoped token required",
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
        evidence: `GitHub repository API returned HTTP ${response.status}`,
      };
    }

    const metadata = await response.json();
    let branchState = "healthy";
    let branchEvidence = "";
    if (repo.branch) {
      const branch = await githubApi(`/repos/${owner}/${name}/branches/${encodeURIComponent(repo.branch)}`, timeoutMs);
      if (!branch.response.ok) {
        branchState = "failed";
        branchEvidence = `Configured branch ${repo.branch} returned HTTP ${branch.response.status}`;
      } else {
        const branchData = await branch.response.json();
        branchEvidence = `branch=${repo.branch} sha=${branchData.commit?.sha?.slice(0, 12) || "unknown"}`;
      }
    }

    return {
      kind: "repository",
      id: repo.name,
      name: repo.name,
      target: metadata.html_url,
      criticality: repo.criticality || "medium",
      state: metadata.archived || branchState === "failed" ? "failed" : "healthy",
      observedAt: nowIso(),
      latencyMs,
      defaultBranch: metadata.default_branch,
      archived: Boolean(metadata.archived),
      pushedAt: metadata.pushed_at,
      evidence: metadata.archived
        ? "Repository is archived"
        : `${branchEvidence || `default=${metadata.default_branch}`}; pushed=${metadata.pushed_at || "unknown"}`,
    };
  } catch (error) {
    return {
      kind: "repository",
      id: repo.name,
      name: repo.name,
      criticality: repo.criticality || "medium",
      state: "failed",
      observedAt: nowIso(),
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
  if (!previous?.results) return { firstRun: true, materialChanges: [] };
  const before = new Map(previous.results.map((r) => [`${r.kind}:${r.id}`, r]));
  const changes = [];
  for (const item of current) {
    const prior = before.get(`${item.kind}:${item.id}`);
    if (!prior) {
      changes.push({ id: item.id, kind: item.kind, change: "new_target", from: null, to: item.state });
      continue;
    }
    if (prior.state !== item.state || prior.statusCode !== item.statusCode) {
      changes.push({
        id: item.id,
        kind: item.kind,
        change: "state_changed",
        from: prior.state,
        to: item.state,
        previousStatusCode: prior.statusCode,
        statusCode: item.statusCode,
      });
    }
  }
  return { firstRun: false, materialChanges: changes };
}

function markdown(report) {
  const failures = report.results
    .filter((r) => r.state === "failed")
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
    `- **Skipped/limited access:** ${skipped.length}`,
    `- **Material changes:** ${changed.length}`,
    "",
  ];

  if (!failures.length && !changed.length) {
    lines.push("## Result", "", "No material operational change detected.", "");
  }

  if (failures.length) {
    lines.push("## Findings", "");
    for (const item of failures) {
      lines.push(`- **${item.criticality.toUpperCase()} — ${item.name}:** ${item.evidence}`);
    }
    lines.push("");
  }

  if (changed.length) {
    lines.push("## Delta", "");
    for (const item of changed) {
      lines.push(`- ${item.kind}/${item.id}: ${item.from ?? "new"} → ${item.to}`);
    }
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
    "Read-only checks only. No deployments, merges, secret changes, financial execution, paid-resource provisioning, DNS changes, or destructive actions are performed by this sentinel.",
    "",
  );

  return lines.join("\n");
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  if (!config) throw new Error(`Unable to read ${CONFIG_PATH}`);

  const timeoutMs = Number(config.policy?.timeoutMs || 12000);
  const concurrency = Number(config.policy?.maxConcurrency || 4);
  const previous = await readJson(PREVIOUS_STATE);

  const httpTargets = config.httpTargets || [];
  const repositories = config.repositories || [];

  const httpResults = await mapLimited(httpTargets, concurrency, (target) => checkHttp(target, timeoutMs));
  const repoResults = await mapLimited(repositories, concurrency, (repo) => checkRepository(repo, timeoutMs));
  const results = [...httpResults, ...repoResults];
  const delta = buildDelta(results, previous);

  const report = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    overallState: summarizeStatus(results),
    policy: config.policy,
    counts: {
      checked: results.length,
      healthy: results.filter((r) => r.state === "healthy").length,
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
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  await fs.writeFile(mdPath, markdown(report) + "\n", "utf8");
  await fs.writeFile(PREVIOUS_STATE, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(markdown(report));

  const hasCritical = results.some((r) => r.state === "failed" && r.criticality === "critical");
  if (hasCritical && config.policy?.failWorkflowOnCritical === true) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[gem-ops] fatal: ${error?.stack || error}`);
  process.exitCode = 1;
});
