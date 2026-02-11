// file: server/agent/toolSchemas.ts
import { z } from "zod";
import OpenAI from "openai";

/**
 * Zod schemas for tool arguments + helpers to build OpenAI tool definitions.
 * Keep this file dependency-free besides zod + openai types.
 */

export const ToolName = z.enum([
  "get_file_tree",
  "read_file",
  "write_file",
  "apply_patch",
  "search_in_files",
  "fetch_url",
  "run_command",
]);

export type ToolName = z.infer<typeof ToolName>;

export const GetFileTreeArgs = z.object({
  root: z.string().optional().default("."),
  maxDepth: z.number().int().min(0).max(20).optional().default(6),
});

export const ReadFileArgs = z.object({
  path: z.string().min(1),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  maxBytes: z.number().int().min(1024).max(2_000_000).optional().default(250_000),
});

export const WriteFileArgs = z.object({
  path: z.string().min(1),
  content: z.string(),
  createDirs: z.boolean().optional().default(true),
});

export const ApplyPatchArgs = z.object({
  path: z.string().min(1),
  edits: z
    .array(
      z.object({
        startLine: z.number().int().min(1),
        endLine: z.number().int().min(1),
        newText: z.string(),
      })
    )
    .min(1),
});

export const SearchInFilesArgs = z.object({
  query: z.string().min(1),
  paths: z.array(z.string().min(1)).optional().default(["."]),
  regex: z.boolean().optional().default(false),
  caseSensitive: z.boolean().optional().default(false),
  maxMatches: z.number().int().min(1).max(2000).optional().default(200),
});

export const FetchUrlArgs = z.object({
  url: z.string().url(),
  maxBytes: z.number().int().min(1024).max(2_000_000).optional().default(250_000),
});

export const RunCommandArgs = z.object({
  cmd: z.string().min(1),
  args: z.array(z.string()).optional().default([]),
  cwd: z.string().optional().default("."),
  timeoutMs: z.number().int().min(500).max(120_000).optional().default(30_000),
  env: z.record(z.string()).optional().default({}),
});

export const ToolArgSchemas = {
  get_file_tree: GetFileTreeArgs,
  read_file: ReadFileArgs,
  write_file: WriteFileArgs,
  apply_patch: ApplyPatchArgs,
  search_in_files: SearchInFilesArgs,
  fetch_url: FetchUrlArgs,
  run_command: RunCommandArgs,
} as const;

export type ToolArgs<TName extends ToolName> = z.infer<(typeof ToolArgSchemas)[TName]>;

export function parseToolArgs<TName extends ToolName>(name: TName, raw: unknown): ToolArgs<TName> {
  return ToolArgSchemas[name].parse(raw) as ToolArgs<TName>;
}

/**
 * OpenAI tool definitions (function calling)
 * Keep descriptions crisp + operational.
 */
export function buildOpenAITools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const t = (name: ToolName, description: string, schema: z.ZodTypeAny) => ({
    type: "function" as const,
    function: {
      name,
      description,
      parameters: (schema as any).toJSONSchema?.() ?? zodToJsonSchemaFallback(schema),
    },
  });

  return [
    t("get_file_tree", "List project files under a root folder.", GetFileTreeArgs),
    t("read_file", "Read a file (optionally line-ranged).", ReadFileArgs),
    t("write_file", "Write a file. Creates parent dirs when needed.", WriteFileArgs),
    t("apply_patch", "Apply line-based edits to a file.", ApplyPatchArgs),
    t("search_in_files", "Search text across files and return matches.", SearchInFilesArgs),
    t("fetch_url", "Fetch a URL and return the response text.", FetchUrlArgs),
    t("run_command", "Run a sandboxed command (no shell). Use for build/test/dev.", RunCommandArgs),
  ];
}

/**
 * Fallback JSON schema emitter.
 * Why: zod's toJSONSchema is available in newer versions; this prevents crashes.
 */
function zodToJsonSchemaFallback(_schema: z.ZodTypeAny): Record<string, unknown> {
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
}
