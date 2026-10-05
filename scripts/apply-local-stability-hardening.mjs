import fs from "node:fs";
import { spawnSync } from "node:child_process";

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, text) {
  fs.writeFileSync(path, text, "utf8");
}

function replaceOnce(text, needle, replacement, label) {
  const count = text.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return text.replace(needle, replacement);
}

// 1) Normalize common local-model tool namespaces using '.', ':', or '/'.
//    Only resolve when the final segment exactly matches a tool already exposed.
{
  const path = "src/agent/tools.ts";
  let src = read(path);

  const oldBlock = `  // Some OpenAI-compatible local models namespace function names (for example\n  // \"skills.list_skills\" or \"orchestration.list_goals\") even though the\n  // tool schema exposes bare names. Normalize ONLY when the final dotted segment\n  // exactly matches a tool that is actually exposed in this turn. This does not\n  // expand capabilities: the canonical tool was already available to the model.\n  // Reassign toolName to the canonical name so policy checks, external-result\n  // sanitization, spend tracking, and audit output all use the same safe identity.\n  if (!tools.some((t) => t.name === toolName) && toolName.includes(".")) {\n    const suffix = toolName.split(".").pop();\n    if (suffix && tools.some((t) => t.name === suffix)) {\n      toolName = suffix;\n    }\n  }\n  const tool = tools.find((t) => t.name === toolName);\n  const startTime = Date.now();`;

  const newBlock = `  // Some OpenAI-compatible local models namespace function names (for example\n  // \"skills.list_skills\", \"tool:list_goals\", or \"orchestration/list_goals\")\n  // even though the schema exposes bare names. Normalize ONLY when the final\n  // segment exactly matches a tool already exposed in this turn. This does not\n  // expand capabilities. In local Ollama mode, never auto-normalize raw VM shell\n  // execution aliases; local host execution requires a separate explicitly-scoped tool.\n  if (!tools.some((t) => t.name === toolName)) {\n    const parts = toolName.split(/[.:/]/).filter(Boolean);\n    const suffix = parts.length > 1 ? parts[parts.length - 1] : undefined;\n    const matched = suffix ? tools.find((t) => t.name === suffix) : undefined;\n    const localOllamaMode = Boolean(process.env.OLLAMA_BASE_URL || context.config.ollamaBaseUrl);\n    const blockedLocalAliases = new Set([\"exec\", \"read_file\", \"write_file\", \"expose_port\"]);\n    if (matched && !(localOllamaMode && blockedLocalAliases.has(matched.name))) {\n      toolName = matched.name;\n    }\n  }\n  const tool = tools.find((t) => t.name === toolName);\n  const startTime = Date.now();`;

  if (!src.includes("blockedLocalAliases")) {
    src = replaceOnce(src, oldBlock, newBlock, `${path} namespace hardening`);
    write(path, src);
    console.log(`patched: ${path}`);
  } else {
    console.log(`already patched: ${path}`);
  }
}

// 2) Harden the local system prompt against fabricated tool execution / external success.
{
  const path = "src/agent/system-prompt.ts";
  let src = read(path);

  const needle = `- Use ONLY the exact function names listed in AVAILABLE TOOLS. Never invent, prefix, namespace, or guess tool names.\n- In particular, skills are injected instructions, not a tool namespace. To inspect skills, call exactly: list_skills.\n- If a capability is not exposed by an available working tool, state the limitation instead of fabricating a tool call.\n- Financial protections remain active. Do not attempt paid Conway topups unless explicitly enabled by configuration and creator instruction.`;

  const replacement = `- Use ONLY the exact function names listed in AVAILABLE TOOLS. Never invent, prefix, namespace, or guess tool names.\n- In particular, skills are injected instructions, not a tool namespace. To inspect skills, call exactly: list_skills.\n- If a capability is not exposed by an available working tool, state the limitation instead of fabricating a tool call.\n- NEVER claim that an external action, payment, purchase, registration, deployment, message, file change, or transaction succeeded unless an actual tool result in this runtime explicitly confirms success.\n- NEVER simulate tool execution in prose. Do not write fake \"Executing:\", \"Result:\", transaction IDs, balances, registrations, or success confirmations. A proposal is not an executed action.\n- If a tool call fails or is unavailable, record it as failed/unavailable and do not update memory or soul as though it succeeded.\n- Financial protections remain active. Do not attempt paid Conway topups unless explicitly enabled by configuration and creator instruction.`;

  if (!src.includes("NEVER simulate tool execution in prose")) {
    src = replaceOnce(src, needle, replacement, `${path} verified-action rule`);
    write(path, src);
    console.log(`patched: ${path}`);
  } else {
    console.log(`already patched: ${path}`);
  }
}

// 3) Reduce idle local wake-up churn. Keep Conway/default behavior unchanged.
{
  const path = "src/heartbeat/daemon.ts";
  let src = read(path);

  const oldLine = `  // Tick interval from config (not log level)\n  const tickMs = heartbeatConfig.defaultIntervalMs ?? 60_000;`;
  const newLine = `  // Tick interval from config (not log level). Local Ollama mode uses a\n  // minimum 5-minute interval to avoid pointless idle GPU churn and reasoning drift.\n  const configuredTickMs = heartbeatConfig.defaultIntervalMs ?? 60_000;\n  const localOllamaMode = Boolean(process.env.OLLAMA_BASE_URL || config.ollamaBaseUrl);\n  const tickMs = localOllamaMode ? Math.max(configuredTickMs, 300_000) : configuredTickMs;`;

  if (!src.includes("minimum 5-minute interval")) {
    src = replaceOnce(src, oldLine, newLine, `${path} local heartbeat interval`);
    write(path, src);
    console.log(`patched: ${path}`);
  } else {
    console.log(`already patched: ${path}`);
  }
}

const manifest = spawnSync(process.execPath, ["scripts/generate-kernel-manifest.mjs"], {
  stdio: "inherit",
});
if (manifest.status !== 0) throw new Error("kernel manifest regeneration failed");

console.log("local stability hardening applied; kernel manifest regenerated");