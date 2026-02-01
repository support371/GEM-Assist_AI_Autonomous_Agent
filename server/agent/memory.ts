import * as fs from "fs";
import * as path from "path";
import { PersistentMemory, MemoryEntry, AgentState } from "./types";

const MEMORY_FILE = path.resolve(process.cwd(), "agent_memory.json");

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function loadMemory(): PersistentMemory {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = fs.readFileSync(MEMORY_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading memory:", error);
  }
  return {
    entries: [],
    goals: [],
    lastUpdated: new Date().toISOString(),
  };
}

export function saveMemory(memory: PersistentMemory): void {
  try {
    memory.lastUpdated = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving memory:", error);
  }
}

export function addMemoryEntry(
  type: MemoryEntry["type"],
  content: string,
  context?: string,
  goalId?: string
): MemoryEntry {
  const memory = loadMemory();
  const entry: MemoryEntry = {
    id: generateId(),
    type,
    content,
    context,
    timestamp: new Date().toISOString(),
    goalId,
  };
  memory.entries.push(entry);
  if (memory.entries.length > 1000) {
    memory.entries = memory.entries.slice(-1000);
  }
  saveMemory(memory);
  return entry;
}

export function addGoal(goal: string, id: string): void {
  const memory = loadMemory();
  memory.goals.push({
    id,
    goal,
    status: "in_progress",
    createdAt: new Date().toISOString(),
  });
  saveMemory(memory);
}

export function updateGoalStatus(goalId: string, status: "completed" | "in_progress" | "failed"): void {
  const memory = loadMemory();
  const goal = memory.goals.find(g => g.id === goalId);
  if (goal) {
    goal.status = status;
    if (status === "completed" || status === "failed") {
      goal.completedAt = new Date().toISOString();
    }
    saveMemory(memory);
  }
}

export function getUnfinishedGoals(): PersistentMemory["goals"] {
  const memory = loadMemory();
  return memory.goals.filter(g => g.status === "in_progress");
}

export function getRecentMemory(limit = 20, goalId?: string): MemoryEntry[] {
  const memory = loadMemory();
  let entries = memory.entries;
  if (goalId) {
    entries = entries.filter(e => e.goalId === goalId);
  }
  return entries.slice(-limit);
}

export function formatMemoryForPrompt(goalId?: string): string {
  const entries = getRecentMemory(15, goalId);
  if (entries.length === 0) {
    return "No previous memory available.";
  }
  
  return entries.map(e => {
    const time = new Date(e.timestamp).toLocaleString();
    return `[${e.type.toUpperCase()}] ${time}: ${e.content}${e.context ? ` (Context: ${e.context})` : ""}`;
  }).join("\n");
}

export function clearMemory(): void {
  saveMemory({
    entries: [],
    goals: [],
    lastUpdated: new Date().toISOString(),
  });
}

export function getMemoryStats(): { totalEntries: number; totalGoals: number; completedGoals: number; failedGoals: number } {
  const memory = loadMemory();
  return {
    totalEntries: memory.entries.length,
    totalGoals: memory.goals.length,
    completedGoals: memory.goals.filter(g => g.status === "completed").length,
    failedGoals: memory.goals.filter(g => g.status === "failed").length,
  };
}
