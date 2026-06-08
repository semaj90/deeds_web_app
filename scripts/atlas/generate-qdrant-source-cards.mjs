#!/usr/bin/env node
/**
 * generate-qdrant-source-cards.mjs — Phase 3 prerequisite
 *
 * Creates neschrom97/cards/{id}.json entries for every file_path in
 * codebase_chunks_768 that has a som_cluster assignment, using the
 * T0 deterministic summary from Postgres file_summaries where available.
 *
 * Writes to neschrom97/cards/ (not .opencode/cards/) to avoid
 * overloading OpenCode context with 8k+ JSON files.
 *
 * Usage:
 *   node scripts/atlas/generate-qdrant-source-cards.mjs --dry-run
 *   node scripts/atlas/generate-qdrant-source-cards.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import { ROOT, CARDS_DIR as NESCHROM_CARDS_DIR, ensureDirs } from './_neschrom-paths.mjs';

dotenv.config({ path: path.join(ROOT, '.env'), override: false });

const argv = process.argv.slice(2);
const DRY_RUN = !argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

const CARDS_DIR   = NESCHROM_CARDS_DIR;
const QDRANT_URL  = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION  = 'codebase_chunks_768';
const SCROLL_LIMIT = 500;

function cardId(filePath) {
  return crypto.createHash('sha256').update(`qdrant:${filePath}`).digest('hex').slice(0, 16);
}

async function scrollQdrantClusters() {
  const map = new Map(); // file_path → {som_cluster, gpuCluster}
  let offset = null;
  while (true) {
    const body = { limit: SCROLL_LIMIT, with_payload: ['file_path','som_cluster','gpuCluster','summary','tags'], with_vector: false };
    if (offset) body.offset = offset;
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Qdrant scroll ${res.status}`);
    const data = await res.json();
    for (const pt of data.result?.points ?? []) {
      const fp = pt.payload?.file_path;
      if (!fp) continue;
      const sc = pt.payload?.som_cluster;
      const gc = pt.payload?.gpuCluster;
      if (sc == null && gc == null) continue;
      const existing = map.get(fp);
      if (!existing || (sc != null && gc != null)) {
        map.set(fp, { som_cluster: sc ?? null, gpuCluster: gc ?? null, summary: pt.payload?.summary ?? '', tags: pt.payload?.tags ?? [] });
      }
    }
    offset = data.result?.next_page_offset;
    if (!offset || (data.result?.points ?? []).length === 0) break;
  }
  return map;
}

async function loadFileSummaries(db) {
  try {
    const res = await db.query(`
      SELECT stable_key, summary_t0, exports, imports, route_type
      FROM file_summaries
      LIMIT 50000
    `);
    const m = new Map();
    for (const r of res.rows) m.set(r.stable_key, r);
    return m;
  } catch {
    return new Map();
  }
}

async function main() {
  console.log('\n── Generate Qdrant Source Cards ─────────────────────────');
  console.log(`  mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

  // Load existing card IDs to skip
  const existingIds = new Set(
    fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => f.replace('.json', ''))
  );
  console.log(`  Existing cards: ${existingIds.size}`);

  // Scroll Qdrant for clustered file paths
  process.stdout.write('  Scrolling Qdrant for clustered paths...');
  const qdrantMap = await scrollQdrantClusters();
  process.stdout.write(` ${qdrantMap.size} paths\n`);

  // Load Postgres file summaries
  let summaryMap = new Map();
  try {
    const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    summaryMap = await loadFileSummaries(db);
    await db.end();
    console.log(`  Postgres file_summaries: ${summaryMap.size} rows`);
  } catch (e) {
    console.log(`  Postgres unavailable (${e.message.slice(0, 40)}) — using Qdrant payloads only`);
  }

  let created = 0, skipped = 0;
  ensureDirs();

  for (const [filePath, cluster] of qdrantMap) {
    const id = cardId(filePath);
    if (existingIds.has(id)) { skipped++; continue; }

    // Build summary from Postgres T0 if available, else use Qdrant payload
    const pgRow = summaryMap.get(filePath) ?? summaryMap.get(`sveltekit-frontend/${filePath}`);
    const summary = pgRow?.summary_t0 || cluster.summary || '';
    const tags = cluster.tags?.length ? cluster.tags : [filePath.split('/').pop()?.split('.').pop() ?? 'unknown'];

    const card = {
      id,
      source: `sveltekit-frontend/${filePath}`,
      title: path.basename(filePath),
      text: summary,
      summary,
      tags,
      som_cluster: cluster.som_cluster,
      gpuCluster: cluster.gpuCluster,
      generated_by: 'generate-qdrant-source-cards',
      generated_at: new Date().toISOString(),
    };

    if (!DRY_RUN) {
      fs.writeFileSync(path.join(CARDS_DIR, `${id}.json`), JSON.stringify(card, null, 2), 'utf8');
    }
    if (VERBOSE) console.log(`  [new] ${id} → ${filePath} cluster=${cluster.som_cluster}`);
    created++;
  }

  console.log(`\n── Results ─────────────────────────────────────────────`);
  console.log(`  Qdrant clustered paths: ${qdrantMap.size}`);
  console.log(`  Already had cards:      ${skipped}`);
  console.log(`  New cards created:      ${created}${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`  Total after run:        ${existingIds.size + (DRY_RUN ? 0 : created)}`);

  if (DRY_RUN) {
    console.log('\n  Run with --apply to write cards.');
  } else {
    console.log('\n  ✅ Done → re-run Phase 3 attribution for 70%+ match rate');
  }
}

main().catch(err => {
  console.error('\n❌', err.message);
  process.exit(1);
});