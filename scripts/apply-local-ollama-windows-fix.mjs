#!/usr/bin/env node
import fs from "node:fs";
import { execFileSync } from "node:child_process";

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, text) { fs.writeFileSync(file, text, "utf8"); }
function replaceOnce(file, from, to, marker) {
  let text = read(file);
  if (marker && text.includes(marker)) return;
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${file}: expected 1 match, found ${count}`);
  text = text.replace(from, to);
  write(file, text);
}

// 1) Agent loop: local Ollama is real compute even when Conway auth/credits are unavailable.
const loop = "src/agent/loop.ts";
replaceOnce(loop,
`  const { identity, config, db, conway, inference, social, skills, policyEngine, spendTracker, onStateChange, onTurnComplete, ollamaBaseUrl } =\n    options;`,
`  const { identity, config, db, conway, inference, social, skills, policyEngine, spendTracker, onStateChange, onTurnComplete, ollamaBaseUrl } =\n    options;\n\n  const localOllamaOnly =\n    !!ollamaBaseUrl &&\n    /^https?:\\/\\/(localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?(?:\\/|$)/i.test(ollamaBaseUrl) &&\n    !config.conwayApiKey;`,
"const localOllamaOnly ="
);

replaceOnce(loop,
`  let financial = await getFinancialState(conway, identity.address, db, config.chainType || identity.chainType || "evm");`,
`  let financial = localOllamaOnly\n    ? { creditsCents: 0, usdcBalance: 0, lastChecked: new Date().toISOString() }\n    : await getFinancialState(conway, identity.address, db, config.chainType || identity.chainType || "evm");`,
"? { creditsCents: 0, usdcBalance: 0, lastChecked: new Date().toISOString() }"
);

replaceOnce(loop,
`  const wakeupInput = buildWakeupPrompt({\n    identity,\n    config,\n    financial,\n    db,\n  });`,
`  const baseWakeupInput = buildWakeupPrompt({\n    identity,\n    config,\n    financial,\n    db,\n  });\n  const wakeupInput = localOllamaOnly\n    ? baseWakeupInput + "\\n\\nLOCAL OLLAMA MODE: local inference is available and has no Conway credit cost. Conway credits are unavailable and must NOT be treated as a survival problem. Do not request funding or top-ups merely because Conway credits are zero. Optimize for useful work and verified profit while financial transfers remain locked."\n    : baseWakeupInput;`,
"LOCAL OLLAMA MODE: local inference is available"
);

replaceOnce(loop,
`  log(config, \`[WAKE UP] ${config.name} is alive. Credits: $${(financial.creditsCents / 100).toFixed(2)}\`);`,
`  log(\n    config,\n    localOllamaOnly\n      ? \`[WAKE UP] ${config.name} is alive. Local Ollama compute available; Conway credits ignored.\`\n      : \`[WAKE UP] ${config.name} is alive. Credits: $${(financial.creditsCents / 100).toFixed(2)}\`,\n  );`,
"Local Ollama compute available; Conway credits ignored."
);

replaceOnce(loop,
`      financial = await getFinancialState(conway, identity.address, db, config.chainType || identity.chainType || "evm");`,
`      financial = localOllamaOnly\n        ? { creditsCents: 0, usdcBalance: 0, lastChecked: new Date().toISOString() }\n        : await getFinancialState(conway, identity.address, db, config.chainType || identity.chainType || "evm");`,
"financial = localOllamaOnly\n        ?"
);

replaceOnce(loop,
`      if (financial.creditsCents === -1) {`,
`      if (localOllamaOnly) {\n        if (db.getAgentState() !== "running") {\n          db.setAgentState("running");\n          onStateChange?.("running");\n        }\n        inference.setLowComputeMode(false);\n      } else if (financial.creditsCents === -1) {`,
"if (localOllamaOnly) {\n        if (db.getAgentState() !== \"running\")"
);

replaceOnce(loop,
`      const survivalTier = getSurvivalTier(financial.creditsCents);`,
`      const survivalTier = localOllamaOnly ? "normal" : getSurvivalTier(financial.creditsCents);`,
"const survivalTier = localOllamaOnly ? \"normal\""
);

// 2) Heartbeat: do not generate false distress/death while local Ollama is the active compute path.
const hb = "src/heartbeat/tasks.ts";
replaceOnce(hb,
`function getAlertEngine(): AlertEngine {\n  if (!_alertEngine) _alertEngine = new AlertEngine(createDefaultAlertRules());\n  return _alertEngine;\n}`,
`function getAlertEngine(): AlertEngine {\n  if (!_alertEngine) _alertEngine = new AlertEngine(createDefaultAlertRules());\n  return _alertEngine;\n}\n\nfunction isLocalOllamaOnly(taskCtx: HeartbeatLegacyContext): boolean {\n  const url = process.env.OLLAMA_BASE_URL || taskCtx.config.ollamaBaseUrl;\n  return !!url &&\n    /^https?:\\/\\/(localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?(?:\\/|$)/i.test(url) &&\n    !taskCtx.config.conwayApiKey;\n}`,
"function isLocalOllamaOnly"
);
replaceOnce(hb,
`    const tier = ctx.survivalTier;`,
`    const tier: SurvivalTier = isLocalOllamaOnly(taskCtx) ? "normal" : ctx.survivalTier;`,
"const tier: SurvivalTier = isLocalOllamaOnly"
);
replaceOnce(hb,
`  check_credits: async (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {\n    // Use ctx.creditBalance instead of calling conway.getCreditsBalance()\n    const credits = ctx.creditBalance;`,
`  check_credits: async (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {\n    if (isLocalOllamaOnly(taskCtx)) {\n      const now = new Date().toISOString();\n      taskCtx.db.setKV("last_credit_check", JSON.stringify({ credits: 0, tier: "normal", localOllama: true, timestamp: now }));\n      taskCtx.db.setKV("prev_credit_tier", "normal");\n      taskCtx.db.deleteKV("zero_credits_since");\n      return { shouldWake: false };\n    }\n\n    // Use ctx.creditBalance instead of calling conway.getCreditsBalance()\n    const credits = ctx.creditBalance;`,
"localOllama: true"
);

// 3) Tick context + scheduler: skip the failing Conway credit request in local-only mode.
const tick = "src/heartbeat/tick-context.ts";
replaceOnce(tick,
`  walletAddress?: string,\n  chainType?: string,\n): Promise<TickContext> {`,
`  walletAddress?: string,\n  chainType?: string,\n  skipConwayCredits = false,\n): Promise<TickContext> {`,
"skipConwayCredits = false"
);
replaceOnce(tick,
`  let creditBalance = 0;\n  try {\n    creditBalance = await conway.getCreditsBalance();\n  } catch (err: any) {\n    logger.error("Failed to fetch credit balance", err instanceof Error ? err : undefined);\n  }`,
`  let creditBalance = 0;\n  if (!skipConwayCredits) {\n    try {\n      creditBalance = await conway.getCreditsBalance();\n    } catch (err: any) {\n      logger.error("Failed to fetch credit balance", err instanceof Error ? err : undefined);\n    }\n  }`,
"if (!skipConwayCredits)"
);
replaceOnce(tick,
`  const survivalTier = getSurvivalTier(creditBalance);`,
`  const survivalTier = skipConwayCredits ? "normal" : getSurvivalTier(creditBalance);`,
"const survivalTier = skipConwayCredits ? \"normal\""
);

const scheduler = "src/heartbeat/scheduler.ts";
replaceOnce(scheduler,
`      const context = await buildTickContext(\n        this.db,\n        this.legacyContext.conway,\n        this.config,\n        this.legacyContext.identity.address,\n        this.legacyContext.identity.chainType,\n      );`,
`      const localOllamaUrl = process.env.OLLAMA_BASE_URL || this.legacyContext.config.ollamaBaseUrl;\n      const localOllamaOnly = !!localOllamaUrl &&\n        /^https?:\\/\\/(localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?(?:\\/|$)/i.test(localOllamaUrl) &&\n        !this.legacyContext.config.conwayApiKey;\n      const context = await buildTickContext(\n        this.db,\n        this.legacyContext.conway,\n        this.config,\n        this.legacyContext.identity.address,\n        this.legacyContext.identity.chainType,\n        localOllamaOnly,\n      );`,
"const localOllamaUrl = process.env.OLLAMA_BASE_URL"
);

// 4) Windows-compatible state repository initialization.
const stateVersioning = "src/git/state-versioning.ts";
replaceOnce(stateVersioning,
`import os from "node:os";`,
`import os from "node:os";\nimport fs from "node:fs";\nimport path from "node:path";\nimport { execFileSync } from "node:child_process";`,
"execFileSync } from \"node:child_process\""
);
replaceOnce(stateVersioning,
`  // Check if already initialized\n  const checkResult = await conway.exec(\n    \`test -d ${dir}/.git && echo "exists" || echo "nope"\`,\n    5000,\n  );\n\n  if (checkResult.stdout.trim() === "exists") {\n    return;\n  }\n\n  // Initialize\n  await gitInit(conway, dir);`,
`  fs.mkdirSync(dir, { recursive: true });\n\n  // Check if already initialized using Node APIs (portable across Windows/POSIX).\n  if (fs.existsSync(path.join(dir, ".git"))) {\n    return;\n  }\n\n  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });`,
"portable across Windows/POSIX"
);
replaceOnce(stateVersioning,
`  await conway.writeFile(\`${dir}/.gitignore\`, gitignore);\n\n  // Configure git user\n  await conway.exec(\n    \`cd ${dir} && git config user.name "Automaton" && git config user.email "automaton@conway.tech"\`,\n    5000,\n  );\n\n  // Initial commit\n  await gitCommit(conway, dir, "genesis: automaton state repository initialized");`,
`  fs.writeFileSync(path.join(dir, ".gitignore"), gitignore, "utf8");\n\n  // Configure git user without shell syntax.\n  execFileSync("git", ["config", "user.name", "Automaton"], { cwd: dir, stdio: "ignore" });\n  execFileSync("git", ["config", "user.email", "automaton@conway.tech"], { cwd: dir, stdio: "ignore" });\n  execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });\n  execFileSync("git", ["commit", "-m", "genesis: automaton state repository initialized", "--allow-empty"], { cwd: dir, stdio: "ignore" });`,
"Configure git user without shell syntax."
);

// Remove imports no longer used by initStateRepo if TypeScript flags them.
let sv = read(stateVersioning);
sv = sv.replace(`import { gitInit, gitCommit, gitStatus, gitLog } from "./tools.js";`, `import { gitCommit, gitStatus, gitLog } from "./tools.js";`);
write(stateVersioning, sv);

// 5) Make generic git helpers Windows-safe for later state commits.
const gitTools = "src/git/tools.ts";
let gt = read(gitTools);
if (!gt.includes("function shellInRepo(")) {
  gt = gt.replace(
`function escapeShellArg(arg: string): string {\n  return \'\${arg.replace(/\'/g, "\'\\\\\'\'")}\';\n}`,
`function shellInRepo(repoPath: string, command: string): string {\n  if (process.platform === "win32") {\n    const cmd = command.replaceAll("2>/dev/null", "2>nul");\n    return \`cd /d ${'${'}escapeShellArg(repoPath)} && ${'${'}cmd}\`;\n  }\n  return \`cd ${'${'}escapeShellArg(repoPath)} && ${'${'}command}\`;\n}\n\nfunction escapeShellArg(arg: string): string {\n  if (process.platform === "win32") {\n    return \`"${'${'}arg.replace(/"/g, '\"\"')}"\`;\n  }\n  return \'\${arg.replace(/\'/g, "\'\\\\\'\'")}\';\n}`
  );
  const replacements = [
    [`\`cd ${'${'}escapeShellArg(repoPath)} && git status --porcelain -b 2>/dev/null\``, `shellInRepo(repoPath, "git status --porcelain -b 2>/dev/null")`],
    [`\`cd ${'${'}escapeShellArg(repoPath)} && git diff ${'${'}flag} 2>/dev/null\``, `shellInRepo(repoPath, \`git diff ${'${'}flag} 2>/dev/null\`)`],
    [`\`cd ${'${'}escapeShellArg(repoPath)} && git add -A\``, `shellInRepo(repoPath, "git add -A")`],
    [`\`cd ${'${'}escapeShellArg(repoPath)} && git commit -m ${'${'}escapeShellArg(message)} --allow-empty 2>&1\``, `shellInRepo(repoPath, \`git commit -m ${'${'}escapeShellArg(message)} --allow-empty 2>&1\`)`],
    [`\`cd ${'${'}escapeShellArg(repoPath)} && git log --format="%H|%s|%an|%ai" -n ${'${'}safeLimit} 2>/dev/null\``, `shellInRepo(repoPath, \`git log --format="%H|%s|%an|%ai" -n ${'${'}safeLimit} 2>/dev/null\`)`],
    [`\`cd ${'${'}escapeShellArg(repoPath)} && git push ${'${'}escapeShellArg(remote)}${'${'}branchArg} 2>&1\``, `shellInRepo(repoPath, \`git push ${'${'}escapeShellArg(remote)}${'${'}branchArg} 2>&1\`)`],
    [`\`cd ${'${'}escapeShellArg(repoPath)} && git init 2>&1\``, `shellInRepo(repoPath, "git init 2>&1")`],
  ];
  for (const [from, to] of replacements) {
    if (!gt.includes(from)) throw new Error(`${gitTools}: missing expected command: ${from}`);
    gt = gt.replace(from, to);
  }
  gt = gt.replaceAll(`cmd = \`cd ${'${'}escapeShellArg(repoPath)} && git branch -a 2>/dev/null\`;`, `cmd = shellInRepo(repoPath, "git branch -a 2>/dev/null");`);
  gt = gt.replaceAll(`cmd = \`cd ${'${'}escapeShellArg(repoPath)} && git checkout -b ${'${'}escapeShellArg(branchName)} 2>&1\`;`, `cmd = shellInRepo(repoPath, \`git checkout -b ${'${'}escapeShellArg(branchName)} 2>&1\`);`);
  gt = gt.replaceAll(`cmd = \`cd ${'${'}escapeShellArg(repoPath)} && git checkout ${'${'}escapeShellArg(branchName)} 2>&1\`;`, `cmd = shellInRepo(repoPath, \`git checkout ${'${'}escapeShellArg(branchName)} 2>&1\`);`);
  gt = gt.replaceAll(`cmd = \`cd ${'${'}escapeShellArg(repoPath)} && git branch -d ${'${'}escapeShellArg(branchName)} 2>&1\`;`, `cmd = shellInRepo(repoPath, \`git branch -d ${'${'}escapeShellArg(branchName)} 2>&1\`);`);
  write(gitTools, gt);
}

execFileSync(process.execPath, ["scripts/generate-kernel-manifest.mjs"], { stdio: "inherit" });
console.log("local Ollama + Windows fixes applied; kernel manifest regenerated");
