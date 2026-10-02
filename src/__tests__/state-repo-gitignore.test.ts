/**
 * State Repo .gitignore Tests
 *
 * Regression coverage for the genesis state-repo commit picking up the
 * agent's API keys.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

type ExecResult = { stdout: string; stderr?: string; exitCode: number };

function makeLocalClient(home: string) {
  return {
    async exec(cmd: string, _timeout?: number): Promise<ExecResult> {
      try {
        const stdout = execFileSync("bash", ["-c", cmd], {
          env: { ...process.env, HOME: home },
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        return { stdout, exitCode: 0 };
      } catch (error) {
        const e = error as { stdout?: string; stderr?: string; status?: number };
        return {
          stdout: e.stdout ?? "",
          stderr: e.stderr ?? "",
          exitCode: typeof e.status === "number" ? e.status : 1,
        };
      }
    },
    async writeFile(filePath: string, content: string): Promise<void> {
      const full = filePath.startsWith("~")
        ? path.join(home, filePath.slice(1))
        : filePath;
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf-8");
    },
  };
}

let home: string;

function automatonDir(): string {
  return path.join(home, ".automaton");
}

function committedFiles(): string[] {
  return execFileSync("git", ["ls-files"], {
    cwd: automatonDir(),
    encoding: "utf-8",
  })
    .split("\n")
    .filter(Boolean);
}

function commitContains(needle: string): boolean {
  try {
    execFileSync("git", ["grep", "-q", needle, "HEAD"], {
      cwd: automatonDir(),
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "automaton-state-repo-"));
  fs.mkdirSync(automatonDir(), { recursive: true });
  fs.writeFileSync(
    path.join(automatonDir(), "automaton.json"),
    JSON.stringify({ conwayApiKey: "cwy_live_TESTKEY", openaiApiKey: "sk-TEST" }),
  );
  fs.writeFileSync(
    path.join(automatonDir(), "config.json"),
    JSON.stringify({ apiKey: "cwy_live_PROVISIONKEY" }),
  );
  fs.writeFileSync(
    path.join(automatonDir(), "wallet.json"),
    JSON.stringify({ privateKey: "BASE64PRIVATEKEY" }),
  );
  fs.writeFileSync(path.join(automatonDir(), "state.db"), "");
  fs.writeFileSync(path.join(automatonDir(), "SOUL.md"), "# soul\n");
  fs.writeFileSync(path.join(automatonDir(), "WORKLOG.md"), "log\n");
});

afterEach(() => {
  try {
    fs.rmSync(home, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

describe("initStateRepo gitignore", () => {
  it("does not commit automaton.json (the real config with API keys)", async () => {
    const { initStateRepo } = await import("../git/state-versioning.js");
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      await initStateRepo(makeLocalClient(home) as never);
      expect(committedFiles()).not.toContain("automaton.json");
      expect(commitContains("cwy_live_TESTKEY")).toBe(false);
      expect(commitContains("sk-TEST")).toBe(false);
    } finally {
      process.env.HOME = prevHome;
    }
  });

  it("does not commit wallet.json, config.json or the state database", async () => {
    const { initStateRepo } = await import("../git/state-versioning.js");
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      await initStateRepo(makeLocalClient(home) as never);
      const tracked = committedFiles();
      expect(tracked).not.toContain("wallet.json");
      expect(tracked).not.toContain("config.json");
      expect(tracked).not.toContain("state.db");
      expect(commitContains("BASE64PRIVATEKEY")).toBe(false);
      expect(commitContains("cwy_live_PROVISIONKEY")).toBe(false);
    } finally {
      process.env.HOME = prevHome;
    }
  });

  it("still commits non-sensitive evolution state", async () => {
    const { initStateRepo } = await import("../git/state-versioning.js");
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      await initStateRepo(makeLocalClient(home) as never);
      const tracked = committedFiles();
      expect(tracked).toContain("SOUL.md");
      expect(tracked).toContain("WORKLOG.md");
      expect(tracked).toContain(".gitignore");
    } finally {
      process.env.HOME = prevHome;
    }
  });

  it("does not blanket-ignore JSON, which would hide legitimate state", async () => {
    fs.writeFileSync(
      path.join(automatonDir(), "genesis.json"),
      JSON.stringify({ chainType: "evm" }),
    );
    const { initStateRepo } = await import("../git/state-versioning.js");
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      await initStateRepo(makeLocalClient(home) as never);
      expect(committedFiles()).toContain("genesis.json");
    } finally {
      process.env.HOME = prevHome;
    }
  });

  it("ignores BYOK provider keys", async () => {
    fs.writeFileSync(
      path.join(automatonDir(), "inference-providers.json"),
      JSON.stringify({ providers: [{ apiKey: "sk-BYOK-SECRET" }] }),
    );
    const { initStateRepo } = await import("../git/state-versioning.js");
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      await initStateRepo(makeLocalClient(home) as never);
      expect(committedFiles()).not.toContain("inference-providers.json");
      expect(commitContains("sk-BYOK-SECRET")).toBe(false);
    } finally {
      process.env.HOME = prevHome;
    }
  });
});
