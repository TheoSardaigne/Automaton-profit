#!/usr/bin/env node
import fs from "node:fs";

const file = "src/__tests__/financial.test.ts";
let text = fs.readFileSync(file, "utf8");

const before = `  describe("Rules are registered", () => {\n    it("creates 9 financial rules (7 Phase 0 + 2 Phase 1)", () => {\n      expect(rules.length).toBe(9);\n    });\n\n    it("all rules have priority 500", () => {\n      for (const rule of rules) {\n        expect(rule.priority).toBe(500);\n      }\n    });`;

const after = `  describe("Rules are registered", () => {\n    it("creates 10 financial rules including the profit-launch lock", () => {\n      expect(rules.length).toBe(10);\n      expect(rules.some((rule) => rule.id === "financial.profit_launch_lock")).toBe(true);\n    });\n\n    it("launch lock outranks normal financial rules but not kernel integrity", () => {\n      const launch = rules.find((rule) => rule.id === "financial.profit_launch_lock");\n      expect(launch?.priority).toBe(75);\n      for (const rule of rules.filter((entry) => entry.id !== "financial.profit_launch_lock")) {\n        expect(rule.priority).toBe(500);\n      }\n    });`;

if (!text.includes(before)) {
  throw new Error("financial rule registration contract source context not found");
}
text = text.replace(before, after);
fs.writeFileSync(file, text, "utf8");
console.log("Launch financial tests updated for the new rule hierarchy.");
