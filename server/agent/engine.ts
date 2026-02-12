import OpenAI from "openai";
import {
  AgentState,
  Task,
  ReflectionResult,
  AgentLogEntry,
  AgentConfig,
} from "./types";
import { getToolDescriptions, executeTool, toolRegistry } from "./tools";
import {
  addMemoryEntry,
  addGoal,
  updateGoalStatus,
  formatMemoryForPrompt,
  getUnfinishedGoals,
} from "./memory";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_CONFIG: AgentConfig = {
  maxSteps: 50,
  maxRetries: 3,
  autonomousMode: false,
  reflectionEnabled: true,
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function log(
  state: AgentState,
  type: AgentLogEntry["type"],
  message: string,
  data?: any,
): void {
  state.log.push({
    timestamp: new Date().toISOString(),
    type,
    message,
    data,
  });
  state.updatedAt = new Date().toISOString();
}

async function callLLM(prompt: string, systemPrompt?: string): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const res = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages,
    temperature: 0.2,
    max_completion_tokens: 4096,
  });

  return res.choices[0]?.message?.content || "";
}

export async function planTasks(goal: string, memory: string): Promise<Task[]> {
  const prompt = `You are an autonomous planner with access to the following tools:

${getToolDescriptions()}

Previous context from memory:
${memory}

Break the following goal into clear, ordered tasks. Each task should be specific and actionable.
Consider what tools might be needed for each task.
Return ONLY a numbered list of tasks, one per line.

Goal: ${goal}`;

  const plan = await callLLM(prompt);

  return plan
    .split("\n")
    .filter((l) => l.match(/^\d+/))
    .map((line, i) => ({
      id: i + 1,
      description: line.replace(/^\d+[\).\s]*/, "").trim(),
      status: "pending" as const,
    }));
}

async function executeTaskWithTools(
  task: Task,
  state: AgentState,
): Promise<string> {
  const toolDescriptions = getToolDescriptions();
  const memory = formatMemoryForPrompt(state.id);

  const prompt = `You are an execution agent with access to these tools:

${toolDescriptions}

Previous memory context:
${memory}

Current goal: ${state.goal}
Current task: ${task.description}

To use a tool, respond with:
TOOL: tool_name
PARAMS: {"param1": "value1", "param2": "value2"}

If no tool is needed, just provide your response directly.

Execute the task and provide the result.`;

  const response = await callLLM(prompt);

  const toolMatch = response.match(/TOOL:\s*(\w+)\s*\nPARAMS:\s*(\{[^}]+\})/);

  if (toolMatch) {
    const toolName = toolMatch[1];
    let params = {};
    try {
      params = JSON.parse(toolMatch[2]);
    } catch (e) {
      return `Error parsing tool parameters: ${e}`;
    }

    log(state, "tool", `Using tool: ${toolName}`, params);
    const result = await executeTool(toolName, params);

    addMemoryEntry(
      "result",
      `Tool ${toolName}: ${result.success ? "Success" : "Failed"} - ${JSON.stringify(result.result || result.error)}`,
      task.description,
      state.id,
    );

    return result.success
      ? `Tool ${toolName} succeeded: ${JSON.stringify(result.result)}`
      : `Tool ${toolName} failed: ${result.error}`;
  }

  return response;
}

async function reflectOnTask(
  task: Task,
  result: string,
  state: AgentState,
): Promise<ReflectionResult> {
  const prompt = `You are a self-reflection agent. Analyze the following task execution:

Goal: ${state.goal}
Task: ${task.description}
Result: ${result}

Evaluate:
1. Was the task completed successfully? (true/false)
2. What is your analysis of the outcome?
3. Should the agent retry this task? (true/false)
4. What adjustments should be made, if any?
5. Confidence level (0-100)

Respond in this exact JSON format:
{
  "success": true/false,
  "analysis": "your analysis",
  "shouldRetry": true/false,
  "adjustments": "suggested adjustments or null",
  "confidence": 0-100
}`;

  const response = await callLLM(prompt);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const reflection = JSON.parse(jsonMatch[0]);
      addMemoryEntry(
        "decision",
        `Task "${task.description}": ${reflection.success ? "Success" : "Failed"} (confidence: ${reflection.confidence}%)`,
        reflection.analysis,
        state.id,
      );
      return reflection;
    }
  } catch (e) {
    console.error("Failed to parse reflection:", e);
  }

  return {
    success: true,
    analysis: "Reflection parsing failed, assuming success",
    shouldRetry: false,
    confidence: 50,
  };
}

export async function runAgent(
  goal: string,
  config: Partial<AgentConfig> = {},
  onUpdate?: (state: AgentState) => void,
  forcedId?: string,
): Promise<AgentState> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const stateId = forcedId ?? generateId();

  const state: AgentState = {
    id: stateId,
    goal,
    tasks: [],
    currentTask: 0,
    log: [],
    status: "planning",
    stepsExecuted: 0,
    maxSteps: finalConfig.maxSteps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    autonomous: finalConfig.autonomousMode,
  };

  const emit = () => onUpdate?.(state);
  emit();

  log(state, "info", `Starting agent with goal: ${goal}`);
  addGoal(goal, stateId);
  addMemoryEntry("goal", goal, undefined, stateId);
  emit();

  try {
    const memory = formatMemoryForPrompt();
    state.tasks = await planTasks(goal, memory);
    log(state, "info", `Planned ${state.tasks.length} tasks`);
    addMemoryEntry(
      "decision",
      `Planned ${state.tasks.length} tasks for goal`,
      undefined,
      stateId,
    );
    emit();

    for (let i = 0; i < state.tasks.length; i++) {
      if (state.stepsExecuted >= state.maxSteps) {
        log(
          state,
          "warning",
          `Maximum steps (${state.maxSteps}) reached. Stopping execution.`,
        );
        state.status = "paused";
        break;
      }

      const task = state.tasks[i];
      state.currentTask = i + 1;
      task.status = "running";
      task.startedAt = new Date().toISOString();
      state.status = "executing";

      log(state, "task", `Starting task ${task.id}: ${task.description}`);
      emit();

      let retries = 0;
      let result: string = "";
      let reflection: ReflectionResult | undefined;

      while (retries <= finalConfig.maxRetries) {
        try {
          result = await executeTaskWithTools(task, state);
          state.stepsExecuted++;

          log(
            state,
            "task",
            `Task ${task.id} result: ${result.substring(0, 200)}...`,
          );
          emit();

          if (finalConfig.reflectionEnabled) {
            state.status = "reflecting";
            emit();

            reflection = await reflectOnTask(task, result, state);
            task.reflection = reflection;

            log(
              state,
              "reflection",
              `Reflection: ${reflection.analysis} (confidence: ${reflection.confidence}%)`,
            );
            emit();

            if (reflection.shouldRetry && retries < finalConfig.maxRetries) {
              log(
                state,
                "warning",
                `Retrying task ${task.id} based on reflection`,
              );
              retries++;
              continue;
            }

            task.status = reflection.success ? "done" : "failed";
          } else {
            task.status = "done";
          }

          break;
        } catch (error: any) {
          log(
            state,
            "error",
            `Error executing task ${task.id}: ${error.message}`,
          );
          retries++;
          if (retries > finalConfig.maxRetries) {
            task.status = "failed";
            task.result = `Failed after ${retries} attempts: ${error.message}`;
          }
        }
      }

      task.result = result;
      task.completedAt = new Date().toISOString();
      addMemoryEntry(
        "task",
        `Completed: ${task.description}`,
        result.substring(0, 500),
        stateId,
      );
      emit();

      if (task.status === "failed" && !finalConfig.autonomousMode) {
        log(
          state,
          "error",
          `Task ${task.id} failed. Stopping non-autonomous execution.`,
        );
        state.status = "failed";
        break;
      }
    }

    const allDone = state.tasks.every((t) => t.status === "done");
    const anyFailed = state.tasks.some((t) => t.status === "failed");

    if (allDone) {
      state.status = "completed";
      updateGoalStatus(stateId, "completed");
      log(state, "info", "All tasks completed successfully!");
    } else if (anyFailed) {
      state.status = "failed";
      updateGoalStatus(stateId, "failed");
      log(state, "error", "Some tasks failed.");
    }
  } catch (error: any) {
    log(state, "error", `Agent error: ${error.message}`);
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
    console.log(`Resuming goal: ${goal.goal}`);
    const state = await runAgent(goal.goal, { autonomousMode: true }, onUpdate);
    results.push(state);
  }

  return results;
}

export function getAvailableTools(): { name: string; description: string }[] {
  return Array.from(toolRegistry.values()).map((t) => ({
    name: t.name,
    description: t.description,
  }));
}
