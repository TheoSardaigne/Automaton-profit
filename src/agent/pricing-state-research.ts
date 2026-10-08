import type { AutomatonTool } from "../types.js";
import { assertLocalWorkspaceFilePath, createLocalWorkspaceTools } from "./local-workspace-tools.js";
import { createLocalWebTools } from "./local-web-tools.js";
import { STATE_SOURCES, extractPricingStates, reconcilePricingStates, pricingStatesToCsv, type StatePage } from "./pricing-state.js";
export async function collectPricingStates(urls: string[], fetchPage: (url: string) => Promise<string>) {
  if (!urls.length || urls.length > 3 || new Set(urls).size !== urls.length || urls.some((u) => !(STATE_SOURCES as readonly string[]).includes(u))) throw new Error("only unique official SimplyBook pilot URLs allowed");
  const pages: Array<StatePage & { requested_url: string; accessible: boolean }> = [];
  for (const url of urls) {
    let response = ""; try { response = await fetchPage(url); } catch { /* Partial UNKNOWN, not invented data. */ }
    const split = response.indexOf("\n---\n"), header = split < 0 ? "" : response.slice(0, split);
    const source_url = /^URL: (.+)$/m.exec(header)?.[1] || url;
    const status = Number(/^HTTP status: (\d+)$/m.exec(header)?.[1]);
    const accessible = split >= 0 && status >= 200 && status < 300 && (STATE_SOURCES as readonly string[]).includes(source_url);
    pages.push({ requested_url: url, source_url: accessible ? source_url : url, accessed_at: new Date().toISOString(), accessible,
      text: accessible ? response.slice(split + 5).slice(0, 60000) : "" });
  }
  return { pages, ...reconcilePricingStates(pages.flatMap(extractPricingStates)) };
}
export function createPricingStateTools(web = createLocalWebTools({ maxRequests: 8 }), workspace = createLocalWorkspaceTools()): AutomatonTool[] {
  return [{ name: "local_pricing_state_csv", category: "vm", riskLevel: "caution",
    description: "SimplyBook EN/FR/comparison pilot only. Separate billing commitment, displayed rate, currency, URL language and capture state. Public bounded GET; no browser, inference, shell or paid tool. All states require owner review; unresolved official-source conflicts are blocked. Writes confined CSV only.",
    parameters: { type: "object", additionalProperties: false, properties: { path: { type: "string" }, urls: { type: "array", minItems: 1, maxItems: 3, uniqueItems: true, items: { type: "string", enum: STATE_SOURCES } } }, required: ["path", "urls"] },
    execute: async (args, context) => {
      try {
        if (typeof args.path !== "string" || args.path.length > 2048 || !args.path.endsWith(".csv") || /[:\0]/.test(args.path)) throw new Error("workspace CSV path required");
        await assertLocalWorkspaceFilePath(args.path);
        const fetch = web.find((t) => t.name === "local_web_fetch"), write = workspace.find((t) => t.name === "local_write_file");
        if (!fetch || !write || !Array.isArray(args.urls)) throw new Error("confined dependencies/URLs required");
        const result = await collectPricingStates(args.urls, (url) => fetch.execute({ url }, context));
        const saved = await write.execute({ path: args.path, content: pricingStatesToCsv(result.states) }, context);
        if (!saved.startsWith("File written in local workspace:")) throw new Error(saved);
        return JSON.stringify({ trust: "UNTRUSTED_WEB_DATA", saved, states: result.states, conflicts: result.conflicts });
      } catch (error) { return `Blocked: ${error instanceof Error ? error.message : String(error)}`; }
    },
  }];
}
