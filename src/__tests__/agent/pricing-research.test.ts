import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalPricingTools, PRICING_SOURCE_SPECS, researchPricingSource } from "../../agent/pricing-research.js";
const spec = PRICING_SOURCE_SPECS[0];
const content = `[UNTRUSTED WEB CONTENT]\nURL: ${spec.url}\nHTTP status: 200\n---\nBasic\n$10/user/mo\nPremium\n$17/user/mo`;
afterEach(() => vi.restoreAllMocks());
describe("pricing pipeline confinement", () => {
  it("never calls inference for inaccessible pages and retains expected UNKNOWN fields", async () => {
    const propose = vi.fn();
    const result = await researchPricingSource(spec, async () => "Blocked: response size", propose);
    expect(propose).not.toHaveBeenCalled();
    expect(result.validated).toHaveLength(2);
    expect(result.validated.flatMap((p) => p.fields).every((f) => f.status === "UNKNOWN")).toBe(true);
  });
  it("keeps fields UNKNOWN when local inference errors or is incomplete", async () => {
    for (const propose of [vi.fn(async () => { throw new Error("local unavailable"); }), vi.fn(async () => ({ draft: { plans: [] }, complete: false }))]) {
      const result = await researchPricingSource(spec, async () => content, propose as never);
      expect(result.page_succeeded).toBe(true);
      expect(result.validated.flatMap((p) => p.fields).every((f) => f.status === "UNKNOWN")).toBe(true);
      expect(propose).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects out-of-scope URLs, duplicates and traversal before web or inference", async () => {
    const execute = vi.fn();
    const tool = createLocalPricingTools([{ name: "local_web_fetch", execute } as never])[0]!;
    for (const args of [
      { path: "../escape.csv", urls: [spec.url] }, { path: "ok.csv", urls: ["https://calendly.com/pricing"] },
      { path: "ok.csv", urls: ["http://localhost/"] }, { path: "ok.csv", urls: [spec.url, spec.url] },
    ]) expect(await tool.execute(args, {} as never)).toMatch(/^Blocked:/);
    expect(execute).not.toHaveBeenCalled();
  });
});
