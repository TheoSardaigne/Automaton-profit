import fs from "node:fs";
import { spawnSync } from "node:child_process";

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function replaceOnce(source, needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) {
    throw new Error(label + ": expected 1 match, found " + count);
  }
  return source.replace(needle, replacement);
}

const file = "src/agent/loop.ts";
let source = read(file);

const importAnchor = 'import { isIdleOnlyTool } from "./idle-only-tools.js";';
const workspaceImport = 'import { createLocalWorkspaceTools } from "./local-workspace-tools.js";';
if (!source.includes(workspaceImport)) {
  source = replaceOnce(
    source,
    importAnchor,
    importAnchor + "\n" + workspaceImport,
    "loop local workspace import",
  );
}

const oldBlock = [
  "  const builtinTools = createBuiltinTools(identity.sandboxId);",
  "  const installedTools = loadInstalledTools(db);",
  "  const tools = [...builtinTools, ...installedTools];",
].join("\n");

const newBlock = [
  "  const builtinTools = createBuiltinTools(identity.sandboxId);",
  "  const installedTools = loadInstalledTools(db);",
  "  const localOllamaMode = Boolean(ollamaBaseUrl || process.env.OLLAMA_BASE_URL);",
  "  // In local Ollama mode, never redirect Conway VM tools to the host machine.",
  "  // Instead expose a separate, confined workspace-only toolset.",
  "  const unavailableLocalVmTools = new Set([",
  '    "exec",',
  '    "read_file",',
  '    "write_file",',
  '    "expose_port",',
  '    "remove_port",',
  "  ]);",
  "  const effectiveBuiltinTools = localOllamaMode",
  "    ? builtinTools.filter((tool) => !unavailableLocalVmTools.has(tool.name))",
  "    : builtinTools;",
  "  const localWorkspaceTools = localOllamaMode ? createLocalWorkspaceTools() : [];",
  "  const tools = [...effectiveBuiltinTools, ...installedTools, ...localWorkspaceTools];",
].join("\n");

if (!source.includes("const localWorkspaceTools = localOllamaMode")) {
  source = replaceOnce(source, oldBlock, newBlock, "loop local workspace wiring");
}

write(file, source);
console.log("patched: " + file);

const manifest = spawnSync(process.execPath, ["scripts/generate-kernel-manifest.mjs"], {
  stdio: "inherit",
  shell: false,
});
if (manifest.status !== 0) {
  throw new Error("kernel manifest regeneration failed");
}

console.log("local workspace wiring applied; kernel manifest regenerated");
