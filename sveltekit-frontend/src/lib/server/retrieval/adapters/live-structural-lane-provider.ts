import { createHash } from 'node:crypto';
import {
  adaptAstGrepMatches,
  classifyStructuralQueryV1,
  executeStructuralQueryV1,
  resolveStructuralIdentityV1,
  buildStructuralLaneResultV1,
  type AstGrepRawMatchV1,
} from '@deeds/parent-atlas';
import { treesitterChunkerChunkSchema } from '@deeds/parent-atlas/core/structural-symbol';
import { extractAstFeatures } from '$lib/server/analysis/ast-grep-extractor.js';
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

function sourceRevisionMatchesUtf8SourceV1(source: string, sourceRevision: string): boolean {
  const sourceBytes = Buffer.from(source, 'utf8');
  if (sourceBytes.toString('utf8') !== source) return false;
  const expected = sourceRevision.replace(/^sha256:/i, '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(expected) && sha256(sourceBytes) === expected;
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

function astGrepLanguage(language: string): string | null {
  switch (language.toLowerCase()) {
    case 'typescript': return 'ts';
    case 'tsx': return 'tsx';
    case 'javascript': return 'js';
    default: return null;
  }
}

/**
 * Live structural provider with an explicit source allowlist. It owns no
 * source discovery and cannot silently broaden from a bounded query to a
 * workspace scan.
 */
export function createLiveStructuralLaneRetrieverV1(input: {
  workspaceRevision: string;
  astGrepRevision: string;
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
        if (!matchingEntries.every((entry) => entry.sourceRevision === sourceRevision) || !sourceRevision) continue;
        if (!sourceRevisionMatchesUtf8SourceV1(record.source, sourceRevision)) continue;
        const sourceBytes = Buffer.from(record.source, 'utf8');
        const evidence = await input.sidecar.astChunk({ source: record.source, language, filePath: sourceRef, sourceRevision });
        if (evidence.source_revision !== sourceRevision || evidence.file_path !== sourceRef) continue;
        const grepLanguage = astGrepLanguage(language);
        if (grepLanguage === null) continue;
        const chunks = evidence.chunks.flatMap((chunk) => {
          const start = chunk.start_byte;
          const end = chunk.end_byte;
          if (!chunk.upstream_node_id || !chunk.upstream_file_id || !chunk.upstream_chunk_id) return [];
          const exactHash = sha256Utf8ByteSpanV1(record.source, start, end);
          if (exactHash === null) return [];
          const parsed = treesitterChunkerChunkSchema.safeParse({
            upstream_node_id: chunk.upstream_node_id,
            upstream_file_id: chunk.upstream_file_id,
            upstream_symbol_id: chunk.upstream_symbol_id ?? undefined,
            upstream_chunk_id: chunk.upstream_chunk_id,
            source_ref: sourceRef,
            language,
            node_type: chunk.node_type,
            kind: chunk.kind,
            symbol_name: chunk.name ?? undefined,
            parent_route: chunk.parent_route ?? [],
            parent_context: chunk.parent_context ?? undefined,
            byte_start: start,
            byte_end: end,
            start_line: chunk.start_line,
            end_line: chunk.end_line,
            content_hash: exactHash,
            calls: chunk.calls,
            imports: chunk.imports,
            exports: chunk.exports,
          });
          return parsed.success ? [parsed.data] : [];
        });
        const features = await extractAstFeatures(record.source, grepLanguage);
        const matches: AstGrepRawMatchV1[] = features.flatMap((feature) => {
          const start = feature.byteStart;
          const end = feature.byteEnd;
          if (!feature.ruleId || start === undefined || end === undefined || end <= start || end > sourceBytes.length) return [];
          const matchBytes = sourceBytes.subarray(start, end);
          const exactText = matchBytes.toString('utf8');
          if (!Buffer.from(exactText, 'utf8').equals(matchBytes)) return [];
          return [{
            rule_id: feature.ruleId,
            text: exactText,
            byte_start: start,
            byte_end: end,
            observation_kind: feature.type,
            captures: feature.captures ?? { name: feature.name },
            confidence: feature.confidence ?? 0.9,
          }];
        });
        const adapted = adaptAstGrepMatches({
          source_ref: sourceRef,
          source_revision: sourceRevision,
          extractor_revision: input.astGrepRevision,
          chunks,
          matches,
        });
        observations.push(...adapted.filter((observation) => observation.upstream_node_id && observation.upstream_chunk_id));
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
