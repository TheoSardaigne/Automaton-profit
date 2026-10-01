#!/usr/bin/env node
import fs from "node:fs";

const file = "scripts/apply-launch-candidate-v1.mjs";
const before = '        `Blocked in profit launch mode: ${request.tool.name}. Disable profitLaunchMode only after explicit live-spend validation.`,';
const after = [
  '        "Blocked in profit launch mode: " + request.tool.name +',
  '          ". Disable profitLaunchMode only after explicit live-spend validation.",',
].join("\n");

const current = fs.readFileSync(file, "utf8");
if (current.includes(before)) {
  fs.writeFileSync(file, current.replace(before, after), "utf8");
  console.log("Fixed nested template literal in launch candidate codemod.");
} else if (current.includes(after)) {
  console.log("Launch candidate codemod syntax fix already applied.");
} else {
  throw new Error("Expected launch candidate codemod syntax context not found; refusing to guess.");
}
