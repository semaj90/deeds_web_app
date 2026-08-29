import { createHash } from 'node:crypto';
import type { LaneCandidate, RetrievalInput } from './lane-contracts.js';

export type StructuralRetrievalMode = 'legacy' | 'shadow' | 'structural';

export type StructuralProviderContextV1 = {
  query: string;
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  sourceRefs?: string[];
  maxSources: number;
  maxMatches: number;
  timeoutMs: number;
};

export type StructuralProviderResultV1 = {
  schema: 'atlas.structural-provider-result.v1';
  providerRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  workspaceRevision: string;
  candidates: LaneCandidate[];
  sourceCount: number;
  observationCount: number;
  matchedCount: number;
  acceptedCount: number;
  resultChecksum: string;
  canonicalAuthority: false;
  writes: false;
};

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function resolveStructuralRetrievalMode(value: unknown = process.env.ATLAS_STRUCTURAL_RETRIEVAL_MODE): StructuralRetrievalMode {
  if (value === 'shadow' || value === 'structural' || value === 'legacy') return value;
  return 'legacy';
}

export function buildStructuralProviderResultV1(input: {
  context: StructuralProviderContextV1;
  providerRevision: string;
  candidates: LaneCandidate[];
  sourceCount: number;
  observationCount: number;
  matchedCount: number;
}): StructuralProviderResultV1 {
  const { context } = input;
  if (input.sourceCount > context.maxSources) throw new Error('STRUCTURAL_PROVIDER_SOURCE_BUDGET_EXCEEDED');
  if (input.matchedCount > context.maxMatches) throw new Error('STRUCTURAL_PROVIDER_MATCH_BUDGET_EXCEEDED');
  const acceptedCount = input.candidates.length;
  return {
    schema: 'atlas.structural-provider-result.v1',
    providerRevision: input.providerRevision,
    candidateSnapshotRevision: context.candidateSnapshotRevision,
    ordinalMapChecksum: context.ordinalMapChecksum,
    workspaceRevision: context.workspaceRevision,
    candidates: input.candidates,
    sourceCount: input.sourceCount,
    observationCount: input.observationCount,
    matchedCount: input.matchedCount,
    acceptedCount,
    resultChecksum: digest(input.candidates.map((candidate) => ({ packetKey: candidate.packetKey, sourceRef: candidate.sourceRef, rank: candidate.rank, score: candidate.score }))),
    canonicalAuthority: false,
    writes: false,
  };
}

export type StructuralProvider = (context: StructuralProviderContextV1, request: RetrievalInput) => Promise<StructuralProviderResultV1>;
