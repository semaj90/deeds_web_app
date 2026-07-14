#!/usr/bin/env node
/**
 * Audit packet-to-chunk mapping using exact identity evidence only.
 *
 * Accepted evidence:
 *   - exact normalized source_ref
 *   - explicit packet_key in chunk metadata/output_meta
 *   - exact feature_id
 *   - exact tree_node_id
 *   - exact qdrant_id / qdrant_point_id
 *
 * Rejected:
 *   - substring / LIKE / prefix guessing
 *   - empty source/path rows participating in a mapping
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import {
  firstDefined,
  isInvalidSourceRef,
  normalizedSourceRef,
  stableHash,
} from './lib/packet-audit-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');

const { Pool } = pg;
const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 2 });

function addIndex(map, key, value) {
  if (!key) return;
  const bucket = map.get(key);
  if (bucket) {
    bucket.add(value);
  } else {
    map.set(key, new Set([value]));
  }
}

function sampleRows(rows, limit = 10) {
  return rows.slice(0, limit).map((row) => ({ ...row }));
}

function toArray(set) {
  return [...set].sort();
}

function uniqueCount(map) {
  return [...map.values()].reduce((sum, set) => sum + set.size, 0);
}

function countAmbiguous(map) {
  return [...map.values()].filter((set) => set.size > 1).length;
}

function makeReportMarkdown(report) {
  const lines = [
    '# Packet/Chunk Mapping Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    '',
    '## Summary',
    '',
    `- Atlas packets: ${report.totals.atlasPackets.toLocaleString()}`,
    `- Codebase chunks: ${report.totals.codebaseChunks.toLocaleString()}`,
    `- Exact source_ref matches: ${report.matches.exactSourceRef.pairs.toLocaleString()}`,
    `- packet_key matches: ${report.matches.packetKey.pairs.toLocaleString()}`,
    `- feature_id matches: ${report.matches.featureId.pairs.toLocaleString()}`,
    `- tree_node_id matches: ${report.matches.treeNodeId.pairs.toLocaleString()}`,
    `- qdrant_id matches: ${report.matches.qdrantId.pairs.toLocaleString()}`,
    `- ambiguous mappings: ${report.problems.ambiguousMappings.toLocaleString()}`,
    `- unmapped packets: ${report.problems.unmappedPackets.toLocaleString()}`,
    `- chunks mapped to multiple packets: ${report.problems.chunksMappedToMultiplePackets.toLocaleString()}`,
    `- packets mapped to multiple chunks: ${report.problems.packetsMappedToMultipleChunks.toLocaleString()}`,
    `- empty-path rows: ${report.problems.emptyPathRows.toLocaleString()}`,
    `- invalid source refs: ${report.problems.invalidSourceRefs.toLocaleString()}`,
    '',
    '## Samples',
    '',
    `### Empty-path rows`,
    '```json',
    JSON.stringify(report.samples.emptyPathRows, null, 2),
    '```',
    '',
    `### Ambiguous mappings`,
    '```json',
    JSON.stringify(report.samples.ambiguousMappings, null, 2),
    '```',
  ];
  return lines.join('\n');
}

async function main() {
  const client = await pool.connect();
  try {
    const packetRes = await client.query(`
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

    const chunkRes = await client.query(`
      SELECT
        id,
        qdrant_id,
        source_ref,
        relative_path,
        metadata,
        output_meta,
        kind
      FROM codebase_chunk_index
      WHERE id IS NOT NULL
    `);

    const packets = packetRes.rows;
    const chunks = chunkRes.rows;

    const packetByKey = new Map();
    const packetBySource = new Map();
    const packetByFeature = new Map();
    const packetByTreeNode = new Map();
    const packetByQdrant = new Map();

    for (const packet of packets) {
      const keys = new Set([
        normalizedSourceRef(firstDefined(packet.canonical_source_ref, packet.source_ref_key, packet.source_ref)),
      ]);
      for (const key of keys) {
        if (key) addIndex(packetBySource, key, packet.packet_key);
      }
      addIndex(packetByKey, packet.packet_key, packet.packet_key);
      addIndex(packetByFeature, firstDefined(packet.feature_id), packet.packet_key);
      addIndex(packetByTreeNode, firstDefined(packet.tree_node_id), packet.packet_key);
      addIndex(packetByQdrant, firstDefined(packet.qdrant_point_id), packet.packet_key);
    }

    const chunkToPackets = new Map();
    const packetToChunks = new Map();
    const evidenceCounts = {
      exactSourceRef: 0,
      packetKey: 0,
      featureId: 0,
      treeNodeId: 0,
      qdrantId: 0,
    };

    const invalidSourceRows = [];
    const emptyPathRows = [];
    const ambiguousMappings = [];
    const emptySourceMappedChunks = [];
    let unmappedChunkCount = 0;

    for (const chunk of chunks) {
      const rawSource = firstDefined(chunk.source_ref, chunk.relative_path, chunk.metadata?.source_ref, chunk.output_meta?.source_ref);
      const normalized = normalizedSourceRef(rawSource);
      const rawRelative = firstDefined(chunk.relative_path);

      const hasEmptyPath = !normalized || !rawSource;
      if (hasEmptyPath) {
        emptyPathRows.push({
          id: chunk.id,
          source_ref: chunk.source_ref ?? null,
          relative_path: chunk.relative_path ?? null,
          qdrant_id: chunk.qdrant_id ?? null,
        });
      }
      if (isInvalidSourceRef(rawSource)) {
        invalidSourceRows.push({
          id: chunk.id,
          source_ref: chunk.source_ref ?? null,
          relative_path: chunk.relative_path ?? null,
        });
      }

      const candidatePackets = new Map();
      const sourcePackets = normalized ? packetBySource.get(normalized) ?? new Set() : new Set();
      const packetKeyPackets = new Set();
      const featurePackets = new Set();
      const treeNodePackets = new Set();
      const qdrantPackets = new Set();

      const explicitPacketKey = firstDefined(chunk.metadata?.packet_key, chunk.output_meta?.packet_key);
      if (explicitPacketKey && packetByKey.has(explicitPacketKey)) {
        for (const packetKey of packetByKey.get(explicitPacketKey) ?? []) {
          packetKeyPackets.add(packetKey);
          addIndex(packetToChunks, packetKey, chunk.id);
          evidenceCounts.packetKey++;
        }
      }

      const explicitFeatureId = firstDefined(chunk.metadata?.feature_id, chunk.output_meta?.feature_id);
      if (explicitFeatureId && packetByFeature.has(explicitFeatureId)) {
        for (const packetKey of packetByFeature.get(explicitFeatureId) ?? []) {
          featurePackets.add(packetKey);
          addIndex(packetToChunks, packetKey, chunk.id);
          evidenceCounts.featureId++;
        }
      }

      const explicitTreeNodeId = firstDefined(chunk.metadata?.tree_node_id, chunk.output_meta?.tree_node_id);
      if (explicitTreeNodeId && packetByTreeNode.has(explicitTreeNodeId)) {
        for (const packetKey of packetByTreeNode.get(explicitTreeNodeId) ?? []) {
          treeNodePackets.add(packetKey);
          addIndex(packetToChunks, packetKey, chunk.id);
          evidenceCounts.treeNodeId++;
        }
      }

      const explicitQdrantId = firstDefined(chunk.qdrant_id);
      if (explicitQdrantId && packetByQdrant.has(explicitQdrantId)) {
        for (const packetKey of packetByQdrant.get(explicitQdrantId) ?? []) {
          qdrantPackets.add(packetKey);
          addIndex(packetToChunks, packetKey, chunk.id);
          evidenceCounts.qdrantId++;
        }
      }

      if (normalized && sourcePackets.size > 0) {
        for (const packetKey of sourcePackets) {
          addIndex(packetToChunks, packetKey, chunk.id);
          evidenceCounts.exactSourceRef++;
        }
      }

      const packetCandidates = new Set([
        ...sourcePackets,
        ...packetKeyPackets,
        ...featurePackets,
        ...treeNodePackets,
        ...qdrantPackets,
      ]);

      if (packetCandidates.size > 1) {
        ambiguousMappings.push({
          chunk_id: chunk.id,
          source_ref: rawSource || null,
          relative_path: chunk.relative_path ?? null,
          packet_keys: toArray(packetCandidates),
        });
      }

      if (packetCandidates.size === 0) {
        unmappedChunkCount++;
        continue;
      }

      if (hasEmptyPath) {
        emptySourceMappedChunks.push({
          chunk_id: chunk.id,
          source_ref: rawSource || null,
          relative_path: chunk.relative_path ?? null,
          packet_keys: toArray(packetCandidates),
        });
      }

      for (const packetKey of packetCandidates) {
        addIndex(chunkToPackets, chunk.id, packetKey);
      }
    }

    const packetWithChunks = new Set([...packetToChunks.keys()]);
    const packetWithoutChunks = packets
      .map((packet) => packet.packet_key)
      .filter((packetKey) => !packetWithChunks.has(packetKey));

    const packetsMappedToMultipleChunks = [...packetToChunks.entries()]
      .filter(([, chunkIds]) => chunkIds.size > 1)
      .map(([packetKey, chunkIds]) => ({
        packet_key: packetKey,
        chunk_ids: toArray(chunkIds),
      }));

    const chunksMappedToMultiplePackets = [...chunkToPackets.entries()]
      .filter(([, packetKeys]) => packetKeys.size > 1)
      .map(([chunkId, packetKeys]) => ({
        chunk_id: chunkId,
        packet_keys: toArray(packetKeys),
      }));

    const report = {
      generatedAt: new Date().toISOString(),
      runId: `packet-chunk-mapping-${stableHash({
        packets: packets.length,
        chunks: chunks.length,
        ts: new Date().toISOString().slice(0, 10),
      })}`,
      status: emptySourceMappedChunks.length > 0
        ? 'FAIL'
        : (invalidSourceRows.length > 0 || ambiguousMappings.length > 0 ? 'WARN' : 'PASS'),
      totals: {
        atlasPackets: packets.length,
        codebaseChunks: chunks.length,
      },
      matches: {
        exactSourceRef: {
          pairs: evidenceCounts.exactSourceRef,
          packets: packetWithChunks.size,
          chunks: chunkToPackets.size,
        },
        packetKey: {
          pairs: evidenceCounts.packetKey,
          packets: [...packetToChunks.entries()].filter(([, ids]) => ids.size > 0).length,
          chunks: [...chunkToPackets.entries()].filter(([, ids]) => ids.size > 0).length,
        },
        featureId: {
          pairs: evidenceCounts.featureId,
          packets: [...packetToChunks.entries()].filter(([, ids]) => ids.size > 0).length,
          chunks: [...chunkToPackets.entries()].filter(([, ids]) => ids.size > 0).length,
        },
        treeNodeId: {
          pairs: evidenceCounts.treeNodeId,
          packets: [...packetToChunks.entries()].filter(([, ids]) => ids.size > 0).length,
          chunks: [...chunkToPackets.entries()].filter(([, ids]) => ids.size > 0).length,
        },
        qdrantId: {
          pairs: evidenceCounts.qdrantId,
          packets: [...packetToChunks.entries()].filter(([, ids]) => ids.size > 0).length,
          chunks: [...chunkToPackets.entries()].filter(([, ids]) => ids.size > 0).length,
        },
      },
      problems: {
        ambiguousMappings: ambiguousMappings.length,
        unmappedPackets: packetWithoutChunks.length,
        chunksMappedToMultiplePackets: chunksMappedToMultiplePackets.length,
        packetsMappedToMultipleChunks: packetsMappedToMultipleChunks.length,
        emptyPathRows: emptyPathRows.length,
        invalidSourceRefs: invalidSourceRows.length,
        emptySourceMappedChunks: emptySourceMappedChunks.length,
      },
      samples: {
        emptyPathRows: sampleRows(emptyPathRows, 10),
        invalidSourceRefs: sampleRows(invalidSourceRows, 10),
        ambiguousMappings: sampleRows(ambiguousMappings, 10),
        chunksMappedToMultiplePackets: sampleRows(chunksMappedToMultiplePackets, 10),
        packetsMappedToMultipleChunks: sampleRows(packetsMappedToMultipleChunks, 10),
      },
      notes: [
        'Exact source_ref normalization only; no substring, LIKE, or prefix matching was used.',
        'tree_node_id matching is only counted when the value is explicitly present in packet/chunk payload metadata.',
      ],
    };

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.writeFile(
      path.join(REPORTS_DIR, 'packet-chunk-mapping-audit.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(REPORTS_DIR, 'packet-chunk-mapping-audit.md'),
      `${makeReportMarkdown(report)}\n`,
      'utf8',
    );

    console.log(JSON.stringify(report, null, 2));

    if (emptySourceMappedChunks.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[audit-packet-chunk-mapping] failed:', error?.stack ?? error?.message ?? error);
  process.exit(1);
});
