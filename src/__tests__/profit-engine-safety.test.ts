import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => fs.readFileSync(path.resolve(here, "..", rel), "utf8");

describe("profit-engine paid-compute launch guards", () => {
  it("keeps paid compute disabled by default", () => {
    const types = src("types.ts");
    expect(types).toContain("autoTopupEnabled: false");
    expect(types).toContain("allowPaidComputeTopup: false");
    expect(types).toContain("maxPaidComputeTopupUsd: 5");
  });

  it("gates startup bootstrap on both switches", () => {
    const index = src("index.ts");
    expect(index).toMatch(/autoTopupEnabled === true && config.allowPaidComputeTopup === true/);
  });

  it("gates heartbeat and both loop automatic topup paths on the master switch", () => {
    const heartbeat = src("heartbeat/tasks.ts");
    const loop = src("agent/loop.ts");
    expect(heartbeat).toContain("taskCtx.config.allowPaidComputeTopup !== true");
    expect((loop.match(/allowPaidComputeTopup === true/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("gates tool-initiated paid topups and sandbox retry topups", () => {
    const tools = src("agent/tools.ts");
    expect(tools).toContain("ctx.config.allowPaidComputeTopup !== true");
    expect(tools).toContain("ctx.config.autoTopupEnabled === true");
    expect(tools).toContain("ctx.config.allowPaidComputeTopup === true");
  });
});
