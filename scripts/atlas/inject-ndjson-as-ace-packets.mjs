#!/usr/bin/env node
/**
 * inject-ndjson-as-ace-packets.mjs
 *
 * Reads NES/CHROM cluster summaries + graph edges + card samples from
 * .opencode/ndjson/ and writes them as AceFullPacket-shaped Redis entries
 * so the SSE chat context assembler can inject them into the AI assistant.
 *
 * What this does:
 *   1. Reads .opencode/ndjson/cluster-summary.ndjson  (396 SOM clusters)
 *   2. Reads .opencode/ndjson/graph-edges.ndjson      (745 topology edges)
 *   3. Reads .opencode/ndjson/minified-ace-index.ndjson (compact lookup)
 *   4. Samples .opencode/cards/ for snippet text (hex-ID JSON cards)
 *   5. Assembles AceFullPacket-shaped objects per cluster
 *   6. Writes ace:packet:{id} + ace:packet:latest + ace:source_ref:* to Redis
 *      (same schema as ace-packet-store.ts writeAcePacket)
 *
 * These packets are read by query-router.ts Lane 1 (Redis hot packet)
 * and injected into the SSE chat prompt as "## Codebase Context (Atlas)".
 *
 * Usage:
 *   node scripts/atlas/inject-ndjson-as-ace-packets.mjs          # dry-run
 *   node scripts/atlas/inject-ndjson-as-ace-packets.mjs --apply  # write to Redis
 *   node scripts/atlas/inject-ndjson-as-ace-packets.mjs --apply --top 50
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const TOP_N = (() => {
  const i = argv.indexOf('--top');
  return i !== -1 ? parseInt(argv[i + 1], 10) || 100 : 100;
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

// ── NDJSON reader ────────────────────────────────────────────────────────────

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
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

function makePacketId(seed) {
  return crypto.createHash('sha256').update(seed + Date.now()).digest('hex').slice(0, 16);
}

function makeQueryHash(query) {
  return crypto.createHash('sha256').update(query).digest('hex').slice(0, 16);
}

function sourceRefRedisKey(ref) {
  const h = crypto.createHash('sha256').update(ref).digest('hex').slice(0, 8);
  return `ace:source_ref:${h}`;
}

// ── Build an AceFullPacket from a cluster summary ─────────────────────────────

function clusterToPacket(cluster, edgeMap) {
  const clusterId = cluster.cluster_key ?? `${cluster.som_row}:${cluster.som_col}`;
  const featureIds = cluster.feature_ids ?? [];
  const laneIds = cluster.lane_ids ?? [];

  // Build source_refs from card_sample hex IDs  (format: "file:<hexId>")
  const cardSample = cluster.card_sample ?? [];
  const uniqueCards = [...new Set(cardSample)].slice(0, 8);
  const sourceRefs = uniqueCards.map(id => `nes:card:${id}`);

  // Add adjacent cluster refs from graph edges
  const neighbors = edgeMap.get(clusterId) ?? [];
  const neighborIds = neighbors.slice(0, 3).map(n => `nes:cluster:${n}`);
  sourceRefs.push(...neighborIds);

  // Build prompt_context from card snippets + cluster metadata
  const keywords = cluster.top_keywords?.slice(0, 6).join(', ') || '';
  const tags = cluster.top_tags?.slice(0, 6).join(', ') || '';
  const featureStr = featureIds.slice(0, 4).join(', ');
  const laneStr = laneIds.slice(0, 3).join(', ');

  const snippets = uniqueCards.slice(0, 5).map(id => {
    const text = sampleCardSnippet(id);
    return text ? `[nes:card:${id}]\n${text}` : null;
  }).filter(Boolean);

  let promptContext = `## NES Cluster ${clusterId} (${cluster.card_count} cards)\n`;
  if (featureStr) promptContext += `Features: ${featureStr}\n`;
  if (laneStr)    promptContext += `Lanes: ${laneStr}\n`;
  if (keywords)   promptContext += `Keywords: ${keywords}\n`;
  if (tags)       promptContext += `Tags: ${tags}\n`;
  if (neighbors.length) promptContext += `Adjacent clusters: ${neighbors.slice(0, 4).join(', ')}\n`;
  if (snippets.length) {
    promptContext += `\n### Card Excerpts\n${snippets.join('\n\n')}`;
  }

  // ranked_cards for context assembler
  const rankedCards = uniqueCards.slice(0, 5).map((id, i) => ({
    source_ref: `nes:card:${id}`,
    score: 1.0 - i * 0.05,
    feature_id: featureIds[0] ?? null,
    snippet: sampleCardSnippet(id).slice(0, 200),
  }));

  const query = `NES cluster ${clusterId} features: ${featureStr || clusterId}`;
  const queryHash = makeQueryHash(query);
  const packetId = makePacketId(`ndjson:cluster:${clusterId}`);
  const now = new Date().toISOString();

  return {
    packet_id: packetId,
    query,
    query_hash: queryHash,
    source_refs: [...new Set(sourceRefs)],
    feature_ids: featureIds,
    lane_ids: laneIds,
    cluster_id: clusterId,
    workspace_task_id: `cluster:${clusterId}`,
    qdrant_point_ids: [],
    neo4j_neighbor_ids: neighborIds,
    redis_hot_keys: [],
    // Provenance fields
    som_cluster: cluster.som_row != null && cluster.som_col != null
      ? `${cluster.som_row}:${cluster.som_col}`
      : (cluster.cluster_key ?? null),
    engram_ids: [],
    kag_hits: neighbors.length,
    dag_hits: 0,
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Inject NDJSON → ACE Packets ────────────────────────────');
  console.log(`  Mode:  ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Top N: ${TOP_N}`);

  // Load ndjson data
  const clusterPath = path.join(ROOT, '.opencode', 'ndjson', 'cluster-summary.ndjson');
  const edgePath    = path.join(ROOT, '.opencode', 'ndjson', 'graph-edges.ndjson');

  const clusters = readNdjson(clusterPath);
  const edges    = readNdjson(edgePath);

  console.log(`  Clusters: ${clusters.length}`);
  console.log(`  Edges:    ${edges.length}`);

  if (!clusters.length) {
    console.error('  ❌ No clusters found — run: npm run ndjson:mapreduce');
    process.exit(1);
  }

  // Build adjacency map: clusterId → [neighbor cluster IDs]
  const edgeMap = new Map();
  for (const edge of edges) {
    const src = edge.src ?? '';
    const dst = edge.dst ?? '';
    if (!src || !dst) continue;
    if (!edgeMap.has(src)) edgeMap.set(src, []);
    edgeMap.get(src).push(dst);
  }

  // Select top clusters by card_count
  const sorted = [...clusters].sort((a, b) => (b.card_count ?? 0) - (a.card_count ?? 0));
  const selected = sorted.slice(0, TOP_N);

  console.log(`  Selected: ${selected.length} clusters (top ${TOP_N} by card_count)`);
  console.log(`  Cards dir exists: ${fs.existsSync(cardsDir)}`);

  if (!APPLY) {
    // Dry-run: show sample packet
    const sample = clusterToPacket(selected[0], edgeMap);
    console.log('\n  [DRY-RUN] Sample packet:');
    console.log(`    packet_id:      ${sample.packet_id}`);
    console.log(`    cluster_id:     ${sample.cluster_id}`);
    console.log(`    source_refs:    ${sample.source_refs.length} refs`);
    console.log(`    feature_ids:    ${sample.feature_ids.slice(0, 3).join(', ')}`);
    console.log(`    ranked_cards:   ${sample.ranked_cards.length}`);
    console.log(`    prompt_context: ${sample.prompt_context.length} chars`);
    console.log(`    degraded:       ${sample.degraded}`);
    console.log(`\n  prompt_context preview:\n${sample.prompt_context.slice(0, 400)}`);
    console.log('\n  Run with --apply to write to Redis.');
    return;
  }

  // Connect to Redis
  try {
    await redis.connect();
    await redis.ping();
    console.log(`\n  ✅ Redis connected (${REDIS_HOST}:${REDIS_PORT})`);
  } catch (e) {
    console.error(`  ❌ Redis connect failed: ${e.message}`);
    process.exit(1);
  }

  const TTL = 86_400; // 24h
  let written = 0;
  let latest = null;
  const pipeline = redis.pipeline();

  for (const cluster of selected) {
    const packet = clusterToPacket(cluster, edgeMap);

    // Write ace:packet:{id}
    pipeline.set(`ace:packet:${packet.packet_id}`, JSON.stringify(packet), 'EX', TTL);

    // Write ace:source_ref:{hash} → packet_id (for Lane 2 source-ref lookup)
    for (const ref of packet.source_refs.slice(0, 6)) {
      pipeline.set(sourceRefRedisKey(ref), packet.packet_id, 'EX', TTL);
    }

    // Write ace:feature:{featureId} → packet_id
    for (const fid of packet.feature_ids.slice(0, 4)) {
      pipeline.set(`ace:feature:${fid}`, packet.packet_id, 'EX', TTL);
    }

    // Write ace:workspace_task:{task_id} → packet_id
    if (packet.workspace_task_id) {
      pipeline.set(`ace:workspace_task:${packet.workspace_task_id}`, packet.packet_id, 'EX', TTL);
    }

    // Also write Bifrost telemetry key for hot-path reuse by query-router Lane 1
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

    latest = packet.packet_id;
    written++;
  }

  // Write ace:packet:latest → last packet_id
  if (latest) {
    pipeline.set('ace:packet:latest', latest, 'EX', TTL);
  }

  await pipeline.exec();

  console.log(`\n  ✅ Wrote ${written} ACE packets to Redis`);
  console.log(`  ✅ ace:packet:latest → ${latest}`);
  console.log(`  ✅ Bifrost retrieval keys: ${written} (2h TTL)`);

  // Write report
  // Compute summary stats across all written packets
  const allPackets = selected.slice(0, written).map(c => clusterToPacket(c, edgeMap));
  const allSourceRefs = new Set(allPackets.flatMap(p => p.source_refs));
  const allFeatures   = new Set(allPackets.flatMap(p => p.feature_ids));
  const allSomClusters = new Set(allPackets.map(p => p.som_cluster).filter(Boolean));
  const totalKagHits  = allPackets.reduce((s, p) => s + p.kag_hits, 0);
  const totalNesKeys  = allPackets.reduce((s, p) => s + p.nes_chrom_packet_keys.length, 0);

  const reportDir = path.join(ROOT, 'memory', 'exports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'ace-packet-ingest-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    packet_count: written,
    engram_count: 0,
    som_cluster_count: allSomClusters.size,
    source_ref_count: allSourceRefs.size,
    feature_count: allFeatures.size,
    dag_hit_count: 0,
    kag_hit_count: totalKagHits,
    nes_chrom_key_count: totalNesKeys,
    ace_packet_latest: latest,
    ttl_seconds: TTL,
    top_n: TOP_N,
  }, null, 2));
  console.log(`  Report → ${reportPath}`);

  await redis.quit();
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
