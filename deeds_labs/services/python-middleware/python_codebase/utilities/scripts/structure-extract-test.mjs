#!/usr/bin/env node
/**
 * Quick smoke test for the Phase46 adapter structure extraction endpoint.
 * Usage: node scripts/structure-extract-test.mjs "TS2322 ..."
 */
import fetch from "node-fetch";

const adapterUrl = (process.env.PHASE46_ADAPTER_URL || "http://localhost:8092").replace(/\/$/, "");
const sampleText =
  process.argv.slice(2).join(" ") ||
  "TS2322: Type 'number' is not assignable to type 'string' in file src/routes/+page.svelte";

async function main() {
  console.log(`[structure-extract-test] Sending ${sampleText.length} chars to ${adapterUrl}/extract`);
  const res = await fetch(`${adapterUrl}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: sampleText }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Adapter returned ${res.status}: ${body}`);
  }

  const payload = await res.json();
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error("[structure-extract-test] Failed:", err);
  process.exit(1);
});
