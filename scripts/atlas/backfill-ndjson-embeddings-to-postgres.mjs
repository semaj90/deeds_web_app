#!/usr/bin/env node
/**
 * backfill-ndjson-embeddings-to-postgres.mjs
 *
 * Reads NES/CHROM cluster summaries (.opencode/ndjson/cluster-summary.ndjson)
 * and enriched candidates (.opencode/ndjson/enriched-candidates.ndjson),
 * embeds each packet's text via Ollama /api/embeddings, then UPSERTs into
 * nes_chrom_packets (filling in the currently-NULL embedding column).
 *
 * This makes the HNSW index on nes_chrom_packets searchable and unblocks
 * Postgres-side ANN retrieval as a Qdrant fallback lane.
 *
 * Usage:
 *   node scripts/atlas/backfill-ndjson-embeddings-to-postgres.mjs [--dry-run] [--limit N] [--verbose]
 *
 * Flags:
 *   --dry-run    Embed + print but don't write to DB
 *   --limit N    Process at most N clusters (default: all)
 *   --verbose    Print per-row details
 *   --skip-embedded  Skip rows that already have a non-NULL embedding
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const argv        = process.argv.slice(2);
const DRY_RUN     = argv.includes('--dry-run');
const VERBOSE     = argv.includes('--verbose');
const SKIP_EXIST  = argv.includes('--skip-embedded');
const LIMIT_IDX   = argv.indexOf('--limit');
const LIMIT       = LIMIT_IDX >= 0 ? parseInt(argv[LIMIT_IDX + 1], 10) || Infinity : Infinity;

// ── Paths ────────────────────────────────────────────────────────────────────
const OPENCODE_NDJSON = path.join(ROOT, '.opencode', 'ndjson');
const CLUSTER_FILE    = path.join(OPENCODE_NDJSON, 'cluster-summary.ndjson');
const CANDIDATE_FILE  = path.join(OPENCODE_NDJSON, 'enriched-candidates.ndjson');

// ── Env loader ───────────────────────────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
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

const env     = loadEnv();
const DB_URL  = env.DATABASE_URL
  ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? 'legal_password'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5432'}/${env.DB_NAME ?? 'legal_ai_db'}`;

const OLLAMA_RAW = (env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = OLLAMA_RAW.startsWith('http') ? OLLAMA_RAW : `http://${OLLAMA_RAW}:11434`;
const EMBED_MODEL = env.EMBED_MODEL ?? 'embeddinggemma:latest';

// ── Helpers ──────────────────────────────────────────────────────────────────
function readNdjson(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function sha8(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 8);
}

// ── Ollama embed (single string) ─────────────────────────────────────────────
async function embed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`);
  const data = await res.json();
  const vec = data.embedding;
  if (!Array.isArray(vec) || vec.length !== 768) {
    throw new Error(`Unexpected embedding dim: ${vec?.length}`);
  }
  return vec;
}

// ── Build text to embed from a cluster summary ────────────────────────────────
function clusterToText(c) {
  const parts = [];
  if (c.cluster_key)      parts.push(`Cluster: ${c.cluster_key}`);
  if (c.top_keywords?.length) parts.push(`Keywords: ${c.top_keywords.slice(0, 8).join(', ')}`);
  if (c.top_tags?.length)     parts.push(`Tags: ${c.top_tags.slice(0, 6).join(', ')}`);
  if (c.feature_ids?.length)  parts.push(`Features: ${c.feature_ids.slice(0, 5).join(', ')}`);
  if (c.lane_ids?.length)     parts.push(`Lanes: ${c.lane_ids.slice(0, 4).join(', ')}`);
  if (c.prompt_context)       parts.push(c.prompt_context.slice(0, 500));
  if (c.summary)              parts.push(c.summary.slice(0, 300));
  return parts.join('. ').trim() || `NES cluster ${c.cluster_key ?? 'unknown'}`;
}

// ── Build packet rows from cluster summaries ──────────────────────────────────
function buildClusterRows(clusters) {
  return clusters.map(c => {
    const clusterKey = c.cluster_key ?? `${c.som_row ?? 0}:${c.som_col ?? 0}`;
    const packetKey  = `nes:cluster:${clusterKey}`;
    const queryHash  = sha8(packetKey);
    const chunkId    = `cluster-${clusterKey}`;
    const featureId  = (c.feature_ids?.[0]) ?? 'feature.nes_cluster';
    const sourceRef  = `nes:cluster:${clusterKey}`;
    const text       = clusterToText(c);
    return {
      packetKey,
      queryHash,
      chunkId,
      sourceRef,
      sourceRefs:  JSON.stringify(c.card_sample?.map(id => `nes:card:${id}`) ?? []),
      featureId,
      lane:        c.lane_ids?.[0] ?? 'semantic_packet',
      summary:     (c.prompt_context ?? c.summary ?? '').slice(0, 1000),
      payload:     JSON.stringify({
        cluster_key:   clusterKey,
        som_row:       c.som_row,
        som_col:       c.som_col,
        top_keywords:  c.top_keywords,
        top_tags:      c.top_tags,
        card_count:    c.card_count,
      }),
      text,
    };
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n── NDJSON Embedding Backfill → nes_chrom_packets ──\n');

  if (!fs.existsSync(CLUSTER_FILE)) {
    console.error(`  ERROR: ${CLUSTER_FILE} not found`);
    console.error(`  Run: node scripts/atlas/inject-ndjson-as-ace-packets.mjs --apply`);
    process.exit(1);
  }

  const clusters = readNdjson(CLUSTER_FILE);
  console.log(`  Cluster summaries loaded: ${clusters.length}`);

  const rows = buildClusterRows(clusters).slice(0, LIMIT);
  console.log(`  Rows to process: ${rows.length}`);

  if (DRY_RUN) {
    console.log(`  DRY-RUN — will embed but not write to DB`);
  }

  const pool = DRY_RUN ? null : new Pool({ connectionString: DB_URL, max: 3 });

  // Fetch already-embedded packet_keys to skip (unless --skip-embedded not set, then skip anyway)
  const alreadyEmbedded = new Set();
  if (!DRY_RUN && SKIP_EXIST && pool) {
    const res = await pool.query(
      `SELECT packet_key FROM nes_chrom_packets WHERE embedding IS NOT NULL`
    );
    for (const r of res.rows) alreadyEmbedded.add(r.packet_key);
    console.log(`  Already embedded: ${alreadyEmbedded.size} rows (will skip)`);
  }

  let inserted  = 0;
  let updated   = 0;
  let skipped   = 0;
  let errors    = 0;
  const BATCH   = 10; // embed + write in small batches to avoid OOM

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const embedResults = [];

    for (const row of batch) {
      if (alreadyEmbedded.has(row.packetKey)) {
        skipped++;
        embedResults.push(null);
        continue;
      }
      try {
        const vec = await embed(row.text);
        embedResults.push(vec);
        if (VERBOSE) console.log(`    [${i + embedResults.length}] ${row.packetKey} → ${vec.length}d`);
      } catch (err) {
        console.error(`    embed error for ${row.packetKey}: ${err.message}`);
        embedResults.push(null);
        errors++;
      }
    }

    if (DRY_RUN) {
      const ok = embedResults.filter(Boolean).length;
      console.log(`  batch ${Math.floor(i / BATCH) + 1}: ${ok}/${batch.length} embeddings OK (dry-run)`);
      continue;
    }

    // Write each row with embedding
    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const vec = embedResults[j];
      if (!vec) continue;

      // Format as pgvector literal: [0.1,0.2,...]
      const vecLiteral = `[${vec.join(',')}]`;

      try {
        const res = await pool.query(`
          INSERT INTO nes_chrom_packets
            (packet_key, query_hash, chunk_id, source_ref, source_refs,
             feature_id, lane, summary, payload, embedding)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10::vector)
          ON CONFLICT (packet_key) DO UPDATE SET
            embedding  = EXCLUDED.embedding,
            summary    = COALESCE(EXCLUDED.summary, nes_chrom_packets.summary),
            payload    = EXCLUDED.payload,
            updated_at = now()
          RETURNING (xmax = 0) AS inserted
        `, [
          row.packetKey,
          row.queryHash,
          row.chunkId,
          row.sourceRef,
          row.sourceRefs,
          row.featureId,
          row.lane,
          row.summary,
          row.payload,
          vecLiteral,
        ]);

        if (res.rows[0]?.inserted) inserted++;
        else updated++;
      } catch (err) {
        console.error(`    db error for ${row.packetKey}: ${err.message}`);
        errors++;
      }
    }

    const done = Math.min(i + BATCH, rows.length);
    process.stdout.write(`\r  Progress: ${done}/${rows.length} (ins=${inserted} upd=${updated} err=${errors})  `);
  }

  if (pool) await pool.end();

  console.log(`\n\n  Done — inserted: ${inserted}  updated: ${updated}  skipped: ${skipped}  errors: ${errors}`);
  if (errors > 0 && errors === rows.length) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
