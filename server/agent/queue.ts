import { Queue } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { createRedis, isRedisConfigured } from "./redis";
import type { AgentConfig } from "./types";

export const AGENT_QUEUE_NAME = process.env.AGENT_QUEUE_NAME || "agent-runs";

export type AgentJobPayload = {
  agentId: string;
  goal: string;
  config?: Partial<AgentConfig>;
};

export function createAgentQueue() {
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL is required before autonomous jobs can be queued");
  }

  const connection = createRedis();
  return new Queue<AgentJobPayload>(AGENT_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 1000,
      removeOnFail: 2000,
    },
  });
}

export async function enqueueAgentRun(params: {
  goal: string;
  config?: Partial<AgentConfig>;
  agentId?: string;
}) {
  const goal = params.goal?.trim();
  if (!goal) throw new Error("Agent goal is required");
  if (goal.length > 50_000) throw new Error("Agent goal exceeds the maximum supported size");

  const queue = createAgentQueue();
  const agentId = params.agentId ?? uuidv4();

  try {
    await queue.add(
      "run",
      { agentId, goal, config: params.config },
      { jobId: agentId },
    );
  } finally {
    await queue.close();
  }

  return agentId;
}
