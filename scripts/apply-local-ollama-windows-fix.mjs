#!/usr/bin/env node
import fs from "node:fs";
import { execFileSync } from "node:child_process";

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}
function write(file, text) {
  fs.writeFileSync(file, text.replace(/\r\n/g, "\n"), "utf8");
}
function patch(file, marker, transform) {
  let text = read(file);
  if (marker && text.includes(marker)) {
    write(file, text);
    console.log(`already patched: ${file}`);
    return;
  }
  const next = transform(text);
  if (next === text) throw new Error(`${file}: patch pattern not found`);
  write(file, next);
  console.log(`patched: ${file}`);
}
function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`${label}: expected text not found`);
  return text.replace(from, to);
}

// 1) Agent loop: local Ollama is valid compute even with no Conway auth/credits.
patch("src/agent/loop.ts", "const localOllamaOnly =", (text) => {
  const anchor = `  const { identity, config, db, conway, inference, social, skills, policyEngine, spendTracker, onStateChange, onTurnComplete, ollamaBaseUrl } =\n    options;`;
  const insert = `${anchor}\n\n  const localOllamaOnly =\n    !!ollamaBaseUrl &&\n    /^https?:\\/\\/(localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?(?:\\/|$)/i.test(ollamaBaseUrl) &&\n    !config.conwayApiKey;`;
  text = replaceRequired(text, anchor, insert, "agent loop local mode anchor");

  text = replaceRequired(
    text,
    `  let financial = await getFinancialState(conway, identity.address, db, config.chainType || identity.chainType || "evm");`,
    `  let financial = localOllamaOnly\n    ? { creditsCents: 0, usdcBalance: 0, lastChecked: new Date().toISOString() }\n    : await getFinancialState(conway, identity.address, db, config.chainType || identity.chainType || "evm");`,
    "agent initial financial state",
  );

  text = replaceRequired(
    text,
    `  const wakeupInput = buildWakeupPrompt({\n    identity,\n    config,\n    financial,\n    db,\n  });`,
    `  const baseWakeupInput = buildWakeupPrompt({\n    identity,\n    config,\n    financial,\n    db,\n  });\n  const wakeupInput = localOllamaOnly\n    ? baseWakeupInput + "\\n\\nLOCAL OLLAMA MODE: Local inference is available with no Conway credit cost. Do not treat zero Conway credits as a survival problem. Do not request funding or top-ups merely because Conway credits are unavailable. Continue useful profit-oriented work while financial transfers remain locked."\n    : baseWakeupInput;`,
    "agent wakeup prompt",
  );

  text = replaceRequired(
    text,
    `  log(config, \`[WAKE UP] \${config.name} is alive. Credits: $\${(financial.creditsCents / 100).toFixed(2)}\`);`,
    `  log(\n    config,\n    localOllamaOnly\n      ? \`[WAKE UP] \${config.name} is alive. Local Ollama compute available; Conway credits ignored.\`\n      : \`[WAKE UP] \${config.name} is alive. Credits: $\${(financial.creditsCents / 100).toFixed(2)}\`,\n  );`,
    "agent wake log",
  );

  text = replaceRequired(
    text,
    `      financial = await getFinancialState(conway, identity.address, db, config.chainType || identity.chainType || "evm");`,
    `      financial = localOllamaOnly\n        ? { creditsCents: 0, usdcBalance: 0, lastChecked: new Date().toISOString() }\n        : await getFinancialState(conway, identity.address, db, config.chainType || identity.chainType || "evm");`,
    "agent periodic financial refresh",
  );

  text = replaceRequired(
    text,
    `      if (financial.creditsCents === -1) {`,
    `      if (localOllamaOnly) {\n        if (db.getAgentState() !== "running") {\n          db.setAgentState("running");\n          onStateChange?.("running");\n        }\n        inference.setLowComputeMode(false);\n      } else if (financial.creditsCents === -1) {`,
    "agent survival branch",
  );

  text = replaceRequired(
    text,
    `      const survivalTier = getSurvivalTier(financial.creditsCents);`,
    `      const survivalTier = localOllamaOnly ? "normal" : getSurvivalTier(financial.creditsCents);`,
    "agent inference tier",
  );
  return text;
});

// 2) Heartbeat tasks: no false distress/death in local-only mode.
patch("src/heartbeat/tasks.ts", "function isLocalOllamaOnly", (text) => {
  const anchor = `function getAlertEngine(): AlertEngine {\n  if (!_alertEngine) _alertEngine = new AlertEngine(createDefaultAlertRules());\n  return _alertEngine;\n}`;
  const helper = `${anchor}\n\nfunction isLocalOllamaOnly(taskCtx: HeartbeatLegacyContext): boolean {\n  const url = process.env.OLLAMA_BASE_URL || taskCtx.config.ollamaBaseUrl;\n  return !!url &&\n    /^https?:\\/\\/(localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?(?:\\/|$)/i.test(url) &&\n    !taskCtx.config.conwayApiKey;\n}`;
  text = replaceRequired(text, anchor, helper, "heartbeat helper anchor");
  text = replaceRequired(
    text,
    `    const tier = ctx.survivalTier;`,
    `    const tier: SurvivalTier = isLocalOllamaOnly(taskCtx) ? "normal" : ctx.survivalTier;`,
    "heartbeat ping tier",
  );
  const checkAnchor = `  check_credits: async (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {\n    // Use ctx.creditBalance instead of calling conway.getCreditsBalance()`;
  const checkInsert = `  check_credits: async (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {\n    if (isLocalOllamaOnly(taskCtx)) {\n      const now = new Date().toISOString();\n      taskCtx.db.setKV("last_credit_check", JSON.stringify({ credits: 0, tier: "normal", localOllama: true, timestamp: now }));\n      taskCtx.db.setKV("prev_credit_tier", "normal");\n      taskCtx.db.deleteKV("zero_credits_since");\n      return { shouldWake: false };\n    }\n\n    // Use ctx.creditBalance instead of calling conway.getCreditsBalance()`;
  text = replaceRequired(text, checkAnchor, checkInsert, "heartbeat credit check");
  return text;
});

// 3) Tick context: skip Conway credit API entirely while localhost Ollama is configured.
patch("src/heartbeat/tick-context.ts", "const localOllamaOnly = !!process.env.OLLAMA_BASE_URL", (text) => {
  text = replaceRequired(
    text,
    `  const startedAt = new Date();`,
    `  const startedAt = new Date();\n  const localOllamaOnly = !!process.env.OLLAMA_BASE_URL &&\n    /^https?:\\/\\/(localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?(?:\\/|$)/i.test(process.env.OLLAMA_BASE_URL);`,
    "tick local mode",
  );
  text = replaceRequired(
    text,
    `  let creditBalance = 0;\n  try {\n    creditBalance = await conway.getCreditsBalance();\n  } catch (err: any) {\n    logger.error("Failed to fetch credit balance", err instanceof Error ? err : undefined);\n  }`,
    `  let creditBalance = 0;\n  if (!localOllamaOnly) {\n    try {\n      creditBalance = await conway.getCreditsBalance();\n    } catch (err: any) {\n      logger.error("Failed to fetch credit balance", err instanceof Error ? err : undefined);\n    }\n  }`,
    "tick credit fetch",
  );
  text = replaceRequired(
    text,
    `  const survivalTier = getSurvivalTier(creditBalance);`,
    `  const survivalTier = localOllamaOnly ? "normal" : getSurvivalTier(creditBalance);`,
    "tick survival tier",
  );
  return text;
});

// 4) State versioning: use portable Node + git process calls on Windows.
patch("src/git/state-versioning.ts", "function runGitWindows", (text) => {
  text = replaceRequired(
    text,
    `import os from "node:os";`,
    `import os from "node:os";\nimport fs from "node:fs";\nimport path from "node:path";\nimport { execFileSync } from "node:child_process";`,
    "state imports",
  );
  text = replaceRequired(
    text,
    `import { gitInit, gitCommit, gitStatus, gitLog } from "./tools.js";`,
    `import { gitInit, gitCommit, gitStatus, gitLog } from "./tools.js";\n\nfunction runGitWindows(dir: string, args: string[]): string {\n  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });\n}`,
    "state git helper",
  );

  const oldInit = `  // Check if already initialized\n  const checkResult = await conway.exec(\n    \`test -d \${dir}/.git && echo "exists" || echo "nope"\`,\n    5000,\n  );\n\n  if (checkResult.stdout.trim() === "exists") {\n    return;\n  }\n\n  // Initialize\n  await gitInit(conway, dir);`;
  const newInit = `  if (process.platform === "win32") {\n    fs.mkdirSync(dir, { recursive: true });\n    if (fs.existsSync(path.join(dir, ".git"))) return;\n    runGitWindows(dir, ["init"]);\n  } else {\n    // Check if already initialized\n    const checkResult = await conway.exec(\n      \`test -d \${dir}/.git && echo "exists" || echo "nope"\`,\n      5000,\n    );\n    if (checkResult.stdout.trim() === "exists") return;\n    await gitInit(conway, dir);\n  }`;
  text = replaceRequired(text, oldInit, newInit, "state init repo");

  const oldTail = `  await conway.writeFile(\`${'${'}dir}/.gitignore\`, gitignore);\n\n  // Configure git user\n  await conway.exec(\n    \`cd ${'${'}dir} && git config user.name "Automaton" && git config user.email "automaton@conway.tech"\`,\n    5000,\n  );\n\n  // Initial commit\n  await gitCommit(conway, dir, "genesis: automaton state repository initialized");`;
  const newTail = `  if (process.platform === "win32") {\n    fs.writeFileSync(path.join(dir, ".gitignore"), gitignore, "utf8");\n    runGitWindows(dir, ["config", "user.name", "Automaton"]);\n    runGitWindows(dir, ["config", "user.email", "automaton@conway.tech"]);\n    runGitWindows(dir, ["add", "-A"]);\n    runGitWindows(dir, ["commit", "-m", "genesis: automaton state repository initialized", "--allow-empty"]);\n  } else {\n    await conway.writeFile(\`${'${'}dir}/.gitignore\`, gitignore);\n    await conway.exec(\n      \`cd ${'${'}dir} && git config user.name "Automaton" && git config user.email "automaton@conway.tech"\`,\n      5000,\n    );\n    await gitCommit(conway, dir, "genesis: automaton state repository initialized");\n  }`;
  text = replaceRequired(text, oldTail, newTail, "state init tail");

  const oldCommit = `  // Check if there are changes\n  const status = await gitStatus(conway, dir);\n  if (status.clean) {\n    return "No changes to commit";\n  }\n\n  const message = \`${'${'}category}: ${'${'}description}\`;\n  const result = await gitCommit(conway, dir, message);\n  return result;`;
  const newCommit = `  const message = \`${'${'}category}: ${'${'}description}\`;\n  if (process.platform === "win32") {\n    const status = runGitWindows(dir, ["status", "--porcelain"]);\n    if (!status.trim()) return "No changes to commit";\n    runGitWindows(dir, ["add", "-A"]);\n    return runGitWindows(dir, ["commit", "-m", message, "--allow-empty"]);\n  }\n\n  const status = await gitStatus(conway, dir);\n  if (status.clean) return "No changes to commit";\n  return gitCommit(conway, dir, message);`;
  text = replaceRequired(text, oldCommit, newCommit, "state commit change");
  return text;
});

execFileSync(process.execPath, ["scripts/generate-kernel-manifest.mjs"], { stdio: "inherit" });
console.log("local Ollama + Windows fixes applied; kernel manifest regenerated");
