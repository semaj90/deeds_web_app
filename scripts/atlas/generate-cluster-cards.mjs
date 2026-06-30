#!/usr/bin/env node
/**
 * generate-cluster-cards.mjs
 *
 * Idempotent cluster-cards.jsonl generator.
 * Reads from Qdrant codebase_chunks_768 collection, generates canonical cluster cards,
 * writes to sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl.
 *
 * Usage:
 *   node scripts/atlas/generate-cluster-cards.mjs          # Generate (apply)
 *   node scripts/atlas/generate-cluster-cards.mjs --dry-run # Dry-run (preview)
 *
 * Output: sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl
 * Schema: sveltekit-frontend/docs/cluster-cards.schema.json
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const MEMORY_DIR = resolve(ROOT, 'sveltekit-frontend/memory/cluster-cards');
const OUTPUT_PATH = resolve(MEMORY_DIR, 'cluster-cards.jsonl');
const DRY_RUN = process.argv.includes('--dry-run');
const QUIET = process.argv.includes('--quiet');

const log = (...a) => !QUIET && console.log(...a);
const warn = (...a) => console.warn(...a);
const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

// ── Qdrant client ──────────────────────────────────────────────────────────

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const DIM = 768;

async function fetchQdrantPoints(limit = 1000) {
  const points = [];
  let offset = null;

  while (true) {
    const body = {
      limit: 250,
      with_payload: ['file_path', 'source_ref', 'feature_id', 'feature_label', 'som_cluster', 'som_row', 'som_col'],
      with_vector: true,
      ...(offset ? { offset } : {})
    };

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      warn(`${c.r('✗')} Qdrant scroll failed: HTTP ${res.status}`);
      break;
    }

    const data = await res.json();
    const pts = data.result?.points ?? [];
    points.push(...pts);

    offset = data.result?.next_page_offset;
    if (!offset || pts.length === 0 || points.length >= limit) break;
  }

  return points.slice(0, limit);
}

// ── Cluster card generator ─────────────────────────────────────────────────

function generateClusterCards(points) {
  const cards = {};

  for (const pt of points) {
    const clusterId = pt.payload?.som_cluster ?? `unknown_${pt.id}`;
    if (!cards[clusterId]) {
      // Extract vector from Qdrant response (either raw array or nested .content)
      const vecData = pt.vector?.content ?? pt.vector ?? [];
      cards[clusterId] = {
        id: clusterId,
        cluster_label: `Cluster ${clusterId}`,
        centroid_vector: Array.isArray(vecData) ? vecData.slice(0, DIM) : [],
        centroid_dim: DIM,
        member_count: 0,
        member_ids: [],
        som_row: pt.payload?.som_row ?? null,
        som_col: pt.payload?.som_col ?? null,
        features: new Set(),
        files: new Set(),
        created_at: new Date().toISOString(),
      };
    }

    const card = cards[clusterId];
    card.member_count += 1;
    card.member_ids.push(pt.id);
    if (pt.payload?.feature_label) card.features.add(pt.payload.feature_label);
    if (pt.payload?.file_path) card.files.add(pt.payload.file_path);
  }

  // Freeze Sets → Arrays for JSONL serialization
  return Object.entries(cards).map(([id, card]) => ({
    id,
    cluster_label: card.cluster_label,
    centroid_vector: card.centroid_vector,
    centroid_dim: card.centroid_dim,
    member_count: card.member_count,
    member_ids: card.member_ids,
    som_row: card.som_row,
    som_col: card.som_col,
    features: Array.from(card.features),
    files: Array.from(card.files),
    created_at: card.created_at,
  }));
}

// ── Main ───────────────────────────────────────────────────────────────────

log(`${c.b('📊 Cluster Cards Generator')}`);
log(`   DRY_RUN: ${DRY_RUN}`);
log(`   QDRANT_URL: ${QDRANT_URL}`);
log(`   OUTPUT: ${OUTPUT_PATH}`);

try {
  log(`\n${c.b('Step 1')} — Fetch Qdrant points`);
  const points = await fetchQdrantPoints(1000);
  log(`  ${c.g('✓')} Fetched ${points.length} points`);

  log(`\n${c.b('Step 2')} — Generate cluster cards`);
  const cards = generateClusterCards(points);
  log(`  ${c.g('✓')} Generated ${cards.length} cluster cards`);

  if (!DRY_RUN) {
    log(`\n${c.b('Step 3')} — Write NDJSON`);
    mkdirSync(MEMORY_DIR, { recursive: true });

    const ndjson = cards.map((card) => JSON.stringify(card)).join('\n') + '\n';
    writeFileSync(OUTPUT_PATH, ndjson, 'utf8');
    log(`  ${c.g('✓')} Wrote to ${OUTPUT_PATH}`);
    log(`  ${c.g('✓')} ${(ndjson.length / 1024).toFixed(1)} KB`);
  } else {
    log(`\n${c.y('⚠')} DRY-RUN: Skipping write to ${OUTPUT_PATH}`);
    if (cards.length > 0) {
      log(`  Preview: ${JSON.stringify(cards[0]).slice(0, 100)}...`);
    }
  }

  log(`\n${c.g('✓')} Complete`);
  process.exit(0);
} catch (err) {
  warn(`${c.r('✗')} Error: ${err.message}`);
  process.exit(1);
}
