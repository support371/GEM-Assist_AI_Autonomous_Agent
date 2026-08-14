import OpenAI from "openai";
import {
  AgentState,
  Task,
  ReflectionResult,
  AgentLogEntry,
  AgentConfig,
} from "./types";
import { getToolDescriptions, executeTool, toolRegistry } from "./tools";
import { ToolName } from "./toolSchemas";
import {
  addMemoryEntry,
  addGoal,
  updateGoalStatus,
  formatMemoryForPrompt,
  getUnfinishedGoals,
} from "./memory";

const DEFAULT_MODEL =
  process.env.AI_AGENT_MODEL || process.env.AI_AGENT_CHAT_MODEL || "gpt-5.2";

const DEFAULT_CONFIG: AgentConfig = {
  maxSteps: 50,
  maxRetries: 2,
  autonomousMode: false,
  reflectionEnabled: true,
  maxToolCallsPerTask: 4,
  minReflectionConfidence: 70,
  maxPlanTasks: 12,
  model: DEFAULT_MODEL,
};

let openAIClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (openAIClient) return openAIClient;
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI provider credential is not configured");

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;
  openAIClient = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    timeout: 50_000,
    maxRetries: 1,
  });
  return openAIClient;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function clampConfig(config: Partial<AgentConfig>): AgentConfig {
  return {
    maxSteps: clampInteger(config.maxSteps, DEFAULT_CONFIG.maxSteps, 1, 100),
    maxRetries: clampInteger(config.maxRetries, DEFAULT_CONFIG.maxRetries, 0, 5),
    autonomousMode: config.autonomousMode ?? DEFAULT_CONFIG.autonomousMode,
    reflectionEnabled: config.reflectionEnabled ?? DEFAULT_CONFIG.reflectionEnabled,
    maxToolCallsPerTask: clampInteger(
      config.maxToolCallsPerTask,
      DEFAULT_CONFIG.maxToolCallsPerTask,
      0,
      8,
    ),
    minReflectionConfidence: clampInteger(
      config.minReflectionConfidence,
      DEFAULT_CONFIG.minReflectionConfidence,
      0,
      100,
    ),
    maxPlanTasks: clampInteger(
      config.maxPlanTasks,
      DEFAULT_CONFIG.maxPlanTasks,
      1,
      20,
    ),
    model: (config.model || DEFAULT_CONFIG.model).trim(),
  };
}

function log(
  state: AgentState,
  type: AgentLogEntry["type"],
  message: string,
  data?: unknown,
): void {
  state.log.push({
    timestamp: new Date().toISOString(),
    type,
    message,
    data,
  });
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
  state.updatedAt = new Date().toISOString();
}

function redact(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(
      /((?:api[_-]?key|token|secret|password|authorization|cookie|database_url|redis_url)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .slice(0, 16_000);
}

async function callLLM(
  prompt: string,
  model: string,
  systemPrompt?: string,
  maxTokens = 4096,
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await getOpenAI().chat.completions.create({
    model,
    messages,
    max_completion_tokens: maxTokens,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

export async function planTasks(
  goal: string,
  memory: string,
  maxTasks = DEFAULT_CONFIG.maxPlanTasks,
  model = DEFAULT_MODEL,
): Promise<Task[]> {
  const prompt = `You are the planning stage of GEM Autonomous Agent.

Available tools:
${getToolDescriptions()}

Relevant memory:
${memory.slice(0, 20_000)}

Create the smallest complete plan that can actually satisfy the goal. Prefer verification steps over speculative work. Never invent execution evidence. Never plan an irreversible production, billing, credential, financial, trading, withdrawal, DNS, or database mutation as an autonomous action.

Return ONLY a numbered list with one actionable task per line, maximum ${maxTasks} tasks.

Goal: ${goal}`;

  const plan = await callLLM(prompt, model);
  const tasks = plan
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+[\).\s]/.test(line))
    .map((line, index) => ({
      id: index + 1,
      description: line.replace(/^\d+[\).\s]*/, "").trim(),
      status: "pending" as const,
    }))
    .filter((task) => task.description.length > 0)
    .slice(0, maxTasks);

  if (!tasks.length) {
    throw new Error("Planner returned no actionable tasks; execution stopped fail-closed");
  }
  return tasks;
}

type ParsedAction =
  | { action: "tool"; tool: string; params: unknown }
  | { action: "final"; result: string };

function parseAction(text: string): ParsedAction {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidates = [trimmed, fenced].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (
        parsed.action === "tool" &&
        typeof parsed.tool === "string" &&
        parsed.params &&
        typeof parsed.params === "object"
      ) {
        return { action: "tool", tool: parsed.tool, params: parsed.params };
      }
      if (parsed.action === "final" && typeof parsed.result === "string") {
        return { action: "final", result: parsed.result };
      }
    } catch {
      // Plain prose is a valid final answer; malformed tool JSON is not executed.
    }
  }

  return { action: "final", result: trimmed };
}

function toolObservation(result: Awaited<ReturnType<typeof executeTool>>): string {
  if (result.ok) return redact(JSON.stringify({ ok: true, data: result.data }));
  return redact(
    JSON.stringify({
      ok: false,
      error: {
        code: result.error.code,
        message: result.error.message,
        details: result.error.details ?? null,
      },
    }),
  );
}

async function executeTaskWithTools(
  task: Task,
  state: AgentState,
  config: AgentConfig,
): Promise<string> {
  const memory = formatMemoryForPrompt(state.id).slice(0, 16_000);
  const observations: string[] = [];

  for (let turn = 0; turn <= config.maxToolCallsPerTask; turn += 1) {
    const remaining = Math.max(0, config.maxToolCallsPerTask - turn);
    const prompt = `You are the execution stage of GEM Autonomous Agent.

Goal: ${state.goal}
Current task: ${task.description}
Relevant memory:
${memory}

Available tools:
${getToolDescriptions()}

Tool observations from this task:
${observations.length ? observations.join("\n") : "None yet."}

Rules:
- Use evidence, not assumptions.
- Never claim a tool, write, test, deployment, or external action happened unless its observation proves it.
- Consequential production, billing, secret, financial, DNS, database, trading, or withdrawal actions are outside autonomous authority.
- You have ${remaining} tool call(s) remaining.
- To use a tool, return ONLY JSON: {"action":"tool","tool":"tool_name","params":{...}}
- When the task is complete, return ONLY JSON: {"action":"final","result":"complete evidence-grounded result"}
- Do not wrap JSON in markdown.`;

    const response = await callLLM(prompt, config.model);
    const action = parseAction(response);

    if (action.action === "final") {
      if (!action.result.trim()) throw new Error("Execution stage returned an empty result");
      return redact(action.result);
    }

    if (turn >= config.maxToolCallsPerTask) {
      observations.push("Tool budget exhausted; no additional tool call was executed.");
      break;
    }

    const parsedName = ToolName.safeParse(action.tool);
    if (!parsedName.success || !toolRegistry.has(parsedName.data)) {
      observations.push(`Rejected unknown tool: ${action.tool}`);
      continue;
    }

    log(state, "tool", `Using bounded tool: ${parsedName.data}`);
    const result = await executeTool(parsedName.data, action.params);
    state.quality.toolCalls += 1;
    const observation = toolObservation(result);
    observations.push(`${parsedName.data}: ${observation}`);

    addMemoryEntry(
      "result",
      `Tool ${parsedName.data}: ${observation.slice(0, 2000)}`,
      task.description,
      state.id,
    );
  }

  const synthesis = await callLLM(
    `Goal: ${state.goal}\nTask: ${task.description}\nTool evidence:\n${observations.join("\n").slice(0, 20_000)}\n\nTool budget is exhausted. Produce the best evidence-grounded final result. State clearly what remains unverified. Do not claim any unobserved action occurred.`,
    config.model,
    "You are GEM Autonomous Agent's final synthesis stage. Be precise, useful, and fail-closed about missing evidence.",
  );
  if (!synthesis) throw new Error("Execution synthesis returned no result");
  return redact(synthesis);
}

async function reflectOnTask(
  task: Task,
  result: string,
  state: AgentState,
  config: AgentConfig,
): Promise<ReflectionResult> {
  const prompt = `Evaluate the task execution strictly against evidence.

Goal: ${state.goal}
Task: ${task.description}
Result: ${result.slice(0, 16_000)}

Return ONLY valid JSON with this exact shape:
{"success":true,"analysis":"...","shouldRetry":false,"adjustments":"... or null","confidence":85}

A task is successful only when its stated objective is supported by the result. Missing verification, placeholders, contradictory evidence, or claimed-but-unobserved execution must reduce confidence or make success false.`;

  const response = await callLLM(
    prompt,
    config.model,
    "You are GEM's independent verification stage. Prefer a false negative over an unsupported success claim.",
    1600,
  );

  try {
    const fenced = response.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    const parsed = JSON.parse(fenced || response) as Partial<ReflectionResult>;
    if (
      typeof parsed.success !== "boolean" ||
      typeof parsed.analysis !== "string" ||
      typeof parsed.shouldRetry !== "boolean" ||
      typeof parsed.confidence !== "number" ||
      !Number.isFinite(parsed.confidence)
    ) {
      throw new Error("reflection shape invalid");
    }
    return {
      success: parsed.success,
      analysis: redact(parsed.analysis),
      shouldRetry: parsed.shouldRetry,
      adjustments:
        typeof parsed.adjustments === "string" ? redact(parsed.adjustments) : undefined,
      confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
    };
  } catch {
    return {
      success: false,
      analysis: "Verification response could not be validated; task is not accepted as successful.",
      shouldRetry: true,
      adjustments: "Retry with clearer evidence and verification.",
      confidence: 0,
    };
  }
}

function refreshQuality(state: AgentState) {
  const reflections = state.tasks
    .map((task) => task.reflection?.confidence)
    .filter((value): value is number => typeof value === "number");
  state.quality.completedTasks = state.tasks.filter((task) => task.status === "done").length;
  state.quality.failedTasks = state.tasks.filter((task) => task.status === "failed").length;
  state.quality.averageConfidence = reflections.length
    ? Math.round(reflections.reduce((sum, value) => sum + value, 0) / reflections.length)
    : null;
}

export async function runAgent(
  goal: string,
  config: Partial<AgentConfig> = {},
  onUpdate?: (state: AgentState) => void,
  forcedId?: string,
): Promise<AgentState> {
  const finalConfig = clampConfig(config);
  const stateId = forcedId ?? generateId();

  if (!goal?.trim()) throw new Error("Agent goal is required");
  if (goal.length > 50_000) throw new Error("Agent goal exceeds the maximum supported size");

  const state: AgentState = {
    id: stateId,
    goal: goal.trim(),
    tasks: [],
    currentTask: 0,
    log: [],
    status: "planning",
    stepsExecuted: 0,
    maxSteps: finalConfig.maxSteps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    autonomous: finalConfig.autonomousMode,
    quality: {
      model: finalConfig.model,
      trustMode: "fail-closed",
      toolCalls: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageConfidence: null,
    },
  };

  const emit = () => {
    refreshQuality(state);
    onUpdate?.(state);
  };
  emit();

  log(state, "info", `Starting bounded agent goal with model ${finalConfig.model}`);
  addGoal(state.goal, stateId);
  addMemoryEntry("goal", state.goal, undefined, stateId);
  emit();

  try {
    const memory = formatMemoryForPrompt().slice(0, 24_000);
    state.tasks = await planTasks(
      state.goal,
      memory,
      finalConfig.maxPlanTasks,
      finalConfig.model,
    );
    log(state, "info", `Planned ${state.tasks.length} bounded task(s)`);
    addMemoryEntry(
      "decision",
      `Planned ${state.tasks.length} task(s) for goal`,
      undefined,
      stateId,
    );
    emit();

    for (let index = 0; index < state.tasks.length; index += 1) {
      if (state.stepsExecuted >= state.maxSteps) {
        log(state, "warning", `Maximum execution steps (${state.maxSteps}) reached.`);
        state.status = "paused";
        break;
      }

      const task = state.tasks[index];
      state.currentTask = index + 1;
      task.status = "running";
      task.startedAt = new Date().toISOString();
      state.status = "executing";
      log(state, "task", `Starting task ${task.id}: ${task.description}`);
      emit();

      let retries = 0;
      let result = "";

      while (retries <= finalConfig.maxRetries) {
        result = await executeTaskWithTools(task, state, finalConfig);
        state.stepsExecuted += 1;
        log(state, "task", `Task ${task.id} produced evidence-grounded output.`);
        emit();

        if (!finalConfig.reflectionEnabled) {
          task.status = "done";
          break;
        }

        state.status = "reflecting";
        emit();
        const reflection = await reflectOnTask(task, result, state, finalConfig);
        task.reflection = reflection;
        log(
          state,
          "reflection",
          `Verification confidence ${reflection.confidence}%: ${reflection.analysis}`,
        );
        emit();

        const accepted =
          reflection.success &&
          reflection.confidence >= finalConfig.minReflectionConfidence;
        if (accepted) {
          task.status = "done";
          break;
        }

        const mayRetry =
          retries < finalConfig.maxRetries &&
          (reflection.shouldRetry || reflection.confidence < finalConfig.minReflectionConfidence);
        if (mayRetry) {
          retries += 1;
          log(
            state,
            "warning",
            `Task ${task.id} verification did not meet ${finalConfig.minReflectionConfidence}% confidence; retry ${retries}/${finalConfig.maxRetries}.`,
          );
          state.status = "executing";
          emit();
          continue;
        }

        task.status = "failed";
        break;
      }

      task.result = redact(result);
      task.completedAt = new Date().toISOString();
      addMemoryEntry(
        "task",
        `${task.status === "done" ? "Verified" : "Unverified"}: ${task.description}`,
        redact(result).slice(0, 3000),
        stateId,
      );
      emit();

      if (task.status === "failed") {
        log(
          state,
          "error",
          `Task ${task.id} failed verification. Stopping to prevent cascading unsupported work.`,
        );
        state.status = "failed";
        break;
      }
    }

    const allDone = state.tasks.length > 0 && state.tasks.every((task) => task.status === "done");
    const anyFailed = state.tasks.some((task) => task.status === "failed");

    if (allDone) {
      state.status = "completed";
      updateGoalStatus(stateId, "completed");
      log(state, "info", "All planned tasks completed and passed verification.");
    } else if (anyFailed) {
      state.status = "failed";
      updateGoalStatus(stateId, "failed");
      log(state, "error", "Goal stopped because at least one task did not pass verification.");
    } else if (state.status !== "paused") {
      state.status = "failed";
      updateGoalStatus(stateId, "failed");
      log(state, "error", "Goal ended without a fully verified task set.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown agent error";
    log(state, "error", `Agent stopped: ${message}`);
    state.status = "failed";
    updateGoalStatus(stateId, "failed");
  }

  emit();
  return state;
}

export async function resumeUnfinishedGoals(
  onUpdate?: (state: AgentState) => void,
): Promise<AgentState[]> {
  const unfinished = getUnfinishedGoals();
  const results: AgentState[] = [];

  for (const goal of unfinished) {
    const state = await runAgent(
      goal.goal,
      { autonomousMode: true },
      onUpdate,
      goal.id,
    );
    results.push(state);
  }

  return results;
}

export function getAvailableTools(): { name: string; description: string }[] {
  return Array.from(toolRegistry.values()).map((tool) => ({
    name: tool.name,
    description: tool.description,
  }));
}
