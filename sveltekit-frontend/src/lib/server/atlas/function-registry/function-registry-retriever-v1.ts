import type { LaneCandidate, Retriever, RetrievalInput } from '../../retrieval/lane-contracts.js';
import { validateCandidate } from '../../retrieval/lane-contracts.js';
import {
  verifyFunctionRegistrySnapshotV1,
  type FunctionRegistrySnapshotV1,
} from './function-registry-snapshot-v1.js';
import type {
  FunctionSnapshotLoaderV1,
} from './function-registry-snapshot-loader-v1.js';

export type FunctionRegistrySnapshotLoaderV1 = () => Promise<unknown>;

function queryTokens(query: string): string[] {
  return [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}_$.-]+/gu) ?? [])];
}

function scoreEntry(query: string, entry: FunctionRegistrySnapshotV1['entries'][number]): number {
  const haystack = [entry.qualifiedName, entry.signature, entry.sourceRef]
    .join(' ')
    .toLocaleLowerCase();
  const tokens = queryTokens(query);
  if (tokens.length === 0) return 0;
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  const exactName = entry.qualifiedName.toLocaleLowerCase() === query.trim().toLocaleLowerCase();
  return (exactName ? 1 : 0) + matched / tokens.length;
}

export function functionRegistrySnapshotToLaneCandidatesV1(input: {
  snapshot: unknown;
  expectedWorkspaceRevision: string;
  query: string;
  limit: number;
}): LaneCandidate[] {
  if (!Number.isInteger(input.limit) || input.limit < 1 || !input.expectedWorkspaceRevision) return [];
  if (!verifyFunctionRegistrySnapshotV1(input.snapshot)) return [];

  const snapshot = input.snapshot as FunctionRegistrySnapshotV1;
  if (snapshot.workspaceRevision !== input.expectedWorkspaceRevision) return [];

  const ranked = snapshot.entries
    .map((entry) => ({ entry, lexicalScore: scoreEntry(input.query, entry) }))
    .filter(({ lexicalScore }) => lexicalScore > 0)
    .sort((left, right) => right.lexicalScore - left.lexicalScore
      || left.entry.symbolVersionId.localeCompare(right.entry.symbolVersionId))
    .slice(0, input.limit);

  return ranked
    .map(({ entry, lexicalScore }, index) => validateCandidate({
      packetKey: entry.packetKey,
      symbolVersionId: entry.symbolVersionId,
      sourceRef: entry.sourceRef,
      sourceRevision: entry.sourceRevision,
      workspaceRevision: entry.workspaceRevision,
      rank: index + 1,
      score: lexicalScore,
      lane: 'ast',
      metadata: {
        function_registry_schema: snapshot.schema,
        function_registry_snapshot_checksum: snapshot.snapshotChecksum,
        canonical_function_id: entry.canonicalId,
        symbol_version_id: entry.symbolVersionId,
        tree_node_id: entry.treeNodeId,
        qualified_name: entry.qualifiedName,
        signature: entry.signature,
        source_content_hash: entry.sourceContentHash,
        byte_start: entry.startByte,
        byte_end: entry.endByte,
        parser_revision: entry.parserRevision,
        evidence_checksum: entry.evidenceChecksum,
        admission: 'ADVISORY_ONLY',
        canonical_authority: false,
      },
    }))
    .filter((candidate): candidate is LaneCandidate => candidate !== null);
}

export function createFunctionRegistryRetrieverV1(input: {
  loadSnapshot: FunctionRegistrySnapshotLoaderV1;
  expectedWorkspaceRevision: string;
}): Retriever {
  return {
    lane: 'ast',
    async retrieve(request: RetrievalInput): Promise<LaneCandidate[]> {
      const snapshot = await input.loadSnapshot();
      return functionRegistrySnapshotToLaneCandidatesV1({
        snapshot,
        expectedWorkspaceRevision: input.expectedWorkspaceRevision,
        query: request.query,
        limit: request.limit,
      });
    },
  };
}

export type FunctionRegistrySearchCandidateV1 = {
  symbolVersionId: string;
  sourceRevision: string;
};

export function createQualifiedFunctionRegistryRetrieverV1(input: {
  discoverCandidates: (request: {
    query: string;
    expectedWorkspaceRevision: string;
    limit: number;
  }) => Promise<FunctionRegistrySearchCandidateV1[]>;
  loader: FunctionSnapshotLoaderV1;
  expectedWorkspaceRevision: string;
  maxCandidates?: number;
}): Retriever {
  const maxCandidates = input.maxCandidates ?? 32;

  return {
    lane: 'ast',
    async retrieve(request: RetrievalInput): Promise<LaneCandidate[]> {
      if (!input.expectedWorkspaceRevision
        || request.workspaceRevision !== input.expectedWorkspaceRevision
        || !Number.isInteger(maxCandidates)
        || maxCandidates < 1
        || maxCandidates > 64
        || !Number.isInteger(request.limit)
        || request.limit < 1) return [];

      let discovered: FunctionRegistrySearchCandidateV1[];
      try {
        discovered = await input.discoverCandidates({
          query: request.query,
          expectedWorkspaceRevision: input.expectedWorkspaceRevision,
          limit: maxCandidates,
        });
      } catch {
        return [];
      }

      const unique = new Map<string, FunctionRegistrySearchCandidateV1>();
      for (const candidate of discovered.slice(0, maxCandidates)) {
        if (candidate?.symbolVersionId && candidate.sourceRevision
          && !unique.has(candidate.symbolVersionId)) {
          unique.set(candidate.symbolVersionId, candidate);
        }
      }

      const qualifiedCandidates: LaneCandidate[] = [];
      for (const candidate of unique.values()) {
        try {
          const loaded = await input.loader.loadQualified({
            symbolVersionId: candidate.symbolVersionId,
            expectedSourceRevision: candidate.sourceRevision,
            expectedWorkspaceRevision: input.expectedWorkspaceRevision,
          });
          if (loaded.status !== 'QUALIFIED') continue;
          qualifiedCandidates.push(...functionRegistrySnapshotToLaneCandidatesV1({
            snapshot: loaded.snapshot,
            expectedWorkspaceRevision: input.expectedWorkspaceRevision,
            query: request.query,
            limit: 1,
          }));
        } catch {
          continue;
        }
      }

      const ranked = qualifiedCandidates
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0)
          || (left.symbolVersionId ?? '').localeCompare(right.symbolVersionId ?? '')
          || left.packetKey.localeCompare(right.packetKey));
      const packetWinners = new Map<string, LaneCandidate>();
      for (const candidate of ranked) {
        if (!packetWinners.has(candidate.packetKey)) packetWinners.set(candidate.packetKey, candidate);
      }
      return [...packetWinners.values()]
        .slice(0, request.limit)
        .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
    },
  };
}
