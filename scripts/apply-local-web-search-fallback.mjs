import fs from "node:fs";
import { spawnSync } from "node:child_process";

const file = "src/agent/local-web-tools.ts";
let source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const extractorStart = source.indexOf("function extractDuckDuckGoResults");
const extractorEnd = source.indexOf("\n\nexport function createLocalWebTools", extractorStart);
if (extractorStart < 0 || extractorEnd < 0) {
  throw new Error("could not locate existing search-result extractor");
}

const extractorReplacement = `const SEARCH_PROVIDER_SUFFIXES = [
  "duckduckgo.com",
  "bing.com",
  "microsoft.com",
];

function isSearchProviderHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return SEARCH_PROVIDER_SUFFIXES.some((suffix) => host === suffix || host.endsWith("." + suffix));
}

function extractSearchResults(
  html: string,
  baseUrl: string,
): Array<{ title: string; url: string }> {
  const results: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  const pattern = /<a\\b[^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) && results.length < 8) {
    let href = decodeHtmlEntities(match[1]!).trim();
    const title = htmlToText(match[2]!).replace(/\\s+/g, " ").trim().slice(0, 300);
    if (!href || !title || title.length < 2) continue;

    try {
      if (href.startsWith("//")) href = "https:" + href;
      const parsed = new URL(href, baseUrl);

      // DuckDuckGo wraps result URLs through /l/?uddg=...
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) {
        href = decodeURIComponent(uddg);
      } else {
        href = parsed.toString();
      }

      const target = validatePublicHttpUrl(href);
      if (isSearchProviderHost(target.hostname)) continue;
      const canonical = target.toString();
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      results.push({ title, url: canonical });
    } catch {
      // Ignore malformed, internal, navigation, or non-http links.
    }
  }

  return results;
}`;

source =
  source.slice(0, extractorStart) +
  extractorReplacement +
  source.slice(extractorEnd);

const searchToolStart = source.indexOf('      name: "local_web_search"');
if (searchToolStart < 0) throw new Error("could not locate local_web_search tool");
const bodyStart = source.indexOf(
  "        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;",
  searchToolStart,
);
const bodyEndMarker = "\n      },\n    },\n  ];";
const bodyEnd = source.indexOf(bodyEndMarker, bodyStart);
if (bodyStart < 0 || bodyEnd < 0) {
  throw new Error("could not locate local_web_search execution body");
}

const searchReplacement = `        const providers = [
          {
            name: "duckduckgo_html",
            url: \`https://html.duckduckgo.com/html/?q=\${encodeURIComponent(query)}\`,
          },
          {
            name: "duckduckgo_lite",
            url: \`https://lite.duckduckgo.com/lite/?q=\${encodeURIComponent(query)}\`,
          },
          {
            name: "bing",
            url: \`https://www.bing.com/search?q=\${encodeURIComponent(query)}\`,
          },
        ];

        const failures: string[] = [];
        for (const provider of providers) {
          try {
            const { finalUrl, response } = await fetchReadOnly(provider.url);
            if (response.status < 200 || response.status >= 400) {
              failures.push(\`${provider.name}: HTTP \${response.status}\`);
              continue;
            }
            const results = extractSearchResults(response.body, finalUrl.toString());
            if (!results.length) {
              failures.push(\`${provider.name}: no structured results\`);
              continue;
            }

            await appendAudit("web_search", {
              query,
              provider: provider.name,
              resultCount: results.length,
            });
            return [
              "[UNTRUSTED WEB SEARCH RESULTS — use as discovery only; verify with primary sources]",
              \`Query: \${query}\`,
              \`Provider: \${provider.name}\`,
              ...results.map((result, index) => \`\${index + 1}. \${result.title}\\n   \${result.url}\`),
            ].join("\\n");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(\`${provider.name}: \${message}\`);
          }
        }

        await appendAudit("web_search_failed", { query, failures });
        return [
          "[UNTRUSTED WEB SEARCH RESPONSE]",
          \`Query: \${query}\`,
          "All search providers failed to return structured public results.",
          ...failures.map((failure) => \`- \${failure}\`),
        ].join("\\n");`;

source = source.slice(0, bodyStart) + searchReplacement + source.slice(bodyEnd);
fs.writeFileSync(file, source, "utf8");
console.log("patched: " + file);

const manifest = spawnSync(process.execPath, ["scripts/generate-kernel-manifest.mjs"], {
  stdio: "inherit",
  shell: false,
});
if (manifest.status !== 0) {
  throw new Error("kernel manifest regeneration failed");
}

console.log("local web search fallback applied; kernel manifest regenerated");
