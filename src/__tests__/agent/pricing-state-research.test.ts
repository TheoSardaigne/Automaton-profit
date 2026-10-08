import { describe, expect, it, vi } from "vitest";
import { collectPricingStates, createPricingStateTools } from "../../agent/pricing-state-research.js";
import { STATE_SOURCES } from "../../agent/pricing-state.js";
describe("pricing state collection boundaries", () => {
  it("collects multiple official pages and preserves inaccessible slots", async () => {
    const fetch = vi.fn(async (url) => url === STATE_SOURCES[0] ? `[UNTRUSTED]\nURL: ${url}\nHTTP status: 200\n---\nBasic\n€13.9\nper month, billed monthly` : "Blocked: limit");
    const r = await collectPricingStates([...STATE_SOURCES], fetch);
    expect(fetch).toHaveBeenCalledTimes(3); expect(r.states).toHaveLength(24);
    expect(r.pages.filter((p) => p.accessible)).toHaveLength(1);
    expect(r.states.filter((p) => p.evidence_status === "VERIFIED_PRICING_STATE")).toHaveLength(0);
  });
  it("rejects private, duplicate, unofficial URLs and traversal before fetching", async () => {
    const execute = vi.fn(); const tool = createPricingStateTools([{ name: "local_web_fetch", execute } as never])[0]!;
    for (const args of [{ path: "../escape.csv", urls: [STATE_SOURCES[0]] }, { path: "ok.csv", urls: ["http://localhost/"] }, { path: "ok.csv", urls: [STATE_SOURCES[0],STATE_SOURCES[0]] }]) expect(await tool.execute(args, {} as never)).toMatch(/^Blocked:/);
    expect(execute).not.toHaveBeenCalled();
  });
  it("does not accept a redirected unknown source or a thrown fetch", async () => {
    const r = await collectPricingStates([STATE_SOURCES[0],STATE_SOURCES[1]], async (url) => { if (url === STATE_SOURCES[1]) throw new Error("unavailable"); return "URL: https://other.example\nHTTP status: 200\n---\nBasic\n€1"; });
    expect(r.states.every((s) => s.amount === "UNKNOWN")).toBe(true);
  });
});
