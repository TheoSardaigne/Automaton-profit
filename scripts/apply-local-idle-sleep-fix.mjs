import fs from "node:fs";
import { spawnSync } from "node:child_process";

const path = "src/agent/loop.ts";
let src = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function replaceOnce(needle, replacement, label) {
  const count = src.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  src = src.replace(needle, replacement);
}

if (!src.includes("const localIdleSleepMs = ollamaBaseUrl ? 300_000 : 60_000;")) {
  replaceOnce(
    "  const MAX_IDLE_TURNS = 10; // Force sleep after N turns with no real work\n  let idleTurnCount = 0;",
    "  const MAX_IDLE_TURNS = 10; // Force sleep after N turns with no real work\n  const localIdleSleepMs = ollamaBaseUrl ? 300_000 : 60_000;\n  let idleTurnCount = 0;",
    "insert local idle sleep",
  );
}

if (!src.includes("new Date(Date.now() + localIdleSleepMs).toISOString()")) {
  replaceOnce(
    "        if (idleTurnCount >= MAX_IDLE_TURNS) {\n          log(config, `[IDLE] ${idleTurnCount} consecutive idle turns with no work. Entering sleep.`);\n          db.setKV(\"sleep_until\", new Date(Date.now() + 60_000).toISOString());",
    "        if (idleTurnCount >= MAX_IDLE_TURNS) {\n          log(config, `[IDLE] ${idleTurnCount} consecutive idle turns with no work. Entering sleep.`);\n          db.setKV(\"sleep_until\", new Date(Date.now() + localIdleSleepMs).toISOString());",
    "idle turn sleep",
  );

  replaceOnce(
    "        db.setKV(\n          \"sleep_until\",\n          new Date(Date.now() + 60_000).toISOString(),\n        );",
    "        db.setKV(\n          \"sleep_until\",\n          new Date(Date.now() + localIdleSleepMs).toISOString(),\n        );",
    "natural idle sleep",
  );
}

fs.writeFileSync(path, src, "utf8");
console.log(`patched: ${path}`);

const manifest = spawnSync(process.execPath, ["scripts/generate-kernel-manifest.mjs"], {
  stdio: "inherit",
});
if (manifest.status !== 0) throw new Error("kernel manifest regeneration failed");

console.log("local Ollama idle sleep fix applied; kernel manifest regenerated");
