#!/usr/bin/env npx tsx
/**
 * Phase48 – Code Graph Embedder
 * -------------------------------------
 * 1. Runs after `npx svelte-check --output json`
 * 2. Uses Gemma3-Legal / embeddinggemma:latest to vectorize diagnostics
 * 3. Publishes payloads to Redis → picked up by the QUIC Bridge → GPU Analyzer
 */

import fs from "fs/promises";
import path from "node:path";
import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const OLLAMA_URL = process.env.OLLAMA_ENDPOINT ?? "http://127.0.0.1:11434";
// CLI options: --input PATH, --dry-run
const argv = process.argv.slice(2);
let inputPath = argv[argv.indexOf('--input') + 1] || undefined;
const dryRun = argv.includes('--dry-run') || argv.includes('--dryrun');
if (!inputPath || inputPath.startsWith('-')) {
  inputPath = path.resolve('.cache/sveltecheck.trimmed.json');
} else {
  inputPath = path.resolve(inputPath);
}

/** Embedding client with Gemma3 + fallback */
async function embedText(text: string, model = "embeddinggemma:latest") {
  const endpoint = `${OLLAMA_URL}/api/embeddings`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.embedding && Array.isArray(json.embedding)) return json.embedding;
    if (json.data && json.data[0]?.embedding) return json.data[0].embedding;
    throw new Error("Invalid embedding response");
  } catch (err) {
    console.warn(`[phase48] ⚠️ embedding fallback (${err}) → returning zero-vec`);
    return Array(768).fill(0); // still publish, to trigger graph node creation
  }
}

async function main() {
  console.log('[phase48] 🧩 Embedding Svelte-check diagnostics...');
  console.log(`[phase48] Input path: ${inputPath}  dryRun=${dryRun}`);

  // Ensure we pass a definite string to fs.readFile (avoid string | undefined)
  const resolvedInputPath = inputPath
    ? String(inputPath)
    : path.resolve('.cache/sveltecheck.trimmed.json');

  // Read as string and help TS know this is a string (so .slice/.replace are available)
  const raw = (await fs.readFile(resolvedInputPath, 'utf8')) as string;

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch (err: any) {
    console.error('[phase48] Fatal: JSON parse failed for', resolvedInputPath);
    // Guard snippet creation against Buffer by forcing string
    const snippet = String(raw).slice(0, 1200).replace(/\n/g, '\\n');
    console.error('[phase48] File head snippet:', snippet);
    throw err;
  }

  const diagnostics = json.diagnostics ?? [];
  console.log(`[phase48] Found ${diagnostics.length} diagnostics`);

  let redis: any = null;
  if (!dryRun) {
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
  }

  for (const diag of diagnostics) {
    const text = `${diag.code}: ${diag.message} (${diag.file}:${diag.start?.line})`;
    const vec = dryRun ? Array(8).fill(0) : await embedText(text);
    const payload = {
      id: `diag:${diag.code ?? 'unknown'}:${diag.file ?? 'unknown'}`,
      vector: vec,
      metadata: {
        code: diag.code ?? null,
        file: diag.file ?? null,
        line: diag.start?.line ?? null,
        severity: diag.severity ?? null,
        message: diag.message ?? null,
        created_at: new Date().toISOString(),
      },
    };
    if (!dryRun && redis) {
      await redis.publish('ai:embedding:new', JSON.stringify(payload));
      console.log(`[phase48] → published ${payload.id}`);
    } else {
      console.log(
        `[phase48] (dry-run) would publish ${payload.id} vector_len=${payload.vector.length}`
      );
    }
  }

  if (redis) await redis.quit();
  console.log(
    dryRun
      ? '[phase48] ✅ Dry-run complete (no Redis writes)'
      : '[phase48] ✅ Published all diagnostics to Redis → Phase47 pipeline'
  );
}

main().catch((err) => {
  console.error("[phase48] Fatal:", err);
  process.exit(1);
});
