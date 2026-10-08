// Apply declared owner verdicts to this fixed benchmark; never manufacture a review.
import fs from "node:fs/promises";
import path from "node:path";
import { researchRowsToCsv } from "../dist/agent/structured-research.js";
import { pricingRows } from "../dist/agent/pricing-research.js";
const base = path.resolve("research/capability-build-v2/benchmark");
const read = async (name) => JSON.parse(await fs.readFile(path.join(base, name), "utf8"));
const review = await read("human-review.json");
const baseline = await read("human-reviewed-results.json");
const records = await read("results.json");
const metrics = await read("metrics.json");
const key = (row) => JSON.stringify([row.entity, row.plan_name, row.billing_option, row.field, row.value, row.quote, row.source_url]);
const observed = (records) => records.flatMap((record) => record.validated.flatMap((plan) => plan.fields
  .filter((field) => field.status === "VERIFIED_EVIDENCE").map((field) => ({
    entity: record.entity, plan_name: plan.plan_name, billing_option: plan.billing_option,
    field: field.field, value: field.normalized_value, quote: field.exact_evidence_quote, source_url: field.source_url,
  }))));
const original = observed(baseline);
const verdicts = new Map(review.rows.map((row) => [key(row), row.verdict]));
if (verdicts.size !== review.rows.length || original.length !== review.accepted_fields ||
  original.some((row) => !verdicts.has(key(row)))) throw new Error("Review differs from original accepted fields");
const counts = Object.fromEntries(["CORRECT", "INCORRECT", "UNCERTAIN", "NOT_REVIEWED"].map((v) => [v, review.rows.filter((r) => r.verdict === v).length]));
if (counts.CORRECT !== review.correct || counts.INCORRECT !== review.incorrect || counts.UNCERTAIN !== review.uncertain ||
  counts.NOT_REVIEWED !== review.not_reviewed || Object.values(counts).reduce((a, b) => a + b, 0) !== original.length ||
  review.reviewed_fields !== original.length - counts.NOT_REVIEWED || !Number.isFinite(review.elapsed_seconds) || review.elapsed_seconds <= 0 ||
  Math.abs((Date.parse(review.end_iso) - Date.parse(review.start_iso)) / 1000 - review.elapsed_seconds) > 1) throw new Error("Invalid declared review metrics");
const rejected = review.rows.filter((r) => r.verdict !== "CORRECT");
for (const record of records) for (const plan of record.validated) for (const field of plan.fields) {
  const row = { entity: record.entity, plan_name: plan.plan_name, billing_option: plan.billing_option,
    field: field.field, value: field.normalized_value, quote: field.exact_evidence_quote, source_url: field.source_url };
  if (field.status === "VERIFIED_EVIDENCE" && verdicts.get(key(row)) !== "CORRECT") {
    field.normalized_value = "UNKNOWN"; field.exact_evidence_quote = "";
    field.status = "UNKNOWN"; field.reason = "OWNER_REVIEW_REJECTED_OR_NOT_REVIEWED";
  }
}
const retained = observed(records);
metrics.fields_validated = retained.length;
metrics.unknown = metrics.expected_fields - retained.length;
metrics.price_amounts_verified = retained.filter((r) => r.field === "price_amount").length;
metrics.exact_quote_checks = metrics.exact_quote_checks.filter((check) => retained.some((r) =>
  r.entity === check.entity && r.plan_name === check.plan_name && r.billing_option === check.billing_option && r.field === check.field));
metrics.human_review_seconds = review.elapsed_seconds;
metrics.human_false_positives = review.incorrect;
metrics.human_correct_accepted_fields = review.correct;
metrics.human_review_status = "OWNER_DECLARED_REVIEW_OF_ORIGINAL_32_FIELDS";
metrics.human_original_denominator = original.length;
metrics.human_correct_fraction_original = review.correct / original.length;
metrics.human_original_price_amounts = original.filter((r) => r.field === "price_amount").length;
metrics.human_incorrect_price_amounts = rejected.filter((r) => r.field === "price_amount").length;
metrics.owner_rejected_original_rows = rejected;
metrics.post_gate_is_not_a_new_timed_review = true;
for (const [name, data] of [["results.json", records], ["metrics.json", metrics]]) await fs.writeFile(path.join(base, name), JSON.stringify(data, null, 2) + "\n", "utf8");
await fs.writeFile(path.join(base, "dataset.csv"), researchRowsToCsv(records.flatMap((r) => pricingRows({ page: { entity: r.entity, source_url: r.source_url }, validated: r.validated }))), "utf8");
console.log(JSON.stringify({ original_reviewed: original.length, correct: review.correct, incorrect: review.incorrect,
  elapsed_seconds: review.elapsed_seconds, retained: retained.length, unknown: metrics.unknown, retained_prices: metrics.price_amounts_verified }));
