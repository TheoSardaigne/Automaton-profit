import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalWorkspaceTools } from "../../agent/local-workspace-tools.js";

let workspace = "";

function getTool(name: string) {
  const found = createLocalWorkspaceTools().find((entry) => entry.name === name);
  if (!found) throw new Error(`missing tool: ${name}`);
  return found;
}

async function runTool(name: string, args: Record<string, unknown>) {
  return getTool(name).execute(args, {} as never);
}

describe("local workspace tools", () => {
  beforeEach(async () => {
    workspace = await fsp.mkdtemp(path.join(os.tmpdir(), "aurum-workspace-"));
    process.env.AUTOMATON_LOCAL_WORKSPACE = workspace;
  });

  afterEach(async () => {
    delete process.env.AUTOMATON_LOCAL_WORKSPACE;
    await fsp.rm(workspace, { recursive: true, force: true });
  });

  it("writes and reads a normal workspace file", async () => {
    const write = await runTool("local_write_file", {
      path: "notes/idea.txt",
      content: "hello aurum",
    });
    expect(write).toContain("File written in local workspace");

    const read = await runTool("local_read_file", {
      path: "notes/idea.txt",
    });
    expect(read).toBe("hello aurum");
  });

  it("blocks parent traversal", async () => {
    const result = await runTool("local_write_file", {
      path: "../../outside.txt",
      content: "blocked",
    });
    expect(result).toContain("Blocked:");
    expect(result).toContain("escapes the local workspace");
  });

  it("blocks absolute paths", async () => {
    const absolute = path.resolve(workspace, "outside.txt");
    const result = await runTool("local_read_file", { path: absolute });
    expect(result).toContain("Blocked:");
    expect(result).toContain("absolute paths are not allowed");
  });

  it("blocks sensitive filenames", async () => {
    const result = await runTool("local_write_file", {
      path: "wallet.json",
      content: "secret",
    });
    expect(result).toBe("Blocked: sensitive filename");
  });

  it("validates JSON without executing it", async () => {
    await runTool("local_write_file", {
      path: "data.json",
      content: '{"ok":true}',
    });
    const result = await runTool("local_validate_file", {
      path: "data.json",
      mode: "json",
    });
    expect(result).toBe("VALID JSON: data.json");
  });

  it("lists only workspace-relative entries", async () => {
    await runTool("local_write_file", {
      path: "nested/file.txt",
      content: "x",
    });
    const result = await runTool("local_list_files", { path: "." });
    expect(result).toContain("nested");
    expect(result).toContain("file.txt");
    expect(result).not.toContain(workspace);
  });
});
