/** Narrow SimplyBook pilot: literal proposals, independent verification, no web execution. */
export type Commitment = "monthly" | "annual" | "UNKNOWN";
export type PricingStatus = "VERIFIED_PRICING_STATE" | "CONFLICT_REQUIRES_REVIEW" | "UNKNOWN";
export type ConflictKind = "BILLING_MODE_DIFFERENCE" | "CURRENCY_OR_LOCALE_DIFFERENCE" | "STALE_SOURCE_POSSIBLE" | "RENDER_STATE_DIFFERENCE" | "UNEXPLAINED_CONFLICT";
export const STATE_SOURCES = ["https://simplybook.me/en/pricing", "https://simplybook.me/fr/tarifs", "https://simplybook.me/en/simplybook-vs-calendly"] as const;
export const STATE_PLANS = ["Free", "Basic", "Standard", "Premium"] as const;
export interface StatePage { source_url: string; accessed_at: string; text: string }
export interface PricingState {
  entity: string; plan_name: string; amount: number | "UNKNOWN"; currency: string;
  billing_commitment: Commitment; displayed_rate_period: "month" | "year" | "UNKNOWN";
  pricing_unit: string; locale: string; source_url: string; accessed_at: string;
  exact_evidence_quote: string; context_evidence_quote: string; evidence_status: PricingStatus;
  context_complete: boolean; reason: string; capture_mode: string; source_reference_date: string;
}
export interface PricingConflict { left: number; right: number; kind: ConflictKind; explained: boolean; reason: string }
const aliases: Record<string, string> = { Free: "Free", Gratuit: "Free", Basic: "Basic", Basique: "Basic", Standard: "Standard", Premium: "Premium", Enterprise: "Enterprise", Entreprise: "Enterprise" };
const money = /([$€£]|\bUSD|\bEUR|\bGBP)\s*(\d+(?:[.,]\d{1,2})?)(?![\d.,])/g;
const currency = (symbol: string) => symbol === "€" ? "EUR" : ["USD", "EUR", "GBP"].includes(symbol) ? symbol : "UNKNOWN";
function commitment(text: string): Commitment {
  const annual = /\bbilled\s+(?:annually|yearly)\b|facturé\s+annuellement/i.test(text);
  const monthly = /\bbilled\s+monthly\b|facturé\s+mensuellement/i.test(text);
  return annual === monthly ? "UNKNOWN" : annual ? "annual" : "monthly";
}
function period(text: string): PricingState["displayed_rate_period"] {
  const month = /\bper month\b|\bpar mois\b|\/\s*mo\b/i.test(text);
  const year = /\bper year\b|\bpar an\b|\/\s*yr\b/i.test(text);
  return month === year ? "UNKNOWN" : month ? "month" : "year";
}
function base(page: StatePage, plan: string, option: Commitment): PricingState {
  return { entity: "SimplyBook.me", plan_name: plan, amount: "UNKNOWN", currency: "UNKNOWN", billing_commitment: option,
    displayed_rate_period: "UNKNOWN", pricing_unit: "UNKNOWN", locale: new URL(page.source_url).pathname.split("/")[1] || "UNKNOWN",
    source_url: page.source_url, accessed_at: page.accessed_at, exact_evidence_quote: "", context_evidence_quote: "",
    evidence_status: "UNKNOWN", context_complete: false, reason: "NOT_FOUND", capture_mode: "PUBLIC_GET_STATIC_TEXT",
    source_reference_date: page.text.includes("as of April 2026") ? "2026-04 (precision month)" : "UNKNOWN" };
}

/** Enumerate from fixed, plan-bound layouts. Does NOT certify current browser state. */
export function extractPricingStates(page: StatePage): PricingState[] {
  if (!(STATE_SOURCES as readonly string[]).includes(page.source_url) || page.text.length > 60000 || !Number.isFinite(Date.parse(page.accessed_at))) throw new Error("pricing-state source/date/bounds invalid");
  const isTable = page.source_url === STATE_SOURCES[2];
  let text = page.text;
  if (isTable) {
    const start = text.indexOf("SimplyBook.me Pricing (as of April 2026)");
    const end = text.indexOf("What This Means in Practice", start);
    text = start >= 0 && end > start ? text.slice(start, end) : "";
  }
  const headings: Array<{ name: string; offset: number }> = [];
  let offset = 0;
  for (const line of text.split("\n")) { if (aliases[line.trim()]) headings.push({ name: aliases[line.trim()]!, offset }); offset += line.length + 1; }
  const rows: PricingState[] = [];
  const header = isTable ? /^SimplyBook\.me Pricing \(as of April 2026\)[\s\S]*?Custom Features[^\n]*\n/.exec(text)?.[0] || "" : "";
  const tableSchema = /\bMonthly\s+Annual \(per month\)\s+Seats\s+Bookings\s+Custom Features\b/.test(header);
  for (const plan of STATE_PLANS) {
    // Ambiguous repeated cards are never silently selected.
    const matching = headings.filter((h, i) => h.name === plan && /[$€£]\s*\d|\b(?:USD|EUR|GBP)\s*\d/.test(text.slice(h.offset, Math.min(headings[i + 1]?.offset ?? text.length, h.offset + 1800))));
    const heading = matching.length === 1 ? matching[0] : undefined;
    const index = heading ? headings.indexOf(heading) : -1;
    const context = heading ? text.slice(heading.offset, Math.min(headings[index + 1]?.offset ?? text.length, heading.offset + 1800)) : "";
    const amounts = [...context.matchAll(money)];
    for (const option of ["monthly", "annual"] as const) {
      const row = base(page, plan, option);
      if (!heading) { row.reason = matching.length > 1 ? "AMBIGUOUS_PLAN_CARDS" : "NOT_FOUND"; rows.push(row); continue; }
      const candidates = amounts.map((m, i) => {
        // Pricing cards: quote includes amount and immediately following qualifier.
        const tail = context.slice(m.index!, Math.min(amounts[i + 1]?.index ?? context.length, m.index! + 160));
        const qualifier = /(?:per month|per year|par mois|par an)[^\n]*(?:annually|yearly|monthly|annuellement|mensuellement)/i.exec(tail);
        const quote = isTable ? context.trimEnd() : qualifier ? tail.slice(0, qualifier.index + qualifier[0].length) : m[0];
        return { amount: Number(m[2]!.replace(",", ".")), currency: currency(m[1]!), quote,
          option: isTable && tableSchema && amounts.length === 2 ? (i === 0 ? "monthly" : "annual") : commitment(quote),
          rate: isTable && tableSchema ? "month" as const : period(quote) };
      }).filter((c) => c.option === option);
      if (candidates.length !== 1) { row.reason = candidates.length > 1 ? "AMBIGUOUS_SAME_OPTION" : "BILLING_CONTEXT_NOT_FOUND"; rows.push(row); continue; }
      const candidate = candidates[0]!;
      row.amount = candidate.amount; row.currency = candidate.currency; row.displayed_rate_period = candidate.rate;
      row.pricing_unit = candidate.rate; row.exact_evidence_quote = candidate.quote;
      row.context_evidence_quote = isTable ? header : context.slice(0, context.indexOf(candidate.quote) + candidate.quote.length);
      const proved = candidate.quote.length <= 400 && row.context_evidence_quote.length <= 800 &&
        Number.isFinite(candidate.amount) && candidate.amount >= 0 &&
        page.text.includes(candidate.quote) && page.text.includes(row.context_evidence_quote) &&
        candidate.currency !== "UNKNOWN" && candidate.rate !== "UNKNOWN" && !(plan !== "Free" && candidate.amount === 0);
      row.context_complete = proved;
      row.reason = proved ? "CONTEXT_BOUND_OWNER_REVIEW_REQUIRED" : "CONTEXT_INCOMPLETE";
      rows.push(row);
    }
  }
  return rows;
}

/** A model draft can only select an exact independently enumerated offer. */
export function verifyPricingState(page: StatePage, proposed: PricingState): PricingState {
  const expected = extractPricingStates(page).find((r) => r.plan_name === proposed.plan_name && r.billing_commitment === proposed.billing_commitment);
  if (!expected) throw new Error("unknown pricing-state slot");
  const keys = ["entity", "amount", "currency", "displayed_rate_period", "pricing_unit", "locale", "source_url", "accessed_at", "exact_evidence_quote", "context_evidence_quote"] as const;
  return keys.every((key) => proposed[key] === expected[key]) ? expected : { ...expected, amount: "UNKNOWN", context_complete: false, reason: "PROPOSAL_NOT_DEMONSTRATED" };
}

export function reconcilePricingStates(input: PricingState[]) {
  if (input.length > 32) throw new Error("too many pricing states");
  const states = input.map((r) => ({ ...r, evidence_status: "UNKNOWN" as PricingStatus }));
  const conflicts: PricingConflict[] = [];
  for (let i = 0; i < states.length; i++) for (let j = i + 1; j < states.length; j++) {
    const a = states[i]!, b = states[j]!;
    if (a.entity !== b.entity || a.plan_name !== b.plan_name || a.amount === "UNKNOWN" || b.amount === "UNKNOWN") continue;
    if (a.amount === b.amount && a.currency === b.currency && a.displayed_rate_period === b.displayed_rate_period && a.pricing_unit === b.pricing_unit) continue;
    let kind: ConflictKind = "UNEXPLAINED_CONFLICT", explained = false;
    if (a.context_complete && b.context_complete && a.billing_commitment !== "UNKNOWN" && b.billing_commitment !== "UNKNOWN" && a.billing_commitment !== b.billing_commitment && a.currency === b.currency && a.pricing_unit === b.pricing_unit) { kind = "BILLING_MODE_DIFFERENCE"; explained = true; }
    else if (a.context_complete && b.context_complete && a.currency !== "UNKNOWN" && b.currency !== "UNKNOWN" && a.currency !== b.currency) { kind = "CURRENCY_OR_LOCALE_DIFFERENCE"; explained = true; }
    else if (a.capture_mode !== b.capture_mode) kind = "RENDER_STATE_DIFFERENCE";
    else if (a.source_reference_date !== b.source_reference_date && (a.source_reference_date !== "UNKNOWN" || b.source_reference_date !== "UNKNOWN")) kind = "STALE_SOURCE_POSSIBLE";
    // Locale language alone never explains a different same-currency amount.
    conflicts.push({ left: i, right: j, kind, explained, reason: explained ? "DISTINCT_DEMONSTRATED_OFFERS_NO_MERGE" : "NO_DEMONSTRATED_EXPLANATION" });
    if (!explained) for (const r of [a, b]) { r.evidence_status = "CONFLICT_REQUIRES_REVIEW"; r.reason = kind; }
  }
  return { states, conflicts };
}

export function pricingStateIdentity(row: PricingState): string {
  return JSON.stringify([row.entity, row.plan_name, row.amount, row.currency, row.billing_commitment, row.displayed_rate_period,
    row.pricing_unit, row.locale, row.source_url, row.accessed_at, row.exact_evidence_quote, row.context_evidence_quote, row.capture_mode]);
}
/** Human correctness cannot clear an unresolved cross-source conflict. */
export function applyPricingStateReview(states: PricingState[], review: Array<{ identity: string; verdict: string }>) {
  const verdicts = new Map(review.map((r) => [r.identity, r.verdict]));
  if (verdicts.size !== review.length) throw new Error("duplicate review identities");
  return states.map((row): PricingState => row.evidence_status === "CONFLICT_REQUIRES_REVIEW" ? row :
    { ...row, evidence_status: row.context_complete && verdicts.get(pricingStateIdentity(row)) === "CORRECT" ? "VERIFIED_PRICING_STATE" : "UNKNOWN",
      reason: verdicts.get(pricingStateIdentity(row)) === "INCORRECT" ? "OWNER_REJECTED" : row.reason });
}
export const PRICING_STATE_COLUMNS = ["entity", "plan_name", "amount", "currency", "billing_commitment", "displayed_rate_period", "pricing_unit", "locale", "source_url", "accessed_at", "exact_evidence_quote", "context_evidence_quote", "evidence_status", "reason", "capture_mode", "source_reference_date"] as const;
export function pricingStatesToCsv(rows: PricingState[]): string {
  const cell = (v: unknown) => { let text = String(v); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
  return [PRICING_STATE_COLUMNS.map(cell).join(","), ...rows.map((r) => PRICING_STATE_COLUMNS.map((key) => cell(r[key])).join(","))].join("\r\n") + "\r\n";
}
