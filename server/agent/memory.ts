import * as fs from "node:fs";
import * as path from "node:path";
import type { PersistentMemory, MemoryEntry } from "./types";

const MEMORY_FILE = process.env.AGENT_MEMORY_FILE
  ? path.resolve(process.env.AGENT_MEMORY_FILE)
  : path.resolve(process.cwd(), "agent_memory.json");
const MAX_ENTRIES = 1000;
const MAX_GOALS = 500;
const MAX_TEXT_CHARS = 50_000;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function sanitizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(
      /((?:api[_-]?key|token|secret|password|authorization|cookie|database_url|redis_url)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .slice(0, MAX_TEXT_CHARS);
}

function emptyMemory(): PersistentMemory {
  return {
    entries: [],
    goals: [],
    lastUpdated: new Date().toISOString(),
  };
}

function normalizeMemory(value: unknown): PersistentMemory {
  if (!value || typeof value !== "object") return emptyMemory();
  const candidate = value as Partial<PersistentMemory>;
  const entries = Array.isArray(candidate.entries)
    ? candidate.entries
        .filter((entry): entry is MemoryEntry => Boolean(entry && typeof entry === "object"))
        .slice(-MAX_ENTRIES)
        .map((entry) => ({
          id: sanitizeText(entry.id).slice(0, 128) || generateId(),
          type: ["task", "decision", "result", "goal"].includes(entry.type)
            ? entry.type
            : "result",
          content: sanitizeText(entry.content),
          context: entry.context ? sanitizeText(entry.context) : undefined,
          timestamp: sanitizeText(entry.timestamp).slice(0, 64) || new Date().toISOString(),
          goalId: entry.goalId ? sanitizeText(entry.goalId).slice(0, 128) : undefined,
        }))
    : [];

  const goals = Array.isArray(candidate.goals)
    ? candidate.goals
        .filter((goal) => Boolean(goal && typeof goal === "object"))
        .slice(-MAX_GOALS)
        .map((goal) => ({
          id: sanitizeText(goal.id).slice(0, 128) || generateId(),
          goal: sanitizeText(goal.goal),
          status: ["completed", "in_progress", "failed"].includes(goal.status)
            ? goal.status
            : ("failed" as const),
          createdAt: sanitizeText(goal.createdAt).slice(0, 64) || new Date().toISOString(),
          completedAt: goal.completedAt
            ? sanitizeText(goal.completedAt).slice(0, 64)
            : undefined,
        }))
    : [];

  return {
    entries,
    goals,
    lastUpdated:
      typeof candidate.lastUpdated === "string"
        ? candidate.lastUpdated.slice(0, 64)
        : new Date().toISOString(),
  };
}

export function loadMemory(): PersistentMemory {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return emptyMemory();
    const data = fs.readFileSync(MEMORY_FILE, "utf-8");
    return normalizeMemory(JSON.parse(data));
  } catch (error) {
    console.error("Agent memory could not be loaded safely:", error);
    return emptyMemory();
  }
}

export function saveMemory(memory: PersistentMemory): void {
  const normalized = normalizeMemory(memory);
  normalized.lastUpdated = new Date().toISOString();
  const directory = path.dirname(MEMORY_FILE);
  const temporary = `${MEMORY_FILE}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    try {
      fs.renameSync(temporary, MEMORY_FILE);
    } catch {
      if (fs.existsSync(MEMORY_FILE)) fs.unlinkSync(MEMORY_FILE);
      fs.renameSync(temporary, MEMORY_FILE);
    }
  } catch (error) {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {
      // best-effort temporary-file cleanup
    }
    console.error("Agent memory could not be persisted safely:", error);
  }
}

export function addMemoryEntry(
  type: MemoryEntry["type"],
  content: string,
  context?: string,
  goalId?: string,
): MemoryEntry {
  const memory = loadMemory();
  const entry: MemoryEntry = {
    id: generateId(),
    type,
    content: sanitizeText(content),
    context: context ? sanitizeText(context) : undefined,
    timestamp: new Date().toISOString(),
    goalId: goalId ? sanitizeText(goalId).slice(0, 128) : undefined,
  };
  memory.entries.push(entry);
  memory.entries = memory.entries.slice(-MAX_ENTRIES);
  saveMemory(memory);
  return entry;
}

export function addGoal(goal: string, id: string): void {
  const memory = loadMemory();
  const safeId = sanitizeText(id).slice(0, 128);
  const existing = memory.goals.find((item) => item.id === safeId);
  if (existing) {
    existing.goal = sanitizeText(goal);
    existing.status = "in_progress";
    existing.createdAt = existing.createdAt || new Date().toISOString();
    delete existing.completedAt;
  } else {
    memory.goals.push({
      id: safeId,
      goal: sanitizeText(goal),
      status: "in_progress",
      createdAt: new Date().toISOString(),
    });
  }
  memory.goals = memory.goals.slice(-MAX_GOALS);
  saveMemory(memory);
}

export function updateGoalStatus(
  goalId: string,
  status: "completed" | "in_progress" | "failed",
): void {
  const memory = loadMemory();
  const goal = memory.goals.find((item) => item.id === goalId);
  if (!goal) return;

  goal.status = status;
  if (status === "completed" || status === "failed") {
    goal.completedAt = new Date().toISOString();
  } else {
    delete goal.completedAt;
  }
  saveMemory(memory);
}

export function getUnfinishedGoals(): PersistentMemory["goals"] {
  return loadMemory().goals.filter((goal) => goal.status === "in_progress");
}

export function getRecentMemory(limit = 20, goalId?: string): MemoryEntry[] {
  let entries = loadMemory().entries;
  if (goalId) entries = entries.filter((entry) => entry.goalId === goalId);
  return entries.slice(-Math.max(1, Math.min(100, Math.trunc(limit))));
}

export function formatMemoryForPrompt(goalId?: string): string {
  const entries = getRecentMemory(15, goalId);
  if (!entries.length) return "No previous memory available.";

  return entries
    .map((entry) => {
      const time = new Date(entry.timestamp).toISOString();
      return `[${entry.type.toUpperCase()}] ${time}: ${entry.content}${entry.context ? ` (Context: ${entry.context})` : ""}`;
    })
    .join("\n")
    .slice(0, 24_000);
}

export function clearMemory(): void {
  saveMemory(emptyMemory());
}

export function getMemoryStats(): {
  totalEntries: number;
  totalGoals: number;
  completedGoals: number;
  failedGoals: number;
} {
  const memory = loadMemory();
  return {
    totalEntries: memory.entries.length,
    totalGoals: memory.goals.length,
    completedGoals: memory.goals.filter((goal) => goal.status === "completed").length,
    failedGoals: memory.goals.filter((goal) => goal.status === "failed").length,
  };
}
