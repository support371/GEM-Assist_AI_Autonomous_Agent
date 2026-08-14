// file: server/agent/tools.ts
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ToolName, parseToolArgs } from "./toolSchemas";

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

type ToolDescriptor = { name: ToolName; description: string };

export const toolRegistry = new Map<ToolName, ToolDescriptor>([
  ["get_file_tree", { name: "get_file_tree", description: "List non-sensitive project files under the bounded workspace." }],
  ["read_file", { name: "read_file", description: "Read a non-sensitive text file inside the bounded workspace." }],
  ["write_file", { name: "write_file", description: "Write a non-sensitive file inside the bounded workspace; never writes secret files." }],
  ["apply_patch", { name: "apply_patch", description: "Apply line edits to a non-sensitive workspace file." }],
  ["search_in_files", { name: "search_in_files", description: "Search non-sensitive text files in the bounded workspace." }],
  ["fetch_url", { name: "fetch_url", description: "Fetch a public HTTP(S) URL with private-network and metadata endpoints blocked." }],
  ["run_command", { name: "run_command", description: "Run a narrow validation command without shell access or inherited secrets." }],
]);

export function getToolDescriptions(): string {
  return Array.from(toolRegistry.values())
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join("\n");
}

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
  ".gem-ops-cache",
]);

const SAFE_TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".html",
  ".txt",
  ".yml",
  ".yaml",
  ".toml",
]);

const SAFE_CHILD_ENV_KEYS = new Set([
  "PATH",
  "HOME",
  "USERPROFILE",
  "TMP",
  "TEMP",
  "TMPDIR",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
  "NODE_ENV",
  "CI",
  "TERM",
  "FORCE_COLOR",
]);

const BLOCKED_PACKAGE_COMMANDS = new Set([
  "add",
  "audit",
  "config",
  "dlx",
  "exec",
  "install",
  "link",
  "login",
  "logout",
  "publish",
  "remove",
  "set",
  "token",
  "uninstall",
  "unlink",
  "update",
  "upgrade",
]);

function safeResolve(relOrAbs: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, relOrAbs);
  if (
    resolved !== WORKSPACE_ROOT &&
    !resolved.startsWith(`${WORKSPACE_ROOT}${path.sep}`)
  ) {
    throw new Error("Path escapes workspace root.");
  }
  return resolved;
}

function isSensitivePath(filePath: string): boolean {
  const rel = path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, "/");
  const parts = rel.split("/").filter(Boolean);
  const base = parts.at(-1)?.toLowerCase() || "";
  const loweredParts = parts.map((part) => part.toLowerCase());

  if (loweredParts.some((part) => [".ssh", ".aws", ".azure", ".gnupg"].includes(part))) {
    return true;
  }
  if (rel.toLowerCase().includes(".config/gcloud/")) return true;

  if (
    base === ".env" ||
    (base.startsWith(".env.") && ![".env.example", ".env.sample", ".env.template"].includes(base))
  ) {
    return true;
  }

  if ([".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"].includes(path.extname(base))) {
    return true;
  }

  return /(^|[._-])(secret|secrets|credential|credentials|private[-_]?key|access[-_]?token|refresh[-_]?token)([._-]|$)/i.test(base);
}

function assertSafeFilePath(filePath: string) {
  if (isSensitivePath(filePath)) {
    throw new Error("Access to secret-bearing files is blocked by the agent trust boundary.");
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  const version = isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version !== 6) return true;

  if (normalized === "::" || normalized === "::1") return true;
  if (/^(fc|fd)/.test(normalized)) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return false;
}

async function assertPublicUrl(urlValue: string): Promise<URL> {
  const url = new URL(urlValue);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP(S) URLs are allowed.");
  }
  if (url.username || url.password) throw new Error("URLs containing credentials are blocked.");

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal" ||
    hostname === "metadata" ||
    hostname === "host.docker.internal"
  ) {
    throw new Error("Local, private, and cloud-metadata hosts are blocked.");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("URL resolves to a private, loopback, link-local, multicast, or reserved address.");
  }
  return url;
}

async function safeFetch(initialUrl: string, maxRedirects = 3): Promise<Response> {
  let url = await assertPublicUrl(initialUrl);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "GEM-Agent-SafeFetch/1.0" },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    if (redirects === maxRedirects) throw new Error("URL redirect limit exceeded.");
    url = await assertPublicUrl(new URL(location, url).href);
  }
  throw new Error("URL redirect limit exceeded.");
}

export async function executeTool(name: ToolName, rawArgs: unknown): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_file_tree": {
        const args = parseToolArgs(name, rawArgs);
        const root = safeResolve(args.root);
        assertSafeFilePath(root);
        const tree = await getFileTree(root, args.maxDepth);
        return { ok: true, data: tree };
      }

      case "read_file": {
        const args = parseToolArgs(name, rawArgs);
        const filePath = safeResolve(args.path);
        assertSafeFilePath(filePath);
        const buf = await fs.readFile(filePath);
        const clipped = buf.subarray(0, args.maxBytes);
        const text = clipped.toString("utf8");

        if (!args.startLine && !args.endLine) {
          return {
            ok: true,
            data: { path: args.path, content: text, truncated: buf.length > clipped.length },
          };
        }

        const lines = text.split(/\r?\n/);
        const start = Math.max(1, args.startLine ?? 1);
        const end = Math.min(lines.length, args.endLine ?? lines.length);
        return {
          ok: true,
          data: {
            path: args.path,
            startLine: start,
            endLine: end,
            content: lines.slice(start - 1, end).join("\n"),
            truncated: buf.length > clipped.length,
            totalLinesInClip: lines.length,
          },
        };
      }

      case "write_file": {
        const args = parseToolArgs(name, rawArgs);
        const filePath = safeResolve(args.path);
        assertSafeFilePath(filePath);
        if (args.createDirs) await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, args.content, "utf8");
        return {
          ok: true,
          data: { path: args.path, bytes: Buffer.byteLength(args.content, "utf8") },
        };
      }

      case "apply_patch": {
        const args = parseToolArgs(name, rawArgs);
        const filePath = safeResolve(args.path);
        assertSafeFilePath(filePath);
        if (!(await fileExists(filePath))) {
          return { ok: false, error: { code: "NOT_FOUND", message: `File not found: ${args.path}` } };
        }

        const original = await fs.readFile(filePath, "utf8");
        const lines = original.split(/\r?\n/);
        const edits = [...args.edits].sort((a, b) => b.startLine - a.startLine);
        for (const edit of edits) {
          const startIndex = edit.startLine - 1;
          const endIndex = edit.endLine - 1;
          if (startIndex < 0 || endIndex < startIndex || endIndex >= lines.length) {
            return {
              ok: false,
              error: {
                code: "RANGE_ERROR",
                message: `Invalid edit range [${edit.startLine}, ${edit.endLine}] for ${args.path}`,
              },
            };
          }
          lines.splice(
            startIndex,
            endIndex - startIndex + 1,
            ...edit.newText.split(/\r?\n/),
          );
        }
        await fs.writeFile(filePath, lines.join("\n"), "utf8");
        return { ok: true, data: { path: args.path, editsApplied: edits.length } };
      }

      case "search_in_files": {
        const args = parseToolArgs(name, rawArgs);
        const compiled = args.regex
          ? new RegExp(args.query, args.caseSensitive ? "g" : "gi")
          : null;
        const matches: Array<{ path: string; line: number; preview: string }> = [];

        for (const candidate of args.paths) {
          const root = safeResolve(candidate);
          assertSafeFilePath(root);
          const files = await collectTextFiles(root, 6);
          for (const file of files) {
            if (matches.length >= args.maxMatches) break;
            const content = await fs.readFile(file, "utf8").catch(() => "");
            if (!content) continue;
            const lines = content.split(/\r?\n/);
            for (let index = 0; index < lines.length && matches.length < args.maxMatches; index += 1) {
              const line = lines[index];
              const haystack = args.caseSensitive ? line : line.toLowerCase();
              const needle = args.caseSensitive ? args.query : args.query.toLowerCase();
              const hit = compiled ? compiled.test(line) : haystack.includes(needle);
              if (hit) {
                matches.push({
                  path: path.relative(WORKSPACE_ROOT, file),
                  line: index + 1,
                  preview: line.slice(0, 240),
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
        const response = await safeFetch(args.url);
        const text = await response.text();
        const clipped = text.slice(0, args.maxBytes);
        return {
          ok: true,
          data: {
            url: response.url || args.url,
            status: response.status,
            contentType: response.headers.get("content-type"),
            body: clipped,
            truncated: text.length > clipped.length,
          },
        };
      }

      case "run_command": {
        const args = parseToolArgs(name, rawArgs);
        return runCommandSandbox(args);
      }

      default:
        return { ok: false, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${name}` } };
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "TOOL_ERROR",
        message: error instanceof Error ? error.message : "Unknown tool error",
      },
    };
  }
}

async function getFileTree(rootAbs: string, maxDepth: number) {
  const output: Array<{ path: string; type: "file" | "dir"; size?: number }> = [];

  async function walk(directory: string, depth: number) {
    if (depth > maxDepth) return;
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (DEFAULT_IGNORES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (isSensitivePath(absolute)) continue;
      const relative = path.relative(WORKSPACE_ROOT, absolute);
      if (entry.isDirectory()) {
        output.push({ path: relative, type: "dir" });
        await walk(absolute, depth + 1);
      } else if (entry.isFile()) {
        const stat = await fs.stat(absolute).catch(() => null);
        output.push({ path: relative, type: "file", size: stat?.size ?? 0 });
      }
    }
  }

  await walk(rootAbs, 0);
  return output;
}

async function collectTextFiles(rootAbs: string, maxDepth: number) {
  const files: string[] = [];
  async function walk(directory: string, depth: number) {
    if (depth > maxDepth) return;
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (DEFAULT_IGNORES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (isSensitivePath(absolute)) continue;
      if (entry.isDirectory()) {
        await walk(absolute, depth + 1);
      } else if (entry.isFile() && SAFE_TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(absolute);
      }
    }
  }
  await walk(rootAbs, 0);
  return files;
}

async function workspaceContainsSensitiveFiles(maxDepth = 4): Promise<boolean> {
  let scanned = 0;
  const maxEntries = 10_000;
  async function walk(directory: string, depth: number): Promise<boolean> {
    if (depth > maxDepth || scanned >= maxEntries) return false;
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (DEFAULT_IGNORES.has(entry.name)) continue;
      scanned += 1;
      const absolute = path.join(directory, entry.name);
      if (isSensitivePath(absolute)) return true;
      if (entry.isDirectory() && (await walk(absolute, depth + 1))) return true;
      if (scanned >= maxEntries) break;
    }
    return false;
  }
  return walk(WORKSPACE_ROOT, 0);
}

function safeChildEnvironment(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SAFE_CHILD_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (key === "NODE_ENV" || key === "CI" || key.startsWith("GEM_AGENT_")) {
      env[key] = value;
    }
  }
  env.GEM_AGENT_SANDBOX = "1";
  return env;
}

function validateCommand(cmd: string, args: string[]): string | null {
  const allowlist = new Set(["npm", "pnpm", "yarn", "node", "ls", "pwd"]);
  if (!allowlist.has(cmd)) return `Command not allowed: ${cmd}`;

  if (["npm", "pnpm", "yarn"].includes(cmd)) {
    const command = (args[0] || "").toLowerCase();
    if (BLOCKED_PACKAGE_COMMANDS.has(command)) {
      return `Package-manager command is blocked in agent mode: ${command}`;
    }
  }

  if (cmd === "node") {
    const blockedFlags = new Set([
      "-e",
      "--eval",
      "-p",
      "--print",
      "-r",
      "--require",
      "--input-type",
      "--import",
    ]);
    if (args.some((arg) => blockedFlags.has(arg) || arg.startsWith("--eval="))) {
      return "Node evaluation/preload flags are blocked in agent mode.";
    }
    const script = args.find((arg) => !arg.startsWith("-"));
    if (script) {
      const resolved = safeResolve(script);
      if (isSensitivePath(resolved)) return "Execution of sensitive files is blocked.";
    }
  }

  return null;
}

async function runCommandSandbox(args: {
  cmd: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env: Record<string, string>;
}): Promise<ToolResult> {
  const commandError = validateCommand(args.cmd, args.args ?? []);
  if (commandError) {
    return { ok: false, error: { code: "CMD_NOT_ALLOWED", message: commandError } };
  }

  if (
    process.env.AGENT_ALLOW_COMMANDS_WITH_SECRET_FILES !== "true" &&
    (await workspaceContainsSensitiveFiles())
  ) {
    return {
      ok: false,
      error: {
        code: "SENSITIVE_WORKSPACE",
        message:
          "Command execution is disabled because secret-bearing files were detected in the workspace. Move secrets outside the workspace or explicitly enable this boundary in a trusted local runtime.",
      },
    };
  }

  const cwdAbs = safeResolve(args.cwd);
  const childEnv = safeChildEnvironment(args.env || {});

  return new Promise<ToolResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: ToolResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const child = spawn(args.cmd, args.args ?? [], {
      cwd: cwdAbs,
      shell: false,
      env: childEnv,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({
        ok: false,
        error: { code: "TIMEOUT", message: `Command timed out after ${args.timeoutMs}ms` },
      });
    }, args.timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (stdout.length < 100_000) stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 100_000) stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const data = {
        code: code ?? 1,
        stdout: stdout.slice(0, 50_000),
        stderr: stderr.slice(0, 50_000),
        truncated: stdout.length > 50_000 || stderr.length > 50_000,
      };
      if (code === 0) {
        finish({ ok: true, data });
      } else {
        finish({
          ok: false,
          error: {
            code: "COMMAND_FAILED",
            message: `Command exited with code ${code ?? 1}`,
            details: data,
          },
        });
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, error: { code: "SPAWN_ERROR", message: error.message } });
    });
  });
}
