import { Worker } from "bullmq";
import type IORedis from "ioredis";
import {
  createRedis,
  redisChannelAgentEvents,
  redisKeyAgentState,
} from "./redis";
import { AGENT_QUEUE_NAME, type AgentJobPayload } from "./queue";
import { runAgent } from "./engine";
import type { AgentState } from "./types";
import type { AgentEvent } from "./events";

function publish(redisPub: IORedis, agentId: string, event: AgentEvent) {
  return redisPub.publish(
    redisChannelAgentEvents(agentId),
    JSON.stringify(event),
  );
}

export function startAgentWorker() {
  const connection = createRedis();
  const redisPub = createRedis();

  const worker = new Worker<AgentJobPayload>(
    AGENT_QUEUE_NAME,
    async (job) => {
      const { agentId, goal, config } = job.data;

      await publish(redisPub, agentId, {
        type: "log",
        agentId,
        level: "info",
        message: "Job started",
      });

      const onUpdate = async (state: AgentState) => {
        await connection.set(
          redisKeyAgentState(agentId),
          JSON.stringify(state),
          "EX",
          60 * 60,
        );
        await publish(redisPub, agentId, { type: "state", agentId, state });
      };

      const finalState = await runAgent(
        goal,
        config ?? {},
        (s) => void onUpdate(s),
        agentId,
      );

      await connection.set(
        redisKeyAgentState(agentId),
        JSON.stringify(finalState),
        "EX",
        60 * 60,
      );

      await publish(redisPub, agentId, {
        type: "done",
        agentId,
        status: finalState.status === "completed" ? "completed" : "failed",
      });

      return { agentId, status: finalState.status };
    },
    { connection },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const { agentId } = job.data;
    await publish(redisPub, agentId, {
      type: "log",
      agentId,
      level: "error",
      message: err.message,
    });
    await publish(redisPub, agentId, {
      type: "done",
      agentId,
      status: "failed",
    });
  });

  return worker;
}
