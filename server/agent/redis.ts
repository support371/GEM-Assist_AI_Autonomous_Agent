import IORedis from "ioredis";

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

export function createRedis() {
  const url = process.env.REDIS_URL?.trim();

  if (!url) {
    return new IORedis("redis://127.0.0.1:6379", {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
      connectTimeout: 1000,
      retryStrategy: () => null,
    });
  }

  return new IORedis(url, {
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });
}

export function redisKeyAgentState(agentId: string) {
  return `agent:${agentId}:state`;
}

export function redisChannelAgentEvents(agentId: string) {
  return `agent:${agentId}:events`;
}
