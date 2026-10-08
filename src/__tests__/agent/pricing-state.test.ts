import { describe, expect, it } from "vitest";
import { extractPricingStates, verifyPricingState, reconcilePricingStates, applyPricingStateReview, pricingStateIdentity, pricingStatesToCsv, STATE_SOURCES, type StatePage } from "../../agent/pricing-state.js";
const page: StatePage = { source_url: STATE_SOURCES[0], accessed_at: "2026-10-08T19:00:00Z", text: "Basic\n€11.9\nper month, billed annually\n€13.9\nper month, billed monthly\nStandard\n€24.9\nper month, billed annually\n€29.9\nper month, billed monthly" };
const basic = () => extractPricingStates(page).filter((r) => r.plan_name === "Basic");
describe("pricing-state evidence and review gate", () => {
  it("separates annual commitment from displayed month and preserves both offers", () => {
    const rows = basic(); expect(rows.map((r) => r.amount)).toEqual([13.9, 11.9]);
    expect(rows.map((r) => r.billing_commitment)).toEqual(["monthly", "annual"]);
    expect(rows.every((r) => r.displayed_rate_period === "month" && r.currency === "EUR" && r.context_complete)).toBe(true);
    expect(rows.every((r) => r.evidence_status === "UNKNOWN")).toBe(true);
    expect(reconcilePricingStates(rows).conflicts[0]).toMatchObject({ kind: "BILLING_MODE_DIFFERENCE", explained: true });
  });
  it("supports French literal qualifiers without merging translated plan names", () => {
    const rows = extractPricingStates({ ...page, source_url: STATE_SOURCES[1], text: "Basique\n€11,9\npar mois, facturé annuellement\n€13,9\npar mois, facturé mensuellement" });
    expect(rows.filter((r) => r.plan_name === "Basic").map((r) => [r.amount, r.locale, r.context_complete])).toEqual([[13.9, "fr", true], [11.9, "fr", true]]);
  });
  it.each(["amount", "currency", "locale", "source_url", "accessed_at", "exact_evidence_quote", "context_evidence_quote", "displayed_rate_period", "pricing_unit"] as const)("rejects an invented %s even with model assertion", (key) => {
    const row = basic()[0]!; expect(verifyPricingState(page, { ...row, [key]: key === "amount" ? 99 : "invented" } as never).context_complete).toBe(false);
  });
  it("rejects bare dollar currency, absent billing, paid zero and duplicate cards", () => {
    for (const text of ["Basic\n$13.9\nper month, billed monthly", "Basic\n€13.9\nper month", "Basic\n€0\nper month, billed monthly", page.text + "\nBasic\n€99\nper month, billed monthly"]) {
      expect(extractPricingStates({ ...page, text }).filter((r) => r.plan_name === "Basic").every((r) => !r.context_complete)).toBe(true);
    }
  });
  it("keeps inaccessible fields UNKNOWN and rejects private/off-scope sources or oversized content", () => {
    expect(extractPricingStates({ ...page, text: "" })).toHaveLength(8);
    for (const source_url of ["http://localhost", "https://third-party.example", "https://simplybook.me/en/pricing?currency=USD"]) expect(() => extractPricingStates({ ...page, source_url })).toThrow();
    expect(() => extractPricingStates({ ...page, text: "a".repeat(60001) })).toThrow();
  });
  it("parses only the exact SimplyBook comparison table, not Calendly or prose prices", () => {
    const text = "Calendly\nBasic\n$10\nSimplyBook.me Pricing (as of April 2026)\nPlan\nMonthly\nAnnual (per month)\nSeats\nBookings\nCustom Features\nBasic\n€13.90\n€11.90\n5\n100/month\n3\nWhat This Means in Practice\nBasic\n€99";
    const rows = extractPricingStates({ ...page, source_url: STATE_SOURCES[2], text }).filter((r) => r.plan_name === "Basic");
    expect(rows.map((r) => r.amount)).toEqual([13.9, 11.9]); expect(rows.every((r) => r.context_complete)).toBe(true);
    expect(rows[0]!.source_reference_date).toContain("2026-04");
  });
  it("blocks same-context different amounts and cannot clear conflicts with human CORRECT alone", () => {
    const a = basic()[0]!, b = { ...a, amount: 14, source_url: STATE_SOURCES[1], locale: "fr" };
    const { states, conflicts } = reconcilePricingStates([a, b]);
    expect(conflicts[0]).toMatchObject({ kind: "UNEXPLAINED_CONFLICT", explained: false });
    expect(applyPricingStateReview(states, states.map((r) => ({ identity: pricingStateIdentity(r), verdict: "CORRECT" }))).every((r) => r.evidence_status === "CONFLICT_REQUIRES_REVIEW")).toBe(true);
  });
  it.each([ ["capture_mode", "MANUAL_RENDER", "RENDER_STATE_DIFFERENCE"], ["source_reference_date", "2026-04", "STALE_SOURCE_POSSIBLE"] ])("classifies %s as possible rather than explaining it", (key, value, kind) => {
    const a = basic()[0]!; expect(reconcilePricingStates([a, { ...a, amount: 99, [key!]: value }]).conflicts[0]).toMatchObject({ kind, explained: false });
  });
  it("preserves demonstrated currency differences without guessing exchange rates", () => {
    const a = basic()[0]!; const b = { ...a, amount: 15, currency: "USD" };
    expect(reconcilePricingStates([a,b]).conflicts[0]).toMatchObject({ kind: "CURRENCY_OR_LOCALE_DIFFERENCE", explained: true });
  });
  it("requires exact owner tuple confirmation; rejection and unknown stay blocked", () => {
    const rows = basic();
    expect(applyPricingStateReview(rows, [{ identity: pricingStateIdentity(rows[0]!), verdict: "CORRECT" }]).map((r) => r.evidence_status)).toEqual(["VERIFIED_PRICING_STATE", "UNKNOWN"]);
    expect(applyPricingStateReview(rows, [{ identity: pricingStateIdentity(rows[0]!), verdict: "INCORRECT" }])[0]!.reason).toBe("OWNER_REJECTED");
    expect(() => applyPricingStateReview(rows, [{ identity: "x", verdict: "CORRECT" }, { identity: "x", verdict: "CORRECT" }])).toThrow();
  });
  it("exports stable quoted CSV with UTF-8, multiline quotes and formula protection", () => {
    const csv = pricingStatesToCsv([{ ...basic()[0]!, exact_evidence_quote: 'é, "price"\nline', reason: '=DANGEROUS()' }]);
    expect(csv).toContain('"é, ""price""\nline"'); expect(csv).toContain('"\'=DANGEROUS()"'); expect(csv.endsWith("\r\n")).toBe(true);
  });
});
