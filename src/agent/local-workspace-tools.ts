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

function resolveRelativePath(
  input: string,
  allowRoot = false,
): { root: string; target: string; relative: string } {
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
        throw new Error(
          `symbolic links are not allowed in local workspace paths: ${part}`,
        );
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return;
      throw error;
    }
  }
}

async function appendAudit(
  action: string,
  relative: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const logPath = actionLogPath();
  await fsp.mkdir(path.dirname(logPath), { recursive: true });
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    action,
    path: relative,
    ...details,
  });
  await fsp.appendFile(logPath, entry + "\n", "utf8");
}

async function ensureWorkspace(): Promise<string> {
  const root = getLocalWorkspaceRoot();
  await fsp.mkdir(root, { recursive: true });
  return root;
}

async function walkDirectory(
  root: string,
  dir: string,
  depth: number,
  output: string[],
): Promise<void> {
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
      description:
        "Show the confined local workspace path and safety limits. This workspace is the only local filesystem area you may use.",
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
        ].join("\n");
      },
    },
    {
      name: "local_list_files",
      description:
        "List files and directories inside the confined local workspace. Paths must be relative to the workspace.",
      category: "vm",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative directory path, or . for workspace root",
          },
        },
      },
      execute: async (args) => {
        try {
          const { root, target } = resolveRelativePath(
            String(args.path ?? "."),
            true,
          );
          await ensureWorkspace();
          await rejectSymlinks(root, target);
          const stat = await fsp.stat(target);
          if (!stat.isDirectory()) return "ERROR: path is not a directory";
          const output: string[] = [];
          await walkDirectory(root, target, 0, output);
          return output.length
            ? output.join("\n")
            : "Workspace directory is empty.";
        } catch (error) {
          return `Blocked: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    },
    {
      name: "local_read_file",
      description:
        "Read a UTF-8 text file inside the confined local workspace. Secret-like filenames and symlinks are blocked.",
      category: "vm",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path" },
        },
        required: ["path"],
      },
      execute: async (args) => {
        try {
          const { root, target, relative } = resolveRelativePath(
            String(args.path),
          );
          if (isSensitiveName(target)) return "Blocked: sensitive filename";
          await ensureWorkspace();
          await rejectSymlinks(root, target);
          const stat = await fsp.stat(target);
          if (!stat.isFile()) return "ERROR: path is not a regular file";
          if (stat.size > MAX_READ_BYTES) {
            return `Blocked: file exceeds ${MAX_READ_BYTES} byte read limit`;
          }
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
      description:
        "Create or replace a UTF-8 text file inside the confined local workspace. Parent directories are created automatically. No deletion or writes outside the workspace are permitted.",
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
          if (bytes > MAX_WRITE_BYTES) {
            return `Blocked: content exceeds ${MAX_WRITE_BYTES} byte write limit`;
          }
          const { root, target, relative } = resolveRelativePath(
            String(args.path),
          );
          if (isSensitiveName(target)) return "Blocked: sensitive filename";
          await ensureWorkspace();
          await rejectSymlinks(root, target);
          await fsp.mkdir(path.dirname(target), { recursive: true });
          await rejectSymlinks(root, target);
          await fsp.writeFile(target, content, {
            encoding: "utf8",
            flag: "w",
          });
          await appendAudit("write", relative, { bytes });
          return `File written in local workspace: ${relative} (${bytes} bytes)`;
        } catch (error) {
          return `Blocked: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    },
    {
      name: "local_validate_file",
      description:
        "Validate a workspace file without executing it. Supported modes: json, javascript_syntax.",
      category: "vm",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path" },
          mode: {
            type: "string",
            enum: ["json", "javascript_syntax"],
          },
        },
        required: ["path", "mode"],
      },
      execute: async (args) => {
        try {
          const mode = String(args.mode);
          const { root, target, relative } = resolveRelativePath(
            String(args.path),
          );
          if (isSensitiveName(target)) return "Blocked: sensitive filename";
          await ensureWorkspace();
          await rejectSymlinks(root, target);
          const stat = await fsp.stat(target);
          if (!stat.isFile()) return "ERROR: path is not a regular file";
          if (stat.size > MAX_READ_BYTES) {
            return `Blocked: file exceeds ${MAX_READ_BYTES} byte validation limit`;
          }

          if (mode === "json") {
            JSON.parse(await fsp.readFile(target, "utf8"));
            await appendAudit("validate_json", relative);
            return `VALID JSON: ${relative}`;
          }
          if (mode === "javascript_syntax") {
            if (!/[.](?:js|mjs|cjs)$/i.test(target)) {
              return "Blocked: javascript_syntax only accepts .js, .mjs, or .cjs files";
            }
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
        } catch (error: unknown) {
          const maybeError = error as {
            stderr?: string | Buffer;
            message?: string;
          };
          const message =
            maybeError?.stderr?.toString() ||
            maybeError?.message ||
            String(error);
          return `INVALID: ${String(message).trim().slice(0, 4000)}`;
        }
      },
    },
  ];
}
