import type { Express, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "artifacts/gem-ops";
const DEFAULT_LEDGER_PATH = ".gem-ops-cache/audit-ledger.json";

interface AuditSummary {
  schemaVersion?: number;
  updatedAt?: string | null;
  integrity?: string;
  eventCount?: number;
  appended?: boolean;
  headHash?: string | null;
  failedIndex?: number | null;
  failureReason?: string | null;
  latest?: {
    sequence?: number;
    sourceGeneratedAt?: string | null;
    operationalState?: string;
    costState?: string;
    releaseState?: string;
    trend?: string;
  } | null;
  message?: string;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function summaryPath(): string {
  return path.resolve(
    process.cwd(),
    process.env.GEM_OPS_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    "audit-summary.json",
  );
}

function ledgerPath(): string {
  return path.resolve(
    process.cwd(),
    process.env.GEM_OPS_AUDIT_LEDGER || DEFAULT_LEDGER_PATH,
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
    message: "A valid GEM operations token is required for detailed audit access.",
  });
  return false;
}

export function registerGemOpsAuditRoutes(app: Express): void {
  app.get("/api/ops/audit-summary", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const summary = await readJson<AuditSummary>(summaryPath());
    if (!summary) {
      return res.json({
        schemaVersion: 1,
        updatedAt: null,
        integrity: "NOT_INITIALIZED",
        eventCount: 0,
        appended: false,
        headHash: null,
        failedIndex: null,
        failureReason: null,
        latest: null,
        message: "No controller audit ledger exists yet.",
      });
    }
    return res.json(summary);
  });

  app.get("/api/ops/audit-details", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!requireToken(req, res)) return;
    const ledger = await readJson<Record<string, unknown>>(ledgerPath());
    if (!ledger) {
      return res.status(404).json({
        error: "Not initialized",
        message: "No detailed GEM controller audit ledger exists in this runtime.",
      });
    }
    return res.json(ledger);
  });
}
