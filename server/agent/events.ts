import type { AgentState } from "./types";
import type { Response } from "express";

export type AgentEvent =
  | { type: "state"; agentId: string; state: AgentState }
  | {
      type: "log";
      agentId: string;
      level: "info" | "warn" | "error";
      message: string;
      data?: unknown;
    }
  | {
      type: "tool";
      agentId: string;
      name: string;
      args?: unknown;
      result?: unknown;
      ok?: boolean;
    }
  | {
      type: "task";
      agentId: string;
      taskId: number | string;
      status: string;
      message?: string;
    }
  | {
      type: "done";
      agentId: string;
      status: "completed" | "failed" | "paused";
    };

export function sseWrite(res: Response, event: AgentEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
