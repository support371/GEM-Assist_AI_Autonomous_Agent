import * as fs from "fs";
import * as path from "path";
import { Tool, ToolInput, ToolOutput } from "./types";

const WORKSPACE_DIR = process.cwd();

function logToolExecution(toolName: string, input: ToolInput, output: ToolOutput) {
  const timestamp = new Date().toISOString();
  console.log(`[TOOL] ${timestamp} | ${toolName}`);
  console.log(`  Input: ${JSON.stringify(input)}`);
  console.log(`  Output: ${output.success ? "SUCCESS" : "FAILED"} - ${JSON.stringify(output.result || output.error)}`);
}

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read the contents of a file from the workspace",
  parameters: [
    { name: "filepath", type: "string", description: "Path to the file relative to workspace", required: true },
  ],
  execute: async (input: ToolInput): Promise<ToolOutput> => {
    const { filepath } = input;
    try {
      const fullPath = path.resolve(WORKSPACE_DIR, filepath);
      if (!fullPath.startsWith(WORKSPACE_DIR)) {
        const output = { success: false, result: null, error: "Access denied: Path outside workspace" };
        logToolExecution("read_file", input, output);
        return output;
      }
      if (!fs.existsSync(fullPath)) {
        const output = { success: false, result: null, error: `File not found: ${filepath}` };
        logToolExecution("read_file", input, output);
        return output;
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      const output = { success: true, result: content };
      logToolExecution("read_file", input, output);
      return output;
    } catch (error: any) {
      const output = { success: false, result: null, error: error.message };
      logToolExecution("read_file", input, output);
      return output;
    }
  },
};

export const writeFileTool: Tool = {
  name: "write_file",
  description: "Write content to a file in the workspace",
  parameters: [
    { name: "filepath", type: "string", description: "Path to the file relative to workspace", required: true },
    { name: "content", type: "string", description: "Content to write to the file", required: true },
  ],
  execute: async (input: ToolInput): Promise<ToolOutput> => {
    const { filepath, content } = input;
    try {
      const fullPath = path.resolve(WORKSPACE_DIR, filepath);
      if (!fullPath.startsWith(WORKSPACE_DIR)) {
        const output = { success: false, result: null, error: "Access denied: Path outside workspace" };
        logToolExecution("write_file", input, output);
        return output;
      }
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, "utf-8");
      const output = { success: true, result: `File written successfully: ${filepath}` };
      logToolExecution("write_file", input, output);
      return output;
    } catch (error: any) {
      const output = { success: false, result: null, error: error.message };
      logToolExecution("write_file", input, output);
      return output;
    }
  },
};

export const listFilesTool: Tool = {
  name: "list_files",
  description: "List files and directories in a given path",
  parameters: [
    { name: "dirpath", type: "string", description: "Directory path relative to workspace (default: root)", required: false },
    { name: "recursive", type: "boolean", description: "Whether to list recursively", required: false },
  ],
  execute: async (input: ToolInput): Promise<ToolOutput> => {
    const { dirpath = ".", recursive = false } = input;
    try {
      const fullPath = path.resolve(WORKSPACE_DIR, dirpath);
      if (!fullPath.startsWith(WORKSPACE_DIR)) {
        const output = { success: false, result: null, error: "Access denied: Path outside workspace" };
        logToolExecution("list_files", input, output);
        return output;
      }
      if (!fs.existsSync(fullPath)) {
        const output = { success: false, result: null, error: `Directory not found: ${dirpath}` };
        logToolExecution("list_files", input, output);
        return output;
      }
      
      const listDir = (dir: string, prefix = ""): string[] => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        let files: string[] = [];
        for (const entry of entries) {
          if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            files.push(`[DIR] ${relativePath}`);
            if (recursive) {
              files = files.concat(listDir(path.join(dir, entry.name), relativePath));
            }
          } else {
            files.push(relativePath);
          }
        }
        return files;
      };
      
      const files = listDir(fullPath);
      const output = { success: true, result: files };
      logToolExecution("list_files", input, output);
      return output;
    } catch (error: any) {
      const output = { success: false, result: null, error: error.message };
      logToolExecution("list_files", input, output);
      return output;
    }
  },
};

export const fetchUrlTool: Tool = {
  name: "fetch_url",
  description: "Fetch content from a URL",
  parameters: [
    { name: "url", type: "string", description: "The URL to fetch", required: true },
    { name: "method", type: "string", description: "HTTP method (GET, POST, etc.)", required: false },
    { name: "headers", type: "object", description: "Request headers", required: false },
    { name: "body", type: "string", description: "Request body for POST/PUT", required: false },
  ],
  execute: async (input: ToolInput): Promise<ToolOutput> => {
    const { url, method = "GET", headers = {}, body } = input;
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "User-Agent": "AutonomousAgent/1.0",
          ...headers,
        },
        body: body ? body : undefined,
      });
      
      const contentType = response.headers.get("content-type") || "";
      let result: any;
      
      if (contentType.includes("application/json")) {
        result = await response.json();
      } else {
        result = await response.text();
        if (result.length > 10000) {
          result = result.substring(0, 10000) + "\n...[truncated]";
        }
      }
      
      const output = {
        success: response.ok,
        result: {
          status: response.status,
          statusText: response.statusText,
          data: result,
        },
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
      logToolExecution("fetch_url", { url, method }, output);
      return output;
    } catch (error: any) {
      const output = { success: false, result: null, error: error.message };
      logToolExecution("fetch_url", input, output);
      return output;
    }
  },
};

export const toolRegistry: Map<string, Tool> = new Map([
  ["read_file", readFileTool],
  ["write_file", writeFileTool],
  ["list_files", listFilesTool],
  ["fetch_url", fetchUrlTool],
]);

export function getToolDescriptions(): string {
  const tools = Array.from(toolRegistry.values());
  return tools.map(tool => {
    const params = tool.parameters.map(p => 
      `  - ${p.name} (${p.type}${p.required ? ", required" : ""}): ${p.description}`
    ).join("\n");
    return `${tool.name}: ${tool.description}\nParameters:\n${params}`;
  }).join("\n\n");
}

export async function executeTool(toolName: string, input: ToolInput): Promise<ToolOutput> {
  const tool = toolRegistry.get(toolName);
  if (!tool) {
    return { success: false, result: null, error: `Unknown tool: ${toolName}` };
  }
  return await tool.execute(input);
}
