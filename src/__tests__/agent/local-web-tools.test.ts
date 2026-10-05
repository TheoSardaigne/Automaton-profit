import { describe, expect, it } from "vitest";
import {
  createLocalWebTools,
  isPrivateOrReservedIp,
  validatePublicHttpUrl,
} from "../../agent/local-web-tools.js";

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
