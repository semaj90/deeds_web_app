#!/usr/bin/env node
/**
 * gap_synth_003 backfill — patch cluster_key + agents_scope into codebase_chunks_768
 *
 * Reads:
 *   - Qdrant codebase_chunks_768 (scroll all points)
 *   - Postgres code_relations (HAS_AGENTS_SCOPE edges)
 *   - NES glyph architecture JSON for som_cluster → cluster_key mapping
 *
 * Writes:
 *   - Qdrant SetPayload: cluster_key, agents_scope, relation_types per point
 *
 * Usage:
 *   node scripts/wiki/backfill-qdrant-cluster-keys.mjs
 *   node scripts/wiki/backfill-qdrant-cluster-keys.mjs --dry-run
 *   node scripts/wiki/backfill-qdrant-cluster-keys.mjs --limit 500
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

dotenv.config({ path: resolve(ROOT, '.env') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE   = args.includes('--force');   // skip idempotency check — re-patch all points
const LIMIT_ARG = args.indexOf('--limit');
const LIMIT = LIMIT_ARG !== -1 ? parseInt(args[LIMIT_ARG + 1], 10) : Infinity;

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const BATCH = 100;

function log(...msg) { console.log(...msg); }

// ── Load NES glyph data for cluster_key lookup ────────────────────────────────
const NES_PATH = resolve(ROOT, 'docs/graph/nes-glyph-architecture.json');
let nesNodes = [];
if (existsSync(NES_PATH)) {
  try {
    const nes = JSON.parse(readFileSync(NES_PATH, 'utf8'));
    nesNodes = nes.nodes ?? [];
    log(`[nes] Loaded ${nesNodes.length} NES nodes`);
  } catch { log('[nes] Failed to parse nes-glyph-architecture.json'); }
} else {
  log('[nes] nes-glyph-architecture.json not found — cluster_key will use topo_class only');
}

// Build filePath → clusterKey map from NES
const fileClusterMap = new Map();
for (const node of nesNodes) {
  if (node.stableKey && node.clusterKey) {
    fileClusterMap.set(node.stableKey, node.clusterKey);
  }
  if (node.filePath && node.clusterKey) {
    fileClusterMap.set(node.filePath.replace(/\\/g, '/'), node.clusterKey);
  }
}
log(`[nes] ${fileClusterMap.size} file→clusterKey mappings`);

// ── Load code_relations from Postgres ────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { log('[error] DATABASE_URL not set'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

const agentsScopeMap = new Map(); // filePath → agentsMdPath
const relationTypesMap = new Map(); // filePath → Set<relationType>

log('[pg] Loading code_relations...');
const pgRes = await pool.query(
  `SELECT source_file, target_key, relation_type FROM code_relations WHERE relation_type != 'EXPORTS_SYMBOL'`
);
for (const row of pgRes.rows) {
  const fp = row.source_file?.replace(/\\/g, '/') ?? '';
  if (!fp) continue;
  if (row.relation_type === 'HAS_AGENTS_SCOPE') {
    agentsScopeMap.set(fp, row.target_key);
  } else {
    const types = relationTypesMap.get(fp) ?? new Set();
    types.add(row.relation_type);
    relationTypesMap.set(fp, types);
  }
}
await pool.end();
log(`[pg] ${agentsScopeMap.size} agents_scope mappings, ${relationTypesMap.size} files with relation_types`);

// ── Scroll Qdrant and patch payloads ─────────────────────────────────────────
let offset = null;
let totalPatched = 0;
let totalSkipped = 0;
let scrolled = 0;

log(`[qdrant] Scrolling ${COLLECTION}${DRY_RUN ? ' (dry-run)' : ''}...`);

outer: while (true) {
  const body = { limit: BATCH, with_payload: true, with_vector: false };
  if (offset !== null) body.offset = offset;

  const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!scrollRes.ok) {
    log(`[error] Scroll failed: ${scrollRes.status} ${await scrollRes.text()}`);
    break;
  }
  const scrollData = await scrollRes.json();
  const points = scrollData.result?.points ?? [];
  if (points.length === 0) break;

  offset = scrollData.result?.next_page_offset ?? null;

  // Build patches for this batch
  const patches = [];
  for (const pt of points) {
    if (scrolled >= LIMIT) break outer;
    scrolled++;

    const filePath = String(pt.payload?.file_path ?? pt.payload?.relativePath ?? '').replace(/\\/g, '/');
    const topoClass = String(pt.payload?.topo_class ?? '');
    const somCluster = pt.payload?.som_cluster ?? pt.payload?.somCluster;

    // Determine cluster_key. Convention is `<namespace>:<id>` where namespace ∈
    // {gpu, som, dir, topo}. SOM cluster IDs come from the GPU k-means pass and
    // MUST be serialized with the `gpu:` prefix because that's what MCP tool
    // clusters.get_members queries for. Previous logic preferred topo_class
    // over `gpu` whenever both were set, producing keys like `unclassified:0`,
    // `legal-evidence:2`, `server:92` — which the MCP tool can't find since it
    // only knows the `gpu:` namespace. topo_class is a separate dimension
    // already stored in its own payload field — don't conflate it with cluster_key.
    let clusterKey = fileClusterMap.get(filePath) ?? fileClusterMap.get(filePath.replace(/^src\//, ''));
    if (!clusterKey) {
      if (somCluster != null) {
        clusterKey = `gpu:${somCluster}`;
      } else if (topoClass) {
        clusterKey = `topo:${topoClass}`;
      } else {
        clusterKey = 'general';
      }
    }

    // code_relations stores paths relative to src/ (no "src/" prefix)
    const filePathNormalized = filePath.replace(/^src\//, '');
    const agentsScope = agentsScopeMap.get(filePathNormalized) ?? agentsScopeMap.get(filePath) ?? null;
    const relationTypes = filePath
      ? [...(relationTypesMap.get(filePathNormalized) ?? relationTypesMap.get(filePath) ?? [])]
      : [];

    // Skip if already correct (bypassed with --force for full re-patch)
    if (
      !FORCE &&
      pt.payload?.cluster_key === clusterKey &&
      pt.payload?.agents_scope === agentsScope &&
      JSON.stringify(pt.payload?.relation_types ?? []) === JSON.stringify(relationTypes)
    ) {
      totalSkipped++;
      continue;
    }

    patches.push({
      id: pt.id,
      payload: {
        cluster_key: clusterKey,
        ...(agentsScope ? { agents_scope: agentsScope } : {}),
        ...(relationTypes.length ? { relation_types: relationTypes } : {}),
      },
    });
  }

  if (patches.length === 0) {
    if (offset === null) break;
    continue;
  }

  if (!DRY_RUN) {
    for (const patch of patches) {
      const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: [patch.id], payload: patch.payload }),
      });
      if (!r.ok) log(`[warn] SetPayload failed for ${patch.id}: ${r.status}`);
    }
  }

  totalPatched += patches.length;
  log(`  scrolled=${scrolled} patched=${totalPatched} skipped=${totalSkipped}${DRY_RUN ? ' [DRY]' : ''}`);

  if (offset === null) break;
}

log(`\n✅ Done. Scrolled ${scrolled} points — patched ${totalPatched}, skipped ${totalSkipped}.`);
if (DRY_RUN) log('   (dry-run — no writes made)');
