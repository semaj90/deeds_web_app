import { createHash } from 'node:crypto';
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

export type FunctionRegistryChunkRowV1 = {
  chunkRowId: string;
  canonicalChunkId: string;
  content: string;
  lineStart: number;
  lineEnd: number;
};

export function resolveFunctionRegistryChunkRowV1(input: {
  sourceBytes: Uint8Array;
  sourceRevision: string;
  sourceContentHash: string;
  startByte: number;
  endByte: number;
  rows: readonly FunctionRegistryChunkRowV1[];
}): { chunkRowId: string; canonicalChunkId: string } | null {
  if (!/^sha256:[a-f0-9]{64}$/i.test(input.sourceRevision)
    || !/^[a-f0-9]{64}$/i.test(input.sourceContentHash)
    || input.sourceRevision.slice(7).toLowerCase() !== input.sourceContentHash.toLowerCase()
    || createHash('sha256').update(input.sourceBytes).digest('hex') !== input.sourceContentHash.toLowerCase()
    || !Number.isSafeInteger(input.startByte) || !Number.isSafeInteger(input.endByte)
    || input.startByte < 0 || input.endByte <= input.startByte || input.endByte > input.sourceBytes.byteLength
    || input.rows.length === 0 || input.rows.length > 64) return null;

  const sourceBuffer = Buffer.from(input.sourceBytes);
  const matches = input.rows.filter((row) => {
    if (!row.chunkRowId || !row.canonicalChunkId || !Number.isInteger(row.lineStart)
      || !Number.isInteger(row.lineEnd) || row.lineStart < 1 || row.lineEnd < row.lineStart
      || !row.content) return false;
    const chunkBytes = Buffer.from(row.content, 'utf8');
    let occurrence = sourceBuffer.indexOf(chunkBytes);
    if (occurrence < 0) return false;
    const firstOccurrence = occurrence;
    occurrence = sourceBuffer.indexOf(chunkBytes, occurrence + 1);
    if (occurrence >= 0) return false;
    const chunkEnd = firstOccurrence + chunkBytes.byteLength;
    if (firstOccurrence > input.startByte || chunkEnd < input.endByte) return false;
    const chunkLineStart = 1 + sourceBuffer.subarray(0, firstOccurrence).reduce((count, byte) => count + Number(byte === 10), 0);
    const chunkLineEnd = chunkLineStart + chunkBytes.reduce((count, byte) => count + Number(byte === 10), 0);
    return row.lineStart === chunkLineStart && row.lineEnd === chunkLineEnd;
  });

  return matches.length === 1
    ? { chunkRowId: matches[0].chunkRowId, canonicalChunkId: matches[0].canonicalChunkId }
    : null;
}

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
  resolveChunkRow?: (entry: FunctionRegistrySnapshotV1['entries'][number]) => Promise<{ chunkRowId: string; canonicalChunkId: string } | null>;
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
          const laneCandidates = functionRegistrySnapshotToLaneCandidatesV1({
            snapshot: loaded.snapshot,
            expectedWorkspaceRevision: input.expectedWorkspaceRevision,
            query: request.query,
            limit: 1,
          });
          for (const laneCandidate of laneCandidates) {
            const entry = loaded.snapshot.entries.find((item) => item.symbolVersionId === laneCandidate.symbolVersionId);
            if (!input.resolveChunkRow) {
              qualifiedCandidates.push(laneCandidate);
              continue;
            }
            const chunkRow = entry ? await input.resolveChunkRow(entry) : null;
            if (!chunkRow) continue;
            qualifiedCandidates.push({
              ...laneCandidate,
              packetId: chunkRow.chunkRowId,
              metadata: { ...laneCandidate.metadata, canonical_chunk_row_id: chunkRow.chunkRowId, canonical_chunk_id: chunkRow.canonicalChunkId },
            });
          }
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
