#!/usr/bin/env node
/**
 * inject-ndjson-as-ace-packets.mjs
 *
 * Reads NES/CHROM cluster summaries + graph edges + card samples + enriched
 * candidates + atlas top-dirs from .opencode/ndjson/ and memory/atlas/ and
 * writes them as AceFullPacket-shaped Redis entries so the SSE chat context
 * assembler can inject them into the AI assistant.
 *
 * Sources (in order of richness):
 *   1. .opencode/ndjson/cluster-summary.ndjson     (396 SOM clusters)
 *   2. .opencode/ndjson/graph-edges.ndjson         (745 topology edges)
 *   3. .opencode/ndjson/enriched-candidates.ndjson (2033 file-level records)
 *   4. .opencode/ndjson/minified-ace-index.ndjson  (50 compact cluster entries)
 *   5. memory/atlas/codebase-atlas.top.json        (50 top dirs, auth+rank scores)
 *   6. .opencode/cards/                            (hex-ID JSON cards for snippets)
 *
 * Outputs (Redis, 24h TTL):
 *   ace:packet:{id}               — full AceFullPacket per cluster/dir
 *   ace:source_ref:{hash}         → packet_id (Lane 2 query-router lookup)
 *   ace:feature:{featureId}       → packet_id
 *   ace:workspace_task:{taskId}   → packet_id
 *   ace:dir_atlas:{dirHash}       → packet_id (new — atlas top-dir lane)
 *   bitfrost:retrieval:{hash}     — telemetry key for query-router Lane 1
 *   ace:packet:latest             → last written packet_id
 *
 * Report:
 *   memory/exports/ace-packet-ingest-report.json
 *   Fields: packet_count, engram_count, som_cluster_count, source_ref_count,
 *           feature_count, dag_hit_count, kag_hit_count, nes_chrom_key_count
 *
 * Usage:
 *   node scripts/atlas/inject-ndjson-as-ace-packets.mjs           # dry-run
 *   node scripts/atlas/inject-ndjson-as-ace-packets.mjs --apply   # write to Redis
 *   node scripts/atlas/inject-ndjson-as-ace-packets.mjs --apply --top 200
 *   node scripts/atlas/inject-ndjson-as-ace-packets.mjs --apply --atlas-only
 *   node scripts/atlas/inject-ndjson-as-ace-packets.mjs --apply --clusters-only
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY         = argv.includes('--apply');
const ATLAS_ONLY    = argv.includes('--atlas-only');
const CLUSTERS_ONLY = argv.includes('--clusters-only');
const VERBOSE       = argv.includes('--verbose');
const TOP_N = (() => {
  const i = argv.indexOf('--top');
  return i !== -1 ? parseInt(argv[i + 1], 10) || 200 : 200;
})();

// ── Env loader ───────────────────────────────────────────────────────────────

function loadEnv() {
  const paths = [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ];
  const env = { ...process.env };
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
  return env;
}

const env = loadEnv();
const REDIS_HOST = env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(env.REDIS_PORT || '6379', 10);
const REDIS_PASS = env.REDIS_PASSWORD || env.REDIS_PASS || '';

// ── Redis client (cold-start safe) ───────────────────────────────────────────

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASS || undefined,
  family: 4,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
  connectTimeout: 3000,
});
redis.on('error', () => {});

// ── NDJSON / JSON helpers ────────────────────────────────────────────────────

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return fallback; }
}

// ── Card snippet sampler ─────────────────────────────────────────────────────

const cardsDir = path.join(ROOT, '.opencode', 'cards');
const cardCache = new Map();

function sampleCardSnippet(cardId) {
  if (!cardId) return '';
  if (cardCache.has(cardId)) return cardCache.get(cardId);
  const p = path.join(cardsDir, `${cardId}.json`);
  if (!fs.existsSync(p)) { cardCache.set(cardId, ''); return ''; }
  try {
    const card = JSON.parse(fs.readFileSync(p, 'utf8'));
    const text = (card.text ?? card.content ?? card.summary ?? card.title ?? '').slice(0, 300);
    cardCache.set(cardId, text);
    return text;
  } catch {
    cardCache.set(cardId, '');
    return '';
  }
}

// ── Packet helpers (mirrors ace-packet-store.ts) ─────────────────────────────

function sha(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function makePacketId(seed) {
  return sha(seed + Date.now()).slice(0, 16);
}

function makeQueryHash(query) {
  return sha(query).slice(0, 16);
}

function sourceRefRedisKey(ref) {
  return `ace:source_ref:${sha(ref).slice(0, 8)}`;
}

// ── Build candidate index: cardId / fileRef → enriched metadata ──────────────

function buildCandidateIndex(candidates) {
  // Maps card_id (e.g. "file:src/...") → enriched record
  const idx = new Map();
  for (const c of candidates) {
    if (c.card_id) idx.set(c.card_id, c);
  }
  return idx;
}

// ── Build ACE packet from a SOM cluster summary ──────────────────────────────

function clusterToPacket(cluster, edgeMap, candidateIdx) {
  const clusterId = cluster.cluster_key ?? `${cluster.som_row}:${cluster.som_col}`;
  const featureIds = cluster.feature_ids ?? [];
  const laneIds    = cluster.lane_ids    ?? [];

  // card_sample hex IDs → source_refs
  const cardSample = cluster.card_sample ?? [];
  const uniqueCards = [...new Set(cardSample)].slice(0, 8);
  const sourceRefs = uniqueCards.map(id => `nes:card:${id}`);

  // Enrich from candidates: add dag_hits, som coords, real file refs
  let dagHits = 0;
  const enrichedFileRefs = [];
  for (const id of uniqueCards) {
    // Try matching "file:<hexId>" candidate
    const cand = candidateIdx.get(`file:${id}`) ?? candidateIdx.get(id);
    if (cand) {
      if (cand.som_row != null) dagHits++;
      if (cand.card_id) enrichedFileRefs.push(cand.card_id);
    }
  }
  if (enrichedFileRefs.length) sourceRefs.push(...enrichedFileRefs.slice(0, 4));

  // Graph neighbors
  const neighbors = edgeMap.get(clusterId) ?? [];
  const neighborIds = neighbors.slice(0, 3).map(n => `nes:cluster:${n}`);
  sourceRefs.push(...neighborIds);

  // Build prompt_context
  const keywords  = cluster.top_keywords?.slice(0, 6).join(', ') || '';
  const tags       = cluster.top_tags?.slice(0, 6).join(', ')     || '';
  const featureStr = featureIds.slice(0, 4).join(', ');
  const laneStr    = laneIds.slice(0, 3).join(', ');

  const snippets = uniqueCards.slice(0, 5).map(id => {
    const text = sampleCardSnippet(id);
    return text ? `[nes:card:${id}]\n${text}` : null;
  }).filter(Boolean);

  let promptContext = `## NES Cluster ${clusterId} (${cluster.card_count ?? '?'} cards)\n`;
  if (featureStr) promptContext += `Features: ${featureStr}\n`;
  if (laneStr)    promptContext += `Lanes: ${laneStr}\n`;
  if (keywords)   promptContext += `Keywords: ${keywords}\n`;
  if (tags)       promptContext += `Tags: ${tags}\n`;
  if (neighbors.length) promptContext += `Adjacent clusters: ${neighbors.slice(0, 4).join(', ')}\n`;
  if (dagHits)    promptContext += `DAG hits: ${dagHits}\n`;
  if (snippets.length) promptContext += `\n### Card Excerpts\n${snippets.join('\n\n')}`;

  const rankedCards = uniqueCards.slice(0, 5).map((id, i) => ({
    source_ref: `nes:card:${id}`,
    score: 1.0 - i * 0.05,
    feature_id: featureIds[0] ?? null,
    snippet: sampleCardSnippet(id).slice(0, 200),
  }));

  const query     = `NES cluster ${clusterId} features: ${featureStr || clusterId}`;
  const queryHash = makeQueryHash(query);
  const packetId  = makePacketId(`ndjson:cluster:${clusterId}`);
  const now       = new Date().toISOString();

  return {
    packet_id: packetId,
    query,
    query_hash: queryHash,
    source_refs: [...new Set(sourceRefs)],
    feature_ids: featureIds,
    lane_ids: laneIds.length ? laneIds : ['nes-chrom'],
    cluster_id: clusterId,
    workspace_task_id: `cluster:${clusterId}`,
    qdrant_point_ids: [],
    neo4j_neighbor_ids: neighborIds,
    redis_hot_keys: [],
    som_cluster: cluster.som_row != null && cluster.som_col != null
      ? `${cluster.som_row}:${cluster.som_col}`
      : (cluster.cluster_key ?? null),
    engram_ids: [],
    kag_hits: neighbors.length,
    dag_hits: dagHits,
    nes_chrom_packet_keys: uniqueCards.slice(0, 5).map(id => `nes:card:${id}`),
    prompt_context: promptContext.slice(0, 4000),
    ranked_cards: rankedCards,
    cache_hit: 'none',
    latency_ms: 0,
    degraded: sourceRefs.length === 0,
    created_at: now,
    ttl_seconds: 86_400,
  };
}

// ── Build ACE packet from a top-atlas directory entry ────────────────────────

function atlasEntryToPacket(entry, candidateIdx) {
  const dir      = entry.d ?? '';
  const clusters = entry.clusters ?? [];
  const topo     = entry.topo     ?? [];
  const tools    = entry.tools    ?? [];
  const tags     = entry.tags     ?? [];
  const topFiles = entry.top      ?? [];
  const auth     = entry.auth     ?? 0;
  const rank     = entry.rank     ?? 0;

  // source_refs: top files from atlas + "file:" normalized
  const sourceRefs = [...new Set([
    `dir:${dir}`,
    ...topFiles.slice(0, 6).map(f => `file:${f}`),
  ])];

  // Enrich from candidates
  let dagHits = 0;
  for (const ref of sourceRefs) {
    if (candidateIdx.has(ref)) dagHits++;
  }

  // feature_ids: top cluster labels
  const featureIds = [
    dir.split('/').pop() ?? dir,
    ...topo.slice(0, 2),
    ...clusters.slice(0, 3),
  ].filter(Boolean);

  const promptContext = [
    `## Atlas Directory: ${dir}`,
    `Rank: ${rank.toFixed(3)} | Authority: ${auth.toFixed(3)}`,
    clusters.length ? `Clusters: ${clusters.slice(0, 6).join(', ')}` : '',
    topo.length     ? `Topology: ${topo.join(', ')}` : '',
    tools.length    ? `Tools: ${tools.slice(0, 4).join(', ')}` : '',
    tags.length     ? `Tags: ${tags.slice(0, 6).join(', ')}` : '',
    topFiles.length ? `\nTop files:\n${[...new Set(topFiles)].slice(0, 5).map(f => `  - ${f}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  const rankedCards = [...new Set(topFiles)].slice(0, 5).map((f, i) => ({
    source_ref: `file:${f}`,
    score: rank * (1 - i * 0.05),
    feature_id: featureIds[0] ?? null,
    snippet: '',
  }));

  const query     = `atlas directory ${dir} clusters: ${clusters.slice(0, 3).join(', ')}`;
  const queryHash = makeQueryHash(query);
  const packetId  = makePacketId(`atlas:dir:${dir}`);
  const now       = new Date().toISOString();

  return {
    packet_id: packetId,
    query,
    query_hash: queryHash,
    source_refs: [...new Set(sourceRefs)],
    feature_ids: featureIds,
    lane_ids: ['atlas-top-dir'],
    cluster_id: clusters[0] ?? dir,
    workspace_task_id: `dir:${dir}`,
    qdrant_point_ids: [],
    neo4j_neighbor_ids: [],
    redis_hot_keys: [],
    som_cluster: null,
    engram_ids: [],
    kag_hits: clusters.length,
    dag_hits: dagHits,
    nes_chrom_packet_keys: [],
    prompt_context: promptContext.slice(0, 4000),
    ranked_cards: rankedCards,
    cache_hit: 'none',
    latency_ms: 0,
    degraded: sourceRefs.length <= 1,
    created_at: now,
    ttl_seconds: 86_400,
    // extra atlas metadata
    atlas_auth: auth,
    atlas_rank: rank,
    atlas_dir: dir,
  };
}

// ── Write a single packet batch to Redis pipeline ────────────────────────────

function enqueuePacket(pipeline, packet, TTL) {
  pipeline.set(`ace:packet:${packet.packet_id}`, JSON.stringify(packet), 'EX', TTL);

  for (const ref of packet.source_refs.slice(0, 8)) {
    pipeline.set(sourceRefRedisKey(ref), packet.packet_id, 'EX', TTL);
  }
  for (const fid of packet.feature_ids.slice(0, 4)) {
    if (fid) pipeline.set(`ace:feature:${fid}`, packet.packet_id, 'EX', TTL);
  }
  if (packet.workspace_task_id) {
    pipeline.set(`ace:workspace_task:${packet.workspace_task_id}`, packet.packet_id, 'EX', TTL);
  }
  if (packet.atlas_dir) {
    pipeline.set(`ace:dir_atlas:${sha(packet.atlas_dir).slice(0, 8)}`, packet.packet_id, 'EX', TTL);
  }
  // Bifrost telemetry key for query-router Lane 1
  const bifrostKey = `bitfrost:retrieval:${packet.query_hash}`;
  pipeline.set(bifrostKey, JSON.stringify({
    query_hash: packet.query_hash,
    source_refs: packet.source_refs,
    cache_hit: false,
    latency_ms: 0,
    logged_at: packet.created_at,
    atlas_cluster_ids: [packet.cluster_id],
    feature_ids: packet.feature_ids,
  }), 'EX', 7200);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Inject NDJSON → ACE Packets ────────────────────────────');
  console.log(`  Mode:    ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Top N:   ${TOP_N}`);
  console.log(`  Sources: ${ATLAS_ONLY ? 'atlas-only' : CLUSTERS_ONLY ? 'clusters-only' : 'all'}`);

  // ── Load all sources ─────────────────────────────────────────────────────

  const ndjsonDir = path.join(ROOT, '.opencode', 'ndjson');
  const memAtlas  = path.join(ROOT, 'sveltekit-frontend', 'memory', 'atlas');

  const clusters   = readNdjson(path.join(ndjsonDir, 'cluster-summary.ndjson'));
  const edges      = readNdjson(path.join(ndjsonDir, 'graph-edges.ndjson'));
  const candidates = readNdjson(path.join(ndjsonDir, 'enriched-candidates.ndjson'));
  const miniIndex  = readNdjson(path.join(ndjsonDir, 'minified-ace-index.ndjson'));
  const atlasTop   = readJson(path.join(memAtlas, 'codebase-atlas.top.json'), { top: [] });

  const atlasEntries = atlasTop.top ?? [];

  console.log(`  clusters:    ${clusters.length}`);
  console.log(`  edges:       ${edges.length}`);
  console.log(`  candidates:  ${candidates.length}`);
  console.log(`  mini-index:  ${miniIndex.length}`);
  console.log(`  atlas dirs:  ${atlasEntries.length}`);
  console.log(`  cards dir:   ${fs.existsSync(cardsDir) ? 'exists' : 'missing'}`);

  if (!clusters.length && !atlasEntries.length) {
    console.error('  ❌ No data found — run: npm run ndjson:mapreduce');
    process.exit(1);
  }

  // Build adjacency map
  const edgeMap = new Map();
  for (const edge of edges) {
    const src = edge.src ?? '';
    const dst = edge.dst ?? '';
    if (!src || !dst) continue;
    if (!edgeMap.has(src)) edgeMap.set(src, []);
    edgeMap.get(src).push(dst);
  }

  // Build candidate index
  const candidateIdx = buildCandidateIndex(candidates);

  // ── Assemble packets ─────────────────────────────────────────────────────

  const packets = [];

  // Lane A: SOM cluster packets
  if (!ATLAS_ONLY && clusters.length) {
    const sorted   = [...clusters].sort((a, b) => (b.card_count ?? 0) - (a.card_count ?? 0));
    const selected = sorted.slice(0, TOP_N);
    for (const cluster of selected) {
      packets.push(clusterToPacket(cluster, edgeMap, candidateIdx));
    }
    console.log(`\n  [Lane A] Cluster packets: ${packets.length}`);
  }

  // Lane B: Atlas top-dir packets
  if (!CLUSTERS_ONLY && atlasEntries.length) {
    const atlasPackets = atlasEntries.map(e => atlasEntryToPacket(e, candidateIdx));
    packets.push(...atlasPackets);
    console.log(`  [Lane B] Atlas dir packets: ${atlasPackets.length}`);
  }

  console.log(`  Total packets: ${packets.length}`);

  if (!APPLY) {
    // Dry-run: show first packet of each lane
    const clusterSample = packets.find(p => p.lane_ids?.includes('nes-chrom'));
    const atlasSample   = packets.find(p => p.lane_ids?.includes('atlas-top-dir'));
    const show = (label, p) => {
      if (!p) return;
      console.log(`\n  [DRY-RUN] ${label}:`);
      console.log(`    packet_id:      ${p.packet_id}`);
      console.log(`    cluster_id:     ${p.cluster_id}`);
      console.log(`    source_refs:    ${p.source_refs.length} refs`);
      console.log(`    feature_ids:    ${p.feature_ids.slice(0, 3).join(', ')}`);
      console.log(`    dag_hits:       ${p.dag_hits}`);
      console.log(`    kag_hits:       ${p.kag_hits}`);
      console.log(`    ranked_cards:   ${p.ranked_cards.length}`);
      console.log(`    prompt_context: ${p.prompt_context.length} chars`);
      console.log(`    degraded:       ${p.degraded}`);
      if (VERBOSE) console.log(`\n    prompt:\n${p.prompt_context.slice(0, 500)}`);
    };
    show('Lane A — cluster packet', clusterSample);
    show('Lane B — atlas dir packet', atlasSample);
    console.log('\n  Run with --apply to write to Redis.\n');
    return;
  }

  // ── Connect and write ────────────────────────────────────────────────────

  try {
    await redis.connect();
    await redis.ping();
    console.log(`\n  ✅ Redis connected (${REDIS_HOST}:${REDIS_PORT})`);
  } catch (e) {
    console.error(`  ❌ Redis connect failed: ${e.message}`);
    process.exit(1);
  }

  const TTL = 86_400;
  let written = 0;
  let latest  = null;

  // Write in batches of 100 to avoid pipeline overflows
  const BATCH = 100;
  for (let i = 0; i < packets.length; i += BATCH) {
    const batch = packets.slice(i, i + BATCH);
    const pipeline = redis.pipeline();
    for (const packet of batch) {
      enqueuePacket(pipeline, packet, TTL);
      latest = packet.packet_id;
      written++;
    }
    await pipeline.exec();
    if (VERBOSE) console.log(`  [batch] wrote ${Math.min(i + BATCH, packets.length)}/${packets.length}`);
  }

  // Write ace:packet:latest
  if (latest) {
    await redis.setex('ace:packet:latest', TTL, latest);
  }

  console.log(`\n  ✅ Wrote ${written} ACE packets to Redis`);
  console.log(`  ✅ ace:packet:latest → ${latest}`);

  // ── Compute report stats ─────────────────────────────────────────────────

  const allSourceRefs   = new Set(packets.flatMap(p => p.source_refs));
  const allFeatures     = new Set(packets.flatMap(p => p.feature_ids));
  const allSomClusters  = new Set(packets.map(p => p.som_cluster).filter(Boolean));
  const totalDagHits    = packets.reduce((s, p) => s + (p.dag_hits ?? 0), 0);
  const totalKagHits    = packets.reduce((s, p) => s + (p.kag_hits ?? 0), 0);
  const totalNesKeys    = packets.reduce((s, p) => s + p.nes_chrom_packet_keys.length, 0);
  const engramCount     = packets.filter(p => p.engram_ids?.length).length;

  const report = {
    timestamp:          new Date().toISOString(),
    packet_count:       written,
    engram_count:       engramCount,
    som_cluster_count:  allSomClusters.size,
    source_ref_count:   allSourceRefs.size,
    feature_count:      allFeatures.size,
    dag_hit_count:      totalDagHits,
    kag_hit_count:      totalKagHits,
    nes_chrom_key_count: totalNesKeys,
    ace_packet_latest:  latest,
    ttl_seconds:        TTL,
    top_n:              TOP_N,
    lanes: {
      cluster: packets.filter(p => p.lane_ids?.includes('nes-chrom')).length,
      atlas_dir: packets.filter(p => p.lane_ids?.includes('atlas-top-dir')).length,
    },
  };

  const reportDir = path.join(ROOT, 'memory', 'exports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'ace-packet-ingest-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n  Report → ${reportPath}`);
  console.log(`  Packets: ${report.packet_count} | SourceRefs: ${report.source_ref_count} | Features: ${report.feature_count}`);
  console.log(`  DAG hits: ${report.dag_hit_count} | KAG hits: ${report.kag_hit_count} | SOM clusters: ${report.som_cluster_count}`);

  await redis.quit();
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });