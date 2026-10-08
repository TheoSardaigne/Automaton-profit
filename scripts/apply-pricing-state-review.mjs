// Fixed benchmark intake only: declared owner data, no invented timing or verdict.
import fs from "node:fs/promises";
import path from "node:path";
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
const states = applyPricingStateReview(original.states, review.rows);
const success = incorrect===0 && uncertain===0 && notReviewed===0 && states.every((r)=>r.evidence_status === "VERIFIED_PRICING_STATE") && review.simpler_than_v2 === "YES";
const finalMetrics = { ...metrics, human_review_seconds: review.elapsed_seconds, human_correct: correct, human_incorrect: incorrect,
  human_uncertain: uncertain, human_not_reviewed: notReviewed, simpler_than_v2_owner_declared: review.simpler_than_v2,
  falsely_verified: states.filter((r) => r.evidence_status === "VERIFIED_PRICING_STATE" && review.rows.find((h) => h.identity === pricingStateIdentity(r))?.verdict !== "CORRECT").length,
  verified_pricing_state: states.filter((r) => r.evidence_status === "VERIFIED_PRICING_STATE").length,
  unknown: states.filter((r)=>r.evidence_status === "UNKNOWN").length,
  success_criteria_met: success, decision: success ? "V3_BENCHMARK_VALIDATED_NOT_GENERAL_COMMERCIAL_READINESS" : "V3_NOT_VALIDATED" };
await fs.writeFile(path.join(base,"reviewed-results.json"),JSON.stringify({...original,states},null,2)+"\n");
await fs.writeFile(path.join(base,"reviewed-metrics.json"),JSON.stringify(finalMetrics,null,2)+"\n");
await fs.writeFile(path.join(base,"dataset.csv"),pricingStatesToCsv(states));
console.log(JSON.stringify(finalMetrics,null,2));
