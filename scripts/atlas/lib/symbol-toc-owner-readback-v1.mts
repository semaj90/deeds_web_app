import { createHash } from 'node:crypto';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
} from '../../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { createWorkspaceExactPromotionSourceReader } from '../../../packages/parent-atlas/src/core/exact-promotion-workspace-source-reader.js';
import { assertSourceBindingScopeV1, SOURCE_BINDING_READONLY_SQL_V1 } from './source-binding-readonly-fetch-v1.mjs';
import {
  createSourceBindingResolverV1,
  snapshotBindingFetcherV1,
  verifyPacketSourceLinkV1,
  verifyBindingAgainstExactReaderV1,
} from './source-binding-resolver-v1.mjs';
import { qualifySymbolTocRowV1 } from './symbol-toc-row-qualification-v1.mjs';
import { verifyChunkSourceSpanReadbackV1 } from './chunk-source-span-v1.mjs';

type SymbolRowV1 = {
  symbol_version_id: string;
  stable_symbol_id: string;
  packet_key: string;
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  symbol_kind: string;
  qualified_name: string;
  byte_start: number | string;
  byte_end: number | string;
};

type SourceBindingV1 = {
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  contentDigest: string;
  bindingChecksum: string;
  producerRevision: string | null;
  byteLength: number | null;
  canonicalAuthority: false;
};

export async function verifySymbolTocOwnerReadbackV1(input: {
  ordinalMap: unknown;
  symbol: SymbolRowV1;
  sourceBinding: SourceBindingV1;
  repoRoot: string;
}) {
  let ordinalMap: ReturnType<typeof candidateOrdinalMapV1Schema.parse>;
  try {
    ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
    assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  } catch (error) {
    return { status: 'BLOCKED', reason: 'CANDIDATE_ORDINAL_MAP_INVALID', detail: error instanceof Error ? error.message : String(error) };
  }

  const { symbol, sourceBinding } = input;
  if (sourceBinding?.sourceRef !== symbol.source_ref
    || sourceBinding?.workspaceRevision !== symbol.workspace_revision
    || ordinalMap.workspaceRevision !== symbol.workspace_revision
    || sourceBinding?.sourceRevision !== symbol.source_revision
    || sourceBinding?.contentDigest !== symbol.source_revision
    || sourceBinding?.canonicalAuthority !== false
    || typeof sourceBinding?.bindingChecksum !== 'string'
    || sourceBinding.bindingChecksum.trim().length === 0) {
    return { status: 'BLOCKED', reason: 'SOURCE_BINDING_CONTEXT_MISMATCH' };
  }

  const candidates = ordinalMap.candidates.filter((candidate) =>
    candidate.packetKey === symbol.packet_key
    && candidate.sourceRef === symbol.source_ref
    && candidate.sourceRevision === symbol.source_revision
    && candidate.workspaceRevision === symbol.workspace_revision
    && (candidate.symbolVersionId === null || candidate.symbolVersionId === symbol.symbol_version_id));
  if (candidates.length !== 1) {
    return { status: 'BLOCKED', reason: candidates.length === 0 ? 'CANDIDATE_MAP_ROW_NOT_FOUND' : 'CANDIDATE_MAP_ROW_AMBIGUOUS' };
  }

  const qualified = qualifySymbolTocRowV1({ symbol, candidate: candidates[0] });
  if (qualified.status === 'BLOCKED') return qualified;
  if (!qualified.row) return { status: 'BLOCKED', reason: 'QUALIFIED_SYMBOL_ROW_UNAVAILABLE' };

  let readerResult;
  try {
    const reader = createWorkspaceExactPromotionSourceReader(input.repoRoot);
    readerResult = await reader({
      source_ref: symbol.source_ref,
      span_start: qualified.row.byteStart,
      span_end: qualified.row.byteEnd,
    });
  } catch (error) {
    return { status: 'BLOCKED', reason: 'EXACT_SOURCE_READER_FAILED', detail: error instanceof Error ? error.message : String(error) };
  }

  if (readerResult.file_found !== true || readerResult.span_found !== true) {
    return { status: 'BLOCKED', reason: 'EXACT_SOURCE_READER_READBACK_UNAVAILABLE' };
  }
  if (readerResult.span_utf8_valid !== true) return { status: 'BLOCKED', reason: 'SYMBOL_SPAN_NOT_UTF8_BOUNDARY' };
  const bindingReadback = verifyBindingAgainstExactReaderV1(sourceBinding, readerResult);
  if (!bindingReadback.verified) return { status: 'BLOCKED', reason: bindingReadback.status };
  const spanChecksum = typeof readerResult.span_sha256 === 'string'
    ? `sha256:${readerResult.span_sha256.replace(/^sha256:/, '')}`
    : null;
  if (!spanChecksum || !/^sha256:[a-f0-9]{64}$/.test(spanChecksum)
    || readerResult.span_byte_length !== qualified.row.byteEnd - qualified.row.byteStart) {
    return { status: 'BLOCKED', reason: 'EXACT_SOURCE_READER_SPAN_INVALID' };
  }

  return {
    status: 'SOURCE_READBACK_MATCH_NOT_ADMITTED',
    row: qualified.row,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    sourceBindingChecksum: sourceBinding.bindingChecksum,
    sourceBindingProducerRevision: sourceBinding.producerRevision,
    spanChecksum,
    sourceReaderEvidenceRef: readerResult.evidence_ref ?? null,
    canonicalAuthority: false,
    evidenceAdmitted: false,
  };
}

export function resolveSymbolTocChunkOrdinalsV1(input: {
  ordinalMap: unknown;
  symbol: SymbolRowV1;
  sourceBytes: Uint8Array;
  chunks: Array<{ canonicalChunkId: string; contentBytes: Uint8Array; sourceSpan?: unknown }>;
}) {
  let ordinalMap: ReturnType<typeof candidateOrdinalMapV1Schema.parse>;
  try {
    ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
    assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  } catch (error) {
    return { status: 'BLOCKED', reason: 'CANDIDATE_ORDINAL_MAP_INVALID', detail: error instanceof Error ? error.message : String(error) };
  }

  const { symbol, sourceBytes, chunks } = input;
  if (!symbol?.packet_key || !symbol.source_ref || !symbol.symbol_version_id
    || !symbol.stable_symbol_id
    || symbol.workspace_revision !== ordinalMap.workspaceRevision
    || (typeof symbol.byte_start !== 'number' && typeof symbol.byte_start !== 'string')
    || (typeof symbol.byte_end !== 'number' && typeof symbol.byte_end !== 'string')
    || !Number.isSafeInteger(Number(symbol.byte_start)) || !Number.isSafeInteger(Number(symbol.byte_end))) {
    return { status: 'BLOCKED', reason: 'SYMBOL_SOURCE_SCOPE_OR_SPAN_INVALID' };
  }
  const source = Buffer.from(sourceBytes);
  const sourceText = source.toString('utf8');
  const sourceRevision = `sha256:${createHash('sha256').update(source).digest('hex')}`;
  if (sourceRevision !== symbol.source_revision || !Buffer.from(sourceText, 'utf8').equals(source)) {
    return { status: 'BLOCKED', reason: 'SOURCE_BYTES_REVISION_MISMATCH' };
  }

  const byteStart = Number(symbol.byte_start);
  const byteEnd = Number(symbol.byte_end);
  const isBoundary = (offset: number) => offset === 0 || offset === source.length || (source[offset] & 0xc0) !== 0x80;
  if (byteStart < 0 || byteEnd <= byteStart || byteEnd > source.length
    || !isBoundary(byteStart) || !isBoundary(byteEnd)) {
    return { status: 'BLOCKED', reason: 'SYMBOL_SPAN_INVALID_UTF8_BOUNDARY' };
  }

  const candidates = ordinalMap.candidates.filter((candidate) =>
    candidate.packetKey === symbol.packet_key
    && candidate.sourceRef === symbol.source_ref
    && candidate.sourceRevision === symbol.source_revision
    && candidate.workspaceRevision === symbol.workspace_revision);
  if (candidates.length === 0) return { status: 'BLOCKED', reason: 'CANDIDATE_SOURCE_SCOPE_NOT_FOUND' };

  const chunksById = new Map<string, typeof chunks[number]>();
  for (const chunk of chunks) {
    if (!chunk.canonicalChunkId || !(chunk.contentBytes instanceof Uint8Array) || chunk.contentBytes.length === 0
      || chunksById.has(chunk.canonicalChunkId)) {
      return { status: 'BLOCKED', reason: 'CHUNK_INPUT_INVALID_OR_DUPLICATE' };
    }
    chunksById.set(chunk.canonicalChunkId, chunk);
  }

  const candidateByCanonicalId = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const rows = candidateByCanonicalId.get(candidate.canonicalId) ?? [];
    rows.push(candidate);
    candidateByCanonicalId.set(candidate.canonicalId, rows);
  }
  const expectedChunkIds = [...candidateByCanonicalId.keys()].sort();
  const suppliedChunkIds = [...chunksById.keys()].sort();
  if (JSON.stringify(expectedChunkIds) !== JSON.stringify(suppliedChunkIds)) {
    return { status: 'BLOCKED', reason: 'CANDIDATE_CHUNK_SET_MISMATCH' };
  }

  const matches: Array<{ canonicalChunkId: string; candidateOrdinal: number; sourceByteStart: number; sourceByteEnd: number; chunkChecksum: string }> = [];
  const unresolvedChunks: Array<{
    canonicalChunkId: string;
    reason: string;
    chunkByteLength: number;
    chunkChecksum: string;
    sourceSpanPresent: boolean;
  }> = [];
  const nonOverlappingChunks: Array<{ canonicalChunkId: string; candidateOrdinal: number }> = [];
  for (const [canonicalChunkId, chunk] of chunksById) {
    const candidateRows = candidateByCanonicalId.get(canonicalChunkId) ?? [];
    if (candidateRows.length !== 1) return { status: 'BLOCKED', reason: 'CANDIDATE_CHUNK_ID_AMBIGUOUS' };
    const candidate = candidateRows[0];
    if (candidate.symbolVersionId !== null && candidate.symbolVersionId !== symbol.symbol_version_id) {
      return { status: 'BLOCKED', reason: 'CANDIDATE_SYMBOL_VERSION_MISMATCH' };
    }
    const content = Buffer.from(chunk.contentBytes);
    const chunkChecksum = createHash('sha256').update(content).digest('hex');
    const sourceSpanPresent = chunk.sourceSpan !== undefined && chunk.sourceSpan !== null;
    let sourceByteStart: number;
    let sourceByteEnd: number;
    if (sourceSpanPresent) {
      const spanReadback = verifyChunkSourceSpanReadbackV1({
        descriptor: chunk.sourceSpan,
        sourceBytes: source,
        chunkBytes: content,
        expectedSourceRef: symbol.source_ref,
        expectedSourceRevision: sourceRevision,
      });
      if (!spanReadback.verified) {
        unresolvedChunks.push({
          canonicalChunkId,
          reason: spanReadback.reason ?? 'STORED_SOURCE_SPAN_READBACK_FAILED',
          chunkByteLength: content.byteLength,
          chunkChecksum,
          sourceSpanPresent,
        });
        continue;
      }
      sourceByteStart = spanReadback.startByte;
      sourceByteEnd = spanReadback.endByte;
    } else {
      const offsets: number[] = [];
      let offset = -1;
      while ((offset = source.indexOf(content, offset + 1)) >= 0 && offsets.length < 2) offsets.push(offset);
      if (offsets.length !== 1) {
        unresolvedChunks.push({
          canonicalChunkId,
          reason: offsets.length === 0 ? 'CHUNK_BYTES_NOT_FOUND_IN_SOURCE' : 'CHUNK_BYTES_AMBIGUOUS_IN_SOURCE',
          chunkByteLength: content.byteLength,
          chunkChecksum,
          sourceSpanPresent,
        });
        continue;
      }
      sourceByteStart = offsets[0];
      sourceByteEnd = sourceByteStart + content.length;
    }
    if (!isBoundary(sourceByteStart) || !isBoundary(sourceByteEnd)) {
      unresolvedChunks.push({
        canonicalChunkId,
        reason: 'CHUNK_SPAN_NOT_UTF8_ALIGNED',
        chunkByteLength: content.byteLength,
        chunkChecksum,
        sourceSpanPresent,
      });
      continue;
    }
    if (sourceByteStart < byteEnd && sourceByteEnd > byteStart) {
      matches.push({
        canonicalChunkId,
        candidateOrdinal: candidate.candidateOrdinal,
        sourceByteStart,
        sourceByteEnd,
        chunkChecksum,
      });
    } else {
      nonOverlappingChunks.push({ canonicalChunkId, candidateOrdinal: candidate.candidateOrdinal });
    }
  }

  matches.sort((left, right) => left.candidateOrdinal - right.candidateOrdinal);
  if (matches.length === 0) return { status: 'BLOCKED', reason: 'SYMBOL_HAS_NO_EXACTLY_BOUND_CANDIDATE_CHUNK', unresolvedChunks };
  return {
    status: 'SYMBOL_CHUNK_CROSSWALK_NOT_ADMITTED',
    symbolVersionId: symbol.symbol_version_id,
    sourceRevision,
    workspaceRevision: symbol.workspace_revision,
    symbolSpan: { byteStart, byteEnd, checksum: createHash('sha256').update(source.subarray(byteStart, byteEnd)).digest('hex') },
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    matches,
    unresolvedChunks,
    nonOverlappingChunks,
    canonicalAuthority: false,
    evidenceAdmitted: false,
  };
}

export async function verifySymbolTocOwnerReadbackFromPostgresV1(input: {
  ordinalMap: unknown;
  symbol: SymbolRowV1;
  repoRoot: string;
  connect: () => Promise<{
    query: (sql: string, parameters?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
    release?: () => void;
  }>;
}) {
  let client: Awaited<ReturnType<typeof input.connect>> | null = null;
  let readTransactionOpen = false;
  try {
    client = await input.connect();
    const scope = assertSourceBindingScopeV1({
      sourceRef: input.symbol.source_ref,
      workspaceRevision: input.symbol.workspace_revision,
    });
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    readTransactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    await client.query("SET LOCAL lock_timeout = '1000ms'");
    const packetResult = await client.query(`
SELECT packet_key, source_ref, source_revision
  FROM public.atlas_packets
 WHERE packet_key = $1
 LIMIT 2`, [input.symbol.packet_key]);
    if (!packetResult || !Array.isArray(packetResult.rows) || packetResult.rows.length > 2) {
      return { status: 'BLOCKED', reason: 'CANONICAL_PACKET_READBACK_INVALID' };
    }
    const packetLink = verifyPacketSourceLinkV1({
      packetKey: input.symbol.packet_key,
      sourceRef: scope.sourceRef,
      sourceRevision: input.symbol.source_revision,
    }, packetResult.rows);
    if (!packetLink.verified) return { status: 'BLOCKED', reason: packetLink.status };
    const bindingResult = await client.query(SOURCE_BINDING_READONLY_SQL_V1, [scope.workspaceRevision, scope.sourceRef]);
    if (!bindingResult || !Array.isArray(bindingResult.rows) || bindingResult.rows.length > 2) {
      return { status: 'BLOCKED', reason: 'SOURCE_BINDING_READBACK_INVALID' };
    }
    const bindingRows = bindingResult.rows;
    if (bindingRows.length === 0) return { status: 'BLOCKED', reason: 'SOURCE_BINDING_NOT_FOUND' };
    if (bindingRows.length > 1) return { status: 'BLOCKED', reason: 'SOURCE_BINDING_AMBIGUOUS' };
    const resolveSourceBinding = createSourceBindingResolverV1(snapshotBindingFetcherV1(bindingRows));
    const sourceBinding = resolveSourceBinding({
      sourceRef: input.symbol.source_ref,
      workspaceRevision: input.symbol.workspace_revision,
    });
    if (!sourceBinding) return { status: 'BLOCKED', reason: 'SOURCE_BINDING_ROW_INVALID' };
    return await verifySymbolTocOwnerReadbackV1({ ...input, sourceBinding });
  } catch (error) {
    return { status: 'BLOCKED', reason: 'SOURCE_BINDING_READBACK_FAILED', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    if (client && readTransactionOpen) await client.query('ROLLBACK').catch(() => {});
    client?.release?.();
  }
}
