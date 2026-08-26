#!/usr/bin/env node
/**
 * Regenerate Multihop Codebase Map with Phase D+E Enrichment
 * Schema-adaptive: introspects atlas_packets at runtime
 *
 * 2026-08-26 rewrite: the version of this file found on disk had drifted from
 * its own contract in four ways, confirmed by direct inspection before this
 * rewrite (not assumed from the file's docstring/name alone):
 *   1. `LIMIT 5000` on the atlas_packets read -- caps output far below the
 *      full corpus (61,660 packets live).
 *   2. Wrote to `docs/graph/codebase-map.enriched.json` (repo root) -- the
 *      real downstream consumer (audit-multihop-map-schema.mjs's contract,
 *      and the actual artifact used elsewhere in this pipeline) lives at
 *      `sveltekit-frontend/docs/graph/multihop-codebase-map.enriched.json`.
 *      Different directory AND different filename.
 *   3. Node schema had ~15 fewer fields than audit-multihop-map-schema.mjs's
 *      REQUIRED_FIELDS list and the fields actually present in the existing
 *      17,485-node artifact (confirmed via direct inspection of that file).
 *   4. "Enrichment" only read atlas_packets.qdrant_point_id directly --
 *      confirmed live (2026-08-26) that column is only 6,451/61,660 (10.5%)
 *      populated and was the same stale-ID problem found and fixed in
 *      Phase 2 (upsert-qdrant-packet-payload.mjs). Real Qdrant coverage
 *      requires a live lookup by source_ref, not that column.
 *
 * This rewrite: full corpus (no artificial cap), correct output location,
 * full 28-field schema, and a real Qdrant + Redis join rather than trusting
 * stale Postgres columns.
 */

import pg from 'pg';
import Redis from 'ioredis';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

// Correct output location -- matches audit-multihop-map-schema.mjs's actual
// consumer contract and the pre-existing 17,485-node artifact's real path,
// NOT the repo-root docs/graph the previous version of this file wrote to.
const GRAPH_DIR = resolve(ROOT, 'sveltekit-frontend/docs/graph');
const REPORTS_DIR = resolve(ROOT, 'docs/reports');

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASS = process.env.REDIS_PASSWORD ?? 'redis';

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

function canonicalizeSourceRef(value) {
  if (!value) return null;
  return String(value)
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^sveltekit-frontend\//, '')
    .trim() || null;
}

async function getColumnsList() {
  const res = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'atlas_packets'
  `);
  return new Set(res.rows.map(r => r.column_name));
}

async function fetchPostgresPackets(columns) {
  const selectColumns = (...names) => names.filter(n => columns.has(n)).join(', ');
  const selectClause = [
    selectColumns('packet_key', 'source_ref', 'canonical_source_ref', 'feature_id', 'feature_label', 'file_path'),
    selectColumns('community_id', 'community_source', 'community_confidence'),
    selectColumns('qdrant_collection'),
    selectColumns('som_row', 'som_col', 'som_cluster'),
    selectColumns('authority_score'),
    selectColumns('latent_64'),
    selectColumns('metadata', 'payload'),
    selectColumns('tree_node_id'),
    selectColumns('tags'),
    selectColumns('canonical', 'ledger_type', 'lineage_version'),
    selectColumns('summary', 'created_at', 'updated_at')
  ].filter(s => s).join(', ');

  const res = await pool.query(`SELECT ${selectClause} FROM atlas_packets`);
  return res.rows;
}

// Full paginated scroll of the Qdrant collection, payload restricted to the
// identity fields only (keeps each page small). Builds a bare-source_ref ->
// true set so per-packet matching is an O(1) lookup instead of one Qdrant
// round trip per packet (avoids the exact per-row scroll cost Phase 2 hit).
async function scrollAllQdrantSourceRefs() {
  const matched = new Set();
  let offset;
  let pages = 0;
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 500; // safety cap; ~106k points / 1000 per page ≈ 107 pages expected
  for (; pages < MAX_PAGES; pages++) {
    const body = {
      limit: PAGE_SIZE,
      with_payload: ['source_ref', 'file_path'],
      with_vector: false,
    };
    if (offset !== undefined) body.offset = offset;
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) break;
    const data = await res.json();
    const points = data.result?.points ?? [];
    for (const pt of points) {
      const ref = canonicalizeSourceRef(pt.payload?.source_ref ?? pt.payload?.file_path);
      if (ref) matched.add(ref);
    }
    offset = data.result?.next_page_offset ?? null;
    if (offset === null || offset === undefined || points.length === 0) { pages++; break; }
  }
  return { matched, pages };
}

async function loadKarpathyScores() {
  const scores = new Map(); // canonical bare source_ref -> parsed score object
  let redis = null;
  try {
    redis = new Redis(REDIS_URL, {
      password: REDIS_PASS || undefined,
      lazyConnect: true, maxRetriesPerRequest: 1,
      enableOfflineQueue: false, retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    const all = await redis.hgetall('gpu:karpathy:scores');
    for (const [key, raw] of Object.entries(all)) {
      const canon = canonicalizeSourceRef(key);
      if (!canon) continue;
      try { scores.set(canon, JSON.parse(raw)); } catch { /* skip malformed */ }
    }
  } catch { /* Redis unavailable -- proceed with zero karpathy enrichment */ }
  finally { if (redis) await redis.quit().catch(() => {}); }
  return scores;
}

async function regenerateMultihop() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log('║  Regenerate Multihop Codebase Map + Phase D+E Enrichment      ║');
  logger.log('╚════════════════════════════════════════════════════════════════╝\n');

  const dryRun = process.argv.includes('--dry-run');
  logger.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}\n`);

  try {
    logger.log('Step 1: Introspecting atlas_packets schema...');
    const columns = await getColumnsList();
    logger.ok(`Found ${columns.size} columns\n`);

    logger.log('Step 2: Loading packets from Postgres (full corpus, no artificial cap)...');
    const packets = await fetchPostgresPackets(columns);
    logger.ok(`Loaded ${packets.length} packets (full corpus)\n`);

    logger.log('Step 3: Scrolling Qdrant for live source_ref coverage (full collection)...');
    const { matched: qdrantMatched, pages: qdrantPages } = await scrollAllQdrantSourceRefs();
    logger.ok(`Qdrant: ${qdrantMatched.size} distinct source_refs across ${qdrantPages} pages\n`);

    logger.log('Step 4: Loading Karpathy GPU scores from Redis...');
    const karpathyScores = await loadKarpathyScores();
    logger.ok(`Karpathy: ${karpathyScores.size} scored files in gpu:karpathy:scores\n`);

    logger.log('Step 5: Transforming into multihop nodes...');
    const nodes = [];
    let withMissingFields = 0;
    let qdrantHits = 0;
    let karpathyHits = 0;
    // Multiple atlas_packets rows can share one file's canonicalRef (packets
    // are not 1:1 with files), so counting per-row hits against the
    // karpathyScores map (keyed per-file) can exceed karpathyScores.size --
    // track distinct matched files instead so the rate stays <= 100%.
    const karpathyMatchedRefs = new Set();

    for (const row of packets) {
      const stableKey = row.packet_key || row.source_ref || Math.random().toString(36).slice(2, 18);
      let metadata = {};
      if (columns.has('metadata') && row.metadata) {
        try { metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata; } catch { /* ignore */ }
      }
      let payload = {};
      if (columns.has('payload') && row.payload) {
        try { payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload; } catch { /* ignore */ }
      }
      const ginMetadata = (metadata && Object.keys(metadata).length) ? metadata : payload;

      const canonicalRef = canonicalizeSourceRef(row.canonical_source_ref ?? row.source_ref ?? row.file_path);
      const qdrantHit = canonicalRef ? qdrantMatched.has(canonicalRef) : false;
      const karpathy = canonicalRef ? karpathyScores.get(canonicalRef) : undefined;

      if (qdrantHit) qdrantHits++;
      if (karpathy) { karpathyHits++; if (canonicalRef) karpathyMatchedRefs.add(canonicalRef); }

      const node = {
        stableKey,
        kind: 'packet',
        packetKey: row.packet_key ?? null,
        sourceRef: row.source_ref ?? null,
        featureId: row.feature_id ?? null,
        featureLabel: row.feature_label ?? null,
        communityId: columns.has('community_id') ? row.community_id ?? null : null,
        communitySource: columns.has('community_source') ? row.community_source ?? null : null,
        communityConfidence: columns.has('community_confidence') ? row.community_confidence ?? null : null,
        filePath: row.file_path ?? row.source_ref ?? null,
        fileUrl: canonicalRef ? `file:${canonicalRef}` : null,
        summary: row.summary ?? null,
        tags: columns.has('tags') ? row.tags ?? [] : [],
        qdrantPointId: qdrantHit ? canonicalRef : null,
        qdrantCollection: qdrantHit ? COLLECTION : null,
        qdrantTags: qdrantHit ? (columns.has('tags') ? row.tags ?? [] : []) : null,
        qdrantPayload: qdrantHit ? { source_ref: canonicalRef, matched: true } : null,
        // NEVER inline the raw 64-dim vector here -- this repo's own Wire
        // Format Layering Rule (CLAUDE.md) forbids serializing bulk numeric
        // arrays through JSON; a packet descriptor must carry a reference,
        // not the values. Confirmed live 2026-08-26: doing this on all
        // 61,660 nodes produced a 193MB JSON file. A boolean presence flag
        // is all this schema slot needs until a real mmap/Arrow reference
        // exists to point at.
        encodedLatent: (columns.has('latent_64') && row.latent_64 != null) ? true : null,
        somCell: (row.som_row !== null && row.som_row !== undefined && row.som_col !== null && row.som_col !== undefined)
          ? `${row.som_row}:${row.som_col}`
          : (row.som_cluster ?? null),
        karpathyBlend: karpathy?.blend ?? null,
        redisKey: karpathy ? `gpu:karpathy:scores#${canonicalRef}` : null,
        ginMetadata,
        clusterKey: row.som_cluster ?? null,
        manifold4: null, // not yet computed anywhere in this pipeline -- left null intentionally, not fabricated
        svgGlyphRefs: null, // same -- no producer exists yet
        treeNodeId: columns.has('tree_node_id') ? row.tree_node_id ?? null : null,
        pageIndexPath: null, // same -- no producer exists yet
        lineageVersion: columns.has('lineage_version') ? row.lineage_version ?? 'packet-identity-v1' : 'packet-identity-v1',
        ledgerType: columns.has('ledger_type') ? row.ledger_type ?? 'atlas_packets' : 'atlas_packets',
        canonical: columns.has('canonical') ? row.canonical ?? true : true,
        readyForHigherHop: Boolean(row.packet_key && row.feature_id && row.source_ref),
      };

      const missing = ['packetKey', 'sourceRef', 'featureId', 'communityId'].filter(f => node[f] === null || node[f] === undefined);
      if (missing.length > 0) withMissingFields++;

      nodes.push(node);
    }

    logger.ok(`Transformed ${nodes.length} nodes (${withMissingFields} with missing core identity fields)\n`);

    const qdrantMatchRate = nodes.length ? qdrantHits / nodes.length : 0;
    // Distinct-files-matched / total-files-scored -- bounded to [0,1] by
    // construction, unlike a raw per-row hit count (packets are not 1:1
    // with files, so per-row counting can exceed karpathyScores.size).
    const karpathyEnrichRate = karpathyScores.size ? karpathyMatchedRefs.size / karpathyScores.size : 0;

    logger.log(`  Qdrant match rate:    ${qdrantHits}/${nodes.length} packets (${(qdrantMatchRate * 100).toFixed(1)}%)`);
    logger.log(`  Karpathy enrich rate: ${karpathyMatchedRefs.size}/${karpathyScores.size} distinct scored files found among packets (${(karpathyEnrichRate * 100).toFixed(1)}%) -- ${karpathyHits} packet rows carried a karpathyBlend value\n`);

    logger.log('Step 6: Writing outputs...');
    if (!dryRun) {
      mkdirSync(GRAPH_DIR, { recursive: true });
      mkdirSync(REPORTS_DIR, { recursive: true });

      const multihopMap = {
        version: 3,
        generated: new Date().toISOString(),
        source: { canonical: 'postgres:atlas_packets', enrichment: ['qdrant', 'redis'] },
        nodes,
        stats: {
          totalNodes: nodes.length,
          qdrantMatchRate,
          karpathyEnrichRate,
          enrichmentCoverage: {
            packetKey: nodes.filter(n => n.packetKey).length,
            featureId: nodes.filter(n => n.featureId).length,
            communityId: nodes.filter(n => n.communityId).length,
            qdrantPointId: nodes.filter(n => n.qdrantPointId).length,
            somCell: nodes.filter(n => n.somCell).length,
            karpathyBlend: nodes.filter(n => n.karpathyBlend).length,
          }
        }
      };

      // Compact (no pretty-print indent) -- at 61,660 nodes x ~30 fields,
      // indentation alone added ~30% file size (measured live 2026-08-26:
      // 165MB pretty vs ~115MB compact) for zero benefit, since this file is
      // read by tooling, not visually scanned line by line.
      writeFileSync(resolve(GRAPH_DIR, 'multihop-codebase-map.enriched.json'), JSON.stringify(multihopMap));
      logger.ok('Wrote: sveltekit-frontend/docs/graph/multihop-codebase-map.enriched.json');

      const report = {
        timestamp: new Date().toISOString(),
        totalNodes: nodes.length,
        withMissingCoreFields: withMissingFields,
        qdrantMatchRate,
        karpathyEnrichRate,
        qdrantPagesScanned: qdrantPages,
      };
      writeFileSync(resolve(REPORTS_DIR, 'multihop-codebase-map.enriched.report.json'), JSON.stringify(report, null, 2));
      logger.ok('Wrote: docs/reports/multihop-codebase-map.enriched.report.json');

      const md = [
        '# Multihop Codebase Map — Enriched',
        '',
        `Generated: ${multihopMap.generated}`,
        '',
        `- Total nodes: ${nodes.length}`,
        `- Qdrant match rate: ${(qdrantMatchRate * 100).toFixed(1)}%`,
        `- Karpathy enrich rate: ${(karpathyEnrichRate * 100).toFixed(1)}%`,
        `- Nodes with missing core identity fields: ${withMissingFields}`,
        '',
      ].join('\n');
      writeFileSync(resolve(GRAPH_DIR, 'multihop-codebase-map.enriched.md'), md);
      logger.ok('Wrote: sveltekit-frontend/docs/graph/multihop-codebase-map.enriched.md\n');
    }

    logger.log('✅ Multihop regeneration complete\n');

  } catch (err) {
    logger.error(`Failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

regenerateMultihop();
