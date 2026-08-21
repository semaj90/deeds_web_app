import type { GraphIdentityAuditReceiptV1 } from '../identity/graph-identity-contracts.js';

export interface GraphIdentityAuditPopulationV1 {
  treeNodeIds: readonly string[];
  pageIndexPaths: readonly string[];
  parseNodeIds: readonly string[];
  symbolIds: readonly string[];
  symbolVersionIds: readonly string[];
  canonicalDocumentSourceRefs: readonly string[];
  canonicalChunkPacketKeys: readonly string[];
  linkedPacketKeys: readonly string[];
  orphanPacketKeys: readonly string[];
  maxDepth: number;
  parserManifestBackend?: string;
  parserRuntimeBackend?: string;
}

function duplicateCount(values: readonly string[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const value of values) {
    if (seen.has(value)) duplicates += 1;
    else seen.add(value);
  }
  return duplicates;
}

export function auditGraphIdentityPopulation(
  population: GraphIdentityAuditPopulationV1,
  meta: {
    runId: string;
    workspaceRevision?: string;
    sourceRevisionSetHash?: string;
    evidenceRefs?: string[];
  },
): GraphIdentityAuditReceiptV1 {
  const pageIndexPath = duplicateCount(population.pageIndexPaths);
  const parseNodeId = duplicateCount(population.parseNodeIds);
  const symbolId = duplicateCount(population.symbolIds);
  const symbolVersionId = duplicateCount(population.symbolVersionIds);

  const packetTreeLineageProven =
    population.orphanPacketKeys.length === 0 &&
    population.linkedPacketKeys.length === population.canonicalChunkPacketKeys.length;

  const parserManifestAlignmentProven =
    Boolean(population.parserManifestBackend) &&
    population.parserManifestBackend === population.parserRuntimeBackend;

  return {
    schemaVersion: 'atlas.graph-identity-audit.v1',
    runId: meta.runId,
    createdAt: new Date().toISOString(),
    workspaceRevision: meta.workspaceRevision,
    sourceRevisionSetHash: meta.sourceRevisionSetHash,

    counts: {
      treeNodes: population.treeNodeIds.length,
      canonicalDocuments: population.canonicalDocumentSourceRefs.length,
      canonicalChunks: population.canonicalChunkPacketKeys.length,
      linkedPackets: population.linkedPacketKeys.length,
      orphanPackets: population.orphanPacketKeys.length,
      maxDepth: population.maxDepth,
    },

    collisions: {
      pageIndexPath,
      graphNodeKey: 0, // wire real extraction before proving
      parseNodeId,
      symbolId,
      symbolVersionId,
    },

    gates: {
      packetTreeLineageProven,
      parseNodeIdentityProven:
        population.parseNodeIds.length > 0 &&
        parseNodeId === 0 &&
        pageIndexPath === 0 &&
        parserManifestAlignmentProven,
      stableSymbolIdentityProven:
        population.symbolIds.length > 0 && symbolId === 0,
      symbolVersionIdentityProven:
        population.symbolVersionIds.length > 0 && symbolVersionId === 0,
      packetToSymbolLineageProven: false,
      parserManifestAlignmentProven,
      canonicalGraphSnapshotProven: false, // never auto-promote
    },

    evidenceRefs: meta.evidenceRefs ?? [],
  };
}