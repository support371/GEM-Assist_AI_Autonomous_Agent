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
  generatedAt?: string;
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
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function publicSummaryPath(): string {
  return path.resolve(
    process.cwd(),
    process.env.GEM_OPS_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    "public-summary.json",
  );
}

function detailedReportPath(): string {
  return path.resolve(
    process.cwd(),
    process.env.GEM_OPS_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    "latest.json",
  );
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
    },
    guardrails: [
      "no automatic merge",
      "no automatic deployment",
      "no secret rotation",
      "no DNS mutation",
      "no database mutation",
      "no financial execution",
      "no paid-resource provisioning",
    ],
  };
}

async function runFixedSentinel(): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/gem-ops-sentinel.mjs"], {
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
        reject(new Error(`GEM operations refresh exceeded ${REFRESH_TIMEOUT_MS}ms`));
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
      const result = await runFixedSentinel();
      if (result.code !== 0) {
        return res.status(502).json({
          error: "Sentinel refresh failed",
          exitCode: result.code,
          stderr: result.stderr,
        });
      }

      const summary = await readJson<PublicSummary>(publicSummaryPath());
      return res.json({ ok: true, summary });
    } catch (error) {
      return res.status(500).json({
        error: "Sentinel refresh failed",
        message: error instanceof Error ? error.message : "Unknown refresh failure",
      });
    }
  });
}
