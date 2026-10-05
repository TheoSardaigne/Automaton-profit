import fs from "node:fs";
import { spawnSync } from "node:child_process";

const path = "src/agent/tools.ts";
let src = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const oldBlock = `  // Some OpenAI-compatible local models occasionally namespace a tool name\n  // even though the schema exposes the bare function name. Keep aliases explicit\n  // and read-only/safe rather than accepting arbitrary dotted names.\n  const SAFE_TOOL_ALIASES: Record<string, string> = {\n    "skills.list_skills": "list_skills",\n  };\n  const resolvedToolName = SAFE_TOOL_ALIASES[toolName] ?? toolName;\n  const tool = tools.find((t) => t.name === resolvedToolName);\n  const startTime = Date.now();`;

const newBlock = `  // Some OpenAI-compatible local models namespace function names (for example\n  // \"skills.list_skills\" or \"orchestration.list_goals\") even though the\n  // tool schema exposes bare names. Normalize ONLY when the final dotted segment\n  // exactly matches a tool that is actually exposed in this turn. This does not\n  // expand capabilities: the canonical tool was already available to the model.\n  // Reassign toolName to the canonical name so policy checks, external-result\n  // sanitization, spend tracking, and audit output all use the same safe identity.\n  if (!tools.some((t) => t.name === toolName) && toolName.includes(".")) {\n    const suffix = toolName.split(".").pop();\n    if (suffix && tools.some((t) => t.name === suffix)) {\n      toolName = suffix;\n    }\n  }\n  const tool = tools.find((t) => t.name === toolName);\n  const startTime = Date.now();`;

if (src.includes(newBlock)) {
  console.log("safe tool namespace normalization already applied");
} else {
  const count = src.split(oldBlock).length - 1;
  if (count !== 1) {
    throw new Error(`${path}: expected previous alias block once, found ${count}`);
  }
  src = src.replace(oldBlock, newBlock);
  fs.writeFileSync(path, src, "utf8");
  console.log(`patched: ${path}`);
}

const manifest = spawnSync(process.execPath, ["scripts/generate-kernel-manifest.mjs"], {
  stdio: "inherit",
});
if (manifest.status !== 0) {
  throw new Error("kernel manifest regeneration failed");
}

console.log("safe tool namespace normalization applied; kernel manifest regenerated");