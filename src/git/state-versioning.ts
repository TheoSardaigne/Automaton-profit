/**
 * State Versioning
 *
 * Version control the automaton's own state files (~/.automaton/).
 * Every self-modification triggers a git commit with a descriptive message.
 * The automaton's entire identity history is version-controlled and replayable.
 */

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { ConwayClient, AutomatonDatabase } from "../types.js";
import { gitInit, gitCommit, gitStatus, gitLog } from "./tools.js";

function runGitWindows(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const AUTOMATON_DIR = "~/.automaton";

function resolveHome(p: string): string {
  const home = process.env.AUTOMATON_HOME || process.env.HOME || os.homedir() || "/root";
  if (p.startsWith("~")) {
    return `${home}${p.slice(1)}`;
  }
  return p;
}

/**
 * Initialize git repo for the automaton's state directory.
 * Creates .gitignore to exclude sensitive files.
 */
export async function initStateRepo(
  conway: ConwayClient,
): Promise<void> {
  const dir = resolveHome(AUTOMATON_DIR);

  if (process.platform === "win32") {
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(path.join(dir, ".git"))) return;
    runGitWindows(dir, ["init"]);
  } else {
    // Check if already initialized
    const checkResult = await conway.exec(
      `test -d ${dir}/.git && echo "exists" || echo "nope"`,
      5000,
    );
    if (checkResult.stdout.trim() === "exists") return;
    await gitInit(conway, dir);
  }

  // Create .gitignore for sensitive files.
  // Runtime/provider configs contain API keys and must never enter the state repo.
  // Keep this explicit rather than using *.json so non-secret state such as
  // genesis.json can still be versioned.
  const gitignore = `# Sensitive files - never commit
wallet.json
config.json
automaton.json
inference-providers.json
state.db
state.db-wal
state.db-shm
*.db
*.db-journal
*.db-wal
*.db-shm
logs/
*.log
*.err
.env
`;

  if (process.platform === "win32") {
    fs.writeFileSync(path.join(dir, ".gitignore"), gitignore, "utf8");
    runGitWindows(dir, ["config", "user.name", "Automaton"]);
    runGitWindows(dir, ["config", "user.email", "automaton@conway.tech"]);
    runGitWindows(dir, ["add", "-A"]);
    runGitWindows(dir, ["commit", "-m", "genesis: automaton state repository initialized", "--allow-empty"]);
  } else {
    await conway.writeFile(`${dir}/.gitignore`, gitignore);
    await conway.exec(
      `cd ${dir} && git config user.name "Automaton" && git config user.email "automaton@conway.tech"`,
      5000,
    );
    await gitCommit(conway, dir, "genesis: automaton state repository initialized");
  }
}

/**
 * Commit a state change with a descriptive message.
 * Called after any self-modification.
 */
export async function commitStateChange(
  conway: ConwayClient,
  description: string,
  category: string = "state",
): Promise<string> {
  const dir = resolveHome(AUTOMATON_DIR);

  const message = `${category}: ${description}`;
  if (process.platform === "win32") {
    const status = runGitWindows(dir, ["status", "--porcelain"]);
    if (!status.trim()) return "No changes to commit";
    runGitWindows(dir, ["add", "-A"]);
    return runGitWindows(dir, ["commit", "-m", message, "--allow-empty"]);
  }

  const status = await gitStatus(conway, dir);
  if (status.clean) return "No changes to commit";
  return gitCommit(conway, dir, message);
}

/**
 * Commit after a SOUL.md update.
 */
export async function commitSoulUpdate(
  conway: ConwayClient,
  description: string,
): Promise<string> {
  return commitStateChange(conway, description, "soul");
}

/**
 * Commit after a skill installation or removal.
 */
export async function commitSkillChange(
  conway: ConwayClient,
  skillName: string,
  action: "install" | "remove" | "update",
): Promise<string> {
  return commitStateChange(
    conway,
    `${action} skill: ${skillName}`,
    "skill",
  );
}

/**
 * Commit after heartbeat config change.
 */
export async function commitHeartbeatChange(
  conway: ConwayClient,
  description: string,
): Promise<string> {
  return commitStateChange(conway, description, "heartbeat");
}

/**
 * Commit after config change.
 */
export async function commitConfigChange(
  conway: ConwayClient,
  description: string,
): Promise<string> {
  return commitStateChange(conway, description, "config");
}

/**
 * Get the state repo history.
 */
export async function getStateHistory(
  conway: ConwayClient,
  limit: number = 20,
) {
  const dir = resolveHome(AUTOMATON_DIR);
  return gitLog(conway, dir, limit);
}
