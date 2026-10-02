# Launch Candidate v2

This branch is the fail-closed pre-money launch candidate for Automaton-profit.

Source hardening commit: `f3c8dc0a4782bc733751c3c0a8951fd4593c1971`.

## Safety envelope

- `profitLaunchMode` must be enabled or autonomous startup refuses to run.
- Automatic and paid compute top-ups are disabled.
- Autonomous transfers, x402 payments, paid sandbox provisioning, remote child spawning, domain/DNS changes, messaging, registrations, feedback transactions, port exposure changes, and git pushes are denied by deterministic policy while launch mode is active.
- Inference spend is capped to a micro-budget: 200 cents/hour, 100 cents/session, 25 cents/call, and 10 turns/cycle maximum.
- Orchestration uses local workers only while launch mode is active.
- Generic incoming transfers are funding/inflow, not earned revenue.
- Only the trusted `earned_revenue` transaction type may contribute to earned revenue; no model-facing tool can create that transaction type.
- Operating profit is defined as verified earned revenue minus recorded expenses.
- The wallet USDC baseline and delta are recorded for reconciliation.
- The protected-kernel manifest covers 38 security/economic enforcement files and is checked in CI.
- Production dependency audit fails on high or critical findings.

This candidate is intentionally not a live-money configuration. Real-money permissions should remain locked until a trusted revenue-attribution path and controlled unlock process are implemented and independently validated.
