import { createLocalWebTools } from "../dist/agent/local-web-tools.js";

function tool(name) {
  const found = createLocalWebTools().find((entry) => entry.name === name);
  if (!found) throw new Error(`missing tool: ${name}`);
  return found;
}

console.log("[1/2] Fetching public test page...");
const fetchResult = await tool("local_web_fetch").execute(
  { url: "https://example.com/" },
  {},
);
if (!fetchResult.includes("Example Domain")) {
  console.error(fetchResult.slice(0, 2000));
  throw new Error("public fetch smoke test failed");
}
console.log("OK: public fetch works");

console.log("[2/2] Running read-only web search...");
const searchResult = await tool("local_web_search").execute(
  { query: "OpenAI official website" },
  {},
);
const resultUrls = [...searchResult.matchAll(/^\s+(https?:\/\/\S+)$/gm)].map((match) => match[1]);
if (!searchResult.startsWith("[UNTRUSTED WEB SEARCH RESULTS") || !resultUrls.length) {
  console.error(searchResult.slice(0, 2000));
  throw new Error("web search smoke test failed");
}
// Confirm at least one discovered public URL works through the same safe fetch tool.
let usable = false;
for (const url of resultUrls.slice(0, 3)) {
  const page = await tool("local_web_fetch").execute({ url }, {});
  if (/HTTP status: 2\d\d\n/.test(page) && !page.includes("(empty response body)")) {
    console.log(`Verified search URL: ${url}`);
    usable = true;
    break;
  }
}
if (!usable) throw new Error("no discovered search URL could be fetched successfully");
console.log("OK: read-only web search works");
console.log("local web smoke test passed");
