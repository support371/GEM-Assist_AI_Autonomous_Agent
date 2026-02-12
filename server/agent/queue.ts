import { Queue } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { createRedis } from "./redis";
import type { AgentConfig } from "./types";

export const AGENT_QUEUE_NAME = process.env.AGENT_QUEUE_NAME || "agent-runs";

export type AgentJobPayload = {
  agentId: string;
  goal: string;
  config?: Partial<AgentConfig>;
};

export function createAgentQueue() {
  const connection = createRedis();
  return new Queue<AgentJobPayload>(AGENT_QUEUE_NAME, { connection });
}

export async function enqueueAgentRun(params: {
  goal: string;
  config?: Partial<AgentConfig>;
  agentId?: string;
}) {
  const queue = createAgentQueue();
  const agentId = params.agentId ?? uuidv4();

  await queue.add(
    "run",
    { agentId, goal: params.goal, config: params.config },
    { removeOnComplete: 1000, removeOnFail: 2000 },
  );

  await queue.close();
  return agentId;
}
