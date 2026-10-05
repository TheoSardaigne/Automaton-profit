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
  if (count !== 1) {
    throw new Error(`${label}: expected 1 match, found ${count}`);
  }
  return text.replace(needle, replacement);
}

// 1) Safe alias for a known gpt-oss namespacing quirk.
{
  const path = "src/agent/tools.ts";
  let src = read(path);

  const oldLookup = `  const tool = tools.find((t) => t.name === toolName);\n  const startTime = Date.now();`;
  const newLookup = `  // Some OpenAI-compatible local models occasionally namespace a tool name\n  // even though the schema exposes the bare function name. Keep aliases explicit\n  // and read-only/safe rather than accepting arbitrary dotted names.\n  const SAFE_TOOL_ALIASES: Record<string, string> = {\n    "skills.list_skills": "list_skills",\n  };\n  const resolvedToolName = SAFE_TOOL_ALIASES[toolName] ?? toolName;\n  const tool = tools.find((t) => t.name === resolvedToolName);\n  const startTime = Date.now();`;

  if (!src.includes("SAFE_TOOL_ALIASES")) {
    src = replaceOnce(src, oldLookup, newLookup, `${path} tool alias`);
  }
  write(path, src);
  console.log(`patched: ${path}`);
}

// 2) Make the system prompt truthful in local Ollama mode.
{
  const path = "src/agent/system-prompt.ts";
  let src = read(path);

  const oldOperational = `  // Layer 6: Operational Context\n  sections.push(OPERATIONAL_CONTEXT);`;
  const newOperational = `  // Layer 6: Operational Context\n  const localOllamaMode = Boolean(process.env.OLLAMA_BASE_URL || config.ollamaBaseUrl);\n  if (localOllamaMode) {\n    sections.push(\`\n<environment>\nLOCAL OLLAMA MODE IS ACTIVE.\n- Inference runs locally through Ollama on the creator's Windows host.\n- Local inference does NOT require Conway compute credits. Zero Conway credits are not a survival emergency while Ollama is reachable.\n- Conway Cloud sandbox operations may be unavailable until Conway authentication is restored. Do not assume a Linux Conway VM exists.\n- Do not call Conway-dependent VM/cloud tools merely to inspect the local host.\n- Use ONLY the exact function names listed in AVAILABLE TOOLS. Never invent, prefix, namespace, or guess tool names.\n- In particular, skills are injected instructions, not a tool namespace. To inspect skills, call exactly: list_skills.\n- If a capability is not exposed by an available working tool, state the limitation instead of fabricating a tool call.\n- Financial protections remain active. Do not attempt paid Conway topups unless explicitly enabled by configuration and creator instruction.\n</environment>\n\`);\n  } else {\n    sections.push(OPERATIONAL_CONTEXT);\n  }`;

  if (!src.includes("LOCAL OLLAMA MODE IS ACTIVE")) {
    src = replaceOnce(src, oldOperational, newOperational, `${path} operational context`);
  }

  const oldTier = `  // Compute survival tier\n  const survivalTier = financial.creditsCents > 50 ? "normal"\n    : financial.creditsCents > 10 ? "low_compute"\n    : financial.creditsCents > 0 ? "critical"\n    : "dead";`;
  const newTier = `  // Compute survival tier. Local Ollama compute is independent of Conway credits.\n  const localComputeAvailable = Boolean(process.env.OLLAMA_BASE_URL || config.ollamaBaseUrl);\n  const survivalTier = localComputeAvailable ? "normal"\n    : financial.creditsCents > 50 ? "normal"\n    : financial.creditsCents > 10 ? "low_compute"\n    : financial.creditsCents > 0 ? "critical"\n    : "dead";`;

  if (!src.includes("const localComputeAvailable = Boolean")) {
    src = replaceOnce(src, oldTier, newTier, `${path} survival tier`);
  }

  const oldFirstWake = `You have $\${(financial.creditsCents / 100).toFixed(2)} in compute credits and \${financial.usdcBalance.toFixed(4)} USDC on \${usdcNetwork}.`;
  const newFirstWake = `\${process.env.OLLAMA_BASE_URL || config.ollamaBaseUrl\n  ? \`Local Ollama compute is available. Conway credit balance ($\${(financial.creditsCents / 100).toFixed(2)}) is not required for local inference.\`\n  : \`You have $\${(financial.creditsCents / 100).toFixed(2)} in compute credits.\`} You have \${financial.usdcBalance.toFixed(4)} USDC on \${usdcNetwork}.`;

  if (!src.includes("Local Ollama compute is available. Conway credit balance")) {
    src = replaceOnce(src, oldFirstWake, newFirstWake, `${path} first wakeup`);
  }

  const oldLaterWake = `Your credits: $\${(financial.creditsCents / 100).toFixed(2)} | USDC: \${financial.usdcBalance.toFixed(4)}`;
  const newLaterWake = `\${process.env.OLLAMA_BASE_URL || config.ollamaBaseUrl\n  ? \`Local Ollama compute: available | Conway credits: $\${(financial.creditsCents / 100).toFixed(2)} (not required locally)\`\n  : \`Your credits: $\${(financial.creditsCents / 100).toFixed(2)}\`} | USDC: \${financial.usdcBalance.toFixed(4)}`;

  if (!src.includes("Local Ollama compute: available | Conway credits")) {
    src = replaceOnce(src, oldLaterWake, newLaterWake, `${path} later wakeup`);
  }

  write(path, src);
  console.log(`patched: ${path}`);
}

const manifest = spawnSync(process.execPath, ["scripts/generate-kernel-manifest.mjs"], {
  stdio: "inherit",
});
if (manifest.status !== 0) {
  throw new Error("kernel manifest regeneration failed");
}

console.log("local prompt + safe tool alias fixes applied; kernel manifest regenerated");
