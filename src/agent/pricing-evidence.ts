/** Independent, fail-closed verifier. Model confidence never overrides evidence. */
export const PRICING_FIELDS = ["plan_name", "price_amount", "currency", "billing_period", "pricing_unit", "free_plan"] as const;
export type PricingField = typeof PRICING_FIELDS[number];
export interface PricingPage { entity: string; source_url: string; accessed_at: string; text: string; plan_names: string[] }
export interface FieldProposal { field: PricingField; normalized_value: string | number | boolean; exact_evidence_quote: string; source_url: string; confidence: number }
export interface PlanProposal { plan_name: string; billing_option: "monthly" | "annual" | "UNKNOWN"; fields: FieldProposal[] }
export interface VerifiedPricingField {
  field: PricingField; normalized_value: string | number | boolean; exact_evidence_quote: string;
  source_url: string; status: "VERIFIED_EVIDENCE" | "UNKNOWN"; reason: string; model_confidence: number | null;
}

export function planContexts(page: PricingPage): Map<string, string> {
  if (page.text.length > 60_000 || page.plan_names.length > 10) throw new Error("pricing source exceeds bounds");
  const lines = page.text.split("\n");
  const result = new Map<string, string>();
  let offset = 0;
  const headings: Array<{ name: string; offset: number }> = [];
  for (const line of lines) {
    const name = line.trim();
    if (page.plan_names.includes(name)) headings.push({ name, offset });
    offset += line.length + 1;
  }
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]!;
    const end = headings[i + 1]?.offset ?? page.text.length;
    const context = page.text.slice(heading.offset, Math.min(end, heading.offset + 1800));
    // Ignore navigation/table labels lacking a pricing card. First card wins;
    // competing duplicate cards are rejected rather than silently merged.
    if (!/[$€£]\s*\d|^[ \t]*Custom[ \t]*$/m.test(context)) continue;
    if (result.has(heading.name) && result.get(heading.name) !== context) {
      result.set(heading.name, "");
    } else if (!result.has(heading.name)) result.set(heading.name, context);
  }
  return result;
}

interface Rate { amount: string; currency: string; option: string; unit: string; text: string }
function unitFromText(text: string): string {
  const units = [...text.matchAll(/\/\s*(user|seat|member|person|mo(?:nth)?|year|yr)\b|\bper\s+(user|seat|member|person|month|year)\b/gi)]
    .map((m) => (m[1] || m[2]!).toLowerCase()).map((u) => u === "mo" ? "month" : u === "yr" ? "year" : u);
  return [...new Set(units)].join("/") || "UNKNOWN";
}
function rates(context: string): Rate[] {
  const found = [...context.matchAll(/([$€£]|\bUSD|\bEUR|\bGBP)\s*(\d+(?:[.,]\d{1,2})?)(?![\d.,])/g)];
  return found.map((match, i) => {
    const text = context.slice(match.index!, Math.min(found[i + 1]?.index ?? context.length, match.index! + 160));
    const option = /\bbilled\s+(?:annually|yearly)\b/i.test(text) ? "annual"
      : /\bbilled\s+monthly\b/i.test(text) ? "monthly" : "UNKNOWN";
    const unit = unitFromText(text);
    return { amount: String(Number(match[2]!.replace(",", "."))),
      currency: match[1] === "€" ? "EUR" : ["USD", "EUR", "GBP"].includes(match[1]!) ? match[1]! : "UNKNOWN",
      option, unit, text };
  });
}

export function verifyPricingProposal(page: PricingPage, proposal: PlanProposal) {
  const context = planContexts(page).get(proposal?.plan_name) || "";
  const option = ["monthly", "annual", "UNKNOWN"].includes(proposal?.billing_option) ? proposal.billing_option : "INVALID";
  const offers = rates(context);
  const applicable = offers.filter((r) => r.option === option);
  const unique = (values: string[]) => [...new Set(values)];
  const expectedAmount = unique(applicable.map((r) => r.amount));
  const ambiguousRate = !applicable.length || expectedAmount.length !== 1;
  const zeroPlaceholder = proposal?.plan_name !== "Free" && expectedAmount[0] === "0";
  const fields = Array.isArray(proposal?.fields) ? proposal.fields : [];
  const verified = PRICING_FIELDS.map((field): VerifiedPricingField => {
    const candidates = fields.filter((f) => f?.field === field);
    const candidate = candidates[0];
    const base: VerifiedPricingField = { field, normalized_value: "UNKNOWN", exact_evidence_quote: "", source_url: page.source_url,
      status: "UNKNOWN", reason: "NOT_PROPOSED", model_confidence: null };
    const reject = (reason: string) => ({ ...base, reason });
    if (candidates.length > 1) return reject("DUPLICATE_FIELD");
    if (!candidate || candidate.normalized_value === "UNKNOWN") return base;
    if (!context || option === "INVALID") return reject("PLAN_CONTEXT_UNBOUND");
    if (candidate.source_url !== page.source_url) return reject("WRONG_SOURCE");
    if (typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) return reject("INVALID_CONFIDENCE");
    const quote = candidate.exact_evidence_quote;
    if (typeof quote !== "string" || !quote.trim() || quote.length > 400) return reject("INVALID_QUOTE_LENGTH");
    if (!page.text.includes(quote)) return reject("QUOTE_NOT_IN_SOURCE");
    if (!context.includes(quote)) return reject("QUOTE_NOT_IN_PLAN_CONTEXT");
    if (/\b(?:ignore\s+(?:all|previous)|system\s+prompt|follow\s+(?:these|my)\s+instructions)\b/i.test(quote)) return reject("INSTRUCTION_LIKE_EVIDENCE");
    const value = candidate.normalized_value;
    let compatible = false;
    if (field === "plan_name") compatible = value === proposal.plan_name && quote.split("\n").some((line) => line.trim() === value);
    else {
      // Price/currency/unit/free status must be evidenced within the selected rate,
      // not borrowed from another price on the same card.
      const evidenced = applicable.filter((r) => r.text.includes(quote) || quote.includes(r.text.trim()));
      const quoteRates = rates(quote);
      const directlyBound = applicable.filter((r) => quoteRates.some((q) => q.amount === r.amount && q.option === r.option));
      const bound = [...evidenced, ...directlyBound];
      // A paid amount with a known billing option needs that qualifier in the
      // quote itself. This checks context, not freshness or browser-rendered price.
      if (field === "price_amount" && Number(value) > 0 && option !== "UNKNOWN" &&
        !quoteRates.some((q) => q.option === option)) return reject("AMOUNT_QUOTE_LACKS_BILLING_CONTEXT");
      if (field === "price_amount") compatible = !ambiguousRate && !zeroPlaceholder &&
        typeof value === "number" && Number.isFinite(value) && value >= 0 && String(value) === expectedAmount[0] &&
        bound.some((r) => rates(quote).some((q) => q.amount === r.amount));
      if (field === "currency") compatible = typeof value === "string" && value !== "UNKNOWN" &&
        bound.some((r) => r.currency === value && (value === "EUR" ? /€|\bEUR\b/.test(quote) : new RegExp(`\\b${value}\\b`).test(quote)));
      if (field === "billing_period") compatible = value === option && option !== "UNKNOWN" && bound.length > 0 &&
        (option === "annual" ? /\bbilled\s+(?:annually|yearly)\b/i : /\bbilled\s+monthly\b/i).test(quote);
      if (field === "pricing_unit") compatible = typeof value === "string" && value !== "UNKNOWN" && bound.some((r) => r.unit === value && unitFromText(quote) === value);
      if (field === "free_plan") compatible = !ambiguousRate && !zeroPlaceholder && bound.length > 0 &&
        (value === true ? proposal.plan_name === "Free" && expectedAmount[0] === "0" && rates(quote).some((q) => q.amount === "0")
          : value === false && Number(expectedAmount[0]) > 0 && rates(quote).some((q) => Number(q.amount) > 0));
    }
    if (!compatible) return reject(zeroPlaceholder && field === "price_amount" ? "ZERO_PLACEHOLDER_RISK" : "VALUE_NOT_DEMONSTRATED");
    return { ...base, normalized_value: value, exact_evidence_quote: quote, status: "VERIFIED_EVIDENCE", reason: "EXACT_QUOTE_AND_RULES", model_confidence: candidate.confidence };
  });
  return { entity: page.entity, source_url: page.source_url, accessed_at: page.accessed_at,
    plan_name: proposal?.plan_name, billing_option: option, fields: verified };
}

/** Expected slots are operator-owned, not chosen or inflated by the model. */
export function verifyPricingDraft(page: PricingPage, draft: unknown, slots: Array<{ plan_name: string; billing_option: "monthly" | "annual" | "UNKNOWN" }>) {
  const proposed = draft && typeof draft === "object" && Array.isArray((draft as { plans?: unknown }).plans)
    ? (draft as { plans: PlanProposal[] }).plans.slice(0, 20) : [];
  if (slots.length > 20) throw new Error("too many expected slots");
  return slots.map((slot) => {
    const matches = proposed.filter((p) => p?.plan_name === slot.plan_name && p?.billing_option === slot.billing_option);
    return verifyPricingProposal(page, { ...slot, fields: matches.length === 1 ? matches[0]!.fields : [] });
  });
}
