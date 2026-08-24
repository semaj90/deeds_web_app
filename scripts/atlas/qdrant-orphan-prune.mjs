#!/usr/bin/env node
/**
 * Qdrant orphan point pruner
 *
 * Deletes Qdrant points in codebase_chunks_768 that have no Postgres counterpart:
 *   1. Points still missing packet_key after backfill (AGENTS.md, deleted files)
 *   2. Points whose source_ref has no matching row in codebase_chunk_index or atlas_packets
 *
 * Run after qdrant-packet-key-backfill.mjs to close count divergence.
 *
 * Usage:
 *   node scripts/atlas/qdrant-orphan-prune.mjs [--dry-run] [--verbose] [--limit N] [--json]
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, writeFileSync } from 'fs';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env') });
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = process.argv.includes('--json');
const ALLOW_DELETE_UNRESOLVED = process.argv.includes('--allow-delete-unresolved');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit=') || a === '--limit');
const LIMIT = LIMIT_ARG
  ? parseInt(LIMIT_ARG.includes('=') ? LIMIT_ARG.split('=')[1] : process.argv[process.argv.indexOf('--limit') + 1])
  : Infinity;

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BATCH_SIZE = 100;
const PG_BATCH = 1000;

const PG_CONFIG = {
  host: process.env.PGHOST || process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5434'),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'legal_ai_db',
  user: process.env.PGUSER || process.env.DB_USER || 'legal_admin',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'legal_password',
  connectionTimeoutMillis: 10000,
};

function log(...args) { if (VERBOSE) console.log(...args); }

function sourceExistsOnDisk(sourceRef) {
  const value = String(sourceRef ?? '').trim();
  if (!value || value.includes(':') && !/^[A-Za-z]:[\\/]/.test(value)) return false;
  return [
    resolve(REPO_ROOT, value),
    resolve(REPO_ROOT, 'sveltekit-frontend', value),
  ].some((candidate) => existsSync(candidate));
}

async function deleteQdrantPoints(pointIds) {
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: pointIds }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.result?.status === 'acknowledged';
}

async function scrollQdrantMissingPacketKey(callback) {
  let offset = null;
  let total = 0;

  while (true) {
    const body = {
      limit: BATCH_SIZE,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [{ is_empty: { key: 'packet_key' } }],
        must_not: [{ key: 'kind', match: { value: 'directory-cluster' } }],
      },
    };
    if (offset) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status}`);
    const data = await res.json();
    const points = data.result?.points ?? [];

    if (points.length === 0) break;
    await callback(points);
    total += points.length;

    if (total >= LIMIT) {
      console.log(`  Reached --limit=${LIMIT}, stopping`);
      break;
    }

    offset = data.result?.next_page_offset;
    if (!offset) break;
  }

  return total;
}

async function scrollQdrantAllCodePoints(callback) {
  let offset = null;
  let total = 0;

  while (true) {
    const body = {
      limit: BATCH_SIZE,
      with_payload: ['source_ref', 'packet_key', 'content_hash', 'canonical_id', 'projection_revision'],
      with_vector: false,
      filter: {
        must_not: [{ key: 'kind', match: { value: 'directory-cluster' } }],
      },
    };
    if (offset) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status}`);
    const data = await res.json();
    const points = data.result?.points ?? [];

    if (points.length === 0) break;
    await callback(points);
    total += points.length;

    if (total >= LIMIT) break;

    offset = data.result?.next_page_offset;
    if (!offset) break;
  }

  return total;
}

async function getPostgresSourceRefs(pool) {
  const refs = new Set();

  try {
    const r1 = await pool.query(`SELECT source_ref FROM codebase_chunk_index WHERE source_ref IS NOT NULL`);
    for (const row of r1.rows) refs.add(row.source_ref);
    log(`  Postgres codebase_chunk_index source_refs: ${refs.size}`);
  } catch (e) {
    log(`  codebase_chunk_index query failed: ${e.message}`);
  }

  try {
    const r2 = await pool.query(`
      SELECT source_ref AS ref FROM atlas_packets WHERE source_ref IS NOT NULL
      UNION
      SELECT canonical_source_ref AS ref FROM atlas_packets WHERE canonical_source_ref IS NOT NULL
    `);
    for (const row of r2.rows) refs.add(row.ref);
    log(`  Postgres combined source_refs: ${refs.size}`);
  } catch (e) {
    log(`  atlas_packets query failed: ${e.message}`);
  }

  return refs;
}

async function main() {
  const stats = {
    phase1_orphan_no_packet_key: { scanned: 0, recoverable_by_source_ref: 0, deleted: 0, errors: 0, ids: [] },
    phase2_stale_no_pg_match: { scanned: 0, recoverable_on_disk: 0, deleted: 0, errors: 0, source_refs_on_disk: 0, source_refs_missing_on_disk: 0, by_extension: {}, by_packet_prefix: {}, id_kinds: { numeric: 0, string: 0 }, samples: [], unresolved_candidates: [], ids: [] },
    total_deleted: 0,
  };

  console.log(`=== Qdrant orphan prune — ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ===`);
  console.log(`Collection: ${QDRANT_COLLECTION}`);
  if (!DRY_RUN && !ALLOW_DELETE_UNRESOLVED) {
    console.error('Refusing live deletion without --allow-delete-unresolved; run --dry-run first.');
    process.exit(2);
  }
  if (LIMIT !== Infinity) console.log(`Limit: ${LIMIT} points`);
  console.log('');

  const pool = new pg.Pool(PG_CONFIG);

  // A missing packet_key is recoverable when source_ref still resolves to
  // canonical Postgres data. Do not classify those points as deletable.
  console.log('[Identity] Loading Postgres source_refs before orphan classification...');
  const pgSourceRefs = await getPostgresSourceRefs(pool);
  console.log(`  Postgres has ${pgSourceRefs.size} distinct source_refs`);
  console.log('');

  // ── Phase 1: Delete points with no packet_key (AGENTS.md, deleted files) ──
  console.log('[Phase 1] Pruning points with no packet_key (post-backfill orphans)...');

  const phase1Ids = [];
  await scrollQdrantMissingPacketKey(async (points) => {
    for (const p of points) {
      const sourceRef = p.payload?.source_ref ?? p.payload?.relative_path;
      if (sourceRef && pgSourceRefs.has(sourceRef)) {
        stats.phase1_orphan_no_packet_key.recoverable_by_source_ref++;
        continue;
      }
      phase1Ids.push(p.id);
      log(`  Unresolved (no packet_key/source_ref match): id=${p.id} source_ref=${sourceRef ?? 'UNKNOWN'}`);
    }
  });
  stats.phase1_orphan_no_packet_key.scanned = phase1Ids.length;

  if (phase1Ids.length > 0) {
    if (!DRY_RUN) {
      // Delete in batches of 100
      for (let i = 0; i < phase1Ids.length; i += 100) {
        const batch = phase1Ids.slice(i, i + 100);
        try {
          await deleteQdrantPoints(batch);
          stats.phase1_orphan_no_packet_key.deleted += batch.length;
        } catch (e) {
          stats.phase1_orphan_no_packet_key.errors += batch.length;
          console.error(`  Error deleting batch: ${e.message}`);
        }
      }
    } else {
      stats.phase1_orphan_no_packet_key.deleted = phase1Ids.length;
      console.log(`  [dry-run] Would delete ${phase1Ids.length} points with no packet_key`);
    }
  }
  stats.phase1_orphan_no_packet_key.ids = phase1Ids.slice(0, 20);
  console.log(`  Phase 1: scanned=${stats.phase1_orphan_no_packet_key.scanned}, recoverable=${stats.phase1_orphan_no_packet_key.recoverable_by_source_ref}, deleted=${stats.phase1_orphan_no_packet_key.deleted}, errors=${stats.phase1_orphan_no_packet_key.errors}`);
  console.log('');

  // ── Phase 2: Find points with packet_key but no matching source_ref in Postgres ──
  console.log('[Phase 2] Scanning Qdrant for stale points (source_ref not in Postgres)...');

  const phase2Ids = [];
  let phase2Scanned = 0;

  await scrollQdrantAllCodePoints(async (points) => {
    for (const p of points) {
      phase2Scanned++;
      if (!p.payload?.packet_key) continue; // phase 1 owns unresolved no-key points
      const sourceRef = p.payload?.source_ref;
      if (!sourceRef) continue; // no source_ref — already handled by phase 1 or has packet_key from other means
      if (!pgSourceRefs.has(sourceRef)) {
        const onDisk = sourceExistsOnDisk(sourceRef);
        if (onDisk) stats.phase2_stale_no_pg_match.source_refs_on_disk++;
        else stats.phase2_stale_no_pg_match.source_refs_missing_on_disk++;
        if (stats.phase2_stale_no_pg_match.samples.length < 25) {
          stats.phase2_stale_no_pg_match.samples.push({
            id: p.id,
            source_ref: sourceRef,
            packet_key: p.payload?.packet_key ?? null,
            canonical_id: p.payload?.canonical_id ?? null,
            content_hash: p.payload?.content_hash ?? null,
            projection_revision: p.payload?.projection_revision ?? null,
            source_exists_on_disk: onDisk,
          });
        }
        if (onDisk) {
          stats.phase2_stale_no_pg_match.recoverable_on_disk++;
          continue;
        }
        phase2Ids.push(p.id);
        const extension = sourceRef.includes('.') ? sourceRef.split('.').pop().toLowerCase() : '(none)';
        const packetPrefix = String(p.payload?.packet_key ?? '(none)').split(':')[0];
        stats.phase2_stale_no_pg_match.by_extension[extension] = (stats.phase2_stale_no_pg_match.by_extension[extension] ?? 0) + 1;
        stats.phase2_stale_no_pg_match.by_packet_prefix[packetPrefix] = (stats.phase2_stale_no_pg_match.by_packet_prefix[packetPrefix] ?? 0) + 1;
        const idKind = typeof p.id === 'number' ? 'numeric' : 'string';
        stats.phase2_stale_no_pg_match.id_kinds[idKind]++;
        stats.phase2_stale_no_pg_match.unresolved_candidates.push({
          id: p.id,
          source_ref: sourceRef,
          packet_key: p.payload?.packet_key ?? null,
          canonical_id: p.payload?.canonical_id ?? null,
          content_hash: p.payload?.content_hash ?? null,
          projection_revision: p.payload?.projection_revision ?? null,
          source_exists_on_disk: false,
        });
        log(`  Stale (no PG match): id=${p.id} source_ref=${sourceRef}`);
      }
    }
  });
  stats.phase2_stale_no_pg_match.scanned = phase2Scanned;

  if (phase2Ids.length > 0) {
    if (!DRY_RUN) {
      for (let i = 0; i < phase2Ids.length; i += 100) {
        const batch = phase2Ids.slice(i, i + 100);
        try {
          await deleteQdrantPoints(batch);
          stats.phase2_stale_no_pg_match.deleted += batch.length;
          if ((i / 100) % 10 === 0) {
            console.log(`  Progress: ${stats.phase2_stale_no_pg_match.deleted}/${phase2Ids.length} deleted`);
          }
        } catch (e) {
          stats.phase2_stale_no_pg_match.errors += batch.length;
          console.error(`  Error deleting batch: ${e.message}`);
        }
      }
    } else {
      stats.phase2_stale_no_pg_match.deleted = phase2Ids.length;
      console.log(`  [dry-run] Would delete ${phase2Ids.length} stale points`);
    }
  }
  stats.phase2_stale_no_pg_match.ids = phase2Ids.slice(0, 20);
  console.log(`  Phase 2: scanned=${phase2Scanned}, stale=${phase2Ids.length}, deleted=${stats.phase2_stale_no_pg_match.deleted}, errors=${stats.phase2_stale_no_pg_match.errors}`);
  console.log('');

  await pool.end().catch(() => {});

  stats.total_deleted = stats.phase1_orphan_no_packet_key.deleted + stats.phase2_stale_no_pg_match.deleted;

  console.log('=== Results ===');
  console.log(`  Phase 1 (no packet_key): deleted ${stats.phase1_orphan_no_packet_key.deleted} of ${stats.phase1_orphan_no_packet_key.scanned}`);
  console.log(`  Phase 2 (stale/no PG):   deleted ${stats.phase2_stale_no_pg_match.deleted} of ${phase2Ids.length} stale (${phase2Scanned} total scanned)`);
  console.log(`  Total deleted:           ${stats.total_deleted}${DRY_RUN ? ' (dry-run, not applied)' : ''}`);

  if (JSON_OUT) {
    const outPath = join(dirname(fileURLToPath(import.meta.url)), '../../docs/reports/qdrant-orphan-prune.json');
    writeFileSync(outPath, JSON.stringify({ ...stats, run_at: new Date().toISOString(), dry_run: DRY_RUN }, null, 2));
    console.log(`\nJSON report: docs/reports/qdrant-orphan-prune.json`);
  }

  console.log(stats.phase1_orphan_no_packet_key.errors === 0 && stats.phase2_stale_no_pg_match.errors === 0
    ? '✅ Prune complete'
    : '⚠ Prune done with errors');

  process.exit((stats.phase1_orphan_no_packet_key.errors + stats.phase2_stale_no_pg_match.errors) > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(2);
});
