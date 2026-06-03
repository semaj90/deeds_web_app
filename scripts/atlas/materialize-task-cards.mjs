#!/usr/bin/env node
/**
 * materialize-task-cards.mjs — Phase 102 T6 + T6.1 + T6.2 + T6.3
 *
 * Reads task_semantic_packets (one per workspace_task_id), enriches each with:
 *   T6.1 — Parent Atlas lineage (source_refs, cluster membership from atlas docs
 *           joined on feature_id; qdrant_point_ids collected from all sibling packets)
 *   T6.2 — Karpathy authority score (Redis gpu:karpathy:scores → 0 with scoring_source
 *           set to "unavailable" so agents know rank is approximate)
 *   T6.3 — Agent pickup metadata (retrieval_path, source_refs, parent_atlas_id,
 *           authority_score, superseded_score) ready for zero-DB agent consumption
 *
 * Writes one `.opencode/cards/task-{workspace_task_id}.json` per task and
 * regenerates `.opencode/cards/index.json`.
 *
 * Usage:
 *   node scripts/atlas/materialize-task-cards.mjs
 *   node scripts/atlas/materialize-task-cards.mjs --limit=20
 *   node scripts/atlas/materialize-task-cards.mjs --dry-run
 *   node scripts/atlas/materialize-task-cards.mjs --no-redis   (skip Karpathy, score=0)
 *   node scripts/atlas/materialize-task-cards.mjs --all        (no limit)
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// ── env injection ──────────────────────────────────────────────────────────────
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env'), override: false });
  dotenv.config({ path: resolve(ROOT, '.env'), override: false });
} catch { /* optional */ }

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

const DRY_RUN  = process.argv.includes('--dry-run');
const NO_REDIS = process.argv.includes('--no-redis');
const ALL      = process.argv.includes('--all');
const LIMIT    = ALL ? Infinity : (() => { const a = process.argv.find(x => x.startsWith('--limit=')); return a ? parseInt(a.split('=')[1], 10) : 10; })();

const DB_URL    = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL    ?? 'redis://127.0.0.1:6379';

const CARDS_DIR  = resolve(ROOT, '.opencode/cards');
const INDEX_PATH = resolve(CARDS_DIR, 'index.json');

// ── Redis cold-start pattern ──────────────────────────────────────────────────
async function connectRedis() {
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    await redis.ping();
    return redis;
  } catch {
    redis.disconnect();
    return null;
  }
}

// ── T6.2: Load Karpathy blend scores from Redis ───────────────────────────────
// Returns { map: Map<filePath, {pr, attn, authority, blend}>, source }
async function loadKarpathyScores(redis) {
  if (!redis) return { map: new Map(), source: 'unavailable' };
  try {
    const raw = await redis.hgetall('gpu:karpathy:scores');
    if (!raw || !Object.keys(raw).length) return { map: new Map(), source: 'unavailable' };
    const map = new Map();
    for (const [k, v] of Object.entries(raw)) {
      try { map.set(k, JSON.parse(v)); } catch { /* skip malformed */ }
    }
    return { map, source: map.size > 0 ? 'redis' : 'unavailable' };
  } catch {
    return { map: new Map(), source: 'unavailable' };
  }
}

// ── Query: one representative packet per task ─────────────────────────────────
async function loadPackets(pool) {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (p.workspace_task_id)
      p.id,
      p.workspace_task_id,
      p.feature_id,
      p.cluster_id,
      p.centroid_id,
      p.source_ref,
      p.file_path,
      p.next_action,
      p.status,
      p.agent_pickup_ready,
      p.summary_llm,
      p.summary_model,
      p.related_feature_ids,
      p.related_task_ids,
      p.related_file_paths,
      p.semantic_path,
      p.qdrant_point_id,
      p.created_at,
      p.updated_at,
      t.title        AS task_title,
      t.name         AS task_name,
      t.workspace_id
    FROM task_semantic_packets p
    LEFT JOIN workspace_tasks t ON t.id = p.workspace_task_id
    WHERE p.summary_llm IS NOT NULL
      AND p.workspace_task_id IS NOT NULL
      AND (p.deleted IS NULL OR p.deleted = false)
    ORDER BY p.workspace_task_id, p.confidence DESC NULLS LAST, p.id DESC
  `);
  return rows;
}

// ── T6.1: Collect all qdrant_point_ids for each task (from sibling packets) ──
async function loadSiblingPointIds(pool, taskIds) {
  if (!taskIds.length) return new Map();
  const { rows } = await pool.query(
    `SELECT DISTINCT workspace_task_id, qdrant_point_id
     FROM task_semantic_packets
     WHERE workspace_task_id = ANY($1::int[])
       AND qdrant_point_id IS NOT NULL`,
    [taskIds]
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.workspace_task_id)) map.set(r.workspace_task_id, []);
    map.get(r.workspace_task_id).push(r.qdrant_point_id);
  }
  return map;
}

// ── T6.1: Load Parent Atlas docs joined by feature_id ────────────────────────
// Returns Map<feature_id, atlasDoc[]>
async function loadAtlasByFeature(pool, featureIds) {
  if (!featureIds.length) return new Map();
  const { rows } = await pool.query(
    `SELECT id, source_ref, cluster_id, centroid_id, feature_id, summary, alias_id, ingest_source
     FROM parent_atlas_documents
     WHERE feature_id = ANY($1::text[])
       AND source_ref IS NOT NULL
     ORDER BY feature_id, id`,
    [featureIds]
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.feature_id)) map.set(r.feature_id, []);
    map.get(r.feature_id).push(r);
  }
  return map;
}

// ── T6.1: Extract cluster number from titles like TASK-cluster-prune-65 ──────
function extractClusterNum(title) {
  const m = title && title.match(/cluster[-_]prune[-_](\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// ── T6.1: Load cluster_summaries + codebase_chunk_index for prune tasks ───────
// Returns Map<clusterNum, { purpose, tags, member_count, file_paths: string[] }>
async function loadClusterEnrichment(pool, clusterNums) {
  if (!clusterNums.length) return new Map();

  // cluster_summaries has gpu_cluster integer + purpose/tags/member_count
  const { rows: summaryRows } = await pool.query(
    `SELECT gpu_cluster, purpose, tags, member_count
     FROM cluster_summaries
     WHERE gpu_cluster = ANY($1::int[])`,
    [clusterNums]
  );

  // codebase_chunk_index has gpu_cluster (int) + relative_path — correct join key
  const { rows: memberRows } = await pool.query(
    `SELECT gpu_cluster, relative_path
     FROM codebase_chunk_index
     WHERE gpu_cluster = ANY($1::int[])
       AND relative_path IS NOT NULL
     ORDER BY gpu_cluster, page_rank_score DESC NULLS LAST
     LIMIT 1000`,
    [clusterNums]
  );

  const map = new Map();

  // Seed from summaries
  for (const r of summaryRows) {
    map.set(r.gpu_cluster, {
      purpose: r.purpose ?? null,
      tags: r.tags ?? [],
      member_count: r.member_count ?? 0,
      file_paths: [],
    });
  }

  // Fill file_paths from codebase_chunk_index (top 20 per cluster by PageRank)
  for (const r of memberRows) {
    if (!map.has(r.gpu_cluster)) map.set(r.gpu_cluster, { purpose: null, tags: [], member_count: 0, file_paths: [] });
    const entry = map.get(r.gpu_cluster);
    if (entry.file_paths.length < 20 && !entry.file_paths.includes(r.relative_path)) {
      entry.file_paths.push(r.relative_path);
    }
  }

  return map;
}

// ── Load cluster links ────────────────────────────────────────────────────────
async function loadClusterLinks(pool, taskIds) {
  if (!taskIds.length) return new Map();
  const { rows } = await pool.query(
    `SELECT workspace_task_id, cluster_id, centroid_id, qdrant_point_id, relation_kind, source_ref
     FROM task_cluster_links
     WHERE workspace_task_id = ANY($1::int[])`,
    [taskIds]
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.workspace_task_id)) map.set(r.workspace_task_id, []);
    map.get(r.workspace_task_id).push(r);
  }
  return map;
}

// ── T6.2: Best Karpathy blend for a packet ───────────────────────────────────
function bestKarpathyBlend(packet, atlasDocs, karpathyMap) {
  let blend = 0;
  // Search candidate file paths: packet's own + atlas source_refs + related files
  const candidates = [
    packet.file_path,
    ...(Array.isArray(packet.related_file_paths) ? packet.related_file_paths : []),
    ...(atlasDocs ?? []).map(a => a.source_ref).filter(Boolean),
  ].filter(Boolean);
  for (const fp of candidates) {
    const scores = karpathyMap.get(fp);
    if (scores?.blend > blend) blend = scores.blend;
  }
  return blend;
}

// ── T6.1: Build source_refs list from atlas + packet + cluster members ────────
function buildSourceRefs(packet, atlasDocs, clusterEntry) {
  const refs = new Set();
  if (packet.source_ref) refs.add(packet.source_ref);
  if (packet.file_path) refs.add(packet.file_path);
  for (const a of (atlasDocs ?? [])) {
    if (a.source_ref) refs.add(a.source_ref);
  }
  // Cluster member file_paths as fallback source_refs (codebase-structure tasks)
  for (const fp of (clusterEntry?.file_paths ?? [])) {
    refs.add(fp);
  }
  return [...refs];
}

// ── T6.1: Derive cluster/centroid from atlas when packet has none ─────────────
function deriveCluster(packet, clusterLinks, atlasDocs) {
  // Prefer packet's own values
  if (packet.cluster_id) return { cluster_id: packet.cluster_id, centroid_id: packet.centroid_id };
  // Then cluster links
  const links = clusterLinks ?? [];
  if (links.length) return { cluster_id: links[0].cluster_id, centroid_id: links[0].centroid_id };
  // Then atlas docs that have cluster assignments
  const atlasWithCluster = (atlasDocs ?? []).find(a => a.cluster_id);
  if (atlasWithCluster) return { cluster_id: atlasWithCluster.cluster_id, centroid_id: atlasWithCluster.centroid_id ?? null };
  return { cluster_id: null, centroid_id: null };
}

// ── Rank packets by Karpathy blend score ─────────────────────────────────────
function rankPackets(packets, atlasByFeature, karpathyMap) {
  return packets.map(p => {
    const atlasDocs = atlasByFeature.get(p.feature_id) ?? [];
    const blend = bestKarpathyBlend(p, atlasDocs, karpathyMap);
    return { ...p, _karpathy_blend: blend };
  }).sort((a, b) => b._karpathy_blend - a._karpathy_blend);
}

// ── Build enriched card JSON (T6 + T6.1 + T6.2 + T6.3) ──────────────────────
function buildCard(packet, clusterLinks, atlasDocs, siblingPointIds, karpathySource, clusterEntry) {
  const links   = clusterLinks ?? [];
  const atlasDoc = (atlasDocs ?? [])[0] ?? null;
  const sourceRefs = buildSourceRefs(packet, atlasDocs, clusterEntry);
  const { cluster_id, centroid_id } = deriveCluster(packet, links, atlasDocs);

  // T6.3 retrieval path: ordered list of systems this card spans
  const retrievalPath = [];
  if (packet.summary_llm) retrievalPath.push('task_semantic_packets');
  if (sourceRefs.length) retrievalPath.push('parent_atlas_documents');
  if (links.length) retrievalPath.push('task_cluster_links');
  if (clusterEntry) retrievalPath.push('cluster_summaries');
  if (packet._karpathy_blend > 0) retrievalPath.push('karpathy_scores');

  return {
    // Identity
    card_type: 'task',
    task_id: packet.workspace_task_id,
    packet_id: packet.id,
    workspace_id: packet.workspace_id ?? 'deeds-web-app',
    feature_id: packet.feature_id,

    // Display
    title: packet.task_title ?? packet.task_name ?? packet.feature_id ?? `task-${packet.workspace_task_id}`,
    summary: packet.summary_llm,
    summary_model: packet.summary_model,
    next_action: packet.next_action,
    status: packet.status,
    agent_pickup_ready: packet.agent_pickup_ready ?? false,

    // Topology (T6.1: enriched from atlas and cluster links)
    cluster_id,
    centroid_id,
    source_ref: packet.source_ref ?? atlasDoc?.source_ref ?? null,
    file_path: packet.file_path ?? null,
    semantic_path: packet.semantic_path ?? [],

    // T6.1 — Parent Atlas lineage
    parent_atlas_id: atlasDoc?.id ?? null,
    source_refs: sourceRefs,
    atlas_source_refs: (atlasDocs ?? []).map(a => a.source_ref).filter(Boolean),
    qdrant_point_ids: siblingPointIds ?? [],

    // Relations
    related_feature_ids: packet.related_feature_ids ?? [],
    related_task_ids: packet.related_task_ids ?? [],
    related_file_paths: packet.related_file_paths ?? [],
    cluster_links: links.map(l => ({
      cluster_id: l.cluster_id,
      centroid_id: l.centroid_id,
      qdrant_point_id: l.qdrant_point_id,
      relation_kind: l.relation_kind,
    })),

    // T6.2 — Karpathy authority scoring
    karpathy_blend: packet._karpathy_blend ?? 0,
    authority_score: packet._karpathy_blend ?? 0,
    scoring_source: karpathySource,

    // T6.3 — Agent pickup metadata (zero-DB agent consumption)
    superseded_score: 0,
    retrieval_path: retrievalPath,

    // Timestamps
    created_at: packet.created_at,
    updated_at: packet.updated_at,
    generated_at: new Date().toISOString(),
  };
}

// ── Update index.json ─────────────────────────────────────────────────────────
function updateIndex(newEntries) {
  let existing = [];
  if (existsSync(INDEX_PATH)) {
    try { existing = JSON.parse(readFileSync(INDEX_PATH, 'utf-8')); } catch { existing = []; }
  }
  const kept = existing.filter(e => !e.id?.startsWith('task-'));
  return [...kept, ...newEntries];
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[T6] Materialize Task Cards — Phase 102 (T6 + T6.1 + T6.2 + T6.3)');
  console.log(`[T6] DRY_RUN=${DRY_RUN}  LIMIT=${ALL ? 'ALL' : LIMIT}  NO_REDIS=${NO_REDIS}`);

  const pool = new Pool({ connectionString: DB_URL });
  await pool.query('SELECT 1');
  console.log('[T6] Postgres connected');

  // T6.2: Redis for Karpathy scores (non-fatal)
  let redis = null;
  if (!NO_REDIS) {
    redis = await connectRedis();
    if (redis) console.log('[T6] Redis connected — loading Karpathy scores');
    else        console.warn('[T6] Redis not reachable — scoring_source=unavailable, rank by Postgres order');
  }

  const { map: karpathyMap, source: karpathySource } = await loadKarpathyScores(redis);
  console.log(`[T6] Karpathy map: ${karpathyMap.size} file entries (source=${karpathySource})`);

  // Load all representative packets
  const allPackets = await loadPackets(pool);
  console.log(`[T6] Loaded ${allPackets.length} distinct tasks with summary_llm`);

  // T6.1: Load atlas docs by feature_id for all tasks
  const featureIds = [...new Set(allPackets.map(p => p.feature_id).filter(Boolean))];
  const atlasByFeature = await loadAtlasByFeature(pool, featureIds);
  const atlasCoverage = [...atlasByFeature.values()].reduce((n, arr) => n + arr.length, 0);
  console.log(`[T6] Parent Atlas: ${atlasCoverage} docs across ${atlasByFeature.size} feature IDs`);

  // Rank and take top-N
  const ranked = rankPackets(allPackets, atlasByFeature, karpathyMap);
  const topN = ALL ? ranked : ranked.slice(0, LIMIT);
  console.log(`[T6] Selected ${topN.length} tasks (ranked by ${karpathySource === 'redis' ? 'Karpathy blend' : 'Postgres order'})`);

  // Load cluster links and sibling qdrant point IDs for selected tasks
  const taskIds = [...new Set(topN.map(p => p.workspace_task_id).filter(Boolean))];

  // T6.1: Extract cluster numbers for codebase-structure / cluster-prune tasks
  const clusterNumMap = new Map(); // workspace_task_id → clusterNum
  for (const p of topN) {
    const title = p.task_title ?? p.task_name ?? '';
    const num = extractClusterNum(title);
    if (num !== null) clusterNumMap.set(p.workspace_task_id, num);
  }
  const clusterNums = [...new Set(clusterNumMap.values())];

  const [clusterLinkMap, siblingPointMap, clusterEnrichMap] = await Promise.all([
    loadClusterLinks(pool, taskIds),
    loadSiblingPointIds(pool, taskIds),
    loadClusterEnrichment(pool, clusterNums),
  ]);

  const clusterLinked  = [...clusterLinkMap.values()].filter(v => v.length).length;
  const pointLinked    = [...siblingPointMap.values()].filter(v => v.length).length;
  const clusterEnriched = clusterNums.filter(n => clusterEnrichMap.has(n)).length;
  console.log(`[T6] Cluster links: ${clusterLinked} tasks with links`);
  console.log(`[T6] Qdrant point IDs: ${pointLinked} tasks with points`);
  console.log(`[T6] Cluster enrichment: ${clusterEnriched}/${clusterNums.length} cluster numbers found in cluster_summaries`);

  if (DRY_RUN) {
    for (const p of topN) {
      const atlasDocs    = atlasByFeature.get(p.feature_id) ?? [];
      const clusterNum   = clusterNumMap.get(p.workspace_task_id) ?? null;
      const clusterEntry = clusterNum !== null ? clusterEnrichMap.get(clusterNum) : null;
      const sourceRefs   = buildSourceRefs(p, atlasDocs, clusterEntry);
      const title = p.task_title ?? p.task_name ?? p.feature_id ?? `task-${p.workspace_task_id}`;
      console.log(
        `  [DRY] task-${p.workspace_task_id}: "${title}" ` +
        `blend=${p._karpathy_blend?.toFixed(3) ?? '0.000'} ` +
        `source_refs=${sourceRefs.length} atlas_docs=${atlasDocs.length}` +
        (clusterEntry ? ` cluster=${clusterNum}(${clusterEntry.file_paths.length} files)` : '')
      );
    }
    console.log(`\n[T6] DRY-RUN complete — ${topN.length} cards would be written`);
    await pool.end();
    if (redis) await redis.quit();
    return;
  }

  mkdirSync(CARDS_DIR, { recursive: true });

  const indexEntries = [];
  let written = 0;

  for (const packet of topN) {
    const atlasDocs     = atlasByFeature.get(packet.feature_id) ?? [];
    const clusterLinks  = clusterLinkMap.get(packet.workspace_task_id) ?? [];
    const siblingPoints = siblingPointMap.get(packet.workspace_task_id) ?? [];
    const clusterNum    = clusterNumMap.get(packet.workspace_task_id) ?? null;
    const clusterEntry  = clusterNum !== null ? clusterEnrichMap.get(clusterNum) : null;

    const card     = buildCard(packet, clusterLinks, atlasDocs, siblingPoints, karpathySource, clusterEntry);
    const filename = `task-${packet.workspace_task_id}.json`;

    writeFileSync(resolve(CARDS_DIR, filename), JSON.stringify(card, null, 2));
    written++;

    indexEntries.push({
      id: `task-${packet.workspace_task_id}`,
      file: filename,
      title: card.title,
      excerpt: card.summary?.slice(0, 120) ?? '',
      feature_id: card.feature_id,
      karpathy_blend: card.karpathy_blend,
      scoring_source: card.scoring_source,
      parent_atlas_id: card.parent_atlas_id,
      source_refs_count: card.source_refs.length,
      card_type: 'task',
    });

    process.stdout.write(`\r[T6] ${written}/${topN.length} cards written`);
  }

  process.stdout.write('\n');

  const mergedIndex = updateIndex(indexEntries);
  writeFileSync(INDEX_PATH, JSON.stringify(mergedIndex, null, 2));
  console.log(`[T6] index.json updated — ${mergedIndex.length} total entries (${indexEntries.length} task cards)`);

  // Gate check
  const { rows: [{ c }] } = await pool.query(
    `SELECT count(*) c FROM task_semantic_packets WHERE summary_llm IS NOT NULL`
  );
  const atlasLinked    = indexEntries.filter(e => e.parent_atlas_id !== null).length;
  const sourceRefed    = indexEntries.filter(e => e.source_refs_count > 0).length;
  const clusterBacked  = clusterEnrichMap.size;

  console.log(`\n[T6] Gate: ${c} packets have summary_llm`);
  console.log(`[T6] Gate: ${written} task cards written`);
  console.log(`[T6] Gate: ${atlasLinked}/${written} cards have parent_atlas_id`);
  console.log(`[T6] Gate: ${sourceRefed}/${written} cards have ≥1 source_ref`);
  console.log(`[T6] Gate: ${clusterBacked} cluster-prune tasks enriched from cluster_summaries`);
  console.log(`[T6] Gate: scoring_source=${karpathySource}`);
  console.log('[T6] Done');

  await pool.end();
  if (redis) await redis.quit();
}

main().catch(err => {
  console.error('[T6] FATAL:', err);
  process.exit(1);
});
