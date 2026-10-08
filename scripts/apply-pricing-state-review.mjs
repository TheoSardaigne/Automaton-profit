// Fixed benchmark intake only: declared owner data, no invented timing or verdict.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pricingStateIdentity, applyPricingStateReview, pricingStatesToCsv } from "../dist/agent/pricing-state.js";
const base = path.resolve("research/capability-build-v3/benchmark");
const read = async (name) => JSON.parse(await fs.readFile(path.join(base,name),"utf8"));
const review = await read("human-review.json");
const original = await read("results.json");
const metrics = await read("metrics.json");
const ids = new Set(original.states.map(pricingStateIdentity));
if (review.benchmark !== "capability-build-v3" || review.reviewer !== "OWNER_DECLARED_HUMAN" ||
  review.rows.length !== ids.size || new Set(review.rows.map((r) => r.identity)).size !== ids.size ||
  review.rows.some((r) => !ids.has(r.identity) || pricingStateIdentity(r) !== r.identity)) throw new Error("review identity differs from original capture");
const count = (v) => review.rows.filter((r) => r.verdict === v).length;
const correct=count("CORRECT"), incorrect=count("INCORRECT"), uncertain=count("UNCERTAIN"), notReviewed=count("NOT_REVIEWED");
if (correct+incorrect+uncertain+notReviewed !== ids.size || review.correct !== correct || review.incorrect !== incorrect ||
  review.uncertain !== uncertain || review.not_reviewed !== notReviewed || review.offers !== ids.size ||
  !["YES", "NO", "UNKNOWN"].includes(review.simpler_than_v2) || !Number.isFinite(Date.parse(review.start_iso)) || !Number.isFinite(Date.parse(review.end_iso)) || !Number.isFinite(review.elapsed_seconds) || review.elapsed_seconds <= 0 ||
  Math.abs((Date.parse(review.end_iso)-Date.parse(review.start_iso))/1000-review.elapsed_seconds)>1) throw new Error("invalid declared timed review");
let amendment = null;
try { amendment = await read("owner-verdict-amendment.json"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
let effectiveRows = review.rows;
if (amendment) {
  const digest = crypto.createHash("sha256").update(await fs.readFile(path.join(base,"human-review.json"))).digest("hex");
  if (amendment.benchmark !== review.benchmark || amendment.reviewer !== "OWNER_DECLARED_HUMAN" || amendment.original_review_sha256 !== digest ||
    !Number.isFinite(Date.parse(amendment.recorded_at)) || amendment.rows.length !== ids.size ||
    new Set(amendment.rows.map((r) => r.identity)).size !== ids.size ||
    amendment.rows.some((r) => !ids.has(r.identity) || !["CORRECT","INCORRECT","UNCERTAIN","NOT_REVIEWED"].includes(r.verdict))) throw new Error("invalid owner verdict amendment");
  const amended = new Map(amendment.rows.map((r) => [r.identity,r.verdict]));
  effectiveRows = review.rows.map((r) => ({...r,verdict:amended.get(r.identity)}));
}
const effectiveCount = (v) => effectiveRows.filter((r) => r.verdict===v).length;
const effectiveCorrect=effectiveCount("CORRECT"), effectiveIncorrect=effectiveCount("INCORRECT");
const effectiveUncertain=effectiveCount("UNCERTAIN"), effectiveNotReviewed=effectiveCount("NOT_REVIEWED");
const states = applyPricingStateReview(original.states, effectiveRows);
const success = effectiveIncorrect===0 && effectiveUncertain===0 && effectiveNotReviewed===0 && states.every((r)=>r.evidence_status === "VERIFIED_PRICING_STATE") && review.simpler_than_v2 === "YES";
const finalMetrics = { ...metrics, human_review_seconds: amendment ? "UNKNOWN_FOR_AMENDED_CONFIRMATION" : review.elapsed_seconds,
  original_timed_review_seconds: review.elapsed_seconds, original_human_correct: correct, original_human_incorrect: incorrect,
  owner_verdict_amendment_applied: Boolean(amendment), human_correct: effectiveCorrect, human_incorrect: effectiveIncorrect,
  human_correct_fraction_original_offers: effectiveCorrect/ids.size,
  human_uncertain: effectiveUncertain, human_not_reviewed: effectiveNotReviewed, simpler_than_v2_owner_declared: review.simpler_than_v2,
  falsely_verified: states.filter((r) => r.evidence_status === "VERIFIED_PRICING_STATE" && effectiveRows.find((h) => h.identity === pricingStateIdentity(r))?.verdict !== "CORRECT").length,
  verified_pricing_state: states.filter((r) => r.evidence_status === "VERIFIED_PRICING_STATE").length,
  unknown: states.filter((r)=>r.evidence_status === "UNKNOWN").length,
  pricing_confirmed_by_owner: effectiveIncorrect===0 && effectiveUncertain===0 && effectiveNotReviewed===0 && states.every((r)=>r.evidence_status === "VERIFIED_PRICING_STATE"),
  success_criteria_met: success, decision: success ? "V3_BENCHMARK_VALIDATED_NOT_GENERAL_COMMERCIAL_READINESS" : amendment && effectiveCorrect===ids.size ? "PRICING_OWNER_CONFIRMED_SIMPLICITY_UNCONFIRMED" : "V3_NOT_VALIDATED" };
await fs.writeFile(path.join(base,"reviewed-results.json"),JSON.stringify({...original,states},null,2)+"\n");
await fs.writeFile(path.join(base,"reviewed-metrics.json"),JSON.stringify(finalMetrics,null,2)+"\n");
await fs.writeFile(path.join(base,"dataset.csv"),pricingStatesToCsv(states));
console.log(JSON.stringify(finalMetrics,null,2));
