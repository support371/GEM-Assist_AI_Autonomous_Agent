import type { Express, Request, Response } from "express";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONFIG_PATH = "config/gem-ops.targets.json";
const DEFAULT_OUTPUT_DIR = "artifacts/gem-ops";
const DEFAULT_PREVIOUS_STATE = ".gem-ops-cache/latest.json";
const REFRESH_TIMEOUT_MS = 30_000;

interface PublicSummary {
  schemaVersion?: number;
  generatedAt?: string | null;
  overallState?: string;
  counts?: {
    checked?: number;
    healthy?: number;
    degraded?: number;
    failed?: number;
    skipped?: number;
  };
  materialChanges?: number;
  resolved?: number;
  remoteRequests?: number;
  billingGuard?: string;
  message?: string;
}

interface CostGuardSummary {
  schemaVersion?: number;
  generatedAt?: string | null;
  overallState?: string;
  repositoriesChecked?: number;
  requestsUsed?: number;
  totals?: {
    vercelContexts?: number;
    rateLimitedContexts?: number;
    duplicateContexts?: number;
  };
  automaticUpgradeAllowed?: boolean;
  message?: string;
}

interface RemediationSummary {
  schemaVersion?: number;
  generatedAt?: string | null;
  sourceOverallState?: string;
  executionAuthority?: string;
  totalTasks?: number;
  counts?: {
    P0?: number;
    P1?: number;
    P2?: number;
    P3?: number;
    P4?: number;
  };
  message?: string;
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function outputFile(name: string): string {
  return path.resolve(
    process.cwd(),
    process.env.GEM_OPS_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    name,
  );
}

function publicSummaryPath(): string {
  return outputFile("public-summary.json");
}

function detailedReportPath(): string {
  return outputFile("latest.json");
}

function costGuardSummaryPath(): string {
  return outputFile("cost-guard-summary.json");
}

function costGuardDetailsPath(): string {
  return outputFile("cost-guard.json");
}

function remediationSummaryPath(): string {
  return outputFile("remediation-summary.json");
}

function remediationPlanPath(): string {
  return outputFile("remediation-plan.json");
}

function secureTokenMatches(request: Request): boolean {
  const expected = process.env.GEM_OPS_DASHBOARD_TOKEN;
  const supplied = request.header("x-gem-ops-token");
  if (!expected || !supplied) return false;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function requireOpsToken(request: Request, response: Response): boolean {
  if (secureTokenMatches(request)) return true;
  response.status(401).json({
    error: "Unauthorized",
    message: "A valid GEM operations token is required for detailed or executable operations.",
  });
  return false;
}

async function getCapabilities() {
  const configPath = path.resolve(
    process.cwd(),
    process.env.GEM_OPS_CONFIG || DEFAULT_CONFIG_PATH,
  );
  const config = await readJson<any>(configPath);

  return {
    mode: "read-only",
    pcIndependent: true,
    liveMutationEnabled: false,
    remediationAuthority: "PREPARE_ONLY",
    automaticPaidUpgradeAllowed: false,
    remoteRefreshEnabled: process.env.GEM_OPS_ALLOW_REFRESH === "true",
    authenticatedDetailEnabled: Boolean(process.env.GEM_OPS_DASHBOARD_TOKEN),
    providers: {
      github: Boolean(config?.repositories?.length),
      http: Boolean(config?.httpTargets?.length),
      vercel: Boolean(config?.vercel?.projects?.length),
      supabase: Boolean(config?.supabase?.projectRef),
    },
    configuredChecks: {
      http: config?.httpTargets?.length ?? 0,
      repositories: config?.repositories?.length ?? 0,
      vercelProjects: config?.vercel?.projects?.length ?? 0,
      maxRemoteRequestsPerRun: config?.policy?.maxRemoteRequestsPerRun ?? 40,
      maxCostGuardRequestsPerRun: config?.policy?.maxCostGuardRequestsPerRun ?? 10,
    },
    guardrails: [
      "no automatic merge",
      "no automatic deployment",
      "no automatic paid upgrade",
      "no secret rotation",
      "no DNS mutation",
      "no database mutation",
      "no financial execution",
      "no paid-resource provisioning",
    ],
  };
}

async function runFixedScript(script: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      shell: false,
      env: {
        ...process.env,
        GEM_OPS_CONFIG: process.env.GEM_OPS_CONFIG || DEFAULT_CONFIG_PATH,
        GEM_OPS_OUTPUT_DIR: process.env.GEM_OPS_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
        GEM_OPS_PREVIOUS_STATE:
          process.env.GEM_OPS_PREVIOUS_STATE || DEFAULT_PREVIOUS_STATE,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      if (!settled) {
        settled = true;
        reject(new Error(`GEM operations task exceeded ${REFRESH_TIMEOUT_MS}ms`));
      }
    }, REFRESH_TIMEOUT_MS);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ code: code ?? 1, stderr });
      }
    });
  });
}

async function runFixedControllerCycle(): Promise<{ code: number; stderr: string }> {
  const sentinel = await runFixedScript("scripts/gem-ops-sentinel.mjs");
  if (sentinel.code !== 0) return sentinel;
  const costGuard = await runFixedScript("scripts/gem-ops-cost-guard.mjs");
  if (costGuard.code !== 0) return costGuard;
  const planner = await runFixedScript("scripts/gem-ops-remediation-plan.mjs");
  if (planner.code !== 0) return planner;
  return { code: 0, stderr: "" };
}

export function registerGemOpsRoutes(app: Express): void {
  app.get("/api/ops/capabilities", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getCapabilities());
  });

  app.get("/api/ops/summary", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const summary = await readJson<PublicSummary>(publicSummaryPath());
    if (!summary) {
      return res.json({
        schemaVersion: 2,
        overallState: "NOT_INITIALIZED",
        generatedAt: null,
        counts: { checked: 0, healthy: 0, degraded: 0, failed: 0, skipped: 0 },
        materialChanges: 0,
        resolved: 0,
        remoteRequests: 0,
        billingGuard: "never-provision-paid-resources",
        message: "No local sentinel report exists yet. The controller remains fail-closed until a report is generated.",
      });
    }
    return res.json(summary);
  });

  app.get("/api/ops/cost-summary", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const summary = await readJson<CostGuardSummary>(costGuardSummaryPath());
    if (!summary) {
      return res.json({
        schemaVersion: 1,
        generatedAt: null,
        overallState: "NOT_INITIALIZED",
        repositoriesChecked: 0,
        requestsUsed: 0,
        totals: { vercelContexts: 0, rateLimitedContexts: 0, duplicateContexts: 0 },
        automaticUpgradeAllowed: false,
        message: "No build-cost guard report exists yet.",
      });
    }
    return res.json(summary);
  });

  app.get("/api/ops/remediation-summary", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const summary = await readJson<RemediationSummary>(remediationSummaryPath());
    if (!summary) {
      return res.json({
        schemaVersion: 1,
        generatedAt: null,
        sourceOverallState: "NOT_INITIALIZED",
        executionAuthority: "PREPARE_ONLY",
        totalTasks: 0,
        counts: { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 },
        message: "No remediation queue exists yet.",
      });
    }
    return res.json(summary);
  });

  app.get("/api/ops/details", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!requireOpsToken(req, res)) return;

    const report = await readJson<Record<string, unknown>>(detailedReportPath());
    if (!report) {
      return res.status(404).json({
        error: "Not initialized",
        message: "No detailed GEM operations report exists in this runtime.",
      });
    }
    return res.json(report);
  });

  app.get("/api/ops/cost-details", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!requireOpsToken(req, res)) return;

    const report = await readJson<Record<string, unknown>>(costGuardDetailsPath());
    if (!report) {
      return res.status(404).json({
        error: "Not initialized",
        message: "No detailed GEM build-cost guard report exists in this runtime.",
      });
    }
    return res.json(report);
  });

  app.get("/api/ops/remediation-details", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!requireOpsToken(req, res)) return;

    const plan = await readJson<Record<string, unknown>>(remediationPlanPath());
    if (!plan) {
      return res.status(404).json({
        error: "Not initialized",
        message: "No detailed GEM remediation plan exists in this runtime.",
      });
    }
    return res.json(plan);
  });

  app.post("/api/ops/refresh", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (process.env.GEM_OPS_ALLOW_REFRESH !== "true") {
      return res.status(503).json({
        error: "Remote refresh disabled",
        message: "Set GEM_OPS_ALLOW_REFRESH=true only in a trusted runtime to enable the fixed read-only refresh action.",
      });
    }
    if (!requireOpsToken(req, res)) return;

    try {
      const result = await runFixedControllerCycle();
      if (result.code !== 0) {
        return res.status(502).json({
          error: "Controller refresh failed",
          exitCode: result.code,
          stderr: result.stderr,
        });
      }

      const [summary, cost, remediation] = await Promise.all([
        readJson<PublicSummary>(publicSummaryPath()),
        readJson<CostGuardSummary>(costGuardSummaryPath()),
        readJson<RemediationSummary>(remediationSummaryPath()),
      ]);
      return res.json({ ok: true, summary, cost, remediation });
    } catch (error) {
      return res.status(500).json({
        error: "Controller refresh failed",
        message: error instanceof Error ? error.message : "Unknown refresh failure",
      });
    }
  });
}
