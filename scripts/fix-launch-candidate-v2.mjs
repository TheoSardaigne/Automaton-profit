#!/usr/bin/env node
import fs from "node:fs";

const file = "src/agent/policy-rules/financial.ts";
let text = fs.readFileSync(file, "utf8");

const beforeConfig = "if (request.context.config.profitLaunchMode !== true) return null;";
const afterConfig = "if (request.context?.config?.profitLaunchMode !== true) return null;";
if (!text.includes(beforeConfig)) {
  throw new Error("launch config guard source context not found");
}
text = text.replace(beforeConfig, afterConfig);

const beforePriority = 'priority: 25,';
const afterPriority = 'priority: 75, // kernel integrity remains the unique minimum at 50';
if (!text.includes(beforePriority)) {
  throw new Error("launch priority source context not found");
}
text = text.replace(beforePriority, afterPriority);

fs.writeFileSync(file, text, "utf8");
console.log("Launch candidate v2 policy compatibility fix applied.");
