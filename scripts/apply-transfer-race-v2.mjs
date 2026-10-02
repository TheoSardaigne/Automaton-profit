#!/usr/bin/env node
import fs from "node:fs";

function replaceExact(file, before, after, label) {
  const current = fs.readFileSync(file, "utf8");
  if (!current.includes(before)) {
    throw new Error(`[${label}] source context not found in ${file}`);
  }
  fs.writeFileSync(file, current.replace(before, after), "utf8");
  console.log(`OK  ${label}`);
}

replaceExact(
  "src/agent/tools.ts",
`const logger = createLogger("tools");

// ─── Path Confinement`,
`const logger = createLogger("tools");

// ─── Credit Transfer Mutex ─────────────────────────────────────
// Serialize the complete balance -> policy/reserve checks -> transfer sequence.
// Without this, concurrent transfers can both validate against the same stale
// balance and collectively violate the half-balance or minimum-reserve guards.
let creditTransferLock: Promise<unknown> = Promise.resolve();

function withCreditTransferLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = creditTransferLock.then(fn);
  creditTransferLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ─── Path Confinement`,
  "install credit-transfer mutex",
);

replaceExact(
  "src/agent/tools.ts",
`        // Guard: don't transfer more than half your balance
        const balance = await ctx.conway.getCreditsBalance();
        if (amount > balance / 2) {
          return \`Blocked: Cannot transfer more than half your balance ($\${(balance / 100).toFixed(2)}). Self-preservation.\`;
        }

        // Minimum reserve invariant: post-spend balance must stay >= configured reserve.
        const reserveCents =
          ctx.config.treasuryPolicy?.minimumReserveCents ??
          DEFAULT_TREASURY_POLICY.minimumReserveCents;
        const reserveCheck = checkReserve(amount, balance, reserveCents);
        if (!reserveCheck.allowed) {
          return reserveCheck.message;
        }

        const transfer = await ctx.conway.transferCredits(
          args.to_address as string,
          amount,
          args.reason as string | undefined,
        );`,
`        // The balance read, all spend guards, and the transfer are one critical
        // section. This preserves BOTH the half-balance rule and minimum reserve
        // under concurrent calls (CWE-367 / TOCTOU).
        const outcome = await withCreditTransferLock(async () => {
          const balance = await ctx.conway.getCreditsBalance();
          if (amount > balance / 2) {
            return {
              ok: false as const,
              blocked: \`Blocked: Cannot transfer more than half your balance ($\${(balance / 100).toFixed(2)}). Self-preservation.\`,
            };
          }

          const reserveCents =
            ctx.config.treasuryPolicy?.minimumReserveCents ??
            DEFAULT_TREASURY_POLICY.minimumReserveCents;
          const reserveCheck = checkReserve(amount, balance, reserveCents);
          if (!reserveCheck.allowed) {
            return { ok: false as const, blocked: reserveCheck.message };
          }

          const transfer = await ctx.conway.transferCredits(
            args.to_address as string,
            amount,
            args.reason as string | undefined,
          );
          return { ok: true as const, balance, transfer };
        });

        if (!outcome.ok) return outcome.blocked;
        const { balance, transfer } = outcome;`,
  "make transfer_credits reserve-aware and atomic",
);

replaceExact(
  "src/agent/tools.ts",
`        const balance = await ctx.conway.getCreditsBalance();
        if (amount > balance / 2) {
          return \`Blocked: Cannot transfer more than half your balance. Self-preservation.\`;
        }

        // Minimum reserve invariant: post-spend balance must stay >= configured reserve.
        const reserveCents =
          ctx.config.treasuryPolicy?.minimumReserveCents ??
          DEFAULT_TREASURY_POLICY.minimumReserveCents;
        const reserveCheck = checkReserve(amount, balance, reserveCents);
        if (!reserveCheck.allowed) {
          return reserveCheck.message;
        }

        const transfer = await ctx.conway.transferCredits(
          child.address,
          amount,
          \`fund child \${child.id}\`,
        );`,
`        // Same atomic spend critical section as transfer_credits: re-read the
        // current balance while holding the lock, then enforce both guards.
        const outcome = await withCreditTransferLock(async () => {
          const balance = await ctx.conway.getCreditsBalance();
          if (amount > balance / 2) {
            return {
              ok: false as const,
              blocked: \`Blocked: Cannot transfer more than half your balance. Self-preservation.\`,
            };
          }

          const reserveCents =
            ctx.config.treasuryPolicy?.minimumReserveCents ??
            DEFAULT_TREASURY_POLICY.minimumReserveCents;
          const reserveCheck = checkReserve(amount, balance, reserveCents);
          if (!reserveCheck.allowed) {
            return { ok: false as const, blocked: reserveCheck.message };
          }

          const transfer = await ctx.conway.transferCredits(
            child.address,
            amount,
            \`fund child \${child.id}\`,
          );
          return { ok: true as const, balance, transfer };
        });

        if (!outcome.ok) return outcome.blocked;
        const { balance, transfer } = outcome;`,
  "make fund_child reserve-aware and atomic",
);

replaceExact(
  "src/__tests__/tools-security.test.ts",
`  it("blocks zero amount", async () => {
    const transferTool = tools.find((t) => t.name === "transfer_credits")!;
    const result = await transferTool.execute(
      { to_address: "0xrecipient", amount_cents: 0 },
      ctx,
    );
    expect(result).toContain("Blocked");
    expect(result).toContain("positive number");
  });
});`,
`  it("blocks zero amount", async () => {
    const transferTool = tools.find((t) => t.name === "transfer_credits")!;
    const result = await transferTool.execute(
      { to_address: "0xrecipient", amount_cents: 0 },
      ctx,
    );
    expect(result).toContain("Blocked");
    expect(result).toContain("positive number");
  });

  it("serializes concurrent transfers instead of racing on a stale balance", async () => {
    const transferTool = tools.find((t) => t.name === "transfer_credits")!;
    const [first, second] = await Promise.all([
      transferTool.execute({ to_address: "0xa", amount_cents: 4000 }, ctx),
      transferTool.execute({ to_address: "0xb", amount_cents: 4000 }, ctx),
    ]);

    const results = [first, second];
    expect(results.filter((r) => r.includes("transfer submitted"))).toHaveLength(1);
    expect(results.filter((r) => r.includes("Blocked"))).toHaveLength(1);
    expect(conway.creditsCents).toBe(6000);
  });
});`,
  "add concurrent-transfer regression test",
);

console.log("\nreserve-aware transfer mutex applied.");
