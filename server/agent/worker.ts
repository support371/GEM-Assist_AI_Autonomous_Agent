import { Worker } from "bullmq";
import type IORedis from "ioredis";
import {
  createRedis,
  isRedisConfigured,
  redisChannelAgentEvents,
  redisKeyAgentState,
} from "./redis";
import { AGENT_QUEUE_NAME, type AgentJobPayload } from "./queue";
import { runAgent } from "./engine";
import type { AgentState } from "./types";
import type { AgentEvent } from "./events";

const STATE_TTL_SECONDS = Math.max(
  300,
  Math.min(24 * 60 * 60, Number(process.env.AGENT_STATE_TTL_SECONDS || 3600)),
);
const WORKER_CONCURRENCY = Math.max(
  1,
  Math.min(4, Number(process.env.AGENT_WORKER_CONCURRENCY || 1)),
);

function sanitizeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error || "Unknown worker error")
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(
      /((?:api[_-]?key|token|secret|password|authorization|cookie|database_url|redis_url)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .slice(0, 2000);
}

function publish(redisPub: IORedis, agentId: string, event: AgentEvent) {
  return redisPub.publish(
    redisChannelAgentEvents(agentId),
    JSON.stringify(event),
  );
}

async function persistState(
  redis: IORedis,
  redisPub: IORedis,
  agentId: string,
  state: AgentState,
) {
  const snapshot = JSON.stringify(state);
  await redis.set(redisKeyAgentState(agentId), snapshot, "EX", STATE_TTL_SECONDS);
  await publish(redisPub, agentId, { type: "state", agentId, state });
}

export function startAgentWorker() {
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL is required before the queued autonomous worker can start");
  }

  const connection = createRedis();
  const redisPub = createRedis();

  const worker = new Worker<AgentJobPayload>(
    AGENT_QUEUE_NAME,
    async (job) => {
      const { agentId, goal, config } = job.data;
      let updateChain = Promise.resolve();

      await publish(redisPub, agentId, {
        type: "log",
        agentId,
        level: "info",
        message: "Job started",
      });

      const onUpdate = (state: AgentState) => {
        const immutableSnapshot = JSON.parse(JSON.stringify(state)) as AgentState;
        updateChain = updateChain
          .then(() => persistState(connection, redisPub, agentId, immutableSnapshot))
          .catch(async (error) => {
            await publish(redisPub, agentId, {
              type: "log",
              agentId,
              level: "error",
              message: `State update failed: ${sanitizeError(error)}`,
            }).catch(() => undefined);
          });
      };

      const finalState = await runAgent(
        goal,
        config ?? {},
        onUpdate,
        agentId,
      );

      await updateChain;
      await persistState(connection, redisPub, agentId, finalState);

      await publish(redisPub, agentId, {
        type: "done",
        agentId,
        status: finalState.status === "completed" ? "completed" : "failed",
      });

      return {
        agentId,
        status: finalState.status,
        quality: finalState.quality,
      };
    },
    {
      connection,
      concurrency: WORKER_CONCURRENCY,
    },
  );

  worker.on("failed", async (job, error) => {
    if (!job) return;
    const { agentId } = job.data;
    await publish(redisPub, agentId, {
      type: "log",
      agentId,
      level: "error",
      message: sanitizeError(error),
    }).catch(() => undefined);
    await publish(redisPub, agentId, {
      type: "done",
      agentId,
      status: "failed",
    }).catch(() => undefined);
  });

  worker.on("error", (error) => {
    console.error(`GEM agent worker error: ${sanitizeError(error)}`);
  });

  return worker;
}
