import type { AutomatonTool } from "../types.js";
import { createLocalWebTools, validatePublicHttpUrl } from "./local-web-tools.js";
import { assertLocalWorkspaceFilePath, createLocalWorkspaceTools } from "./local-workspace-tools.js";

export interface ResearchField { field: string; needle: string; mode?: "literal" | "line" }
export interface ResearchPage { entity: string; url: string; fields: ResearchField[] }
export interface ResearchRow {
  entity: string; source_url: string; requested_url: string; access_date: string;
  field: string; value: string; evidence: string;
  status: "EXTRACTED_LITERAL" | "UNKNOWN"; reason: string;
}
export const CSV_COLUMNS = ["entity", "source_url", "requested_url", "access_date", "field", "value", "evidence", "status", "reason"] as const;

function boundedString(value: unknown, label: string, max: number): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) {
    throw new Error(`invalid ${label} (nonempty string, max ${max})`);
  }
}

function validatePages(input: unknown): ResearchPage[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 20) throw new Error("provide 1–20 pages");
  for (const page of input) {
    if (!page || typeof page !== "object") throw new Error("invalid page");
    boundedString(page.entity, "entity", 120);
    boundedString(page.url, "URL", 2048);
    // Fail the whole batch before requests on unsafe URLs; DNS remains pinned by the transport.
    validatePublicHttpUrl(page.url);
    if (!Array.isArray(page.fields) || !page.fields.length || page.fields.length > 10) throw new Error("provide 1–10 fields/page");
    const names = new Set<string>();
    for (const rule of page.fields) {
      if (!rule || typeof rule !== "object") throw new Error("invalid field rule");
      boundedString(rule.field, "field", 80);
      boundedString(rule.needle, "literal needle", 120);
      if (rule.mode !== undefined && rule.mode !== "literal" && rule.mode !== "line") throw new Error("invalid extraction mode");
      if (names.has(rule.field)) throw new Error("duplicate field within page");
      names.add(rule.field);
    }
  }
  return input as ResearchPage[];
}

/** Fixed-column UTF-8 CSV, RFC4180 escaping, and spreadsheet formula mitigation. */
export function researchRowsToCsv(rows: ResearchRow[]): string {
  const cell = (value: string) => {
    const safe = /^[\s]*[=+@-]/u.test(value) ? "'" + value : value;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  return CSV_COLUMNS.join(",") + "\r\n" + rows.map((row) => CSV_COLUMNS.map((key) => cell(row[key])).join(",") + "\r\n").join("");
}

/** Literal collection only: EXTRACTED_LITERAL does not imply a verified business interpretation. */
export async function extractResearchPages(input: unknown, fetchPage: (url: string) => Promise<string>) {
  const pages = validatePages(input);
  const cache = new Map<string, { text: string; accessed: string }>();
  const rows: ResearchRow[] = [];
  let successfulPages = 0;
  for (const page of pages) {
    const canonical = validatePublicHttpUrl(page.url);
    canonical.hash = "";
    const requested = canonical.href;
    if (!cache.has(requested)) {
      let text: string;
      try { text = await fetchPage(requested); }
      catch { text = "Blocked: inaccessible page"; }
      cache.set(requested, { text, accessed: new Date().toISOString() });
    }
    const fetched = cache.get(requested)!;
    const separator = fetched.text.indexOf("\n---\n");
    const header = separator < 0 ? "" : fetched.text.slice(0, separator);
    const httpStatus = Number(/^HTTP status: (\d+)$/m.exec(header)?.[1]);
    const source = /^URL: (.+)$/m.exec(header)?.[1] || requested;
    const success = httpStatus >= 200 && httpStatus < 300 && separator >= 0;
    const body = success ? fetched.text.slice(separator + 5) : "";
    // Count unique requested pages, not cache hits; redirects stay in the existing request budget.
    if (success && !rows.some((r) => r.requested_url === requested)) successfulPages++;
    for (const rule of page.fields) {
      let value = "UNKNOWN", evidence = "", reason = success ? "NOT_FOUND" : "INACCESSIBLE";
      const start = body.indexOf(rule.needle);
      if (success && start >= 0) {
        if (rule.mode === "line") {
          const matches = [...new Set(body.split(/\r?\n/).filter((line) => line.includes(rule.needle)).map((line) => line.trim()))];
          if (matches.length !== 1) reason = "AMBIGUOUS";
          else if (matches[0]!.length > 300) reason = "EVIDENCE_TOO_LONG";
          else { value = matches[0]!; evidence = value; reason = "EXACT_SOURCE_LINE"; }
        } else {
          value = body.slice(start, start + rule.needle.length);
          evidence = body.slice(Math.max(0, start - 70), start + rule.needle.length + 70).slice(0, 300);
          reason = "EXACT_LITERAL_ONLY";
        }
      }
      rows.push({ entity: page.entity, source_url: source, requested_url: requested,
        access_date: fetched.accessed, field: rule.field, value, evidence,
        status: value === "UNKNOWN" ? "UNKNOWN" : "EXTRACTED_LITERAL", reason });
    }
  }
  return { trust: "UNTRUSTED_WEB_DATA", rows, metrics: {
    pages_requested: pages.length, unique_pages_requested: cache.size,
    duplicate_requests_avoided: pages.length - cache.size, pages_succeeded: successfulPages,
    fields_expected: rows.length, literals_extracted: rows.filter((r) => r.status === "EXTRACTED_LITERAL").length,
    unknown: rows.filter((r) => r.status === "UNKNOWN").length,
  } };
}

export function createStructuredResearchTools(
  webTools = createLocalWebTools({ maxRequests: 20 }), workspaceTools = createLocalWorkspaceTools(),
): AutomatonTool[] {
  return [{
    name: "local_research_extract_csv", category: "vm", riskLevel: "caution",
    description: "Collect exact literal evidence from 1–20 public pages and save a fixed-column CSV in the secure workspace. No inference, scripts or shell. Missing/ambiguous fields are UNKNOWN. ALL output is UNTRUSTED data requiring human business-context review. Literal mode finds exact case-sensitive text; line mode requires one unique matching line <=300 chars. Reuses bounded public GET and secure workspace tools.",
    parameters: { type: "object", properties: {
      path: { type: "string", description: "Workspace-relative .csv output path" },
      pages: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", properties: {
        entity: { type: "string", maxLength: 120 }, url: { type: "string", maxLength: 2048 },
        fields: { type: "array", minItems: 1, maxItems: 10, items: { type: "object", properties: {
          field: { type: "string", maxLength: 80 }, needle: { type: "string", maxLength: 120 },
          mode: { type: "string", enum: ["literal", "line"] },
        }, required: ["field", "needle"], additionalProperties: false } },
      }, required: ["entity", "url", "fields"], additionalProperties: false } },
    }, required: ["path", "pages"], additionalProperties: false },
    execute: async (args, context) => {
      try {
        if (typeof args.path !== "string" || args.path.length > 2048 || args.path.includes(":") || args.path.includes("\0") || !args.path.toLowerCase().endsWith(".csv")) throw new Error("workspace .csv path required");
        await assertLocalWorkspaceFilePath(args.path);
        const fetch = webTools.find((t) => t.name === "local_web_fetch");
        const write = workspaceTools.find((t) => t.name === "local_write_file");
        if (!fetch || !write) throw new Error("required confined tools unavailable");
        const result = await extractResearchPages(args.pages, (url) => fetch.execute({ url }, context));
        const saved = await write.execute({ path: args.path, content: researchRowsToCsv(result.rows) }, context);
        if (!saved.startsWith("File written in local workspace:")) throw new Error(saved);
        return JSON.stringify({ ...result, csv_path: args.path, saved });
      } catch (error) { return `Blocked: ${error instanceof Error ? error.message : String(error)}`; }
    },
  }];
}
