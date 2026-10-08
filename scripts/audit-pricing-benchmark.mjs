// Independent operator reference check. NOT a human review or a proof of current availability.
import fs from "node:fs/promises";
import path from "node:path";
const base = path.resolve("research/capability-build-v2/benchmark");
const records = JSON.parse(await fs.readFile(path.join(base, "results.json"), "utf8"));
// Reference observations from pricing-card inspection; never used by the proposer/verifier.
const reference = {
  SavvyCal: { Basic: [10, "UNKNOWN", "UNKNOWN", "user/month", false], Premium: [17, "UNKNOWN", "UNKNOWN", "user/month", false] },
  YouCanBookMe: { Free: [0, "UNKNOWN", "UNKNOWN", "month", true], Individual: ["UNKNOWN", "UNKNOWN", "UNKNOWN", "month", "UNKNOWN"], Professional: ["UNKNOWN", "UNKNOWN", "UNKNOWN", "month", "UNKNOWN"], Team: ["UNKNOWN", "UNKNOWN", "UNKNOWN", "member/month", "UNKNOWN"] },
  // Owner observed other paid amounts. No corrected value supplied: UNKNOWN.
  "SimplyBook.me": { Free: [0, "EUR", "monthly", "month", true], Basic: ["UNKNOWN", "EUR", "monthly", "month", false], Standard: ["UNKNOWN", "EUR", "monthly", "month", false], Premium: ["UNKNOWN", "EUR", "monthly", "month", false], Enterprise: ["UNKNOWN", "UNKNOWN", "monthly", "month", "UNKNOWN"] },
};
const checks = [];
let completePrices = 0;
for (const record of records) for (const plan of record.validated) {
  const ref = reference[record.entity][plan.plan_name];
  const expected = { plan_name: plan.plan_name, price_amount: ref[0], currency: ref[1], billing_period: ref[2], pricing_unit: ref[3], free_plan: ref[4] };
  const accepted = plan.fields.filter((f) => f.status === "VERIFIED_EVIDENCE");
  for (const field of accepted) checks.push({ entity: record.entity, plan_name: plan.plan_name, billing_option: plan.billing_option,
    field: field.field, actual: field.normalized_value, reference: expected[field.field], matches_reference: field.normalized_value === expected[field.field] });
  if (["plan_name", "price_amount", "currency", "billing_period", "pricing_unit"].every((name) => accepted.some((f) => f.field === name))) completePrices++;
}
const report = { role: "OPERATOR_REFERENCE_AUDIT_NOT_OWNER_HUMAN_REVIEW", accepted_checked: checks.length,
  prior_reference_contradicted_by_owner: "Three SimplyBook paid amounts; pre-review-operator-audit.json preserved, not human accuracy",
  correct_against_reference: checks.filter((c) => c.matches_reference).length,
  incorrect_against_reference: checks.filter((c) => !c.matches_reference).length,
  verified_price_amounts: checks.filter((c) => c.field === "price_amount" && c.matches_reference).length,
  correctly_associated_price_contexts: checks.filter((c) => c.field === "price_amount" && c.matches_reference).length,
  accepted_plan_name_fields: checks.filter((c) => c.field === "plan_name" && c.matches_reference).length,
  complete_price_tuples: completePrices, human_false_positives: "UNKNOWN", human_review_seconds: "UNKNOWN", checks };
await fs.writeFile(path.join(base, "operator-audit.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ...report, checks: `${checks.length} checks saved` }, null, 2));
if (report.incorrect_against_reference) process.exitCode = 1;
