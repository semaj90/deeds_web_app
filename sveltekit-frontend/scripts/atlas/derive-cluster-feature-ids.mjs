#!/usr/bin/env node
/**
 * derive-cluster-feature-ids.mjs
 *
 * Two-pass Qdrant aggregation:
 *
 * Pass 1 — scroll all points in codebase_chunks_768, group by som_cluster
 *   (or somRow:somCol), collect feature_id + area + topo_class values per cluster.
 *
 * Pass 2 — for each cluster, rank the collected feature_ids by frequency,
 *   take top-8, then write feature_ids[] + lane_ids[] back to every member point.
 *
 * This is the correct direction: Qdrant members → cluster aggregate → back to members.
 * The NDJSON cluster-summary is NOT the source of truth for feature_ids — the
 * individual point payloads are.
 *
 * Usage:
 *   node scripts/atlas/derive-cluster-feature-ids.mjs
 *   node scripts/atlas/derive-cluster-feature-ids.mjs --dry-run
 *   node scripts/atlas/derive-cluster-feature-ids.mjs --force      # overwrite existing
 *   node scripts/atlas/derive-cluster-feature-ids.mjs --top=8      # feature_ids per cluster
 */

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');
const TOP_ARG = process.argv.find(a => a.startsWith('--top='));
const TOP_N   = TOP_ARG ? Math.max(1, parseInt(TOP_ARG.split('=')[1])) : 8;
const BATCH   = 200;

const QDRANT_URL        = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';

// Lane derivation from feature_id prefix / topo_class
const LANE_MAP = {
  ace: 'orchestration_ace', atlas: 'graph_topology', cache: 'compute_ranking',
  db: 'durable_truth', embed: 'compute_ranking', evidence: 'durable_truth',
  gpu: 'compute_ranking', graph: 'graph_topology', indexer: 'graph_topology',
  kag: 'graph_topology', legal: 'durable_truth', neo4j: 'graph_topology',
  nes: 'durable_truth', qdrant: 'compute_ranking', redis: 'compute_ranking',
  retrieval: 'orchestration_ace', schema: 'durable_truth', som: 'graph_topology',
  tools: 'orchestration_future', vlm: 'compute_ranking', yorha: 'orchestration_ace',
};

function featureToLane(featureId) {
  const prefix = (featureId || '').toLowerCase().split(/[_\-]/)[0];
  return LANE_MAP[prefix] ?? 'sourceRef_spine';
}

// ── Pass 1: scroll all points, build cluster → feature frequency map ──────────

/** @type {Map<string, {featureFreq: Map<string, number>, pointIds: (string|number)[], alreadyPatched: number}>} */
const clusterData = new Map();

let scrollOffset = null;
let totalScanned = 0;
let guard = 0;

process.stdout.write('Pass 1: scanning all points...\n');

while (guard < 500) {
  guard++;
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: BATCH, offset: scrollOffset, with_payload: true, with_vector: false }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) { console.error('Qdrant scroll error', res.status); break; }
  const data = await res.json();
  const points = data?.result?.points ?? [];
  if (!points.length) break;

  for (const point of points) {
    totalScanned++;
    const p = point.payload ?? {};

    // Derive cluster key
    const somCluster = p.som_cluster
      ?? ((p.somRow != null && p.somCol != null) ? `${p.somRow}:${p.somCol}` : null)
      ?? (p.gpuCluster != null ? `gpu:${p.gpuCluster}` : null);

    if (!somCluster) continue;

    if (!clusterData.has(somCluster)) {
      clusterData.set(somCluster, { featureFreq: new Map(), pointIds: [], alreadyPatched: 0 });
    }
    const entry = clusterData.get(somCluster);
    entry.pointIds.push(point.id);

    // Count already-patched (has non-empty feature_ids)
    if (!FORCE && Array.isArray(p.feature_ids) && p.feature_ids.length > 0) {
      entry.alreadyPatched++;
    }

    // Collect feature signals from the point
    const signals = [];
    if (p.feature_id)   signals.push(String(p.feature_id));
    if (p.area)         signals.push(String(p.area));
    if (p.topo_class)   signals.push(String(p.topo_class));
    if (p.agent_area)   signals.push(String(p.agent_area));
    if (p.domain)       signals.push(String(p.domain));
    if (Array.isArray(p.tags)) p.tags.slice(0, 3).forEach(t => signals.push(String(t)));

    for (const sig of signals) {
      const clean = sig.toLowerCase().replace(/[^a-z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      if (clean.length >= 2) {
        entry.featureFreq.set(clean, (entry.featureFreq.get(clean) ?? 0) + 1);
      }
    }
  }

  if (totalScanned % 5000 === 0) process.stdout.write(`  scanned ${totalScanned}...\n`);

  const next = data?.result?.next_page_offset;
  if (next === null || next === undefined || !points.length) break;
  scrollOffset = next;
}

process.stdout.write(`  done. scanned ${totalScanned}, found ${clusterData.size} clusters.\n\n`);

// ── Build cluster → top feature_ids + lane_ids ────────────────────────────────

/** @type {Map<string, {feature_ids: string[], lane_ids: string[]}>} */
const clusterResolved = new Map();

for (const [cluster, entry] of clusterData) {
  const sorted = [...entry.featureFreq.entries()].sort((a, b) => b[1] - a[1]);
  const topFeatures = sorted.slice(0, TOP_N).map(([f]) => f);
  const lanes = [...new Set(topFeatures.map(featureToLane))];
  clusterResolved.set(cluster, { feature_ids: topFeatures, lane_ids: lanes });
}

console.log(`Cluster aggregation complete:`);
const clustersWithFeatures = [...clusterResolved.values()].filter(v => v.feature_ids.length > 0).length;
console.log(`  ${clusterResolved.size} clusters, ${clustersWithFeatures} with feature_ids > 0\n`);

// Sample top clusters
const topClusters = [...clusterData.entries()]
  .sort((a, b) => b[1].pointIds.length - a[1].pointIds.length)
  .slice(0, 5);
for (const [k, entry] of topClusters) {
  const resolved = clusterResolved.get(k);
  console.log(`  ${k}: ${entry.pointIds.length} points → [${resolved?.feature_ids.slice(0,4).join(', ')}]`);
}
console.log();

// ── Pass 2: write feature_ids + lane_ids back to all member points ────────────

let totalPatched = 0;
let totalSkipped = 0;

process.stdout.write(`Pass 2: writing feature_ids to Qdrant${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

for (const [cluster, entry] of clusterData) {
  const resolved = clusterResolved.get(cluster);
  if (!resolved || resolved.feature_ids.length === 0) {
    totalSkipped += entry.pointIds.length;
    continue;
  }

  // Skip entire cluster if all already patched and not --force
  if (!FORCE && entry.alreadyPatched === entry.pointIds.length) {
    totalSkipped += entry.pointIds.length;
    continue;
  }

  if (DRY_RUN) {
    totalPatched += entry.pointIds.length - entry.alreadyPatched;
    totalSkipped += entry.alreadyPatched;
    continue;
  }

  // Write in batches of 100 point IDs per Qdrant call
  for (let i = 0; i < entry.pointIds.length; i += 100) {
    const ids = entry.pointIds.slice(i, i + 100);
    try {
      const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: ids,
          payload: {
            feature_ids: resolved.feature_ids,
            lane_ids:    resolved.lane_ids,
            som_cluster: cluster,
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (r.ok) totalPatched += ids.length;
      else totalSkipped += ids.length;
    } catch {
      totalSkipped += ids.length;
    }
  }

  if ((totalPatched + totalSkipped) % 5000 < 200) {
    process.stdout.write(`  patched ${totalPatched} / skipped ${totalSkipped}...\n`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────────────────');
console.log(`  Total scanned : ${totalScanned}`);
console.log(`  Clusters      : ${clusterData.size}`);
console.log(`  Patched       : ${totalPatched}${DRY_RUN ? ' (dry run)' : ''}`);
console.log(`  Skipped       : ${totalSkipped}`);
console.log(`  Top-N         : ${TOP_N} feature_ids per cluster`);

if (DRY_RUN) {
  console.log('\n  Re-run without --dry-run to apply.');
} else {
  console.log('\n  ✓ Done. Re-run smoke:golden-retrieval to verify feature coverage.');
}
