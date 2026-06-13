#!/usr/bin/env node
/**
 * write-graph-refresh-manifest.mjs
 *
 * Creates memory/exports/graph-refresh-manifest.json with a real shape.
 * Reads node/edge counts from existing graph export files if available;
 * writes a valid stub with status "ok" when no graph data is present.
 *
 * Safe on Windows — no /dev/stdin, no destructive ops.
 *
 * Modes:
 *   node write-graph-refresh-manifest.mjs              # regenerate (default)
 *   node write-graph-refresh-manifest.mjs --invalidate [--reason "..."]
 *   node write-graph-refresh-manifest.mjs --promote [--force]
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import Redis from 'ioredis';

const root = process.cwd();

const EXPORT_DIR    = path.join(root, 'memory', 'exports');
const MANIFEST_PATH = path.join(EXPORT_DIR, 'graph-refresh-manifest.json');

// Candidate graph source files — checked in priority order
const GRAPH_SOURCES = [
  path.join(root, 'docs', 'graph', 'codebase-graph.json'),
  path.join(root, 'memory', 'graphify', 'deep', 'deep-import-graph.json'),
];

const CLUSTER_CARDS_PATH  = path.join(EXPORT_DIR, 'cluster-cards.jsonl');
const PATHWAY_CARDS_PATH  = path.join(EXPORT_DIR, 'pathway-cards.jsonl');
const DOMAIN_TOPOLOGY_TMP = path.join(root, '.tmp', 'domain-topology.json');

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const REDIS_HOST     = process.env.REDIS_HOST     || '127.0.0.1';
const REDIS_PORT     = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';

// Redis key written on invalidation so graphify:daily can skip-or-force
const REDIS_INVALIDATED_KEY = 'atlas:graph:manifest:invalidated';
const REDIS_INVALIDATED_TTL = 86400; // 24 h

// ── Promotion gate thresholds ─────────────────────────────────────────────────
const PK_GATE  = 0.95; // packet_key coverage required
const FID_GATE = 0.80; // feature_id coverage required

// ── CLI flags ─────────────────────────────────────────────────────────────────
const ARGS          = process.argv.slice(2);
const MODE_INVALIDATE = ARGS.includes('--invalidate');
const MODE_PROMOTE    = ARGS.includes('--promote');
const FORCE           = ARGS.includes('--force');
const REASON_IDX      = ARGS.indexOf('--reason');
const REASON          = REASON_IDX >= 0 ? ARGS[REASON_IDX + 1] : 'manual';

// ── Redis helper (fail-open) ──────────────────────────────────────────────────
function makeRedis() {
  return new Redis({
    host:               REDIS_HOST,
    port:               REDIS_PORT,
    password:           REDIS_PASSWORD,
    lazyConnect:        true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy:      () => null,
  });
}

async function trySetRedisInvalidated(redis) {
  try {
    await redis.connect();
    await redis.set(REDIS_INVALIDATED_KEY, '1', 'EX', REDIS_INVALIDATED_TTL);
    console.log(`  [redis] set ${REDIS_INVALIDATED_KEY} (TTL ${REDIS_INVALIDATED_TTL}s)`);
    return true;
  } catch {
    console.warn('  [redis] unavailable — skipping invalidation key');
    return false;
  } finally {
    await redis.quit().catch(() => {});
  }
}

async function tryClearRedisInvalidated(redis) {
  try {
    await redis.connect();
    await redis.del(REDIS_INVALIDATED_KEY);
    console.log(`  [redis] cleared ${REDIS_INVALIDATED_KEY}`);
  } catch {
    console.warn('  [redis] unavailable — could not clear invalidation key');
  } finally {
    await redis.quit().catch(() => {});
  }
}

// ── Manifest I/O ──────────────────────────────────────────────────────────────
function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeManifest(obj) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

// ── Invalidate mode ───────────────────────────────────────────────────────────
/**
 * invalidateGraphManifest(reason)
 * - Reads current manifest
 * - Stamps invalidated_at + invalidation_reason
 * - Writes back
 * - Sets Redis sentinel key atlas:graph:manifest:invalidated (TTL 24h)
 *
 * Called from:
 *   - classify-domain-ontology.mjs --apply (end of script)
 *   - train-xgboost-reranker.py gate-pass path (via node sentinel)
 *   - npm run atlas:graph:invalidate
 */
async function invalidateGraphManifest(reason) {
  const now = new Date().toISOString();
  const manifest = readManifest() || {};

  manifest.invalidated_at       = now;
  manifest.invalidation_reason  = reason;
  // Remove any previous promotion stamp — a new graphify run must re-promote
  delete manifest.promoted_at;
  if (manifest.promotionState === 'promoted') {
    manifest.promotionState = 'generated';
  }

  writeManifest(manifest);
  console.log(`[write-graph-refresh-manifest] invalidated at ${now}`);
  console.log(`  reason: ${reason}`);

  const redis = makeRedis();
  await trySetRedisInvalidated(redis);
}

// ── Promote mode ──────────────────────────────────────────────────────────────
async function promoteGraphManifest(force) {
  const atlasGate = await checkAtlasPromotionGate();
  const pkOk  = atlasGate.packetKeyCoverage >= PK_GATE;
  const fidOk = atlasGate.featureIdCoverage >= FID_GATE;
  const gatePass = pkOk && fidOk;

  console.log('[write-graph-refresh-manifest] promotion gate check:');
  console.log(`  ${pkOk  ? 'PASS' : 'FAIL'} packet_key  coverage: ${(atlasGate.packetKeyCoverage*100).toFixed(1)}% (gate >= ${PK_GATE*100}%)`);
  console.log(`  ${fidOk ? 'PASS' : 'FAIL'} feature_id  coverage: ${(atlasGate.featureIdCoverage*100).toFixed(1)}% (gate >= ${FID_GATE*100}%)`);

  if (!gatePass && !force) {
    console.error('\n  GATE FAIL — promotion blocked. Use --force to override.');
    process.exit(1);
  }
  if (!gatePass && force) {
    console.warn('\n  GATE FAIL — overridden with --force.');
  }

  const manifest = readManifest() || {};
  const now = new Date().toISOString();

  manifest.promotionState   = 'promoted';
  manifest.promoted_at      = now;
  manifest.atlasGate        = atlasGate;
  manifest.promotion_forced = !gatePass && force ? true : undefined;
  // Clear any pending invalidation
  delete manifest.invalidated_at;
  delete manifest.invalidation_reason;

  writeManifest(manifest);
  console.log(`\n  PROMOTED at ${now}`);

  // Clear Redis invalidated sentinel on promotion
  const redis = makeRedis();
  await tryClearRedisInvalidated(redis);
}

// ── Helpers for regenerate mode ───────────────────────────────────────────────
function countJsonlLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return 0;
  return text.split(/\r?\n/).filter(Boolean).length;
}

function tryReadGraph() {
  for (const src of GRAPH_SOURCES) {
    if (!fs.existsSync(src)) continue;
    try {
      const obj = JSON.parse(fs.readFileSync(src, 'utf8'));
      const nodes = Array.isArray(obj.nodes)    ? obj.nodes.length
        : Array.isArray(obj.vertices) ? obj.vertices.length
        : 0;
      const edges = Array.isArray(obj.edges) ? obj.edges.length
        : Array.isArray(obj.links)  ? obj.links.length
        : 0;
      return { nodes, edges, source: path.relative(root, src).replace(/\\/g, '/') };
    } catch {
      // continue to next candidate
    }
  }
  return null;
}

function buildExportsList() {
  const exports = [];
  for (const p of [CLUSTER_CARDS_PATH, PATHWAY_CARDS_PATH]) {
    if (fs.existsSync(p)) {
      exports.push({
        file: path.relative(root, p).replace(/\\/g, '/'),
        rows: countJsonlLines(p),
      });
    }
  }
  if (fs.existsSync(EXPORT_DIR)) {
    const entries = fs.readdirSync(EXPORT_DIR);
    for (const e of entries) {
      if (e === 'graph-refresh-manifest.json') continue;
      if (e.endsWith('.json') || e.endsWith('.jsonl')) {
        const rel = `memory/exports/${e}`;
        if (!exports.find((x) => x.file === rel)) {
          const p = path.join(EXPORT_DIR, e);
          let rows = undefined;
          try {
            if (e.endsWith('.jsonl')) rows = countJsonlLines(p);
            else if (e.endsWith('.json')) {
              const raw = fs.readFileSync(p, 'utf8').trim();
              if (raw) {
                const obj = JSON.parse(raw);
                if (Array.isArray(obj)) rows = obj.length;
                else rows = 1;
              } else rows = 0;
            }
          } catch {}
          const item = { file: rel };
          if (typeof rows === 'number') item.rows = rows;
          exports.push(item);
        }
      }
    }
  }
  return exports;
}

async function checkAtlasPromotionGate() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                                                        AS total,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL)                                  AS has_ref,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND packet_key IS NOT NULL)       AS has_packet_key,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND feature_id IS NOT NULL)       AS has_feature_id,
        COUNT(*) FILTER (WHERE community_confidence >= 0.65)                            AS has_confidence
      FROM atlas_packets
    `);
    const r = rows[0];
    const total   = Number(r.total);
    const withRef = Number(r.has_ref);
    const pkPct   = withRef > 0 ? Number(r.has_packet_key)  / withRef : 0;
    const fidPct  = withRef > 0 ? Number(r.has_feature_id)  / withRef : 0;
    return {
      total,
      withSourceRef:       withRef,
      packetKeyCoverage:   pkPct,
      featureIdCoverage:   fidPct,
      highConfidenceCount: Number(r.has_confidence),
      gateThresholds:      { packetKey: PK_GATE, featureId: FID_GATE },
      promoted:            withRef > 0 && pkPct >= PK_GATE && fidPct >= FID_GATE,
    };
  } catch {
    return { total: 0, promoted: false, error: 'db_unavailable' };
  } finally {
    await pool.end();
  }
}

// ── Regenerate mode (default) ─────────────────────────────────────────────────
async function regenerate() {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const graphData   = tryReadGraph();
  const exports     = buildExportsList();
  const exportCount = exports.reduce((s, e) => s + (e.rows || 0), 0);

  let domains = [];
  if (fs.existsSync(DOMAIN_TOPOLOGY_TMP)) {
    try {
      const dt = JSON.parse(fs.readFileSync(DOMAIN_TOPOLOGY_TMP, 'utf8'));
      if (dt && typeof dt === 'object') {
        if (Array.isArray(dt.domains))
          domains = dt.domains.map((d) => (d.name || d.id || d));
        else if (dt.domains && typeof dt.domains === 'object')
          domains = Object.keys(dt.domains);
      }
    } catch {}
  }

  const atlasGate     = await checkAtlasPromotionGate();
  const promotionState = atlasGate.promoted ? 'promoted' : (graphData ? 'generated' : 'stub');

  const manifest = {
    generatedAt:    new Date().toISOString(),
    nodeCount:      graphData ? graphData.nodes : 0,
    edgeCount:      graphData ? graphData.edges : 0,
    exportCount,
    exports,
    domains,
    producer:       'graph-refresh',
    source:         graphData ? graphData.source : 'graph-refresh',
    status:         'ok',
    promotionState,
    atlasGate,
    generator:      'scripts/atlas/write-graph-refresh-manifest.mjs',
    notes: atlasGate.promoted
      ? `Atlas truth promoted: ${atlasGate.total} packets, pk=${(atlasGate.packetKeyCoverage*100).toFixed(1)}%, fid=${(atlasGate.featureIdCoverage*100).toFixed(1)}%`
      : graphData
        ? `Read from ${graphData.source}`
        : 'No graph source files found. Run npm run graph:exports to populate with real data.',
  };

  writeManifest(manifest);
  console.log('[write-graph-refresh-manifest] wrote:', path.relative(root, MANIFEST_PATH));
  console.log(`  nodeCount: ${manifest.nodeCount}, edgeCount: ${manifest.edgeCount}, status: ${manifest.status}`);
  console.log(`  promotionState: ${promotionState} (atlasPackets=${atlasGate.total}, pkCov=${(atlasGate.packetKeyCoverage*100||0).toFixed(1)}%, fidCov=${(atlasGate.featureIdCoverage*100||0).toFixed(1)}%)`);
  if (!graphData) {
    console.log('  No graph source files found — stub written. Run: npm run graph:exports');
  }

  // If regenerating after an invalidation, set the Redis key so graphify knows to re-run
  if (!atlasGate.promoted) {
    const redis = makeRedis();
    await trySetRedisInvalidated(redis);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  if (MODE_INVALIDATE) {
    await invalidateGraphManifest(REASON);
  } else if (MODE_PROMOTE) {
    await promoteGraphManifest(FORCE);
  } else {
    await regenerate();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
