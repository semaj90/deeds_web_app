#!/usr/bin/env node
/**
 * scripts/atlas/validate-manifold4-payloads.mjs
 * 
 * Validates that Qdrant points have manifold4 metadata, and can repair
 * missing cluster aliases / manifold metadata from nearest-centroid lookup.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const QDRANT_URL = process.env.QDRANT_URL;
const HG_LOOKUP_URL = process.env.HG_LOOKUP_URL || process.env.TOPOLOGY_SEARCH_URL;
const COLLECTION = process.argv[2] || 'codebase_chunks_768';
const SAMPLE_SIZE = Number(process.env.MANIFOLD_SAMPLE_SIZE || 100);
const REPAIR_MODE = process.argv.includes('--repair-missing');
const REPAIR_ALIASES = process.argv.includes('--repair-aliases');
const MANIFEST_PATH = resolve(process.cwd(), 'docs/graph/cluster-aliases.json');

function loadAliasMap() {
  if (!existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function resolveAlias(clusterId, aliasMap) {
  return aliasMap[String(clusterId)]?.alias ?? null;
}

function buildManifoldMeta(payload, clusterId, alias) {
  const somX = Number(payload.somRow ?? payload.som_x ?? payload.som_bmu_row ?? 0) || 0;
  const somY = Number(payload.somCol ?? payload.som_y ?? payload.som_bmu_col ?? 0) || 0;
  const semanticZ = Number(payload.semantic_z ?? payload.dense ?? payload.score ?? 0) || 0;
  const activityW = Number(payload.activity_w ?? payload.pagerank ?? payload.pageRank ?? 0) || 0;
  return {
    som_x: somX,
    som_y: somY,
    semantic_z: semanticZ,
    activity_w: activityW,
    cluster_id: clusterId != null ? String(clusterId) : undefined,
    gpu_cluster: payload.gpu_cluster != null ? String(payload.gpu_cluster) : undefined,
    som_cluster: payload.som_cluster != null ? String(payload.som_cluster) : undefined,
    cluster_alias: alias ?? undefined,
    pagerank: Number(payload.pagerank ?? payload.pageRank ?? 0) || 0,
    hit_rate: Number(payload.hit_rate ?? payload.hitRate ?? 0) || 0,
    last_used_at: payload.last_used_at ?? payload.lastUsedAt ?? undefined,
  };
}

async function getNearestCluster(vector) {
  if (!HG_LOOKUP_URL) return null;
  try {
    const res = await fetch(`${HG_LOOKUP_URL}/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, topK: 1 })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.clusterIds?.[0] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  if (!QDRANT_URL) {
    throw new Error('QDRANT_URL is required');
  }

  console.log(`🔍 Validating manifold4 payloads in ${COLLECTION}...`);
  const aliasMap = loadAliasMap();

  const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: SAMPLE_SIZE, with_payload: true, with_vector: REPAIR_MODE })
  });

  if (!scrollRes.ok) {
    console.error('❌ Failed to scroll Qdrant.');
    process.exit(1);
  }

  const data = await scrollRes.json();
  const points = data.result?.points || [];

  let withManifold = 0;
  let repaired = 0;
  let aliased = 0;

  for (const p of points) {
    const payload = p.payload || {};
    const clusterId = payload.gpu_cluster ?? payload.som_cluster ?? null;
    const alias = clusterId != null ? resolveAlias(clusterId, aliasMap) : null;
    if (p.payload?.manifold4) withManifold++;

    if (REPAIR_MODE || REPAIR_ALIASES) {
      const needsRepair = !p.payload?.manifold4 || !p.payload?.cluster_alias;
      if (needsRepair && (p.vector || clusterId != null)) {
        const resolvedCluster = clusterId ?? await getNearestCluster(p.vector);
        const resolvedAlias = resolvedCluster != null ? resolveAlias(resolvedCluster, aliasMap) : null;
        const patch = {};

        if (REPAIR_MODE && resolvedCluster != null) {
          patch.gpu_cluster = resolvedCluster;
          patch.som_cluster = resolvedCluster;
          patch.manifold4_meta = buildManifoldMeta(payload, resolvedCluster, resolvedAlias);
        }
        if (REPAIR_ALIASES && resolvedAlias) {
          patch.cluster_alias = resolvedAlias;
        }

        if (Object.keys(patch).length > 0) {
          await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: [p.id], payload: patch })
          });
          repaired++;
          if (!p.payload?.cluster_alias && resolvedAlias) aliased++;
        }
      }
    }
  }

  console.log(`📊 Result: ${withManifold}/${points.length} points have manifold4 metadata.`);
  if (repaired > 0) console.log(`🛠️ Repaired points: ${repaired}`);
  if (aliased > 0) console.log(`🏷️ Alias backfills: ${aliased}`);

  if (withManifold < points.length * 0.9) {
    console.warn('⚠️  Most points are missing manifold4 data. Run backfill-manifold-metadata.mjs.');
  } else {
    console.log('✅ Manifold4 validation passed.');
  }
}

main().catch((err) => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
