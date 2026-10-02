#!/usr/bin/env node
import fs from "node:fs";

const file = "src/revenue/verifier.ts";
let text = fs.readFileSync(file, "utf8");
const before = "input.excludedPayerAddresses.filter(isAddress).map(lower)";
const after = "input.excludedPayerAddresses.filter((address) => isAddress(address)).map(lower)";
if (!text.includes(before)) throw new Error("expected isAddress filter source context not found");
text = text.replace(before, after);
fs.writeFileSync(file, text, "utf8");
console.log("Revenue verifier viem filter made type-safe.");
