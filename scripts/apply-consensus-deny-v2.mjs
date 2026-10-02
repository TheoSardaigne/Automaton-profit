#!/usr/bin/env node
import fs from "node:fs";

function replaceExact(file, before, after, label) {
  const current = fs.readFileSync(file, "utf8");
  if (!current.includes(before)) {
    throw new Error(`[${label}] source context not found in ${file}`);
  }
  fs.writeFileSync(file, current.replace(before, after), "utf8");
  console.log(`OK ${label}`);
}

replaceExact(
  "src/orchestration/plan-mode.ts",
`    case "consensus": {
      return {
        approved: true,
        feedback: \`Consensus review stub (critic role '\${normalized.consensusCriticRole}', timeout \${normalized.reviewTimeoutMs}ms).\`,
      };
    }`,
`    case "consensus": {
      // Consensus execution is not implemented yet. A stub must never grant
      // authority: fail closed until a real quorum/critic protocol exists.
      return {
        approved: false,
        feedback:
          \`CONSENSUS_MODE_UNAVAILABLE: consensus review is not implemented \` +
          \`(critic role '\${normalized.consensusCriticRole}', timeout \${normalized.reviewTimeoutMs}ms).\`,
      };
    }`,
  "consensus review denies by default",
);

replaceExact(
  "src/__tests__/orchestration/plan-mode.test.ts",
`    it("consensus mode returns approval feedback", async () => {
      const consensus: PlanApprovalConfig = {
        ...autoConfig,
        mode: "consensus",
        consensusCriticRole: "critic",
        reviewTimeoutMs: 9000,
      };
      const result = await reviewPlan(makePlan(), consensus);
      expect(result.approved).toBe(true);
      expect(result.feedback).toContain("critic role 'critic'");
    });`,
`    it("consensus mode denies by default until consensus is implemented", async () => {
      const consensus: PlanApprovalConfig = {
        ...autoConfig,
        mode: "consensus",
        consensusCriticRole: "critic",
        reviewTimeoutMs: 9000,
      };
      const result = await reviewPlan(makePlan(), consensus);
      expect(result.approved).toBe(false);
      expect(result.feedback).toContain("CONSENSUS_MODE_UNAVAILABLE");
      expect(result.feedback).toContain("critic role 'critic'");
    });`,
  "consensus review regression test",
);

console.log("Consensus fail-closed patch applied.");
