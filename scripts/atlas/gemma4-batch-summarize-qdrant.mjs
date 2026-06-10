#!/usr/bin/env node
/**
 * gemma4-batch-summarize-qdrant.mjs
 *
 * Closes the full indexing loop:
 *   Qdrant codebase_chunks_768 (dense hits)
 *   → group by source_ref
 *   → Gemma4 summary via llama-server :8090 (stream:true, think:false)
 *   → write summary back to Qdrant payload (tags field extended)
 *   → upsert nes_chrom_packets (packet_key, summary, payload JSONB)
 *   → update atlas_feature_map.packet_id
 *
 * Usage:
 *   node scripts/atlas/gemma4-batch-summarize-qdrant.mjs
 *   node scripts/atlas/gemma4-batch-summarize-qdrant.mjs --limit=50
 *   node scripts/atlas/gemma4-batch-summarize-qdrant.mjs --dry-run
 *   node scripts/atlas/gemma4-batch-summarize-qdrant.mjs --only-missing
 *   node scripts/atlas/gemma4-batch-summarize-qdrant.mjs --source-ref=src/routes/api/auth/register/+server.ts
 *
 * Gemma4 rules (hard):
 *   llama-server :8090 → stream:true (thinking block drains first; content follows)
 *   Ollama :11434      → stream:false + think:false (fallback)
 *   batch=1 (sequential) — Gemma4 cannot serve parallel completions
 *   timeout 90s per call
 */

import fs   from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildPacketKey, sha8, slug } from './packet-materializer-lib.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv         = process.argv.slice(2);
const DRY_RUN      = argv.includes('--dry-run');
const ONLY_MISSING = argv.includes('--only-missing');
const VERBOSE      = argv.includes('--verbose');
const limitArg     = argv.find(a => a.startsWith('--limit='));
const sourceArg    = argv.find(a => a.startsWith('--source-ref='));
const LIMIT        = limitArg  ? parseInt(limitArg.split('=')[1])  : null;
const ONLY_REF     = sourceArg ? sourceArg.split('=').slice(1).join('=') : null;

// ── Env ───────────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
  return env;
}
const ENV = loadEnv();

const QDRANT_URL    = ENV.QDRANT_URL    ?? 'http://127.0.0.1:6333';
const COLLECTION    = 'codebase_chunks_768';
const LLAMA_URL     = (ENV.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const OLLAMA_URL    = (ENV.OLLAMA_HOST ?? 'http://127.0.0.1:11434')
                        .replace(/^0\.0\.0\.0/, '127.0.0.1')
                        .replace(/^(?!http)/, 'http://');
const MODEL         = ENV.LLAMA_MODEL ?? 'gemma4-legal-iq4xs-direct.gguf';
const OLLAMA_MODEL  = ENV.GEMMA4_OLLAMA_MODEL ?? 'gemma4-rotorquant:latest';
const DB_URL        = ENV.DATABASE_URL
  ?? `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;

const BATCH_QDRANT  = 250;
const BATCH_WRITE   = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeRef(raw) {
  return String(raw ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^sveltekit-frontend\//, '');
}

// ── Gemma4 summary via llama-server (stream:true per hard rules) ──────────────
async function summarizeViaLlamaServer(text, sourceRef) {
  const prompt =
    `You are a TypeScript/SvelteKit code analyst. In 2-3 sentences, describe what ` +
    `this file does, its primary exports, and any key error patterns it handles.\n\n` +
    `File: ${sourceRef}\n\n` +
    `---\n${text.slice(0, 3000)}\n---\n\nSummary:`;

  const res = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      MODEL,
      messages:   [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.2,
      stream:     true,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`llama-server ${res.status}`);

  let assembled = '';
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') break;
      try {
        const parsed = JSON.parse(payload);
        assembled += parsed.choices?.[0]?.delta?.content ?? '';
      } catch { /* skip malformed */ }
    }
  }
  return assembled.trim();
}

async function summarizeViaOllama(text, sourceRef) {
  const prompt =
    `You are a TypeScript/SvelteKit code analyst. In 2-3 sentences, describe what ` +
    `this file does, its primary exports, and any key error patterns it handles.\n\n` +
    `File: ${sourceRef}\n\n---\n${text.slice(0, 3000)}\n---\n\nSummary:`;

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:   OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream:  false,
      think:   false,
      options: { temperature: 0.2, num_predict: 200 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return (data.message?.content ?? '').trim();
}

async function callGemma4(text, sourceRef) {
  // Try llama-server first (preferred — stream:true avoids thinking-block token starvation)
  try {
    const summary = await summarizeViaLlamaServer(text, sourceRef);
    if (summary) return { summary, backend: 'llama-server' };
  } catch (e) {
    if (VERBOSE) console.warn(`  [llama-server fallback] ${e.message}`);
  }
  // Fallback: Ollama think:false
  const summary = await summarizeViaOllama(text, sourceRef);
  return { summary, backend: 'ollama' };
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────
async function scrollQdrant(offset) {
  const body = { limit: BATCH_QDRANT, with_payload: true, with_vector: false };
  if (offset) body.offset = offset;
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Qdrant scroll ${res.status}`);
  return res.json();
}

async function patchQdrantPayload(pointId, patch) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload?wait=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: patch, points: [pointId] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Qdrant payload patch ${res.status}`);
}

// ── Postgres helpers ──────────────────────────────────────────────────────────
async function upsertPacket(pool, { sourceRef, featureId, summary, payload }) {
  // Use deterministic packet_key (same as materializer)
  const packetKey = buildPacketKey(sourceRef, featureId);
  const queryHash = sha8(`gemma4:${sourceRef}`);

  // Enrich existing packet with summary (look up by packet_key which already exists from materializer)
  await pool.query(
    `INSERT INTO nes_chrom_packets
       (packet_key, query_hash, chunk_id, source_ref, source_refs, feature_id,
        packet_type, lane, model, summary, payload, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6,
             'nes_chrom', 'gemma4_summary', $7, $8, $9::jsonb, NOW(), NOW())
     ON CONFLICT (packet_key) DO UPDATE SET
       summary    = EXCLUDED.summary,
       payload    = nes_chrom_packets.payload || EXCLUDED.payload,
       updated_at = NOW()`,
    [
      packetKey,
      queryHash,
      sha8(sourceRef),
      sourceRef,
      JSON.stringify([sourceRef]),
      featureId ?? `feat:${slug(sourceRef)}`,
      'gemma4-batch-summarize-qdrant.mjs',
      summary,
      JSON.stringify(payload),
    ]
  );
  return packetKey;
}

async function updateAtlasFeatureMap(pool, sourceRef, packetKey) {
  await pool.query(
    `UPDATE atlas_feature_map SET packet_id = $1, indexed_at = NOW()
     WHERE source_ref = $2 OR source_ref = $3`,
    [packetKey, sourceRef, `sveltekit-frontend/${sourceRef}`]
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[gemma4-batch-summarize] Starting (dry_run=${DRY_RUN} only_missing=${ONLY_MISSING} limit=${LIMIT ?? 'all'})`);

  const pool = new pg.Pool({ connectionString: DB_URL, max: 3 });

  // Pass 1: scroll Qdrant, group chunks by source_ref
  const fileMap = new Map(); // sourceRef → { text, featureId, pointIds }
  let offset = null;
  let scanned = 0;

  // Probe Qdrant availability before entering the scroll loop
  try {
    const probe = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(3_000) });
    if (!probe.ok && probe.status !== 200) throw new Error(`status ${probe.status}`);
  } catch (e) {
    console.error(`[gemma4-batch-summarize] Qdrant unreachable at ${QDRANT_URL} — is Docker running?`);
    console.error(`  (${e.message})`);
    await pool.end();
    process.exit(1);
  }

  process.stdout.write('Pass 1: scrolling Qdrant...\n');
  while (true) {
    const data = await scrollQdrant(offset);
    const points = data?.result?.points ?? [];
    if (!points.length) break;

    for (const point of points) {
      scanned++;
      const p = point.payload ?? {};
      const sourceRef = normalizeRef(p.source_ref ?? p.source_path ?? '');
      if (!sourceRef) continue;
      if (ONLY_REF && sourceRef !== ONLY_REF) continue;

      // Skip vendor noise
      if (/^(node_modules|\.svelte-kit|dist|build|\.vite|models\/|granite-docling|turbovec)/.test(sourceRef)) continue;

      if (!fileMap.has(sourceRef)) {
        fileMap.set(sourceRef, { text: '', featureId: null, pointIds: [] });
      }
      const entry = fileMap.get(sourceRef);
      if (p.text && entry.text.length < 4000) entry.text += (entry.text ? '\n\n' : '') + p.text;
      if (!entry.featureId && p.feature_id) entry.featureId = p.feature_id;
      entry.pointIds.push(String(point.id));
    }

    if (scanned % 5000 === 0) process.stdout.write(`  scanned ${scanned}\n`);
    const next = data?.result?.next_page_offset;
    if (next === null || next === undefined) break;
    if (LIMIT && scanned >= LIMIT * 10) break;
    offset = next;
  }
  console.log(`Pass 1: scanned ${scanned} points → ${fileMap.size} unique source_refs`);

  // Pass 2: filter to only those needing summaries
  let candidates = [...fileMap.entries()];
  if (ONLY_MISSING) {
    // Check which source_refs already have a packet
    const refs = candidates.map(([ref]) => ref);
    const rows = await pool.query(
      `SELECT source_ref FROM nes_chrom_packets WHERE source_ref = ANY($1)`,
      [refs]
    ).catch(() => ({ rows: [] }));
    const already = new Set(rows.rows.map(r => r.source_ref));
    candidates = candidates.filter(([ref]) => !already.has(ref));
    console.log(`Pass 2: ${candidates.length} source_refs missing summaries`);
  }

  if (LIMIT) candidates = candidates.slice(0, LIMIT);

  if (candidates.length === 0) {
    console.log('Nothing to summarize.');
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would summarize ${candidates.length} source_refs:`);
    for (const [ref] of candidates.slice(0, 10)) console.log(`  ${ref}`);
    await pool.end();
    return;
  }

  // Pass 3: Gemma4 summarization loop
  let done = 0;
  let errors = 0;

  for (const [sourceRef, entry] of candidates) {
    if (!entry.text) { errors++; continue; }
    process.stdout.write(`\r[${done + 1}/${candidates.length}] ${sourceRef.slice(-60).padEnd(60)}`);

    try {
      const queryHash = sha8(`gemma4-summary:${sourceRef}`);
      const { summary, backend } = await callGemma4(entry.text, sourceRef);
      if (!summary) { errors++; continue; }

      if (VERBOSE) console.log(`\n  [${backend}] ${summary.slice(0, 80)}...`);

      const summaryTags = summary
        .toLowerCase()
        .match(/\b(?:auth|register|login|session|drizzle|insert|unique|constraint|form|action|route|api|error|validator|schema)\b/g)
        ?? [];
      const deduped = [...new Set(summaryTags)].slice(0, 8);

      const packetPayload = {
        source_ref:   sourceRef,
        feature_id:   entry.featureId,
        summary,
        tags:         deduped,
        indexed_at:   new Date().toISOString(),
        backend,
      };

      // Write packet to Postgres
      const packetKey = await upsertPacket(pool, {
        sourceRef,
        featureId:  entry.featureId,
        summary,
        payload:    packetPayload,
        queryHash,
      });

      // Patch Qdrant payload on all chunks for this source_ref
      for (const pointId of entry.pointIds.slice(0, BATCH_WRITE)) {
        await patchQdrantPayload(pointId, {
          gemma4_summary: summary.slice(0, 500),
          summary_tags:   deduped,
          packet_id:      packetKey,
          feature_id:     entry.featureId,
          summarized_at:  new Date().toISOString(),
        }).catch(() => {}); // non-fatal
      }

      // Update atlas_feature_map
      await updateAtlasFeatureMap(pool, sourceRef, packetKey).catch(() => {});

      done++;
    } catch (err) {
      if (VERBOSE) console.warn(`\n  [error] ${sourceRef}: ${err.message}`);
      errors++;
    }
  }

  await pool.end();

  console.log(`\n[gemma4-batch-summarize] done=${done} errors=${errors} / ${candidates.length} total`);
  console.log(`  Qdrant payload updated: gemma4_summary, summary_tags, packet_id`);
  console.log(`  Postgres: nes_chrom_packets upserted, atlas_feature_map.packet_id updated`);
}

main().catch(err => {
  console.error('[gemma4-batch-summarize] Fatal:', err);
  process.exit(1);
});
