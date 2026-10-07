# Launch candidate validation — 7 October 2026

Branch: `launch-candidate-v2-ollama`. No main branch changes.

Scope: pending local Ollama runtime adjustments, Windows state versioning,
heartbeat behavior, safe tool-name normalization, supporting operator scripts,
research archives, updated commercial journals and the portfolio PDF.

Checks on Windows:

- `pnpm typecheck`: passed.
- `pnpm build`: passed, including the CLI package.
- `pnpm check:kernel-manifest`: passed; 38 protected files verified.
- Focused Vitest suites: 166 passed, 3 failed, 169 total across 8 files.
- The three `tools-security.test.ts` failures also reproduced against the committed
  `HEAD` version of `src/agent/tools.ts`: 69 passed, the same 3 failed.
  These existing tests expect POSIX `/root` paths; Windows resolves them to `C:\root`,
  and the existing write guard rejects them. No guard was weakened to make tests pass.

Focused suites: heartbeat, heartbeat-scheduler, profit-launch-v2, tools-security,
financial, agent/local-workspace-tools, agent/local-web-tools and agent/research-session.

No paid compute, Connects, proposals, wallet funding or marketplace changes were performed.
The model-registry operator script was archived, not executed during this publication.
Temporary baseline-check files were removed after validation.
