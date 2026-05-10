#!/usr/bin/env node
/**
 * ingest-grpo-log.mjs
 *
 * Reads a Langfuse JSONL export (from export-langfuse-jsonl.mjs) and:
 *   1. Embeds grpo_thinking text via Ollama embeddinggemma
 *   2. Upserts vectors to Qdrant `synthesis_memory_768` collection (T2 trust tier)
 *   3. INSERTs rows into Postgres `context_timeline` (event_type='grpo_thinking')
 *
 * Usage:
 *   node scripts/ingest-grpo-log.mjs logs/langfuse/2026-05-10.jsonl
 *   node scripts/ingest-grpo-log.mjs --grpo-only logs/langfuse/grpo-thinking.jsonl
 *   node scripts/ingest-grpo-log.mjs --dry-run logs/langfuse/2026-05-10.jsonl
 *
 * Env vars (from .env):
 *   OLLAMA_BASE_URL       default: http://localhost:11434
 *   QDRANT_URL            default: http://localhost:6333
 *   DATABASE_URL          required for Postgres inserts
 *   INGEST_BATCH_SIZE     default: 20
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { Progress } from './lib/progress.mjs';

dotenv.config();

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const GRPO_ONLY = args.includes('--grpo-only');
const filePath  = args.find(a => !a.startsWith('--'));

if (!filePath) {
  console.error('Usage: node scripts/ingest-grpo-log.mjs [--dry-run] [--grpo-only] <path.jsonl>');
  process.exit(1);
}

const INPUT_PATH   = resolve(process.cwd(), filePath);
const BATCH_SIZE   = parseInt(process.env.INGEST_BATCH_SIZE ?? '20', 10);
const OLLAMA_BASE  = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const QDRANT_URL   = process.env.QDRANT_URL      ?? 'http://localhost:6333';
const DATABASE_URL = process.env.DATABASE_URL;
const EMBED_MODEL  = 'embeddinggemma:latest';
const COLLECTION   = 'synthesis_memory_768';
const TIMEOUT_MS   = 30_000;

// ── Postgres client (lazy, optional) ─────────────────────────────────────────

let pgClient = null;

async function getPg() {
  if (pgClient) return pgClient;
  if (!DATABASE_URL) return null;
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    pgClient = client;
    return client;
  } catch {
    console.warn('[ingest-grpo] Postgres unavailable — skipping context_timeline inserts');
    return null;
  }
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────

async function ensureCollection() {
  const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (r.status === 404) {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: 768, distance: 'Cosine' },
        optimizers_config: { default_segment_number: 2 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Qdrant create collection: ${res.status}`);
    console.log(`[ingest-grpo] Created Qdrant collection ${COLLECTION}`);
  }
}

async function upsertBatch(points) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Qdrant upsert: ${res.status} ${await res.text()}`);
}

// ── Ollama embedding ──────────────────────────────────────────────────────────

async function embedText(text) {
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 4096) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama embed: ${res.status}`);
  const { embedding } = await res.json();
  return embedding; // number[]
}

// ── Postgres insert ───────────────────────────────────────────────────────────

async function insertTimeline(pg, rows) {
  if (!pg || rows.length === 0) return;
  const values = rows.map((_, i) => {
    const base = i * 6;
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6})`;
  }).join(',');
  const params = rows.flatMap(r => [
    r.id,
    'grpo_thinking',
    'synthesis',
    r.grpo_reward,
    null,
    JSON.stringify(r.payload),
  ]);
  await pg.query(
    `INSERT INTO context_timeline
       (id, event_type, pipeline, grpo_reward, triggered_rebuild, payload)
     VALUES ${values}
     ON CONFLICT (id) DO NOTHING`,
    params,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`[ingest-grpo] input: ${INPUT_PATH}`);
console.log(`[ingest-grpo] dry_run=${DRY_RUN} grpo_only=${GRPO_ONLY} batch=${BATCH_SIZE}\n`);

if (!DRY_RUN) await ensureCollection();
const pg = DRY_RUN ? null : await getPg();

const rl = createInterface({
  input: createReadStream(INPUT_PATH, 'utf8'),
  crlfDelay: Infinity,
});

let lines    = [];
let batch    = [];
let total    = 0;
let skipped  = 0;
let embedded = 0;
let errors   = 0;

for await (const line of rl) {
  if (!line.trim()) continue;
  lines.push(line);
}

const toProcess = lines
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean)
  .filter(r => !GRPO_ONLY || r.grpo_thinking);

total = toProcess.length;
if (total === 0) {
  console.log('[ingest-grpo] No rows to ingest (try removing --grpo-only or run langfuse:export first)');
  process.exit(0);
}

const progress = new Progress('Ingesting GRPO thinking', total);
const timelineRows = [];

for (const row of toProcess) {
  const text = row.grpo_thinking ?? row.output_preview ?? row.input_preview ?? '';
  if (!text.trim()) { skipped++; progress.tick(); continue; }

  try {
    let vector = null;
    if (!DRY_RUN) {
      vector = await embedText(text);
    } else {
      vector = Array.from({ length: 768 }, () => Math.random() * 2 - 1);
    }

    const pointId = randomUUID();
    batch.push({
      id:      pointId,
      vector,
      payload: {
        chunk_id:       row.chunk_id,
        trace_id:       row.trace_id,
        timestamp:      row.timestamp,
        model:          row.model,
        grpo_reward:    row.grpo_reward,
        grpo_thinking:  row.grpo_thinking,
        trust_tier:     'T2',
        som_cluster:    row.som_cluster,
        adapter:        row.adapter,
        source:         'langfuse_export',
        text_preview:   text.slice(0, 300),
      },
    });

    timelineRows.push({
      id:          pointId,
      grpo_reward: row.grpo_reward,
      payload: {
        chunk_id:       row.chunk_id,
        trace_id:       row.trace_id,
        model:          row.model,
        latency_ms:     row.latency_ms,
        input_tokens:   row.input_tokens,
        output_tokens:  row.output_tokens,
        thinking_preview: (row.grpo_thinking ?? '').slice(0, 200),
      },
    });

    embedded++;

    if (batch.length >= BATCH_SIZE) {
      if (!DRY_RUN) {
        await upsertBatch(batch);
        await insertTimeline(pg, timelineRows);
        timelineRows.length = 0;
      }
      batch = [];
    }
  } catch (err) {
    errors++;
    if (errors <= 5) console.error(`\n[ingest-grpo] error on row ${embedded + skipped}: ${err.message}`);
  }

  progress.tick();
}

// flush remaining
if (batch.length > 0 && !DRY_RUN) {
  await upsertBatch(batch);
  await insertTimeline(pg, timelineRows);
}

progress.done();

if (pg) await pg.end().catch(() => {});

console.log(`
Summary:
  total rows:  ${total}
  embedded:    ${embedded}  → ${COLLECTION}
  skipped:     ${skipped}   (empty text)
  errors:      ${errors}
  dry_run:     ${DRY_RUN}
`);

if (embedded > 0 && !DRY_RUN) {
  console.log('Next steps:');
  console.log(`  # Check synthesis_memory_768 count`);
  console.log(`  curl -s ${QDRANT_URL}/collections/${COLLECTION} | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).result?.vectors_count,'points')"`);
  console.log(`  # Verify context_timeline inserts`);
  console.log(`  psql "$DATABASE_URL" -c "SELECT count(*) FROM context_timeline WHERE event_type='grpo_thinking'"`);
}
