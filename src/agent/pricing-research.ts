import type { AutomatonTool } from "../types.js";
import { createLocalWebTools } from "./local-web-tools.js";
import { createLocalWorkspaceTools, assertLocalWorkspaceFilePath } from "./local-workspace-tools.js";
import { researchRowsToCsv, type ResearchRow } from "./structured-research.js";
import { verifyPricingDraft, type PricingPage } from "./pricing-evidence.js";
import { proposeLocalPricing } from "./local-pricing-extraction.js";

export const PRICING_SOURCE_SPECS = [
  { entity: "SavvyCal", url: "https://savvycal.com/pricing/", plan_names: ["Basic", "Premium"], options: ["UNKNOWN"] },
  { entity: "YouCanBookMe", url: "https://youcanbook.me/pricing", plan_names: ["Free", "Individual", "Professional", "Team"], options: ["UNKNOWN"] },
  { entity: "SimplyBook.me", url: "https://simplybook.me/en/pricing", plan_names: ["Free", "Basic", "Standard", "Premium", "Enterprise"], options: ["monthly"] },
] as const;
export function pricingSlots(spec: typeof PRICING_SOURCE_SPECS[number]) {
  return spec.plan_names.flatMap((plan_name) => spec.options.map((billing_option) => ({ plan_name, billing_option })));
}

/** One page, one bounded local proposal, independent fail-closed verification. */
export async function researchPricingSource(
  spec: typeof PRICING_SOURCE_SPECS[number],
  fetchPage: (url: string) => Promise<string>,
  propose = proposeLocalPricing,
) {
  const response = await fetchPage(spec.url);
  const split = response.indexOf("\n---\n");
  const header = split < 0 ? "" : response.slice(0, split);
  const status = Number(/^HTTP status: (\d+)$/m.exec(header)?.[1]);
  const source_url = /^URL: (.+)$/m.exec(header)?.[1] || spec.url;
  const page: PricingPage = { entity: spec.entity, source_url, accessed_at: new Date().toISOString(),
    text: status >= 200 && status < 300 && split >= 0 ? response.slice(split + 5).slice(0, 60000) : "", plan_names: [...spec.plan_names] };
  const slots = pricingSlots(spec);
  let proposal: Awaited<ReturnType<typeof proposeLocalPricing>> | null = null;
  let failure: string | null = null;
  if (page.text) {
    try { proposal = await propose(page, slots); }
    catch (error) { failure = error instanceof Error ? error.message : String(error); }
  } else failure = "PAGE_INACCESSIBLE";
  const validated = verifyPricingDraft(page, proposal?.complete ? proposal.draft : null, slots);
  return { page, slots, proposal, failure, validated, page_succeeded: Boolean(page.text) };
}

export function pricingRows(result: Awaited<ReturnType<typeof researchPricingSource>>): ResearchRow[] {
  return result.validated.flatMap((plan) => plan.fields.map((field) => ({
    entity: `${plan.entity} / candidate ${plan.plan_name} [${plan.billing_option}]`, source_url: field.source_url,
    requested_url: result.page.source_url, access_date: plan.accessed_at, field: field.field,
    value: String(field.normalized_value), evidence: field.exact_evidence_quote,
    status: field.status === "VERIFIED_EVIDENCE" ? "EXTRACTED_LITERAL" : "UNKNOWN", reason: field.reason,
  })));
}

export function createLocalPricingTools(webTools = createLocalWebTools({ maxRequests: 8 }), workspaceTools = createLocalWorkspaceTools()): AutomatonTool[] {
  return [{ name: "local_pricing_extract_csv", category: "vm", riskLevel: "caution",
    description: "Pricing pilot ONLY for SavvyCal, YouCanBookMe and SimplyBook.me public pricing pages. Local gpt-oss:20b proposes, separate deterministic rules accept exact evidence or UNKNOWN. Fixed loopback, no paid API/fallback, login, shell or changed network limits. CSV remains UNTRUSTED web data requiring human review; VERIFIED evidence is not full commercial certification. At most 3 local model calls per invocation.",
    parameters: { type: "object", properties: {
      path: { type: "string", description: "Confined workspace-relative .csv path" },
      urls: { type: "array", minItems: 1, maxItems: 3, uniqueItems: true, items: { type: "string", enum: PRICING_SOURCE_SPECS.map((s) => s.url) } },
    }, required: ["path", "urls"], additionalProperties: false },
    execute: async (args, context) => {
      try {
        if (typeof args.path !== "string" || args.path.length > 2048 || /[:\0]/.test(args.path) || !args.path.endsWith(".csv")) throw new Error("workspace .csv path required");
        await assertLocalWorkspaceFilePath(args.path);
        const urls = args.urls;
        if (!Array.isArray(urls) || !urls.length || urls.length > 3 || new Set(urls).size !== urls.length || urls.some((url) => !PRICING_SOURCE_SPECS.some((s) => s.url === url))) throw new Error("only 1–3 unique pilot pricing URLs allowed");
        const fetch = webTools.find((t) => t.name === "local_web_fetch"), write = workspaceTools.find((t) => t.name === "local_write_file");
        if (!fetch || !write) throw new Error("confined dependencies unavailable");
        const results = [];
        for (const url of urls) results.push(await researchPricingSource(PRICING_SOURCE_SPECS.find((s) => s.url === url)!, (url) => fetch.execute({ url }, context)));
        const csv = researchRowsToCsv(results.flatMap(pricingRows));
        const saved = await write.execute({ path: args.path, content: csv }, context);
        if (!saved.startsWith("File written in local workspace:")) throw new Error(saved);
        return JSON.stringify({ trust: "UNTRUSTED_WEB_DATA", saved,
          results: results.map(({ validated, failure, page_succeeded }) => ({ validated, failure, page_succeeded })) });
      } catch (error) { return `Blocked: ${error instanceof Error ? error.message : String(error)}`; }
    },
  }];
}
