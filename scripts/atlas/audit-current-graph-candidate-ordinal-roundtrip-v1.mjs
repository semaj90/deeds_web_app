#!/usr/bin/env node

/** Read-only proof of graph-ordinal ↔ CandidateOrdinal identity interchange. */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const artifactDir = resolve(root, 'sveltekit-frontend/docs/reports/current-structural-graph-artifact-v1');
const mapPath = resolve(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json');
const reportPath = resolve(root, 'docs/reports/current-graph-candidate-ordinal-roundtrip-v1.json');

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

const manifest = read(resolve(artifactDir, 'manifest.json'));
const map = read(mapPath);
const candidates = Array.isArray(map.candidates) ? map.candidates : [];
const byPacket = new Map(candidates.map((candidate) => [candidate.packetKey, candidate]));
const nodes = read(resolve(artifactDir, 'nodes.json')).rows;

const bindings = nodes.map((node) => {
  const candidate = node.packet_key ? byPacket.get(node.packet_key) : null;
  return {
    graphOrdinal: Number(node.gpu_node_id),
    graphNodeKey: node.graph_node_key,
    packetKey: node.packet_key ?? null,
    candidateOrdinal: candidate?.candidateOrdinal ?? null,
    candidateSnapshotRevision: candidate?.candidateSnapshotRevision ?? null,
    workspaceRevision: candidate?.workspaceRevision ?? null,
    sourceRevision: candidate?.sourceRevision ?? null,
  };
});

const bound = bindings.filter((row) => row.candidateOrdinal !== null);
const missing = bindings.filter((row) => row.candidateOrdinal === null);
const workspaceMismatches = bound.filter((row) => row.workspaceRevision !== manifest.workspaceRevision);
const packetOrdinalSets = new Map();
for (const row of bound) {
  if (!row.packetKey) continue;
  if (!packetOrdinalSets.has(row.packetKey)) packetOrdinalSets.set(row.packetKey, new Set());
  packetOrdinalSets.get(row.packetKey).add(row.candidateOrdinal);
}
const conflictingPacketOrdinals = [...packetOrdinalSets.entries()]
  .filter(([, ordinals]) => ordinals.size !== 1)
  .map(([packetKey, ordinals]) => ({ packetKey, candidateOrdinals: [...ordinals].sort((a, b) => a - b) }));
const mappingDigest = hash(bound
  .sort((a, b) => a.graphOrdinal - b.graphOrdinal)
  .map((row) => `${row.graphOrdinal}|${row.graphNodeKey}|${row.packetKey}|${row.candidateOrdinal}`)
  .join('\n'));

const report = {
  schema: 'atlas.current-graph-candidate-ordinal-roundtrip-v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_AUDIT',
  graphRevision: manifest.graphRevision,
  projectionRevision: manifest.projectionRevision,
  workspaceRevision: manifest.workspaceRevision,
  candidateSnapshotRevision: map.candidateSnapshotRevision,
  ordinalMapChecksum: map.ordinalMapChecksum,
  graphNodeCount: nodes.length,
  boundNodeCount: bound.length,
  unboundNodeCount: missing.length,
  workspaceMismatches: workspaceMismatches.length,
  conflictingPacketOrdinals,
  mappingDigest: `sha256:${mappingDigest}`,
  bindings,
  status: bound.length > 0 && workspaceMismatches.length === 0 && conflictingPacketOrdinals.length === 0
    ? 'GRAPH_CANDIDATE_ORDINAL_ROUNDTRIP_PROVEN_BOUNDED'
    : 'GRAPH_CANDIDATE_ORDINAL_ROUNDTRIP_BLOCKED',
  graphFeatureGathering: 'NOT_RUN',
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, graphFeatures: false },
  canonicalAuthority: false,
  nextGate: 'BOUNDED_GRAPH_FEATURE_GATHER_AND_CANDIDATE_ORDINAL_READBACK',
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, graphNodeCount: nodes.length, boundNodeCount: bound.length, unboundNodeCount: missing.length, reportPath: 'docs/reports/current-graph-candidate-ordinal-roundtrip-v1.json' }, null, 2));
