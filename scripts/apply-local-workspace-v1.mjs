import fs from "node:fs";
import { spawnSync } from "node:child_process";

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, text) {
  fs.mkdirSync(path.split(/[\\/]/).slice(0, -1).join("/") || ".", { recursive: true });
  fs.writeFileSync(path, text, "utf8");
}

function replaceOnce(text, needle, replacement, label) {
  const count = text.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return text.replace(needle, replacement);
}

const workspaceToolsSource = `import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AutomatonTool } from "../types.js";

const execFileAsync = promisify(execFile);
const MAX_READ_BYTES = 128 * 1024;
const MAX_WRITE_BYTES = 256 * 1024;
const MAX_LIST_ENTRIES = 200;
const MAX_LIST_DEPTH = 3;
const RESERVED_NAMES = new Set([
  ".env",
  "wallet.json",
  "automaton.json",
  "state.db",
  "private-key",
  ".aurum-actions.jsonl",
]);
const RESERVED_EXTENSIONS = [".pem", ".key", ".p12", ".pfx"];

function getAutomatonHome(): string {
  return process.env.HOME || os.homedir();
}

export function getLocalWorkspaceRoot(): string {
  return path.resolve(
    process.env.AUTOMATON_LOCAL_WORKSPACE ||
      path.join(getAutomatonHome(), ".automaton", "workspace"),
  );
}

function actionLogPath(): string {
  return path.join(getAutomatonHome(), ".automaton", "local-action-log.jsonl");
}

function isSensitiveName(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  return (
    RESERVED_NAMES.has(base) ||
    RESERVED_EXTENSIONS.some((ext) => base.endsWith(ext)) ||
    base.startsWith("private-key")
  );
}

function resolveRelativePath(input: string, allowRoot = false): { root: string; target: string; relative: string } {
  const root = getLocalWorkspaceRoot();
  const raw = String(input || ".").trim();
  if (path.isAbsolute(raw)) {
    throw new Error("absolute paths are not allowed");
  }
  const target = path.resolve(root, raw);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("path escapes the local workspace");
  }
  if (!allowRoot && relative === "") {
    throw new Error("workspace root is not a file target");
  }
  return { root, target, relative: relative || "." };
}

async function rejectSymlinks(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  if (!relative || relative === ".") return;
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await fsp.lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`symbolic links are not allowed in local workspace paths: ${part}`);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return;
      throw error;
    }
  }
}

async function appendAudit(action: string, relative: string, details: Record<string, unknown> = {}): Promise<void> {
  const logPath = actionLogPath();
  await fsp.mkdir(path.dirname(logPath), { recursive: true });
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    action,
    path: relative,
    ...details,
  });
  await fsp.appendFile(logPath, entry + "\\n", "utf8");
}

async function ensureWorkspace(): Promise<string> {
  const root = getLocalWorkspaceRoot();
  await fsp.mkdir(root, { recursive: true });
  return root;
}

async function walkDirectory(root: string, dir: string, depth: number, output: string[]): Promise<void> {
  if (depth > MAX_LIST_DEPTH || output.length >= MAX_LIST_ENTRIES) return;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (output.length >= MAX_LIST_ENTRIES) return;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full) || ".";
    if (entry.isSymbolicLink()) {
      output.push(`${rel} [symlink blocked]`);
      continue;
    }
    output.push(entry.isDirectory() ? `${rel}/` : rel);
    if (entry.isDirectory()) {
      await walkDirectory(root, full, depth + 1, output);
    }
  }
}

export function createLocalWorkspaceTools(): AutomatonTool[] {
  return [
    {
      name: "local_workspace_status",
      description: "Show the confined local workspace path and safety limits. This workspace is the only local filesystem area you may use.",
      category: "vm",
      riskLevel: "safe",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        const root = await ensureWorkspace();
        return [
          `Local workspace: ${root}`,
          `Read limit: ${MAX_READ_BYTES} bytes/file`,
          `Write limit: ${MAX_WRITE_BYTES} bytes/file`,
          `List limit: ${MAX_LIST_ENTRIES} entries, depth ${MAX_LIST_DEPTH}`,
          "No absolute paths, parent traversal, symlinks, secrets, deletion, shell, or network execution are available through these tools.",
        ].join("\\n");
      },
    },
    {
      name: "local_list_files",
      description: "List files and directories inside the confined local workspace. Paths must be relative to the workspace.",
      category: "vm",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative directory path, or . for workspace root" },
        },
      },
      execute: async (args) => {
        try {
          const { root, target } = resolveRelativePath(String(args.path ?? "."), true);
          await ensureWorkspace();
          await rejectSymlinks(root, target);
          const stat = await fsp.stat(target);
          if (!stat.isDirectory()) return "ERROR: path is not a directory";
          const output: string[] = [];
          await walkDirectory(root, target, 0, output);
          return output.length ? output.join("\\n") : "Workspace directory is empty.";
        } catch (error) {
          return `Blocked: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    },
    {
      name: "local_read_file",
      description: "Read a UTF-8 text file inside the confined local workspace. Secret-like filenames and symlinks are blocked.",
      category: "vm",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative file path" } },
        required: ["path"],
      },
      execute: async (args) => {
        try {
          const { root, target, relative } = resolveRelativePath(String(args.path));
          if (isSensitiveName(target)) return "Blocked: sensitive filename";
          await ensureWorkspace();
          await rejectSymlinks(root, target);
          const stat = await fsp.stat(target);
          if (!stat.isFile()) return "ERROR: path is not a regular file";
          if (stat.size > MAX_READ_BYTES) return `Blocked: file exceeds ${MAX_READ_BYTES} byte read limit`;
          const content = await fsp.readFile(target, "utf8");
          await appendAudit("read", relative, { bytes: stat.size });
          return content;
        } catch (error) {
          return `Blocked: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    },
    {
      name: "local_write_file",
      description: "Create or replace a UTF-8 text file inside the confined local workspace. Parent directories are created automatically. No deletion or writes outside the workspace are permitted.",
      category: "vm",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path" },
          content: { type: "string", description: "UTF-8 text content" },
        },
        required: ["path", "content"],
      },
      execute: async (args) => {
        try {
          const content = String(args.content ?? "");
          const bytes = Buffer.byteLength(content, "utf8");
          if (bytes > MAX_WRITE_BYTES) return `Blocked: content exceeds ${MAX_WRITE_BYTES} byte write limit`;
          const { root, target, relative } = resolveRelativePath(String(args.path));
          if (isSensitiveName(target)) return "Blocked: sensitive filename";
          await ensureWorkspace();
          await rejectSymlinks(root, target);
          await fsp.mkdir(path.dirname(target), { recursive: true });
          await rejectSymlinks(root, target);
          await fsp.writeFile(target, content, { encoding: "utf8", flag: "w" });
          await appendAudit("write", relative, { bytes });
          return `File written in local workspace: ${relative} (${bytes} bytes)`;
        } catch (error) {
          return `Blocked: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    },
    {
      name: "local_validate_file",
      description: "Validate a workspace file without executing it. Supported modes: json, javascript_syntax.",
      category: "vm",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path" },
          mode: { type: "string", enum: ["json", "javascript_syntax"] },
        },
        required: ["path", "mode"],
      },
      execute: async (args) => {
        try {
          const mode = String(args.mode);
          const { root, target, relative } = resolveRelativePath(String(args.path));
          if (isSensitiveName(target)) return "Blocked: sensitive filename";
          await ensureWorkspace();
          await rejectSymlinks(root, target);
          const stat = await fsp.stat(target);
          if (!stat.isFile()) return "ERROR: path is not a regular file";
          if (stat.size > MAX_READ_BYTES) return `Blocked: file exceeds ${MAX_READ_BYTES} byte validation limit`;

          if (mode === "json") {
            JSON.parse(await fsp.readFile(target, "utf8"));
            await appendAudit("validate_json", relative);
            return `VALID JSON: ${relative}`;
          }
          if (mode === "javascript_syntax") {
            if (!/[.](?:js|mjs|cjs)$/i.test(target)) return "Blocked: javascript_syntax only accepts .js, .mjs, or .cjs files";
            await execFileAsync(process.execPath, ["--check", target], {
              cwd: root,
              timeout: 10_000,
              windowsHide: true,
              maxBuffer: 64 * 1024,
            });
            await appendAudit("validate_js_syntax", relative);
            return `VALID JavaScript syntax: ${relative}`;
          }
          return "Blocked: unsupported validation mode";
        } catch (error: any) {
          const message = error?.stderr || error?.message || String(error);
          return `INVALID: ${String(message).trim().slice(0, 4000)}`;
        }
      },
    },
  ];
}
`;

write("src/agent/local-workspace-tools.ts", workspaceToolsSource);
console.log("written: src/agent/local-workspace-tools.ts");

// Wire tools into the main loop only when Ollama/local mode is active.
{
  const path = "src/agent/loop.ts";
  let src = read(path);

  if (!src.includes('from "./local-workspace-tools.js"')) {
    const anchor = 'import { isIdleOnlyTool } from "./idle-only-tools.js";';
    src = replaceOnce(
      src,
      anchor,
      `${anchor}\nimport { createLocalWorkspaceTools } from "./local-workspace-tools.js";`,
      `${path} import`,
    );
  }

  const oldTools = `  const builtinTools = createBuiltinTools(identity.sandboxId);\n  const installedTools = loadInstalledTools(db);\n  const tools = [...builtinTools, ...installedTools];`;
  const newTools = `  const builtinTools = createBuiltinTools(identity.sandboxId);\n  const installedTools = loadInstalledTools(db);\n  const localOllamaMode = Boolean(ollamaBaseUrl || process.env.OLLAMA_BASE_URL);\n  // Conway VM filesystem/shell tools are not meaningful in local Ollama mode.\n  // Hide them rather than silently redirecting them to the host machine.\n  const unavailableLocalVmTools = new Set([\n    "exec",\n    "read_file",\n    "write_file",\n    "expose_port",\n    "remove_port",\n  ]);\n  const effectiveBuiltinTools = localOllamaMode\n    ? builtinTools.filter((tool) => !unavailableLocalVmTools.has(tool.name))\n    : builtinTools;\n  const localWorkspaceTools = localOllamaMode ? createLocalWorkspaceTools() : [];\n  const tools = [...effectiveBuiltinTools, ...installedTools, ...localWorkspaceTools];`;

  if (!src.includes("createLocalWorkspaceTools()")) {
    src = replaceOnce(src, oldTools, newTools, `${path} workspace wiring`);
  }
  write(path, src);
  console.log(`patched: ${path}`);
}

// Tell the model exactly what the local workspace can and cannot do.
{
  const path = "src/agent/system-prompt.ts";
  let src = read(path);
  const marker = "LOCAL WORKSPACE RULES (OLLAMA MODE):";
  if (!src.includes(marker)) {
    const anchor = "- Financial protections remain active. Do not attempt paid Conway topups unless explicitly enabled by configuration and creator instruction.";
    const addition = `LOCAL WORKSPACE RULES (OLLAMA MODE):\n- Use local_workspace_status, local_list_files, local_read_file, local_write_file, and local_validate_file for local artifact work.\n- These tools are confined to the dedicated .automaton/workspace directory. Treat that directory as your entire writable local filesystem.\n- You do NOT have a general local shell, host filesystem access, deletion capability, credential access, or arbitrary code execution.\n- Never ask to bypass the workspace boundary. If a task requires a capability not exposed by a working tool, clearly report the limitation and the smallest creator action needed.\n- Produce useful artifacts inside the workspace before requesting external spend or irreversible actions.\n`;
    src = replaceOnce(src, anchor, `${addition}\n${anchor}`, `${path} workspace prompt`);
    write(path, src);
    console.log(`patched: ${path}`);
  } else {
    console.log(`already patched: ${path}`);
  }
}

const testSource = `import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalWorkspaceTools } from "../../agent/local-workspace-tools.js";

let workspace = "";

function tool(name: string) {
  const found = createLocalWorkspaceTools().find((entry) => entry.name === name);
  if (!found) throw new Error(\`missing tool: \${name}\`);
  return found;
}

beforeEach(async () => {
  workspace = await fsp.mkdtemp(path.join(os.tmpdir(), "automaton-local-workspace-"));
  process.env.AUTOMATON_LOCAL_WORKSPACE = workspace;
});

afterEach(async () => {
  delete process.env.AUTOMATON_LOCAL_WORKSPACE;
  if (workspace) await fsp.rm(workspace, { recursive: true, force: true });
});

describe("local workspace tools", () => {
  it("writes and reads a confined text file", async () => {
    const write = await tool("local_write_file").execute({ path: "offers/idea.md", content: "hello" }, {} as any);
    expect(write).toContain("File written");
    const read = await tool("local_read_file").execute({ path: "offers/idea.md" }, {} as any);
    expect(read).toBe("hello");
  });

  it("blocks traversal outside the workspace", async () => {
    const result = await tool("local_write_file").execute({ path: "../escape.txt", content: "no" }, {} as any);
    expect(result).toContain("Blocked");
    expect(fs.existsSync(path.resolve(workspace, "../escape.txt"))).toBe(false);
  });

  it("blocks absolute paths", async () => {
    const result = await tool("local_write_file").execute({ path: path.resolve(workspace, "absolute.txt"), content: "no" }, {} as any);
    expect(result).toContain("Blocked");
  });

  it("blocks secret-like filenames", async () => {
    const write = await tool("local_write_file").execute({ path: "wallet.json", content: "{}" }, {} as any);
    expect(write).toContain("Blocked");
  });

  it("validates JSON without executing code", async () => {
    await tool("local_write_file").execute({ path: "data/example.json", content: '{"ok":true}' }, {} as any);
    const result = await tool("local_validate_file").execute({ path: "data/example.json", mode: "json" }, {} as any);
    expect(result).toContain("VALID JSON");
  });

  it("reports invalid JSON", async () => {
    await tool("local_write_file").execute({ path: "data/bad.json", content: "{" }, {} as any);
    const result = await tool("local_validate_file").execute({ path: "data/bad.json", mode: "json" }, {} as any);
    expect(result).toContain("INVALID");
  });
});
`;

write("src/__tests__/agent/local-workspace-tools.test.ts", testSource);
console.log("written: src/__tests__/agent/local-workspace-tools.test.ts");

const manifest = spawnSync(process.execPath, ["scripts/generate-kernel-manifest.mjs"], {
  stdio: "inherit",
});
if (manifest.status !== 0) throw new Error("kernel manifest regeneration failed");

console.log("local workspace v1 applied; kernel manifest regenerated");
