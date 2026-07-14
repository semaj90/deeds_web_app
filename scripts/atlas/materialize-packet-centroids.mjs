#!/usr/bin/env node
/**
 * Materialize packet-level centroids from chunk embeddings.
 *
 * Default mode is dry-run and limit 100 packets.
 * The job aggregates chunk vectors into packet-level centroids first, then
 * writes packet-level topology metadata only when --apply is provided.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import {
  firstDefined,
  isInvalidSourceRef,
  l2Normalize,
  normalizedSourceRef,
  parsePgVectorText,
  stableHash,
  vectorChecksum,
} from './lib/packet-audit-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');

const { Pool } = pg;
const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 2 });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = process.argv.includes('--verbose');
const LIMIT_IDX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_IDX !== -1 && process.argv[LIMIT_IDX + 1]
  ? Math.max(1, parseInt(process.argv[LIMIT_IDX + 1], 10))
  : 100;

function addIndex(map, key, value) {
  if (!key) return;
  const bucket = map.get(key);
  if (bucket) {
    bucket.add(value);
  } else {
    map.set(key, new Set([value]));
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = firstDefined(value);
    if (text) return text;
  }
  return '';
}

function makePacketTopologyPacketCentroid(packetKey, centroid, payload) {
  return {
    packet_centroid_768: {
      packet_key: packetKey,
      vector_model: 'codebase_chunks_768',
      vector_dimension: 768,
      aggregation: 'normalized_mean',
      chunk_count: payload.chunkCount,
      source_ref: payload.sourceRef,
      source_ref_count: payload.sourceRefCount,
      qdrant_id_count: payload.qdrantIdCount,
      feature_id_count: payload.featureIdCount,
      tree_node_id_count: payload.treeNodeIdCount,
      centroid_checksum: vectorChecksum(centroid),
      centroid_norm: 1,
      run_id: payload.runId,
      materialized_at: new Date().toISOString(),
      sample_chunk_ids: payload.sampleChunkIds.slice(0, 10),
      sample_kind: payload.sampleKind,
    },
  };
}

function normalizePacketTopology(existing, centroidEnvelope) {
  const topology = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  topology.packet_centroid_768 = centroidEnvelope.packet_centroid_768;
  return topology;
}

async function loadPacketIndex(client) {
  const { rows } = await client.query(`
    SELECT
      packet_key,
      source_ref,
      canonical_source_ref,
      source_ref_key,
      feature_id,
      tree_node_id,
      qdrant_point_id
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
  `);

  const byKey = new Map();
  const bySource = new Map();
  const byFeature = new Map();
  const byTree = new Map();
  const byQdrant = new Map();

  for (const row of rows) {
    const packetKey = row.packet_key;
    byKey.set(packetKey, row);

    const source = normalizedSourceRef(firstNonEmpty(row.canonical_source_ref, row.source_ref_key, row.source_ref));
    if (source) addIndex(bySource, source, packetKey);
    addIndex(byFeature, firstNonEmpty(row.feature_id), packetKey);
    addIndex(byTree, firstNonEmpty(row.tree_node_id), packetKey);
    addIndex(byQdrant, firstNonEmpty(row.qdrant_point_id), packetKey);
  }

  return { byKey, bySource, byFeature, byTree, byQdrant };
}

function resolvePacketKey(chunk, packetIndex) {
  const candidates = new Set();
  const explicitPacketKey = firstNonEmpty(chunk.metadata?.packet_key, chunk.output_meta?.packet_key);
  const explicitFeatureId = firstNonEmpty(chunk.metadata?.feature_id, chunk.output_meta?.feature_id);
  const explicitTreeNodeId = firstNonEmpty(chunk.metadata?.tree_node_id, chunk.output_meta?.tree_node_id);
  const explicitQdrantId = firstNonEmpty(chunk.qdrant_id);
  const source = normalizedSourceRef(firstNonEmpty(chunk.source_ref, chunk.relative_path, chunk.metadata?.source_ref, chunk.output_meta?.source_ref));

  if (explicitPacketKey && packetIndex.byKey.has(explicitPacketKey)) {
    candidates.add(explicitPacketKey);
  }
  if (source && packetIndex.bySource.has(source)) {
    for (const packetKey of packetIndex.bySource.get(source) ?? []) candidates.add(packetKey);
  }
  if (explicitFeatureId && packetIndex.byFeature.has(explicitFeatureId)) {
    for (const packetKey of packetIndex.byFeature.get(explicitFeatureId) ?? []) candidates.add(packetKey);
  }
  if (explicitTreeNodeId && packetIndex.byTree.has(explicitTreeNodeId)) {
    for (const packetKey of packetIndex.byTree.get(explicitTreeNodeId) ?? []) candidates.add(packetKey);
  }
  if (explicitQdrantId && packetIndex.byQdrant.has(explicitQdrantId)) {
    for (const packetKey of packetIndex.byQdrant.get(explicitQdrantId) ?? []) candidates.add(packetKey);
  }

  return {
    candidates,
    source,
    explicitPacketKey,
    explicitFeatureId,
    explicitTreeNodeId,
    explicitQdrantId,
  };
}

async function main() {
  const client = await pool.connect();
  const runId = `packet-centroid-${stableHash({ ts: new Date().toISOString(), limit: LIMIT, apply: APPLY })}`;
  const startTime = Date.now();

  try {
    const packetIndex = await loadPacketIndex(client);
    const chunkQuery = await client.query(`
      SELECT
        id,
        qdrant_id,
        source_ref,
        relative_path,
        metadata,
        output_meta,
        content_embedding,
        kind
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
      ORDER BY id ASC
    `);

    const packetStats = new Map();
    const problems = {
      invalidSourceRefs: 0,
      emptyPathRows: 0,
      ambiguousMappings: 0,
      unmappedChunks: 0,
      parseFailures: 0,
      nonFiniteVectors: 0,
      emptySourceMappedChunks: 0,
    };

    for (const chunk of chunkQuery.rows) {
      const rawSource = firstNonEmpty(chunk.source_ref, chunk.relative_path, chunk.metadata?.source_ref, chunk.output_meta?.source_ref);
      const normalized = normalizedSourceRef(rawSource);
      const rawRelative = firstNonEmpty(chunk.relative_path);
      const hasEmptyPath = !normalized || !rawRelative;
      if (hasEmptyPath) problems.emptyPathRows++;
      if (isInvalidSourceRef(rawSource)) problems.invalidSourceRefs++;

      const vector = parsePgVectorText(chunk.content_embedding);
      if (!vector) {
        problems.parseFailures++;
        continue;
      }
      const normalizedVector = l2Normalize(vector);
      if (!normalizedVector || normalizedVector.some((value) => !Number.isFinite(value))) {
        problems.nonFiniteVectors++;
        continue;
      }

      const resolution = resolvePacketKey(chunk, packetIndex);
      if (resolution.candidates.size === 0) {
        problems.unmappedChunks++;
        continue;
      }
      if (resolution.candidates.size > 1) {
        problems.ambiguousMappings++;
        continue;
      }
      if (hasEmptyPath) {
        problems.emptySourceMappedChunks++;
        continue;
      }

      const [packetKey] = resolution.candidates;
      const packet = packetIndex.byKey.get(packetKey);
      if (!packet) continue;

      const entry = packetStats.get(packetKey) ?? {
        packetKey,
        sourceRef: firstNonEmpty(packet.canonical_source_ref, packet.source_ref_key, packet.source_ref),
        chunkIds: [],
        sourceRefs: new Set(),
        featureIds: new Set(),
        treeNodeIds: new Set(),
        qdrantIds: new Set(),
        kinds: new Set(),
        sumVector: null,
        vectorCount: 0,
      };

      if (!entry.sumVector) {
        entry.sumVector = new Array(normalizedVector.length).fill(0);
      }
      for (let i = 0; i < normalizedVector.length; i++) {
        entry.sumVector[i] += normalizedVector[i];
      }
      entry.vectorCount++;
      entry.chunkIds.push(chunk.id);
      entry.sourceRefs.add(normalized || '');
      const featureId = firstNonEmpty(chunk.metadata?.feature_id, chunk.output_meta?.feature_id);
      const treeNodeId = firstNonEmpty(chunk.metadata?.tree_node_id, chunk.output_meta?.tree_node_id);
      const qdrantId = firstNonEmpty(chunk.qdrant_id);
      if (featureId) entry.featureIds.add(featureId);
      if (treeNodeId) entry.treeNodeIds.add(treeNodeId);
      if (qdrantId) entry.qdrantIds.add(qdrantId);
      if (chunk.kind) entry.kinds.add(String(chunk.kind));

      packetStats.set(packetKey, entry);
    }

    const packetCentroids = [...packetStats.values()]
      .map((entry) => {
        const mean = entry.sumVector.map((value) => value / entry.vectorCount);
        const centroid = l2Normalize(mean) ?? mean;
        return {
          ...entry,
          centroid,
          checksum: vectorChecksum(centroid),
        };
      })
      .sort((a, b) => b.vectorCount - a.vectorCount || a.packetKey.localeCompare(b.packetKey));

    const selected = packetCentroids.slice(0, LIMIT);
    const applyRows = [];

    for (const entry of selected) {
      const packetTopology = makePacketTopologyPacketCentroid(entry.packetKey, entry.centroid, {
        runId,
        chunkCount: entry.vectorCount,
        sourceRef: entry.sourceRef,
        sourceRefCount: entry.sourceRefs.size,
        featureIdCount: entry.featureIds.size,
        treeNodeIdCount: entry.treeNodeIds.size,
        qdrantIdCount: entry.qdrantIds.size,
        sampleChunkIds: entry.chunkIds,
        sampleKind: [...entry.kinds][0] ?? null,
      });

      applyRows.push({
        packetKey: entry.packetKey,
        sourceRef: entry.sourceRef,
        chunkCount: entry.vectorCount,
        centroidChecksum: entry.checksum,
        packetTopology,
      });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      runId,
      mode: DRY_RUN ? 'dry-run' : 'apply',
      limit: LIMIT,
      totals: {
        packetsSeen: packetIndex.byKey.size,
        chunksSeen: chunkQuery.rows.length,
        packetCandidates: packetStats.size,
        selectedPackets: selected.length,
      },
      problems,
      samples: {
        selectedPackets: applyRows.slice(0, 10),
      },
      status: problems.emptySourceMappedChunks > 0 || problems.parseFailures > 0 || problems.nonFiniteVectors > 0
        ? 'FAIL'
        : (problems.ambiguousMappings > 0 || problems.unmappedChunks > 0 ? 'WARN' : 'PASS'),
      notes: [
        'Vectors are parsed from content_embedding (768-dim) and normalized before mean aggregation.',
        'Packet centroids are materialized at packet level and written to atlas_packets.topology.packet_centroid_768 only when --apply is provided.',
      ],
    };

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.writeFile(
      path.join(REPORTS_DIR, 'packet-centroid-materialization.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );

    if (DRY_RUN) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    let updated = 0;
    for (const row of applyRows) {
      const existing = await client.query(
        `SELECT topology FROM atlas_packets WHERE packet_key = $1`,
        [row.packetKey],
      );
      const currentTopology = existing.rows[0]?.topology ?? null;
      const nextTopology = normalizePacketTopology(currentTopology, row.packetTopology);

      const currentChecksum = currentTopology?.packet_centroid_768?.centroid_checksum ?? null;
      const currentChunkCount = currentTopology?.packet_centroid_768?.chunk_count ?? null;
      const currentVectorModel = currentTopology?.packet_centroid_768?.vector_model ?? null;
      const currentVectorDimension = currentTopology?.packet_centroid_768?.vector_dimension ?? null;

      const sameCentroid =
        currentChecksum === row.centroidChecksum &&
        Number(currentChunkCount) === Number(row.chunkCount) &&
        currentVectorModel === 'codebase_chunks_768' &&
        Number(currentVectorDimension) === 768;

      if (sameCentroid) continue;

      await client.query(
        `
          UPDATE atlas_packets
          SET
            topology = $2::jsonb,
            updated_at = NOW()
          WHERE packet_key = $1
        `,
        [row.packetKey, JSON.stringify(nextTopology)],
      );
      updated++;
    }

    report.status = problems.emptySourceMappedChunks > 0 || problems.invalidSourceRefs > 0 || problems.ambiguousMappings > 0
      ? 'FAIL'
      : 'PASS';
    report.summary = {
      updatedPackets: updated,
      skippedAsCurrent: applyRows.length - updated,
      durationMs: Date.now() - startTime,
    };

    await fs.writeFile(
      path.join(REPORTS_DIR, 'packet-centroid-materialization.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );

    console.log(JSON.stringify(report, null, 2));

    if (problems.emptySourceMappedChunks > 0 || problems.parseFailures > 0 || problems.nonFiniteVectors > 0) {
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[materialize-packet-centroids] failed:', error?.stack ?? error?.message ?? error);
  process.exit(1);
});
