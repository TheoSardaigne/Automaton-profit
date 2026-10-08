// Fixed three-source public pilot, no inference, wallet, browser or paid execution.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createLocalWebTools } from "../dist/agent/local-web-tools.js";
import { collectPricingStates } from "../dist/agent/pricing-state-research.js";
import { STATE_SOURCES, extractPricingStates, reconcilePricingStates, pricingStatesToCsv } from "../dist/agent/pricing-state.js";
const base = path.resolve("research/capability-build-v3/benchmark");
await fs.mkdir(base, { recursive: true });
process.env.HOME = path.resolve("tmp/v3-benchmark-home");
const start = performance.now();
const replay = process.argv[2] === "--replay";
if (process.argv.length > 2 && !replay) throw new Error("unsupported mode");
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
let pages, states, conflicts, fetches = 0;
if (replay) {
  pages = JSON.parse(await fs.readFile(path.join(base, "sources.json"), "utf8"));
  for (const p of pages) if (hash(p.text) !== p.excerpt_sha256) throw new Error("source replay hash mismatch");
  ({ states, conflicts } = reconcilePricingStates(pages.flatMap(extractPricingStates)));
} else {
  const fetch = createLocalWebTools({ maxRequests: 8 }).find((t) => t.name === "local_web_fetch");
  const result = await collectPricingStates([...STATE_SOURCES], async (url) => { fetches++; return fetch.execute({ url }, {}); });
  ({ states, conflicts } = result);
  pages = result.pages.map((p) => {
    const full_sha256 = hash(p.text);
    const comparison = p.source_url === STATE_SOURCES[2];
    const heading = comparison ? "SimplyBook.me Pricing (as of April 2026)" : p.source_url === STATE_SOURCES[1] ? "\n Gratuit\n" : "\n Free\n";
    const endHeading = comparison ? "What This Means in Practice" : p.source_url === STATE_SOURCES[1] ? "\n Entreprise\n" : "\n Enterprise\n";
    const i = p.text.indexOf(heading), end = p.text.indexOf(endHeading, i + heading.length);
    const excerpt = i >= 0 && end > i ? p.text.slice(i, end + endHeading.length) : "";
    return { ...p, text: excerpt, full_sha256, full_characters: p.text.length, excerpt_sha256: hash(excerpt), capture_mode: "PUBLIC_GET_STATIC_TEXT", excerpt_is_not_full_page: true };
  });
  // Prove bounded archived excerpts reproduce every contextual tuple from full captures.
  const replayStates = reconcilePricingStates(pages.flatMap(extractPricingStates));
  if (JSON.stringify(replayStates) !== JSON.stringify({ states, conflicts })) throw new Error("bounded source replay differs from live extraction");
  await fs.writeFile(path.join(base, "sources.json"), JSON.stringify(pages, null, 2) + "\n");
}
const metrics = { benchmark: "capability-build-v3", date: new Date().toISOString(), mode: replay ? "OFFLINE_EXACT_EXCERPT_REPLAY" : "LIVE_PUBLIC_GET",
  pages_expected: 3, pages_accessible: pages.filter((p) => p.accessible).length, fetches_this_invocation: fetches,
  expected_offers: 24, offers_with_amount: states.filter((r) => r.amount !== "UNKNOWN").length,
  machine_context_complete: states.filter((r) => r.context_complete).length,
  distinct_plan_billing_currency_tuples: new Set(states.filter((r) => r.context_complete).map((r) => JSON.stringify([r.plan_name,r.amount,r.currency,r.billing_commitment,r.displayed_rate_period,r.pricing_unit]))).size,
  differences_detected: conflicts.length, explained_differences: conflicts.filter((c) => c.explained).length,
  unresolved_conflicts: conflicts.filter((c) => !c.explained).length,
  verified_pricing_state: states.filter((r) => r.evidence_status === "VERIFIED_PRICING_STATE").length,
  unknown: states.filter((r) => r.evidence_status === "UNKNOWN").length,
  conflict_requires_review: states.filter((r) => r.evidence_status === "CONFLICT_REQUIRES_REVIEW").length,
  falsely_verified: "UNKNOWN_PENDING_OWNER_REVIEW", human_review_seconds: "UNKNOWN", human_correct: "UNKNOWN", human_incorrect: "UNKNOWN",
  machine_seconds: (performance.now()-start)/1000, local_model_calls: 0, external_spend: 0,
  locales_are_url_languages_not_country_or_tax_region: true, browser_state_not_observed: true };
await fs.writeFile(path.join(base, replay ? "replay-results.json" : "results.json"), JSON.stringify({ states, conflicts }, null, 2) + "\n");
await fs.writeFile(path.join(base, replay ? "replay-metrics.json" : "metrics.json"), JSON.stringify(metrics, null, 2) + "\n");
if (!replay) await fs.writeFile(path.join(base, "dataset.csv"), pricingStatesToCsv(states));
console.log(JSON.stringify(metrics, null, 2));
