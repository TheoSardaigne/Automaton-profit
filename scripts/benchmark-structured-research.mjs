// Fixed public benchmark. No wallet, model API, credentials, browser or paid services.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalWebTools } from "../dist/agent/local-web-tools.js";
import { createStructuredResearchTools } from "../dist/agent/structured-research.js";

const repo = fileURLToPath(new URL("../", import.meta.url));
// Keep CSV and web audit inside a dedicated repository benchmark workspace.
process.env.AUTOMATON_LOCAL_WORKSPACE = path.join(repo, "research/capability-build-v1/benchmark");
process.env.HOME = path.join(repo, "tmp/capability-benchmark-home");
const competitors = [
  ["Calendly", "https://calendly.com/", "https://calendly.com/pricing"],
  ["SavvyCal", "https://savvycal.com/", "https://savvycal.com/pricing/"],
  ["Cal.com", "https://cal.com/", "https://cal.com/pricing"],
  ["YouCanBookMe", "https://youcanbook.me/", "https://youcanbook.me/pricing"],
  ["SimplyBook.me", "https://simplybook.me/en/", "https://simplybook.me/en/pricing"],
];
// Predeclared criteria; not fitted after observing fetched bodies.
const pages = competitors.flatMap(([entity, home, pricing]) => [
  { entity, url: home, fields: [
    { field: "scheduling_literal", needle: "scheduling", mode: "literal" },
    { field: "integrations_literal", needle: "integrations", mode: "literal" },
    { field: "unverifiable_control", needle: "AURUM_BENCHMARK_GUARANTEED_ROI_2026", mode: "literal" },
  ] },
  { entity, url: pricing, fields: [
    { field: "free_plan_literal", needle: "Free", mode: "literal" },
    { field: "pricing_line", needle: "$", mode: "line" },
    { field: "unverifiable_control", needle: "AURUM_BENCHMARK_GUARANTEED_ROI_2026", mode: "literal" },
  ] },
]);
const fetched = new Map();
const originalTools = createLocalWebTools({ maxRequests: 20 });
const webTools = originalTools.map((tool) => tool.name !== "local_web_fetch" ? tool : {
  ...tool,
  execute: async (args, context) => {
    const result = await tool.execute(args, context);
    fetched.set(args.url, result);
    return result;
  },
});
const started = performance.now();
const resultText = await createStructuredResearchTools(webTools)[0].execute({ path: "dataset.csv", pages }, {});
if (resultText.startsWith("Blocked:")) throw new Error(resultText);
const result = JSON.parse(resultText);
const elapsedSeconds = (performance.now() - started) / 1000;
const literalRows = result.rows.filter((row) => row.status === "EXTRACTED_LITERAL");
const exactEvidenceChecks = literalRows.map((row) => {
  const response = fetched.get(row.requested_url) || "";
  const headerEnd = response.indexOf("\n---\n");
  const body = headerEnd < 0 ? "" : response.slice(headerEnd + 5);
  const header = headerEnd < 0 ? "" : response.slice(0, headerEnd);
  return { entity: row.entity, field: row.field, source_url: row.source_url,
    value_in_source: body.includes(row.value), evidence_in_source: body.includes(row.evidence),
    correct_source_association: header.includes(`URL: ${row.source_url}\n`),
  };
});
const summary = {
  date: new Date().toISOString(), model_calls: 0, external_spend_executed: 0,
  elapsed_seconds: elapsedSeconds, ...result.metrics,
  exact_evidence_checks: exactEvidenceChecks,
  extraction_errors_observed: exactEvidenceChecks.filter((r) => !r.value_in_source || !r.evidence_in_source || !r.correct_source_association).length,
  controls_unknown: result.rows.filter((r) => r.field === "unverifiable_control" && r.status === "UNKNOWN").length,
  page_outcomes: pages.map((p) => ({ entity: p.entity, url: p.url,
    http_status: /^HTTP status: (\d+)$/m.exec(fetched.get(p.url) || "")?.[1] || "UNKNOWN",
    blocked_reason: (fetched.get(p.url) || "").startsWith("Blocked:") ? fetched.get(p.url) : null,
  })),
  scope: "literal collection, NOT semantic correctness, complete plan-price extraction or end-to-end Ollama autonomy",
};
const out = process.env.AUTOMATON_LOCAL_WORKSPACE;
await fs.writeFile(path.join(out, "result.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
await fs.writeFile(path.join(out, "metrics.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
await fs.writeFile(path.join(out, "input.json"), JSON.stringify(pages, null, 2) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 2));
console.log("Extracted snippets:", JSON.stringify(literalRows, null, 2));
