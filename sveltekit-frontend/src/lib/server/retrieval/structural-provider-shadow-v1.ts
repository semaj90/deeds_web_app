import { createHash } from 'node:crypto';
import type { LaneCandidate } from './lane-contracts.js';
import type { StructuralProviderResultV1 } from './structural-provider-v1.js';

export type StructuralProviderShadowReceiptV1 = {
  schema: 'atlas.structural-provider-shadow-receipt.v1';
  queryDigest: string;
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  legacy: { candidateCount: number; packetKeys: string[]; checksum: string };
  structural: { observationCount: number; matchedCount: number; exactIdentityCount: number; candidateOrdinalCount: number; packetKeys: string[]; checksum: string };
  intersectionCount: number;
  unionCount: number;
  exactPacketOverlap: number;
  newOnly: string[];
  legacyOnly: string[];
  staleRejected: number;
  ambiguousRejected: number;
  unresolvedRejected: number;
  legacyEnteredRrf: true;
  structuralEnteredRrf: false;
  writes: false;
  receiptChecksum: string;
};

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function orderedKeys(candidates: readonly LaneCandidate[]): string[] {
  return [...new Set(candidates.map((candidate) => candidate.packetKey).filter(Boolean))].sort();
}

/** Shadow comparison only: structural results never enter RRF here. */
export function buildStructuralProviderShadowReceiptV1(input: {
  queryDigest: string;
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  legacyCandidates: readonly LaneCandidate[];
  structuralProvider: StructuralProviderResultV1;
  rejectedStatuses?: readonly string[];
}): StructuralProviderShadowReceiptV1 {
  const legacyKeys = orderedKeys(input.legacyCandidates);
  const structuralKeys = orderedKeys(input.structuralProvider.candidates);
  const legacySet = new Set(legacyKeys);
  const structuralSet = new Set(structuralKeys);
  const intersectionCount = structuralKeys.filter((key) => legacySet.has(key)).length;
  const receiptBase = {
    schema: 'atlas.structural-provider-shadow-receipt.v1' as const,
    queryDigest: input.queryDigest,
    workspaceRevision: input.workspaceRevision,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    legacy: { candidateCount: input.legacyCandidates.length, packetKeys: legacyKeys, checksum: digest(legacyKeys) },
    structural: {
      observationCount: input.structuralProvider.observationCount,
      matchedCount: input.structuralProvider.matchedCount,
      exactIdentityCount: input.structuralProvider.acceptedCount,
      candidateOrdinalCount: input.structuralProvider.candidates.filter((candidate) => candidate.metadata?.structural_candidate_ordinal != null).length,
      packetKeys: structuralKeys,
      checksum: input.structuralProvider.resultChecksum,
    },
    intersectionCount,
    unionCount: new Set([...legacyKeys, ...structuralKeys]).size,
    exactPacketOverlap: legacyKeys.length === 0 ? 0 : intersectionCount / legacyKeys.length,
    newOnly: structuralKeys.filter((key) => !legacySet.has(key)),
    legacyOnly: legacyKeys.filter((key) => !structuralSet.has(key)),
    staleRejected: input.rejectedStatuses?.filter((status) => status === 'SOURCE_REVISION_MISMATCH' || status === 'MIXED_WORKSPACE').length ?? 0,
    ambiguousRejected: input.rejectedStatuses?.filter((status) => status === 'AMBIGUOUS_SOURCE').length ?? 0,
    unresolvedRejected: input.rejectedStatuses?.filter((status) => status === 'UNRESOLVED_SOURCE').length ?? 0,
    legacyEnteredRrf: true as const,
    structuralEnteredRrf: false as const,
    writes: false as const,
  };
  return { ...receiptBase, receiptChecksum: digest(receiptBase) };
}
