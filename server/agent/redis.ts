import IORedis from "ioredis";

export function createRedis() {
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export function redisKeyAgentState(agentId: string) {
  return `agent:${agentId}:state`;
}

export function redisChannelAgentEvents(agentId: string) {
  return `agent:${agentId}:events`;
}
