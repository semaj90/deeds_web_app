import { createHash } from 'node:crypto';
import {
  classifyStructuralQueryV1,
  executeStructuralQueryV1,
  resolveStructuralIdentityV1,
  buildStructuralLaneResultV1,
} from '@deeds/parent-atlas';
import type { MiniforgeNlpSidecarClient } from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import type { RetrievalInput, Retriever } from '../lane-contracts.js';
import { structuralLaneHitsToCandidates } from './structural-lane-retriever.js';

type CandidateEntry = {
  candidateOrdinal: number;
  canonicalId: string;
  packetKey: string | null;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
};

type SourceRecord = { source: string; sourceRevision: string };

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256Utf8ByteSpanV1(source: string, startByte: number, endByte: number): string | null {
  if (!Number.isInteger(startByte) || !Number.isInteger(endByte) || startByte < 0 || endByte <= startByte) {
    return null;
  }
  const sourceBytes = Buffer.from(source, 'utf8');
  if (sourceBytes.toString('utf8') !== source || endByte > sourceBytes.length) return null;
  const spanBytes = sourceBytes.subarray(startByte, endByte);
  if (!Buffer.from(spanBytes.toString('utf8'), 'utf8').equals(spanBytes)) return null;
  return sha256(spanBytes);
}

export function resolveStructuralLanguageV1(sourceRef: string): string | null {
  const extension = sourceRef.toLowerCase().match(/\.[^./\\]+$/)?.[0];
  switch (extension) {
    case '.ts':
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.py':
    case '.pyi':
      return 'python';
    case '.rs':
      return 'rust';
    case '.go':
      return 'go';
    case '.java':
      return 'java';
    default:
      return null;
  }
}

/**
 * Live structural provider with an explicit source allowlist. It owns no
 * source discovery and cannot silently broaden from a bounded query to a
 * workspace scan.
 */
export function createLiveStructuralLaneRetrieverV1(input: {
  workspaceRevision: string;
  candidateEntries: readonly CandidateEntry[];
  loadSource: (sourceRef: string) => Promise<SourceRecord>;
  sidecar: Pick<MiniforgeNlpSidecarClient, 'astChunk'>;
}): Retriever {
  return {
    lane: 'ast',
    async retrieve(request: RetrievalInput) {
      const requestedRefs = Array.isArray(request.filters?.sourceRefs)
        ? request.filters.sourceRefs.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];
      if (requestedRefs.length === 0) return [];
      const allowed = new Set(requestedRefs);
      const entries = input.candidateEntries.filter(
        (entry) => allowed.has(entry.sourceRef) && resolveStructuralLanguageV1(entry.sourceRef) !== null,
      );
      if (entries.length === 0) return [];
      const observations = [];
      for (const sourceRef of [...new Set(entries.map((entry) => entry.sourceRef))].sort()) {
        const language = resolveStructuralLanguageV1(sourceRef);
        if (language === null) continue;
        const record = await input.loadSource(sourceRef);
        const matchingEntries = entries.filter((entry) => entry.sourceRef === sourceRef);
        const sourceRevision = record.sourceRevision;
        if (!matchingEntries.every((entry) => entry.sourceRevision === sourceRevision)) continue;
        const evidence = await input.sidecar.astChunk({ source: record.source, language, filePath: sourceRef, sourceRevision });
        for (const chunk of evidence.chunks) {
          const start = chunk.start_byte;
          const end = chunk.end_byte;
          const matchedTextHash = sha256Utf8ByteSpanV1(record.source, start, end);
          if (matchedTextHash === null) continue;
          observations.push({
            schema: 'atlas.ast-grep-observation.v1' as const,
            observation_id: `treesitter:${sha256(JSON.stringify([sourceRef, sourceRevision, start, end, chunk.upstream_node_id ?? null])).slice(0, 40)}`,
            rule_id: `treesitter:${chunk.node_type}`,
            source_ref: sourceRef,
            source_revision: sourceRevision,
            byte_start: start,
            byte_end: end,
            upstream_node_id: chunk.upstream_node_id,
            upstream_chunk_id: chunk.upstream_chunk_id,
            matched_text_hash: matchedTextHash,
            captures: { name: chunk.name ?? '', calls: chunk.calls.join(','), imports: chunk.imports.join(','), exports: chunk.exports.join(',') },
            observation_kind: chunk.node_type,
            confidence: 1,
            extractor_revision: `${evidence.engine}:${evidence.engine_version}`,
            canonical_authority: false as const,
          });
        }
      }
      const queryResult = executeStructuralQueryV1({ plan: classifyStructuralQueryV1(request.query), observations });
      const identity = resolveStructuralIdentityV1({
        queryResult,
        workspaceRevision: input.workspaceRevision,
        candidateEntries: entries,
      });
      const lane = buildStructuralLaneResultV1({ queryResult, identityBridge: identity });
      return structuralLaneHitsToCandidates(lane.hits, input.workspaceRevision).slice(0, request.limit);
    },
  };
}
