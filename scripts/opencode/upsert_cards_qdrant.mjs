#!/usr/bin/env node
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import readline from 'readline';

const SUMMARIES_JSONL = '.opencode/cards/summaries.jsonl';

// Ollama defaults — override via env
const OLLAMA_URL   = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434')
  .replace(/^0\.0\.0\.0/, '127.0.0.1').replace(/\/$/, '');
const EMBED_MODEL  = process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';

// Qdrant — required for live upsert, optional (writes NDJSON fallback if absent)
const QDRANT_URL        = process.env.QDRANT_URL;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'atlas_cards';

// Batch size for Ollama /api/embed calls (keep low to avoid OOM on 8GB GPU)
const EMBED_BATCH = parseInt(process.env.EMBED_BATCH ?? '8', 10);

// ── Pseudoembed fallback (used ONLY when Ollama is unreachable) ────────────────
// 768-dim to match embeddinggemma output so Qdrant collection stays compatible.
function pseudoEmbed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  // L2-normalised so cosine distance is meaningful even for pseudo vectors
  const raw = new Array(768).fill(0).map((_, i) => ((h + i * 2654435761) % 1000) / 1000 - 0.5);
  const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0)) || 1;
  return raw.map(v => v / norm);
}

// ── Real Ollama batch embed ────────────────────────────────────────────────────
async function ollamaEmbedBatch(texts) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama embed ${res.status}: ${await res.text()}`);
  const j = await res.json();
  // Ollama /api/embed returns { embeddings: [[...], [...], ...] }
  if (Array.isArray(j.embeddings)) return j.embeddings;
  // Legacy /api/embeddings returns { embedding: [...] } for single inputs
  if (Array.isArray(j.embedding)) return [j.embedding];
  throw new Error(`Unknown Ollama embed response shape: ${JSON.stringify(Object.keys(j))}`);
}

// ── Qdrant upsert ─────────────────────────────────────────────────────────────
async function upsertToQdrant(points) {
  if (!QDRANT_URL) return;
  const url = QDRANT_URL.replace(/\/$/, '') + `/collections/${QDRANT_COLLECTION}/points?wait=true`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Qdrant upsert ${res.status}: ${res.statusText}`);
}

// ── Read summaries.jsonl ──────────────────────────────────────────────────────
async function readSummaries() {
  try { await fs.access(SUMMARIES_JSONL); }
  catch { throw new Error('No summaries file found. Run summarize_cards_gemma4.mjs first.'); }
  const out = [];
  const rl = readline.createInterface({ input: createReadStream(SUMMARIES_JSONL), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const summaries = await readSummaries();
  console.log(`Loaded ${summaries.length} summaries`);

  // Probe Ollama availability once
  let ollamaOk = false;
  try {
    const probe = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    ollamaOk = probe.ok;
  } catch { /* offline */ }

  if (!ollamaOk) {
    console.warn(`⚠️  Ollama unreachable at ${OLLAMA_URL} — falling back to pseudoEmbed (768-dim hash vectors)`);
  } else {
    console.log(`✓ Ollama ${OLLAMA_URL} reachable, model: ${EMBED_MODEL}`);
  }

  await fs.mkdir('.opencode', { recursive: true });
  const ndjsonLines = [];
  let upserted = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < summaries.length; i += EMBED_BATCH) {
    const batch = summaries.slice(i, i + EMBED_BATCH);
    const texts = batch.map(s => (s.summary || '').slice(0, 2000)); // cap per-text to avoid OOM

    let vectors;
    if (ollamaOk) {
      try {
        vectors = await ollamaEmbedBatch(texts);
      } catch (e) {
        console.error(`Embed batch ${i}–${i + batch.length - 1} failed: ${e.message} — using pseudoEmbed`);
        vectors = texts.map(pseudoEmbed);
      }
    } else {
      vectors = texts.map(pseudoEmbed);
    }

    const points = batch.map((s, j) => ({
      id: s.card_id,
      vector: vectors[j],
      payload: {
        card_id:  s.card_id,
        sourceRef: s.sourceRef ?? s.file ?? null,
        file:     s.file ?? null,
        summary:  s.summary ?? '',
        keywords: s.keywords ?? [],
        tags:     s.tags ?? [],
      },
    }));

    for (const pt of points) ndjsonLines.push(JSON.stringify(pt));

    if (QDRANT_URL) {
      try {
        await upsertToQdrant(points);
        upserted += points.length;
        console.log(`  upserted batch ${i}–${i + batch.length - 1} (${points.length} points)`);
      } catch (e) {
        console.error(`  Qdrant batch ${i}–${i + batch.length - 1} failed: ${e.message}`);
        failed += points.length;
      }
    }
  }

  const ndjsonPath = '.opencode/qdrant-upload.ndjson';
  await fs.writeFile(ndjsonPath, ndjsonLines.join('\n') + '\n', 'utf8');

  console.log(`\n✅ Wrote ${ndjsonLines.length} points → ${ndjsonPath}`);
  if (QDRANT_URL) console.log(`   Qdrant: ${upserted} upserted, ${failed} failed`);
  else console.log(`   QDRANT_URL not set — skipped live upsert (NDJSON written for manual import)`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exitCode = 2; });
