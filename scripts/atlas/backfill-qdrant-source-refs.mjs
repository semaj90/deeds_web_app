#!/usr/bin/env node
/**
 * backfill-qdrant-source-refs.mjs
 *
 * Map/Reduce repair lane: Postgres codebase_chunk_index → Qdrant payload backfill.
 *
 * Problem:
 *   - Some Qdrant points missing sourceRef / relative_path payload
 *   - Some points have stale cluster IDs (e.g., 65, 76, 93) from old indexing runs
 *   - Postgres codebase_chunk_index is the truth table
 *   - Qdrant codebase_chunks_768 is the fast search cave — needs correct labels
 *
 * What it does (4-phase Map/Reduce pipeline):
 *
 *   Phase 1 — MAP
 *     Scan Postgres codebase_chunk_index
 *     Emit canonical records keyed by relative_path
 *
 *   Phase 2 — REDUCE
 *     Group duplicates by relative_path / content_hash
 *     Choose newest / highest-quality record per path
 *     Attach gpu_cluster, som_cluster, tags, semantic_tags
 *
 *   Phase 3 — BACKFILL QDRANT
 *     For each canonical record:
 *       Scroll Qdrant to find matching points (by sourceRef OR chunk_id)
 *       Upsert payload: sourceRef, gpu_cluster, som_cluster, content_hash, tags, token_count
 *
 *   Phase 4 — AUDIT REPORT
 *     Write .tmp/backfill-qdrant-source-refs-{date}.json with:
 *       fixed, skipped, missing_qdrant_id, duplicate_paths, stale_clusters
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-source-refs.mjs           # dry-run
 *   node scripts/atlas/backfill-qdrant-source-refs.mjs --commit  # writes to Qdrant
 *   node scripts/atlas/backfill-qdrant-source-refs.mjs --limit 500
 *   node scripts/atlas/backfill-qdrant-source-refs.mjs --collection codebase_chunks_768
 *   node scripts/atlas/backfill-qdrant-source-refs.mjs --scan-only  # Phase 4 only (audit without fixing)
 *
 * Env:
 *   QDRANT_URL    default http://localhost:6333
 *   DATABASE_URL  Postgres connection string
 */

import pg            from 'pg';
import dotenv        from 'dotenv';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');
dotenv.config({ path: resolve(ROOT, '.env') });

// ── CLI ───────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const getFlag  = (name) => {
  const eq  = args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
  if (eq) return eq;
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : null;
};

const DRY_RUN    = !args.includes('--commit');
const SCAN_ONLY  = args.includes('--scan-only');
const VERBOSE    = args.includes('--verbose');
const LIMIT      = parseInt(getFlag('limit') ?? '2000', 10);
const COLLECTION = getFlag('collection') ?? 'codebase_chunks_768';
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/$/, '');
const DB_URL     = process.env.DATABASE_URL;
const TODAY      = new Date().toISOString().slice(0, 10);
const TMP_DIR    = resolve(ROOT, '.tmp');
const REPORT_OUT = resolve(TMP_DIR, `backfill-qdrant-source-refs-${TODAY}.json`);
const BATCH_SIZE = 100;   // Qdrant scroll page size
const PG_BATCH   = 500;   // Postgres page size

// ── Qdrant helpers ────────────────────────────────────────────────────
async function qdrantPost(path, body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function qdrantScrollAll(collection, filter = null) {
  const points = [];
  let offset = null;
  while (true) {
    const body = { limit: BATCH_SIZE, with_payload: true, with_vector: false };
    if (filter) body.filter = filter;
    if (offset) body.offset = offset;
    const res = await qdrantPost(`/collections/${collection}/points/scroll`, body);
    const batch = res.result?.points ?? [];
    points.push(...batch);
    offset = res.result?.next_page_offset ?? null;
    if (!offset || batch.length === 0) break;
  }
  return points;
}

async function qdrantSetPayload(collection, pointIds, payload) {
  if (DRY_RUN) return;
  await qdrantPost(`/collections/${collection}/points/payload?wait=true`, {
    payload,
    points: pointIds,
  });
}

// ── Phase 1: Map — scan Postgres ──────────────────────────────────────
async function mapPostgres(client) {
  console.log('\n[Phase 1] MAP — scanning Postgres codebase_chunk_index...');

  // Check what columns actually exist (schema may vary by DB)
  const colCheck = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'codebase_chunk_index' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  const cols = new Set(colCheck.rows.map(r => r.column_name));

  if (cols.size === 0) {
    console.warn('  ⚠  codebase_chunk_index table not found — skipping Postgres phase.');
    return [];
  }

  const available = (name) => cols.has(name);
  const selectCols = [
    'id',
    available('relative_path') ? 'relative_path' : available('file_path') ? 'file_path AS relative_path' : null,
    available('qdrant_id')     ? 'qdrant_id'     : null,
    available('chunk_id')      ? 'chunk_id'      : null,
    available('content_hash')  ? 'content_hash'  : null,
    available('gpu_cluster')   ? 'gpu_cluster'   : available('neo4j_gpu_cluster') ? 'neo4j_gpu_cluster AS gpu_cluster' : null,
    available('som_cluster')   ? 'som_cluster'   : null,
    available('semantic_tags') ? 'semantic_tags' : null,
    available('token_count')   ? 'token_count'   : null,
    available('domain')        ? 'domain'        : null,
    available('language')      ? 'language'      : null,
    available('updated_at')    ? 'updated_at'    : available('indexed_at') ? 'indexed_at AS updated_at' : null,
  ].filter(Boolean).join(', ');

  console.log(`  Columns available: ${[...cols].join(', ')}`);

  const whereClause = available('file_path')
    ? 'WHERE relative_path IS NOT NULL OR file_path IS NOT NULL'
    : 'WHERE relative_path IS NOT NULL';

  const { rows } = await client.query(`
    SELECT ${selectCols}
    FROM codebase_chunk_index
    ${whereClause}
    ORDER BY updated_at DESC NULLS LAST
    LIMIT $1
  `, [LIMIT]);

  console.log(`  Fetched ${rows.length} rows from Postgres`);
  return rows;
}

// ── Phase 2: Reduce — deduplicate by path ─────────────────────────────
function reduceCanonical(rows) {
  console.log('\n[Phase 2] REDUCE — deduplicating by relative_path...');

  const byPath = new Map();
  const duplicatePaths = [];

  for (const row of rows) {
    const path = row.relative_path ?? row.file_path ?? null;
    if (!path) continue;

    // Normalise: strip leading ./ or /
    const normPath = path.replace(/^\.?\//, '').replace(/\\/g, '/');

    if (byPath.has(normPath)) {
      duplicatePaths.push(normPath);
      // Keep the one with a qdrant_id or chunk_id (more complete)
      const existing = byPath.get(normPath);
      const betterNew = (row.qdrant_id || row.chunk_id) && !(existing.qdrant_id || existing.chunk_id);
      if (betterNew) byPath.set(normPath, { ...row, relative_path: normPath });
    } else {
      byPath.set(normPath, { ...row, relative_path: normPath });
    }
  }

  const canonical = [...byPath.values()];
  console.log(`  ${canonical.length} canonical paths (${duplicatePaths.length} duplicates resolved)`);
  return { canonical, duplicatePaths: [...new Set(duplicatePaths)] };
}

// ── Phase 3: Backfill Qdrant ──────────────────────────────────────────
async function backfillQdrant(canonical) {
  console.log(`\n[Phase 3] BACKFILL — patching Qdrant collection '${COLLECTION}'...`);
  if (DRY_RUN) console.log('  [DRY RUN — no writes]\n');

  // Check collection exists
  try {
    const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`Collection ${COLLECTION} not found (${r.status})`);
  } catch (e) {
    console.error(`  Qdrant not reachable or collection missing: ${e.message}`);
    if (!DRY_RUN) throw e;
    console.log('  (dry-run: continuing without Qdrant)\n');
    return { fixed: 0, skipped: 0, missingQdrantId: canonical.length, staleClusterIds: [] };
  }

  let fixed = 0;
  let skipped = 0;
  const missingQdrantId = [];
  const staleClusterIds = [];
  const KNOWN_CLUSTER_RANGE = { min: 0, max: 50 }; // clusters 0-50 are from current kmeans(k=20-50)

  for (const row of canonical) {
    const sourcePath = row.relative_path;

    // Detect stale cluster IDs (>50 = old indexing run artefacts)
    const gpuCluster = parseInt(row.gpu_cluster ?? '-1', 10);
    if (!isNaN(gpuCluster) && gpuCluster > KNOWN_CLUSTER_RANGE.max) {
      staleClusterIds.push({ path: sourcePath, cluster: gpuCluster });
    }

    // Strategy 1: find by qdrant_id or chunk_id stored in Postgres
    const directId = row.qdrant_id ?? row.chunk_id ?? null;

    let pointIds = [];

    if (directId) {
      // Verify point exists in Qdrant
      try {
        const res = await qdrantPost(`/collections/${COLLECTION}/points`, { ids: [directId] });
        const pts = res.result ?? [];
        if (pts.length > 0) pointIds = [directId];
      } catch { /* point not found — fall through to scroll strategy */ }
    }

    if (pointIds.length === 0) {
      // Strategy 2: scroll by sourceRef / relativePath payload match
      try {
        const filter = {
          should: [
            { key: 'sourceRef',    match: { value: sourcePath } },
            { key: 'relativePath', match: { value: sourcePath } },
          ],
        };
        const pts = await qdrantPost(`/collections/${COLLECTION}/points/scroll`, {
          limit: 50, with_payload: false, with_vector: false, filter,
        });
        pointIds = (pts.result?.points ?? []).map(p => p.id);
      } catch { /* scroll failed */ }
    }

    if (pointIds.length === 0) {
      missingQdrantId.push(sourcePath);
      if (VERBOSE) console.log(`  MISS: ${sourcePath}`);
      continue;
    }

    // Build payload patch
    const payload = {
      sourceRef: sourcePath,
      relativePath: sourcePath,
    };
    if (row.content_hash)  payload.content_hash  = row.content_hash;
    if (row.token_count)   payload.token_count   = row.token_count;
    if (row.domain)        payload.domain        = row.domain;
    if (row.language)      payload.language      = row.language;
    // Only write cluster IDs within known range (suppress stale values)
    if (!isNaN(gpuCluster) && gpuCluster >= 0 && gpuCluster <= KNOWN_CLUSTER_RANGE.max) {
      payload.gpu_cluster = gpuCluster;
    }
    if (row.som_cluster !== null && row.som_cluster !== undefined) {
      payload.som_cluster = row.som_cluster;
    }
    if (row.semantic_tags?.length) {
      payload.semantic_tags = row.semantic_tags;
    }

    try {
      await qdrantSetPayload(COLLECTION, pointIds, payload);
      fixed++;
      if (VERBOSE) console.log(`  FIX: ${sourcePath} → ${pointIds.length} point(s)`);
    } catch (err) {
      console.error(`  ERR: ${sourcePath} — ${err.message}`);
      skipped++;
    }
  }

  console.log(`  Fixed: ${fixed}  |  Skipped: ${skipped}  |  Missing Qdrant ID: ${missingQdrantId.length}`);
  return { fixed, skipped, missingQdrantId, staleClusterIds };
}

// ── Phase 3B: Direct-patch Qdrant points that have file_path but no sourceRef ──
// These are points from older indexing runs that set file_path but never set sourceRef.
// directory-cluster points (kind=directory-cluster) are skipped — they legitimately
// have no sourceRef.
async function patchFilepathPoints() {
  console.log('\n[Phase 3B] PATCH — points with file_path but no sourceRef...');
  if (DRY_RUN) console.log('  [DRY RUN — no writes]\n');

  let scrollOffset = null;
  let patched = 0;
  let skipped = 0;
  const SKIP_KINDS = new Set(['directory-cluster', 'dir-cluster', 'cluster-summary']);

  try {
    while (true) {
      const body = {
        limit: 200,
        with_payload: true,
        with_vector: false,
        filter: {
          must: [{ is_empty: { key: 'sourceRef' } }],
        },
      };
      if (scrollOffset) body.offset = scrollOffset;

      const res = await qdrantPost(`/collections/${COLLECTION}/points/scroll`, body);
      const pts = res.result?.points ?? [];
      if (pts.length === 0) break;

      const toFix = [];
      for (const pt of pts) {
        const p = pt.payload ?? {};
        const kind = p.kind ?? '';

        // Skip cluster-summary / directory nodes
        if (SKIP_KINDS.has(kind)) { skipped++; continue; }

        // Use file_path or relativePath as sourceRef
        const fp = p.file_path ?? p.relativePath ?? p.relative_path ?? null;
        if (!fp) { skipped++; continue; }

        toFix.push({ id: pt.id, sourceRef: fp });
      }

      // Batch patch
      for (const item of toFix) {
        try {
          if (!DRY_RUN) {
            await qdrantPost(`/collections/${COLLECTION}/points/payload?wait=true`, {
              payload: { sourceRef: item.sourceRef, relativePath: item.sourceRef },
              points: [item.id],
            });
          } else if (VERBOSE) {
            console.log(`  [dry] PATCH ${item.id} → sourceRef=${item.sourceRef.slice(-60)}`);
          }
          patched++;
        } catch (err) {
          console.error(`  ERR patch ${item.id}: ${err.message}`);
          skipped++;
        }
      }

      scrollOffset = res.result?.next_page_offset ?? null;
      if (!scrollOffset) break;
    }
  } catch (e) {
    console.warn(`  Phase 3B skipped (Qdrant unreachable): ${e.message}`);
    return { patched: 0, skipped: 0 };
  }

  console.log(`  Patched: ${patched}  |  Skipped (cluster/no-path): ${skipped}`);
  return { patched, skipped };
}

// ── Phase 4: Scan Qdrant for missing sourceRef (audit-only) ──────────
async function auditQdrantMissing() {
  console.log('\n[Phase 4] AUDIT — scanning Qdrant for points missing sourceRef...');
  try {
    const missingFilter = {
      must_not: [{ key: 'sourceRef', is_empty: false }],
    };
    const pts = await qdrantPost(`/collections/${COLLECTION}/points/scroll`, {
      limit: 500, with_payload: ['sourceRef', 'relativePath'], with_vector: false,
      filter: missingFilter,
    });
    const missing = (pts.result?.points ?? []);
    console.log(`  Points missing sourceRef: ${missing.length}`);
    return missing.map(p => ({ id: p.id, payload: p.payload }));
  } catch (e) {
    console.warn(`  Audit skipped (Qdrant unreachable): ${e.message}`);
    return [];
  }
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n[backfill-qdrant-source-refs] ${DRY_RUN ? 'DRY RUN' : 'COMMIT MODE'}`);
  console.log(`  Collection: ${COLLECTION}`);
  console.log(`  Qdrant:     ${QDRANT_URL}`);
  console.log(`  Limit:      ${LIMIT}`);
  if (SCAN_ONLY) console.log('  Mode:       scan-only (audit without fixing)\n');

  mkdirSync(TMP_DIR, { recursive: true });

  let pgRows = [];
  let canonical = [];
  let duplicatePaths = [];
  let backfillResult = { fixed: 0, skipped: 0, missingQdrantId: [], staleClusterIds: [] };
  let phase3bResult  = { patched: 0, skipped: 0 };
  let auditMissing = [];

  if (!SCAN_ONLY) {
    if (!DB_URL) {
      console.error('  DATABASE_URL not set — skipping Postgres phases.');
    } else {
      const pool = new pg.Pool({ connectionString: DB_URL });
      const client = await pool.connect();
      try {
        pgRows = await mapPostgres(client);
        ({ canonical, duplicatePaths } = reduceCanonical(pgRows));
      } finally {
        client.release();
        await pool.end();
      }

      if (canonical.length > 0) {
        backfillResult = await backfillQdrant(canonical);
      }
    }

    // Phase 3B: fix points that already have file_path but no sourceRef
    phase3bResult = await patchFilepathPoints();
  }

  auditMissing = await auditQdrantMissing();

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    scanOnly: SCAN_ONLY,
    collection: COLLECTION,
    postgres: {
      totalRows: pgRows.length,
      canonicalPaths: canonical.length,
      duplicatePaths: duplicatePaths.length,
      duplicatePathList: duplicatePaths.slice(0, 20),
    },
    qdrant: {
      fixed: backfillResult.fixed,
      skipped: backfillResult.skipped,
      missingQdrantId: backfillResult.missingQdrantId.length,
      missingQdrantIdSample: backfillResult.missingQdrantId.slice(0, 20),
      staleClusterCount: backfillResult.staleClusterIds.length,
      staleClusterSample: backfillResult.staleClusterIds.slice(0, 20),
      phase3b: phase3bResult,
    },
    audit: {
      pointsMissingSourceRef: auditMissing.length,
      sample: auditMissing.slice(0, 10).map(p => ({ id: p.id, payload: p.payload })),
    },
  };

  writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));

  console.log(`\n[backfill-qdrant-source-refs] Summary`);
  console.log(`  PG rows scanned:         ${pgRows.length}`);
  console.log(`  Canonical paths:         ${canonical.length}`);
  console.log(`  Duplicate paths:         ${duplicatePaths.length}`);
  console.log(`  Qdrant fixed:            ${backfillResult.fixed}`);
  console.log(`  Qdrant skipped/err:      ${backfillResult.skipped}`);
  console.log(`  Missing Qdrant pointer:  ${backfillResult.missingQdrantId.length}`);
  console.log(`  Stale cluster IDs:       ${backfillResult.staleClusterIds.length}`);
  console.log(`  Points missing sourceRef:${auditMissing.length}`);
  console.log(`  Report: ${REPORT_OUT}`);
  if (DRY_RUN && !SCAN_ONLY) console.log('\n  Re-run with --commit to write to Qdrant.');
}

main().catch(e => { console.error(e); process.exit(1); });
