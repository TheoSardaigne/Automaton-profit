#!/usr/bin/env node
import fs from "node:fs";

function replaceExact(file, before, after, label) {
  const current = fs.readFileSync(file, "utf8");
  if (!current.includes(before)) {
    throw new Error(`[${label}] source context not found in ${file}`);
  }
  fs.writeFileSync(file, current.replace(before, after), "utf8");
  console.log(`OK  ${label}`);
}

// ── F3.1: universal tool-result taint boundary ──────────────────
replaceExact(
  "src/agent/tools.ts",
`// Tools whose results come from external sources and need sanitization
const EXTERNAL_SOURCE_TOOLS = new Set([
  "exec",
  "web_fetch",
  "check_social_inbox",
]);`,
`// Universal taint boundary: every tool result is untrusted by default.
// Only outputs synthesized entirely from typed/local scalar state may bypass
// sanitization. Installed/MCP tools, file reads, git output, x402 responses,
// skill echoes, social content, etc. remain untrusted.
const TRUSTED_LOCAL_TOOLS = new Set([
  "sleep",
  "check_credits",
  "check_usdc_balance",
  "list_children",
]);

export function isToolResultTrusted(toolName: string): boolean {
  return TRUSTED_LOCAL_TOOLS.has(toolName);
}`,
  "replace external-source allowlist with default-deny trust list",
);

replaceExact(
  "src/agent/tools.ts",
`      error: \`Unknown tool: \${toolName}\`,`,
`      error: sanitizeToolResult(\`Unknown tool: \${toolName}\`),`,
  "sanitize unknown-tool errors",
);

replaceExact(
  "src/agent/tools.ts",
`        error: \`Policy denied: \${decision.reasonCode} — \${decision.humanMessage}\`,`,
`        error: sanitizeToolResult(
          \`Policy denied: \${decision.reasonCode} — \${decision.humanMessage}\`,
        ),`,
  "sanitize policy-denial errors",
);

replaceExact(
  "src/agent/tools.ts",
`    // Sanitize results from external source tools
    if (EXTERNAL_SOURCE_TOOLS.has(toolName)) {
      result = sanitizeToolResult(result);
    }`,
`    // Default-deny: sanitize every result unless it is a deliberately tiny,
    // locally synthesized output. This is the single model-facing choke point.
    if (!isToolResultTrusted(toolName)) {
      result = sanitizeToolResult(result);
    }`,
  "sanitize all untrusted tool results",
);

replaceExact(
  "src/agent/tools.ts",
`      error: err.message || String(err),`,
`      error: sanitizeToolResult(err.message || String(err)),`,
  "sanitize thrown tool errors",
);

// ── F3.2: worker -> parent task_result is untrusted ─────────────
replaceExact(
  "src/orchestration/orchestrator.ts",
`import { createLogger } from "../observability/logger.js";`,
`import { createLogger } from "../observability/logger.js";
import { sanitizeToolResult } from "../agent/injection-defense.js";`,
  "import task-result sanitizer",
);

replaceExact(
  "src/orchestration/orchestrator.ts",
`      const parsed = parseTaskResultMessage(entry.message);
      if (!parsed) {
        continue;
      }

      this.pendingTaskResults.push(parsed);`,
`      const parsed = parseTaskResultMessage(entry.message);
      if (!parsed) {
        continue;
      }

      // Only accept results that map to a task in this orchestrator's graph.
      // A spoofed/foreign task ID gets no persistence, completion or funding side effects.
      const taskRow = getTaskById(this.params.db, parsed.taskId);
      if (!taskRow) {
        continue;
      }

      this.pendingTaskResults.push(parsed);`,
  "drop foreign task_result ids",
);

replaceExact(
  "src/orchestration/orchestrator.ts",
`  if (!payload || typeof payload !== "object") {
    if (!fallbackTaskId) {
      return null;
    }

    return {
      taskId: fallbackTaskId,
      goalId: message.goalId,
      result: {
        success: true,
        output: message.content,
        artifacts: [],
        costCents: 0,
        duration: 0,
      },
    };
  }`,
`  // Fail closed: malformed/plain-text worker results can never complete work.
  if (!payload || typeof payload !== "object") {
    if (!fallbackTaskId) {
      return null;
    }

    const sanitized = sanitizeToolResult(message.content);
    return {
      taskId: fallbackTaskId,
      goalId: message.goalId,
      result: {
        success: false,
        output: sanitized,
        artifacts: [],
        costCents: 0,
        duration: 0,
      },
      error: sanitized,
    };
  }`,
  "fail closed on malformed task_result envelopes",
);

replaceExact(
  "src/orchestration/orchestrator.ts",
`  const success = firstBoolean(nested.success, obj.success, true);
  const output = firstString(nested.output, obj.output, success ? "ok" : "task failed") ?? "";`,
`  // Missing or non-boolean success is failure, never implicit success.
  const success = firstBoolean(nested.success, obj.success, false);
  const output = sanitizeToolResult(
    firstString(nested.output, obj.output, success ? "ok" : "task failed") ?? "",
  );`,
  "fail closed and sanitize structured task_result output",
);

replaceExact(
  "src/orchestration/orchestrator.ts",
`    error: success ? undefined : (firstString(obj.error, output) ?? undefined),`,
`    error: success
      ? undefined
      : sanitizeToolResult(firstString(obj.error, output) ?? "task failed"),`,
  "sanitize task_result error channel",
);

console.log("\nSelective B3 input-taint hardening applied.");
