// file: server/agent/tools.ts
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { ToolName, parseToolArgs } from "./toolSchemas";

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

const WORKSPACE_ROOT = process.env.AGENT_WORKSPACE_ROOT
  ? path.resolve(process.env.AGENT_WORKSPACE_ROOT)
  : path.resolve(process.cwd());

const DEFAULT_IGNORES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".expo",
  ".cache",
]);

function safeResolve(relOrAbs: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, relOrAbs);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Path escapes workspace root.");
  }
  return resolved;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function executeTool(name: ToolName, rawArgs: unknown): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_file_tree": {
        const args = parseToolArgs(name, rawArgs);
        const root = safeResolve(args.root);
        const tree = await getFileTree(root, args.maxDepth);
        return { ok: true, data: tree };
      }

      case "read_file": {
        const args = parseToolArgs(name, rawArgs);
        const filePath = safeResolve(args.path);

        const buf = await fs.readFile(filePath);
        const clipped = buf.subarray(0, args.maxBytes);
        const text = clipped.toString("utf8");

        if (!args.startLine && !args.endLine) {
          return { ok: true, data: { path: args.path, content: text, truncated: buf.length > clipped.length } };
        }

        const lines = text.split(/\r?\n/);
        const start = Math.max(1, args.startLine ?? 1);
        const end = Math.min(lines.length, args.endLine ?? lines.length);
        const slice = lines.slice(start - 1, end).join("\n");

        return {
          ok: true,
          data: {
            path: args.path,
            startLine: start,
            endLine: end,
            content: slice,
            truncated: buf.length > clipped.length,
            totalLinesInClip: lines.length,
          },
        };
      }

      case "write_file": {
        const args = parseToolArgs(name, rawArgs);
        const filePath = safeResolve(args.path);
        const dir = path.dirname(filePath);

        if (args.createDirs) await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, args.content, "utf8");

        return { ok: true, data: { path: args.path, bytes: Buffer.byteLength(args.content, "utf8") } };
      }

      case "apply_patch": {
        const args = parseToolArgs(name, rawArgs);
        const filePath = safeResolve(args.path);

        const exists = await fileExists(filePath);
        if (!exists) {
          return { ok: false, error: { code: "NOT_FOUND", message: `File not found: ${args.path}` } };
        }

        const original = await fs.readFile(filePath, "utf8");
        const lines = original.split(/\r?\n/);

        // Apply edits from bottom to top to keep line indexes stable.
        const edits = [...args.edits].sort((a, b) => b.startLine - a.startLine);

        for (const e of edits) {
          const startIdx = e.startLine - 1;
          const endIdx = e.endLine - 1;
          if (startIdx < 0 || endIdx < startIdx || endIdx >= lines.length) {
            return {
              ok: false,
              error: {
                code: "RANGE_ERROR",
                message: `Invalid edit range [${e.startLine}, ${e.endLine}] for ${args.path} (lines=${lines.length})`,
              },
            };
          }
          const newLines = e.newText.split(/\r?\n/);
          lines.splice(startIdx, endIdx - startIdx + 1, ...newLines);
        }

        const updated = lines.join("\n");
        await fs.writeFile(filePath, updated, "utf8");

        return { ok: true, data: { path: args.path, editsApplied: edits.length } };
      }

      case "search_in_files": {
        const args = parseToolArgs(name, rawArgs);
        const compiled = args.regex
          ? new RegExp(args.query, args.caseSensitive ? "g" : "gi")
          : null;

        const matches: Array<{
          path: string;
          line: number;
          preview: string;
        }> = [];

        for (const p of args.paths) {
          const root = safeResolve(p);
          const files = await collectTextFiles(root, 6);
          for (const f of files) {
            if (matches.length >= args.maxMatches) break;
            const content = await fs.readFile(f, "utf8").catch(() => "");
            if (!content) continue;

            const lines = content.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= args.maxMatches) break;

              const hay = args.caseSensitive ? lines[i] : lines[i].toLowerCase();
              const needle = args.caseSensitive ? args.query : args.query.toLowerCase();

              const hit = compiled ? compiled.test(lines[i]) : hay.includes(needle);
              if (hit) {
                matches.push({
                  path: path.relative(WORKSPACE_ROOT, f),
                  line: i + 1,
                  preview: lines[i].slice(0, 240),
                });
              }

              if (compiled) compiled.lastIndex = 0;
            }
          }
        }

        return { ok: true, data: { query: args.query, matches } };
      }

      case "fetch_url": {
        const args = parseToolArgs(name, rawArgs);
        const res = await fetch(args.url);
        const text = await res.text();
        const clipped = text.slice(0, args.maxBytes);
        return {
          ok: true,
          data: {
            url: args.url,
            status: res.status,
            contentType: res.headers.get("content-type"),
            body: clipped,
            truncated: text.length > clipped.length,
          },
        };
      }

      case "run_command": {
        const args = parseToolArgs(name, rawArgs);
        return await runCommandSandbox(args);
      }

      default:
        return { ok: false, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${name}` } };
    }
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "TOOL_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
        details: err,
      },
    };
  }
}

async function getFileTree(rootAbs: string, maxDepth: number) {
  const out: Array<{ path: string; type: "file" | "dir"; size?: number }> = [];

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (DEFAULT_IGNORES.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      const rel = path.relative(WORKSPACE_ROOT, abs);

      if (e.isDirectory()) {
        out.push({ path: rel, type: "dir" });
        await walk(abs, depth + 1);
      } else if (e.isFile()) {
        const st = await fs.stat(abs).catch(() => null);
        out.push({ path: rel, type: "file", size: st?.size ?? 0 });
      }
    }
  }

  await walk(rootAbs, 0);
  return out;
}

async function collectTextFiles(rootAbs: string, maxDepth: number) {
  const files: string[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (DEFAULT_IGNORES.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs, depth + 1);
      else if (e.isFile()) {
        // quick filter: skip huge/binary-ish files by extension
        const ext = path.extname(e.name).toLowerCase();
        const okExt = new Set([
          ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss",
          ".html", ".txt", ".yml", ".yaml", ".env", ".toml",
        ]);
        if (!okExt.has(ext) && !e.name.includes(".env")) continue;
        files.push(abs);
      }
    }
  }

  await walk(rootAbs, 0);
  return files;
}

async function runCommandSandbox(args: {
  cmd: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env: Record<string, string>;
}): Promise<ToolResult> {
  const ALLOWLIST = new Set(["npm", "pnpm", "yarn", "node", "npx", "ls", "pwd", "grep"]);
  if (!ALLOWLIST.has(args.cmd)) {
    return { ok: false, error: { code: "CMD_NOT_ALLOWED", message: `Command not allowed: ${args.cmd}` } };
  }

  const cwdAbs = safeResolve(args.cwd);

  return await new Promise<ToolResult>((resolve) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(args.cmd, args.args ?? [], {
      cwd: cwdAbs,
      shell: false,
      env: { ...process.env, ...args.env },
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: { code: "TIMEOUT", message: `Command timed out after ${args.timeoutMs}ms` } });
    }, args.timeoutMs);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: true,
        data: {
          code,
          stdout: stdout.slice(0, 50000),
          stderr: stderr.slice(0, 50000),
          truncated: stdout.length > 50000 || stderr.length > 50000,
        },
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: { code: "SPAWN_ERROR", message: err.message } });
    });
  });
}
