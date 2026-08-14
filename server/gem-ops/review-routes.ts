import type { Express, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "artifacts/gem-ops";

interface ReviewSummary {
  schemaVersion?: number;
  generatedAt?: string | null;
  expiresAt?: string | null;
  state?: string;
  eligible?: boolean;
  releaseState?: string;
  auditIntegrity?: string;
  remediationTasks?: number;
  packageDigest?: string | null;
  executionAuthority?: string;
  message?: string;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function outputPath(name: string): string {
  return path.resolve(
    process.cwd(),
    process.env.GEM_OPS_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    name,
  );
}

function tokenMatches(request: Request): boolean {
  const expected = process.env.GEM_OPS_DASHBOARD_TOKEN;
  const supplied = request.header("x-gem-ops-token");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function requireToken(request: Request, response: Response): boolean {
  if (tokenMatches(request)) return true;
  response.status(401).json({
    error: "Unauthorized",
    message: "A valid GEM operations token is required for detailed operator-review evidence.",
  });
  return false;
}

export function registerGemOpsReviewRoutes(app: Express): void {
  app.get("/api/ops/review-summary", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const summary = await readJson<ReviewSummary>(outputPath("review-package-summary.json"));
    if (!summary) {
      return res.json({
        schemaVersion: 1,
        generatedAt: null,
        expiresAt: null,
        state: "NOT_INITIALIZED",
        eligible: false,
        releaseState: "NOT_AVAILABLE",
        auditIntegrity: "NOT_AVAILABLE",
        remediationTasks: 0,
        packageDigest: null,
        executionAuthority: "NONE",
        message: "No evidence-bound operator review package exists yet.",
      });
    }
    return res.json(summary);
  });

  app.get("/api/ops/review-details", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!requireToken(req, res)) return;
    const pkg = await readJson<Record<string, unknown>>(outputPath("review-package.json"));
    if (!pkg) {
      return res.status(404).json({
        error: "Not initialized",
        message: "No detailed GEM operator review package exists in this runtime.",
      });
    }
    return res.json(pkg);
  });
}
