import { describe, expect, it, vi } from "vitest";
import { assertResearchConfig, createResearchDispatcher, hasWrittenDeliverables, RESEARCH_TOOLS } from "../../../scripts/run-aurum-research.mjs";

const config = { name: "Aurum", inferenceModel: "gpt-oss:20b", profitLaunchMode: true, autoTopupEnabled: false, allowPaidComputeTopup: false };
const models = [{ model_id: "gpt-oss:20b", provider: "ollama", enabled: 1 }, { model_id: "gpt-5.2", provider: "openai", enabled: 0 }];

describe("zero-spend research session", () => {
  it("requires four confirmed writes in the current pass", () => {
    const scope = "research/first-payment/session";
    expect(hasWrittenDeliverables(new Set(), scope)).toBe(false);
    expect(hasWrittenDeliverables(new Set([`${scope}/evidence.json`]), scope)).toBe(false);
    expect(hasWrittenDeliverables(new Set(["evidence.json", "comparison.md", "experiment.md", "sample.md"].map((file) => `${scope}/${file}`)), scope)).toBe(true);
  });
  it("requires local inference and explicit financial locks", () => {
    expect(() => assertResearchConfig(config, models)).not.toThrow();
    for (const change of [{ profitLaunchMode: false }, { autoTopupEnabled: true }, { allowPaidComputeTopup: true }, { inferenceModel: "gpt-5.2" }]) {
      expect(() => assertResearchConfig({ ...config, ...change }, models)).toThrow("preflight failed");
    }
    expect(() => assertResearchConfig(config, [...models, { model_id: "paid", provider: "conway", enabled: 1 }])).toThrow("only the local");
    expect(() => assertResearchConfig(config, [])).toThrow("only the local");
  });

  it("never exposes other tools, even through namespaces", async () => {
    const execute = vi.fn().mockResolvedValue("OK");
    const forbidden = vi.fn();
    const dispatch = createResearchDispatcher([
      ...RESEARCH_TOOLS.map((name) => ({ name, execute })),
      { name: "exec", execute: forbidden }, { name: "topup_credits", execute: forbidden },
    ], "research/first-payment/session");
    for (const name of ["exec", "tools.exec", "topup_credits", "financial/topup_credits", "unknown"]) {
      expect(await dispatch(name, {})).toContain("Blocked:");
    }
    expect(forbidden).not.toHaveBeenCalled();
    expect(await dispatch("workspace.local_workspace_status", {})).toBe("OK");
  });

  it("confines file actions to session deliverables", async () => {
    const execute = vi.fn().mockResolvedValue("OK");
    const scope = "research/first-payment/session";
    const dispatch = createResearchDispatcher(RESEARCH_TOOLS.map((name) => ({ name, execute })), scope);
    for (const path of ["wallet.json", "../../wallet.json", "C:/root/.automaton/wallet.json", `${scope}/../evidence.json`, `${scope}/other.txt`]) {
      expect(await dispatch("local_write_file", { path, content: "x" })).toContain("Blocked:");
    }
    expect(await dispatch("local_validate_file", { path: `${scope}/evidence.json`, mode: "javascript_syntax" })).toContain("Blocked:");
    expect(execute).not.toHaveBeenCalled();
    expect(await dispatch("local_write_file", { path: `${scope}/evidence.json`, content: "[]" })).toBe("OK");
    expect(await dispatch("local_list_files", { path: scope })).toBe("OK");
    expect(await dispatch("local_web_search", null)).toContain("Blocked:");
  });

  it("refuses an incomplete toolset", () => {
    expect(() => createResearchDispatcher([], "scope")).toThrow("Incomplete research toolset");
  });
  it("confines batch CSV exports to the session's dataset", async () => {
    const execute = vi.fn().mockResolvedValue("OK");
    const scope = "research/first-payment/session";
    const dispatch = createResearchDispatcher(RESEARCH_TOOLS.map((name) => ({ name, execute })), scope);
    for (const path of ["elsewhere.csv", `${scope}/../dataset.csv`, `${scope}/other.csv`]) {
      expect(await dispatch("local_research_extract_csv", { path, pages: [] })).toContain("Blocked:");
    }
    expect(execute).not.toHaveBeenCalled();
    expect(await dispatch("local_research_extract_csv", { path: `${scope}/dataset.csv`, pages: [] })).toBe("OK");
    expect(await dispatch("local_pricing_extract_csv", { path: "elsewhere.csv", urls: [] })).toContain("Blocked:");
    expect(await dispatch("local_pricing_extract_csv", { path: `${scope}/dataset.csv`, urls: [] })).toBe("OK");
    expect(await dispatch("local_pricing_state_csv", { path: "elsewhere.csv", urls: [] })).toContain("Blocked:");
    expect(await dispatch("local_pricing_state_csv", { path: `${scope}/dataset.csv`, urls: [] })).toBe("OK");
  });
  it("blocks all web calls in offline review", async () => {
    const execute = vi.fn().mockResolvedValue("OK");
    const dispatch = createResearchDispatcher(RESEARCH_TOOLS.map((name) => ({ name, execute })), "scope", { offline: true });
    expect(await dispatch("local_web_search", { query: "test" })).toContain("offline review");
    expect(await dispatch("web.local_web_fetch", { url: "https://example.com" })).toContain("offline review");
    expect(await dispatch("local_research_extract_csv", { path: "scope/dataset.csv", pages: [] })).toContain("offline review");
    expect(await dispatch("local_pricing_extract_csv", { path: "scope/dataset.csv", urls: [] })).toContain("offline review");
    expect(await dispatch("local_pricing_state_csv", { path: "scope/dataset.csv", urls: [] })).toContain("offline review");
    expect(execute).not.toHaveBeenCalled();
  });
});
