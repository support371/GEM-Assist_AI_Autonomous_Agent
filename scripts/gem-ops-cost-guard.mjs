#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CONFIG_PATH = process.env.GEM_OPS_CONFIG || "config/gem-ops.targets.json";
const OUTPUT_DIR = process.env.GEM_OPS_OUTPUT_DIR || "artifacts/gem-ops";
const FIXTURE_PATH = process.env.GEM_OPS_COST_GUARD_FIXTURE || "";
const USER_AGENT = "GEM-Ops-Cost-Guard/1.1";
const DEFAULT_BUDGET = 10;

let requests = 0;

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function github(pathname, budget) {
  requests += 1;
  if (requests > budget) throw new Error(`Cost-guard request budget exceeded (${budget})`);
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": USER_AGENT,
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com${pathname}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${pathname}`);
  return response.json();
}

function isVercelStatus(status) {
  return String(status.context || "").toLowerCase().startsWith("vercel");
}

function isBuildRateLimit(status) {
  const url = String(status.target_url || "");
  const description = String(status.description || "").toLowerCase();
  return url.includes("upgradeToPro=build-rate-limit") || description.includes("build rate limit");
}

function analyzeStatuses(repoName, revision, statuses) {
  const vercel = statuses.filter(isVercelStatus);
  const successful = vercel.filter((s) => s.state === "success");
  const failed = vercel.filter((s) => s.state === "failure" || s.state === "error");
  const rateLimited = failed.filter(isBuildRateLimit);
  const pending = vercel.filter((s) => s.state === "pending");
  const duplicateContexts = Math.max(0, vercel.length - 1);

  let state = "HEALTHY";
  let finding = "No duplicate Vercel build pressure detected.";
  let recommendation = "Keep the current deployment topology under observation.";

  if (rateLimited.length > 0 && successful.length > 0) {
    state = "COST_PRESSURE";
    finding = `${rateLimited.length} Vercel context(s) are rate-limited while ${successful.length} context(s) already succeed for the same revision.`;
    recommendation = "Do not upgrade for duplicate builds. Keep one required deployment integration and disable redundant automatic build contexts after ownership is confirmed.";
  } else if (rateLimited.length > 0) {
    state = "CAPACITY_BLOCKED";
    finding = `${rateLimited.length} Vercel context(s) are blocked by build-rate limits and no successful Vercel context is currently visible.`;
    recommendation = "Do not purchase or upgrade automatically. Reduce duplicate builds, wait for free-tier capacity, or use the already-funded deployment path.";
  } else if (duplicateContexts > 0) {
    state = "DUPLICATE_BUILD_SURFACE";
    finding = `${vercel.length} Vercel status contexts are attached to one repository revision.`;
    recommendation = "Review whether each deployment context is necessary; prefer one authoritative preview/production path to conserve build allowance.";
  } else if (failed.length > 0) {
    state = "BUILD_FAILURE";
    finding = `${failed.length} Vercel context(s) report a non-rate-limit failure.`;
    recommendation = "Inspect the failing deployment logs before changing infrastructure or retrying builds.";
  }

  return {
    repository: repoName,
    revision,
    state,
    vercelContexts: vercel.length,
    successfulContexts: successful.length,
    failedContexts: failed.length,
    pendingContexts: pending.length,
    rateLimitedContexts: rateLimited.length,
    duplicateContexts,
    contexts: vercel.map((s) => ({
      context: s.context,
      state: s.state,
      targetUrl: s.target_url || null,
      rateLimited: isBuildRateLimit(s),
    })),
    finding,
    recommendation,
  };
}

function overallState(results) {
  if (results.some((r) => r.state === "CAPACITY_BLOCKED")) return "CAPACITY_BLOCKED";
  if (results.some((r) => r.state === "BUILD_FAILURE")) return "BUILD_FAILURE";
  if (results.some((r) => r.state === "COST_PRESSURE")) return "COST_PRESSURE";
  if (results.some((r) => r.state === "DUPLICATE_BUILD_SURFACE")) return "DUPLICATE_BUILD_SURFACE";
  if (results.some((r) => r.state === "INSPECTION_LIMITED")) return "INSPECTION_LIMITED";
  return "HEALTHY";
}

function publicSummary(report) {
  return {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    overallState: report.overallState,
    repositoriesChecked: report.results.length,
    requestsUsed: report.requestsUsed,
    totals: report.totals,
    automaticUpgradeAllowed: false,
  };
}

function markdown(report) {
  const lines = [
    "# GEM Build Cost Guard",
    "",
    `- **Overall state:** ${report.overallState}`,
    `- **Repositories checked:** ${report.results.length}`,
    `- **GitHub requests used:** ${report.requestsUsed}/${report.requestBudget}`,
    `- **Vercel contexts observed:** ${report.totals.vercelContexts}`,
    `- **Rate-limited contexts:** ${report.totals.rateLimitedContexts}`,
    `- **Duplicate contexts:** ${report.totals.duplicateContexts}`,
    `- **Automatic paid upgrade:** FORBIDDEN`,
    "",
  ];

  for (const item of report.results.filter((r) => r.state !== "HEALTHY")) {
    lines.push(
      `## ${item.state} — ${item.repository}`,
      "",
      `- ${item.finding}`,
      `- Recommendation: ${item.recommendation}`,
      "",
    );
  }

  if (report.results.every((r) => r.state === "HEALTHY")) {
    lines.push("No build-cost pressure detected.", "");
  }

  return lines.join("\n");
}

function limitedResult(repoName, error) {
  return {
    repository: repoName,
    revision: null,
    state: "INSPECTION_LIMITED",
    vercelContexts: 0,
    successfulContexts: 0,
    failedContexts: 0,
    pendingContexts: 0,
    rateLimitedContexts: 0,
    duplicateContexts: 0,
    contexts: [],
    finding: error instanceof Error ? error.message : String(error),
    recommendation: "Keep the cost guard fail-closed and avoid broadening credentials unless this inspection is operationally necessary.",
  };
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const repositories = (config.repositories || []).filter((r) => r.visibility !== "private");
  const budget = Number(config.policy?.maxCostGuardRequestsPerRun || DEFAULT_BUDGET);
  const fixture = FIXTURE_PATH ? await readJson(FIXTURE_PATH) : null;
  const results = [];

  for (const repo of repositories) {
    if (!fixture && requests + 2 > budget) break;
    const [owner, name] = repo.name.split("/");
    if (!owner || !name) continue;

    try {
      if (fixture) {
        const entry = fixture.repositories?.[repo.name];
        if (!entry) {
          results.push(limitedResult(repo.name, new Error("No deterministic fixture entry for repository")));
          continue;
        }
        results.push(analyzeStatuses(repo.name, entry.revision || "fixture-revision", entry.statuses || []));
        continue;
      }

      const branchName = repo.branch || "main";
      const branch = await github(`/repos/${owner}/${name}/branches/${encodeURIComponent(branchName)}`, budget);
      const revision = branch.commit?.sha || null;
      if (!revision) {
        results.push(limitedResult(repo.name, new Error("Branch revision unavailable")));
        continue;
      }
      const status = await github(`/repos/${owner}/${name}/commits/${revision}/status`, budget);
      results.push(analyzeStatuses(repo.name, revision, status.statuses || []));
    } catch (error) {
      results.push(limitedResult(repo.name, error));
    }
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    overallState: overallState(results),
    requestBudget: budget,
    requestsUsed: requests,
    fixtureMode: Boolean(fixture),
    automaticPaidUpgradeAllowed: false,
    billingPolicy: "never-provision-paid-resources",
    totals: {
      vercelContexts: results.reduce((n, r) => n + r.vercelContexts, 0),
      rateLimitedContexts: results.reduce((n, r) => n + r.rateLimitedContexts, 0),
      duplicateContexts: results.reduce((n, r) => n + r.duplicateContexts, 0),
    },
    results,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, "cost-guard.json"), JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(path.join(OUTPUT_DIR, "cost-guard.md"), markdown(report) + "\n");
  await fs.writeFile(path.join(OUTPUT_DIR, "cost-guard-summary.json"), JSON.stringify(publicSummary(report), null, 2) + "\n");
  console.log(markdown(report));
}

main().catch((error) => {
  console.error(`[gem-ops-cost-guard] fatal: ${error?.stack || error}`);
  process.exitCode = 1;
});
