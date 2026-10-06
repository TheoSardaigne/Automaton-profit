import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLocalWebTools,
  extractSearchResults,
  searchPublicWeb,
  isPrivateOrReservedIp,
  validatePublicHttpUrl,
} from "../../agent/local-web-tools.js";

import dns from "node:dns/promises";
import fsp from "node:fs/promises";

afterEach(() => vi.restoreAllMocks());

function getTool(name: string) {
  const found = createLocalWebTools().find((tool) => tool.name === name);
  if (!found) throw new Error(`missing tool: ${name}`);
  return found;
}

async function runTool(name: string, args: Record<string, unknown>) {
  return getTool(name).execute(args, {} as never);
}

describe("local web tools", () => {
  it("classifies common private and reserved IP ranges", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("10.1.2.3")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.10")).toBe(true);
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
  });

  it("blocks localhost and private IP URLs before network access", () => {
    expect(() => validatePublicHttpUrl("http://localhost/admin")).toThrow(
      "local or internal hostnames are not allowed",
    );
    expect(() => validatePublicHttpUrl("http://127.0.0.1:80/")).toThrow(
      "private or reserved IP addresses are not allowed",
    );
    expect(() => validatePublicHttpUrl("http://192.168.1.1/")).toThrow(
      "private or reserved IP addresses are not allowed",
    );
  });

  it("blocks credentials, non-http schemes, and non-standard ports", () => {
    expect(() => validatePublicHttpUrl("file:///etc/passwd")).toThrow(
      "only http:// and https:// URLs are allowed",
    );
    expect(() => validatePublicHttpUrl("https://user:pass@example.com/")).toThrow(
      "URLs containing credentials are not allowed",
    );
    expect(() => validatePublicHttpUrl("https://example.com:8443/")).toThrow(
      "non-standard network ports are not allowed",
    );
  });

  it("accepts normal public http/https URLs at validation stage", () => {
    expect(validatePublicHttpUrl("https://example.com/path?q=1").hostname).toBe(
      "example.com",
    );
    expect(validatePublicHttpUrl("http://example.com/").protocol).toBe("http:");
  });

  it("web fetch reports blocked localhost access", async () => {
    const result = await runTool("local_web_fetch", {
      url: "http://localhost/private",
    });
    expect(result).toContain("Blocked:");
    expect(result).toContain("local or internal hostnames are not allowed");
  });

  it("search rejects empty and oversized queries without network access", async () => {
    expect(await runTool("local_web_search", { query: "" })).toBe(
      "Blocked: search query is empty",
    );
    expect(await runTool("local_web_search", { query: "x".repeat(301) })).toBe(
      "Blocked: search query exceeds 300 characters",
    );
  });
});

const htmlProvider = "https://html.duckduckgo.com/html/?q=test";
const liteProvider = "https://lite.duckduckgo.com/lite/?q=test";
const bingProvider = "https://www.bing.com/search?q=test";
const rssProvider = "https://www.bing.com/search?format=rss&q=test";
const resultAnchor = '<a href="https://example.com/path?q=one%26two" class="result__a">Example</a>';

function response(url: string, body: string, status = 200) {
  return { finalUrl: new URL(url), response: { status, contentType: "text/html", body } };
}

function publicDns() {
  return vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
}

describe("search parsers and fallbacks", () => {
  it("enforces a lifetime request budget shared by search and fetch", async () => {
    const lookup = vi.spyOn(dns, "lookup").mockRejectedValue(new Error("DNS unavailable"));
    vi.spyOn(fsp, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fsp, "appendFile").mockResolvedValue(undefined);
    const tools = createLocalWebTools({ maxRequests: 1 });
    const fetch = tools.find((tool) => tool.name === "local_web_fetch")!;
    const search = tools.find((tool) => tool.name === "local_web_search")!;
    expect(await fetch.execute({ url: "https://example.com" }, {} as never)).toContain("DNS unavailable");
    expect(await fetch.execute({ url: "https://example.com" }, {} as never)).toContain("session web request limit reached");
    expect(await search.execute({ query: "test" }, {} as never)).toContain("session web request limit reached");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid budgets instead of removing request limits", () => {
    for (const maxRequests of [0, -1, 31, Infinity, NaN, 1.5]) {
      expect(() => createLocalWebTools({ maxRequests })).toThrow("maxRequests must be an integer");
    }
  });
  it("accepts reordered attributes, nested titles, Lite classes and HTML entities", () => {
    const body = `<a HREF='https://example.com/?a=1&amp;b=2' CLASS='other result__a'>A <b>title</b></a>`;
    expect(extractSearchResults(body, htmlProvider)).toEqual([{ title: "A title", url: "https://example.com/?a=1&b=2" }]);
    expect(extractSearchResults('<a href=https://example.com/ class=result-link>Lite</a>', liteProvider)[0]?.title).toBe("Lite");
  });

  it("unwraps DuckDuckGo redirects once, preserving encoded target query data", () => {
    const target = "https://example.com/path?q=one%26two";
    const body = `<a href="//duckduckgo.com/l/?uddg=${encodeURIComponent(target)}&amp;rut=x" class="result__a">Result</a>`;
    expect(extractSearchResults(body, htmlProvider)[0]?.url).toBe(target);
  });

  it("extracts Bing organic links and RSS items, excluding navigation", () => {
    const wrapper = `https://www.bing.com/ck/a?u=a1${Buffer.from("https://example.com/").toString("base64url")}`;
    const body = `<a href="https://navigation.example/">Navigation</a><li class="b_algo"><h2><a href="${wrapper}">Example</a></h2></li>`;
    expect(extractSearchResults(body, bingProvider)).toEqual([{ title: "Example", url: "https://example.com/" }]);
    const rss = '<rss><channel><link>https://navigation.example/</link><item><title>A &amp; B</title><link>https://example.com/</link></item></channel></rss>';
    expect(extractSearchResults(rss, rssProvider)).toEqual([{ title: "A & B", url: "https://example.com/" }]);
  });

  it("discards unsafe targets, provider navigation, duplicates and caps results", () => {
    const urls = ["http://localhost/", "http://127.0.0.1/", "http://169.254.169.254/", "https://user:pass@example.com/", "https://example.com:8443/", "javascript:alert(1)", "/settings", "https://duckduckgo.com/about"];
    const bad = urls.map((u) => `<a class="result__a" href="${u}">Bad</a>`).join("");
    expect(extractSearchResults(bad, htmlProvider)).toEqual([]);
    expect(extractSearchResults(resultAnchor.repeat(3), htmlProvider)).toHaveLength(1);
    const many = Array.from({ length: 12 }, (_, i) => `<a class="result__a" href="https://example.com/${i}">${i}</a>`).join("");
    expect(extractSearchResults(many, htmlProvider)).toHaveLength(8);
  });

  it("handles out-of-range numeric entities without aborting parsing", () => {
    expect(extractSearchResults('<a class="result__a" href="https://example.com/">&#99999999;</a>', htmlProvider)).toHaveLength(1);
  });

  it("falls back after challenge, HTTP failure and network failure", async () => {
    publicDns();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(htmlProvider, "captcha", 202))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(response(rssProvider, "failure", 503))
      .mockResolvedValueOnce(response(bingProvider, '<li class="b_algo"><h2><a href="https://example.com/">Example</a></h2></li>'));
    const found = await searchPublicWeb("a & b", fetcher);
    expect(found.results).toEqual([{ title: "Example", url: "https://example.com/" }]);
    expect(found.attempts).toHaveLength(4);
    expect(fetcher.mock.calls[0]?.[0]).toContain("q=a%20%26%20b");
  });

  it("uses Lite when HTML has no results and stops after success", async () => {
    publicDns();
    const fetcher = vi.fn().mockResolvedValueOnce(response(htmlProvider, "empty"))
      .mockResolvedValueOnce(response(liteProvider, resultAnchor.replace("result__a", "result-link")));
    expect((await searchPublicWeb("test", fetcher)).results).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects mixed public/private DNS answers and never fabricates results", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }] as never);
    const fetcher = vi.fn().mockResolvedValue(response(htmlProvider, resultAnchor));
    const found = await searchPublicWeb("test", fetcher);
    expect(found.results).toEqual([]);
    expect(found.attempts).toHaveLength(4);
  });

  it("does not use error-page links and stops at the shared rate limit", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(htmlProvider, resultAnchor, 429))
      .mockRejectedValueOnce(new Error("web research rate limit reached"));
    const found = await searchPublicWeb("test", fetcher);
    expect(found.results).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
