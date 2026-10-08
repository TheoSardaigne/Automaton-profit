// Operator benchmark: fixed public GET pages; local Ollama only; no wallet or paid fallback.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createLocalWebTools } from "../dist/agent/local-web-tools.js";
import { researchRowsToCsv } from "../dist/agent/structured-research.js";
import { PRICING_SOURCE_SPECS, researchPricingSource, pricingRows } from "../dist/agent/pricing-research.js";
import { PRICING_SYSTEM_PROMPT, pricingUserPrompt } from "../dist/agent/local-pricing-extraction.js";
import { planContexts, verifyPricingDraft } from "../dist/agent/pricing-evidence.js";
const repo = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(repo, "research/capability-build-v2/benchmark");
const privateCache = path.join(repo, "tmp/pricing-v2-source-cache");
await fs.mkdir(out, { recursive: true });
await fs.mkdir(privateCache, { recursive: true });
// No state DB or wallet loaded. Check configured local model and explicit financial locks.
const config = JSON.parse(await fs.readFile("C:/root/.automaton/automaton.json", "utf8"));
if (config.name !== "Aurum" || config.inferenceModel !== "gpt-oss:20b" || config.profitLaunchMode !== true || config.autoTopupEnabled !== false || config.allowPaidComputeTopup !== false) throw new Error("Configured local model/financial locks differ");
process.env.HOME = path.join(repo, "tmp/v2-benchmark-home");
const fetchTool = createLocalWebTools({ maxRequests: 8 }).find((t) => t.name === "local_web_fetch");
const started = performance.now();
const retrySimply = process.argv[2] === "--retry-simply";
const revalidate = process.argv[2] === "--revalidate";
if (process.argv.length > 2 && !retrySimply && !revalidate) throw new Error("unsupported benchmark mode");
const records = revalidate ? JSON.parse(await fs.readFile(path.join(out, "results.json"), "utf8")) : retrySimply ? JSON.parse(await fs.readFile(path.join(out, "results.json"), "utf8")).filter((r) => r.entity !== "SimplyBook.me") : [];
if (revalidate) {
  for (const record of records) {
    const spec = PRICING_SOURCE_SPECS.find((s) => s.entity === record.entity);
    const text = await fs.readFile(path.join(privateCache, `${record.entity.replace(/\W/g, "-")}.txt`), "utf8");
    if (crypto.createHash("sha256").update(text).digest("hex") !== record.source_sha256) throw new Error("cached source hash mismatch");
    record.validated = verifyPricingDraft({ entity: record.entity, source_url: record.source_url, accessed_at: record.accessed_at, text, plan_names: [...spec.plan_names] }, record.proposal?.complete ? record.proposal.draft : null, record.slots);
  }
  await fs.writeFile(path.join(out, "results.json"), JSON.stringify(records, null, 2) + "\n", "utf8");
}
for (const spec of PRICING_SOURCE_SPECS) {
  if (revalidate) continue;
  if (retrySimply && spec.entity !== "SimplyBook.me") continue;
  console.log(`Starting ${spec.entity}: public fetch then one local proposal`);
  let fetchSeconds = 0;
  const result = await researchPricingSource(spec, async (url) => {
    const start = performance.now(); const content = await fetchTool.execute({ url }, {});
    fetchSeconds = (performance.now() - start) / 1000; return content;
  });
  await fs.writeFile(path.join(privateCache, `${spec.entity.replace(/\W/g, "-")}.txt`), result.page.text, "utf8");
  const contexts = [...planContexts(result.page)].map(([plan_name, text]) => ({ plan_name, text }));
  // Full source bodies stay local; committed replay inputs are bounded pricing-card contexts.
  // They retain exact quotes but cannot establish freshness on a later replay.
  const record = { entity: spec.entity, source_url: result.page.source_url, accessed_at: result.page.accessed_at,
    source_sha256: crypto.createHash("sha256").update(result.page.text).digest("hex"), source_characters: result.page.text.length,
    page_succeeded: result.page_succeeded, fetch_seconds: fetchSeconds, failure: result.failure,
    slots: result.slots, contexts, proposal: result.proposal, validated: result.validated };
  records.push(record);
  await fs.writeFile(path.join(out, "results.json"), JSON.stringify(records, null, 2) + "\n", "utf8");
  console.log(`${spec.entity}: ${record.page_succeeded ? "accessible" : "failed"}; ${record.validated.flatMap((p) => p.fields).filter((f) => f.status === "VERIFIED_EVIDENCE").length} validated fields, ${record.proposal?.elapsed_seconds ?? 0}s local inference`);
}
const rows = records.flatMap((record) => pricingRows({ page: { entity: record.entity, source_url: record.source_url }, validated: record.validated }));
await fs.writeFile(path.join(out, "dataset.csv"), researchRowsToCsv(rows), "utf8");
const fields = records.flatMap((r) => r.validated.flatMap((p) => p.fields));
const accepted = fields.filter((f) => f.status === "VERIFIED_EVIDENCE");
const proposals = records.flatMap((r) => r.proposal?.draft?.plans || []).flatMap((p) => Array.isArray(p.fields) ? p.fields : []);
const normalizedProposed = proposals.filter((p) => p.normalized_value !== "UNKNOWN");
const prices = accepted.filter((f) => f.field === "price_amount");
const exactChecks = records.flatMap((r) => r.validated.flatMap((plan) => plan.fields.filter((f) => f.status === "VERIFIED_EVIDENCE").map((f) => ({
  entity: r.entity, plan_name: plan.plan_name, billing_option: plan.billing_option, field: f.field,
  quote_in_card: r.contexts.some((c) => c.plan_name === plan.plan_name && c.text.includes(f.exact_evidence_quote)),
  source_matches: f.source_url === r.source_url,
}))));
const metrics = { date: new Date().toISOString(), external_spend_executed: 0, wallet_loaded: false,
  pages_requested: PRICING_SOURCE_SPECS.length, pages_accessible: records.filter((r) => r.page_succeeded).length,
  expected_plan_options: records.reduce((n, r) => n + r.slots.length, 0), expected_fields: fields.length,
  fields_proposed_total: proposals.length, fields_proposed_non_unknown: normalizedProposed.length,
  fields_validated: accepted.length, unknown: fields.length - accepted.length,
  zero_placeholder_rejections: fields.filter((f) => f.reason === "ZERO_PLACEHOLDER_RISK").length,
  exact_quote_checks: exactChecks, accepted_without_exact_quote: exactChecks.filter((c) => !c.quote_in_card || !c.source_matches).length,
  price_amounts_verified: prices.length, invocation_seconds: (performance.now() - started) / 1000,
  machine_seconds: records.reduce((n, r) => n + r.fetch_seconds + (r.proposal?.elapsed_seconds || 0), 0),
  execution_mode: revalidate ? "OFFLINE_REVALIDATION_OF_EXACT_HASHED_SOURCES_NO_MODEL_CALL" : retrySimply ? "FINAL_RECORDS_REUSE_2_PREVIOUS_PAGES_PLUS_1_MEASURED_RETRY" : "THREE_PAGE_RUN",
  local_model_calls: records.filter((r) => r.proposal || (r.failure && r.failure !== "PAGE_INACCESSIBLE")).length,
  model_calls_this_invocation: revalidate ? 0 : retrySimply ? 1 : 3,
  public_pages_this_invocation: revalidate ? 0 : retrySimply ? 1 : 3,
  human_review_seconds: "UNKNOWN", human_false_positives: "UNKNOWN", human_correct_accepted_fields: "UNKNOWN",
  human_review_status: "PENDING_OWNER_TIMED_REVIEW", manual_agent_review_is_not_human: true,
};
await fs.writeFile(path.join(out, "metrics.json"), JSON.stringify(metrics, null, 2) + "\n", "utf8");
await fs.writeFile(path.join(out, "prompt.txt"), PRICING_SYSTEM_PROMPT + "\n", "utf8");
const prompts = records.map((r) => ({ source_url: r.source_url, expected_slots: r.slots, untrusted_plan_contexts: r.contexts }));
await fs.writeFile(path.join(out, "inputs.json"), JSON.stringify(prompts, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ...metrics, exact_quote_checks: `${exactChecks.length} checks saved` }, null, 2));
// Revalidation never erases an existing owner review or republishes rejected rows.
try { await fs.access(path.join(out, "human-review.json")); }
catch (error) { if (error.code !== "ENOENT") throw error; process.exit(0); }
await import("./apply-pricing-human-review.mjs");
