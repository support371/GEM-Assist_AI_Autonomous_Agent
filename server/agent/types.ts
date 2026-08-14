export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type Task = {
  id: number;
  description: string;
  status: TaskStatus;
  result?: string;
  reflection?: ReflectionResult;
  startedAt?: string;
  completedAt?: string;
};

export type AgentQuality = {
  model: string;
  trustMode: "fail-closed";
  toolCalls: number;
  completedTasks: number;
  failedTasks: number;
  averageConfidence: number | null;
};

export type AgentState = {
  id: string;
  goal: string;
  tasks: Task[];
  currentTask: number;
  log: AgentLogEntry[];
  status: "idle" | "planning" | "executing" | "reflecting" | "completed" | "failed" | "paused";
  stepsExecuted: number;
  maxSteps: number;
  createdAt: string;
  updatedAt: string;
  autonomous: boolean;
  quality: AgentQuality;
};

export type AgentLogEntry = {
  timestamp: string;
  type: "info" | "task" | "tool" | "reflection" | "error" | "warning";
  message: string;
  data?: unknown;
};

export type ToolInput = Record<string, unknown>;
export type ToolOutput = {
  success: boolean;
  result: unknown;
  error?: string;
};

export type Tool = {
  name: string;
  description: string;
  parameters: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
  execute: (input: ToolInput) => Promise<ToolOutput>;
};

export type ReflectionResult = {
  success: boolean;
  analysis: string;
  shouldRetry: boolean;
  adjustments?: string;
  confidence: number;
};

export type MemoryEntry = {
  id: string;
  type: "task" | "decision" | "result" | "goal";
  content: string;
  context?: string;
  timestamp: string;
  goalId?: string;
};

export type PersistentMemory = {
  entries: MemoryEntry[];
  goals: {
    id: string;
    goal: string;
    status: "completed" | "in_progress" | "failed";
    createdAt: string;
    completedAt?: string;
  }[];
  lastUpdated: string;
};

export type AgentConfig = {
  maxSteps: number;
  maxRetries: number;
  autonomousMode: boolean;
  reflectionEnabled: boolean;
  maxToolCallsPerTask: number;
  minReflectionConfidence: number;
  maxPlanTasks: number;
  model: string;
};
