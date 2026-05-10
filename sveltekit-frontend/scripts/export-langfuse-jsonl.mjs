#!/usr/bin/env node
/**
 * export-langfuse-jsonl.mjs
 *
 * Exports Langfuse generations to a JSONL file keyed by chunk_id + timestamp_id.
 * Each line is one inference span suitable for lang-extract analysis,
 * autoencoder batch processing, or QLoRA dataset construction.
 *
 * Usage:
 *   node scripts/export-langfuse-jsonl.mjs
 *   node scripts/export-langfuse-jsonl.mjs --date 2026-05-10
 *   node scripts/export-langfuse-jsonl.mjs --date 2026-05-10 --output logs/langfuse/2026-05-10.jsonl
 *   node scripts/export-langfuse-jsonl.mjs --grpo-only --output logs/grpo/thinking.jsonl
 *
 * Output schema (one JSON per line):
 *   { timestamp, chunk_id, trace_id, name, model, input_tokens, output_tokens,
 *     latency_ms, grpo_reward, grpo_thinking, trust_tier, som_cluster, payload }
 */

import { createWriteStream, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.findIndex(a => a.startsWith(`--${name}=`) || a === `--${name}`);
  if (i === -1) return null;
  return args[i].includes('=') ? args[i].split('=').slice(1).join('=') : (args[i + 1] ?? null);
};

const dateFilter = getArg('date') ?? null;          // e.g. "2026-05-10"
const grpoOnly   = args.includes('--grpo-only');
const outputArg  = getArg('output');

const today = new Date().toISOString().slice(0, 10);
const outPath = outputArg
  ? resolve(process.cwd(), outputArg)
  : resolve(__dir, '../logs/langfuse', `${dateFilter ?? today}.jsonl`);

// ── Config ────────────────────────────────────────────────────────────────────

const LANGFUSE_BASE  = process.env.LANGFUSE_BASE_URL  ?? 'http://localhost:3030';
const LANGFUSE_SK    = process.env.LANGFUSE_SECRET_KEY ?? '';
const LANGFUSE_PK    = process.env.LANGFUSE_PUBLIC_KEY ?? '';
const PAGE_LIMIT     = 500;
const TIMEOUT_MS     = 15_000;

if (!LANGFUSE_SK) {
  console.warn('[export-langfuse] LANGFUSE_SECRET_KEY not set — will try unauthenticated');
}

const authHeader = LANGFUSE_SK
  ? 'Basic ' + Buffer.from(`${LANGFUSE_PK}:${LANGFUSE_SK}`).toString('base64')
  : undefined;

// ── Fetch generations ─────────────────────────────────────────────────────────

async function fetchPage(cursor) {
  const url = new URL('/api/public/generations', LANGFUSE_BASE);
  url.searchParams.set('limit', String(PAGE_LIMIT));
  if (cursor)       url.searchParams.set('cursor', cursor);
  if (dateFilter) {
    url.searchParams.set('fromTimestamp', `${dateFilter}T00:00:00Z`);
    url.searchParams.set('toTimestamp',   `${dateFilter}T23:59:59Z`);
  }

  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const res = await fetch(url.toString(), {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Langfuse API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Transform a generation to our JSONL schema ────────────────────────────────

function transform(gen) {
  const meta   = gen.metadata ?? {};
  const output = gen.output ?? {};

  return {
    timestamp:      gen.startTime ?? gen.createdAt,
    chunk_id:       meta.chunk_id   ?? gen.traceId?.replace(/^chunk_id:/, '') ?? null,
    trace_id:       gen.traceId     ?? null,
    name:           gen.name        ?? null,
    model:          gen.model       ?? null,
    input_tokens:   gen.promptTokens  ?? gen.usage?.input  ?? null,
    output_tokens:  gen.completionTokens ?? gen.usage?.output ?? null,
    latency_ms:     gen.latency      ?? null,
    grpo_reward:    meta.grpo_reward ?? null,
    grpo_thinking:  meta.grpo_thinking ?? null,
    trust_tier:     meta.trust_tier  ?? null,
    som_cluster:    meta.som_cluster ?? null,
    adapter:        meta.adapter     ?? null,
    input_preview:  Array.isArray(gen.input)
      ? gen.input.map(m => m.content ?? '').join(' ').slice(0, 200)
      : String(gen.input ?? '').slice(0, 200),
    output_preview: (output.text ?? output.content ?? String(output)).slice(0, 400),
  };
}

// ── Runner ────────────────────────────────────────────────────────────────────

mkdirSync(dirname(outPath), { recursive: true });
const out = createWriteStream(outPath, { flags: 'w', encoding: 'utf8' });

let cursor    = undefined;
let total     = 0;
let grpoCount = 0;

process.stdout.write(`[export-langfuse] target: ${outPath}\n`);
process.stdout.write(`[export-langfuse] filter: date=${dateFilter ?? 'all'} grpo-only=${grpoOnly}\n\n`);

try {
  while (true) {
    process.stdout.write(`\r  fetching page (cursor=${cursor ?? 'start'})...   `);

    const page = await fetchPage(cursor);
    const gens  = page.data ?? page.generations ?? page.items ?? [];
    if (!gens.length) break;

    for (const gen of gens) {
      const row = transform(gen);
      if (grpoOnly && !row.grpo_thinking) continue;
      out.write(JSON.stringify(row) + '\n');
      total++;
      if (row.grpo_thinking) grpoCount++;
    }

    cursor = page.meta?.nextCursor ?? page.nextCursor ?? null;
    if (!cursor) break;
  }
} catch (err) {
  console.error('\n[export-langfuse] fetch error:', err.message);
  if (err.message.includes('401') || err.message.includes('403')) {
    console.error('  Check LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY in .env');
  }
  process.exitCode = 1;
}

out.end(() => {
  process.stdout.write('\n');
  console.log(`✅ Exported ${total} generations (${grpoCount} with GRPO thinking)`);
  console.log(`   → ${outPath}`);
  if (total > 0) {
    console.log(`\nNext steps:`);
    console.log(`  node scripts/lang-extract.mjs ${outPath}          # keyword/API analysis`);
    console.log(`  node scripts/ingest-grpo-log.mjs ${outPath}       # → synthesis_memory_768`);
  }
});
