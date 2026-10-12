import { createHash } from 'node:crypto';
import { classifyStructuralSymbolKindV1 } from './structural-symbol-kind-admission-v1.mjs';
import { verifySourceBytesAgainstBindingV1 } from './source-binding-resolver-v1.mjs';

const SHA256_REVISION = /^sha256:[a-f0-9]{64}$/;
const SYMBOL_NAME = /^[\p{L}_$][\p{L}\p{N}_$]*(?:(?:\.|::)[\p{L}_$][\p{L}\p{N}_$]*)*$/u;

export function qualifySymbolTocRowV1({ symbol, candidate }) {
  if (!symbol || !candidate) return { status: 'BLOCKED', reason: 'SYMBOL_OR_CANDIDATE_MISSING' };
  if (!symbol.symbol_version_id || !symbol.stable_symbol_id || !symbol.packet_key
    || !symbol.source_ref || !candidate.packetKey || !candidate.sourceRef) {
    return { status: 'BLOCKED', reason: 'CANONICAL_IDENTITY_MISSING' };
  }
  if (symbol.packet_key !== candidate.packetKey || symbol.source_ref !== candidate.sourceRef) {
    return { status: 'BLOCKED', reason: 'CANDIDATE_IDENTITY_MISMATCH' };
  }
  if (!SHA256_REVISION.test(symbol.source_revision ?? '')
    || symbol.source_revision !== candidate.sourceRevision
    || !SHA256_REVISION.test(symbol.workspace_revision ?? '')
    || symbol.workspace_revision !== candidate.workspaceRevision) {
    return { status: 'BLOCKED', reason: 'SOURCE_OR_WORKSPACE_REVISION_MISMATCH' };
  }
  if (!Number.isSafeInteger(candidate.candidateOrdinal) || candidate.candidateOrdinal < 0) {
    return { status: 'BLOCKED', reason: 'CANDIDATE_ORDINAL_UNAVAILABLE' };
  }
  const kind = classifyStructuralSymbolKindV1(symbol.symbol_kind);
  if (!kind.admitted) return { status: 'BLOCKED', reason: kind.reason };
  const qualifiedName = symbol.qualified_name;
  if (typeof qualifiedName !== 'string' || !SYMBOL_NAME.test(qualifiedName)) {
    return { status: 'BLOCKED', reason: 'QUALIFIED_NAME_NOT_DECLARATION' };
  }
  if (symbol.byte_start == null || symbol.byte_end == null
    || (typeof symbol.byte_start !== 'number' && typeof symbol.byte_start !== 'string')
    || (typeof symbol.byte_end !== 'number' && typeof symbol.byte_end !== 'string')) {
    return { status: 'BLOCKED', reason: 'SYMBOL_BYTE_SPAN_INVALID' };
  }
  const byteStart = Number(symbol.byte_start);
  const byteEnd = Number(symbol.byte_end);
  if (!Number.isSafeInteger(byteStart) || !Number.isSafeInteger(byteEnd)
    || byteStart < 0 || byteEnd <= byteStart) {
    return { status: 'BLOCKED', reason: 'SYMBOL_BYTE_SPAN_INVALID' };
  }
  return {
    status: 'PROJECTION_CANDIDATE_NOT_ADMITTED',
    row: {
      packetKey: symbol.packet_key,
      sourceRef: symbol.source_ref,
      sourceRevision: symbol.source_revision,
      workspaceRevision: symbol.workspace_revision,
      candidateOrdinal: candidate.candidateOrdinal,
      stableSymbolId: symbol.stable_symbol_id,
      symbolVersionId: symbol.symbol_version_id,
      symbolKind: kind.kind,
      qualifiedName,
      byteStart,
      byteEnd,
    },
  };
}

export function verifySymbolTocSourceBytesV1({ symbol, candidate, sourceBytes }) {
  const qualified = qualifySymbolTocRowV1({ symbol, candidate });
  if (qualified.status === 'BLOCKED') return qualified;
  if (!(Buffer.isBuffer(sourceBytes) || sourceBytes instanceof Uint8Array)) {
    return { status: 'BLOCKED', reason: 'SOURCE_BYTES_REQUIRED' };
  }

  const bytes = Buffer.from(sourceBytes);
  const sourceRevision = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (sourceRevision !== qualified.row.sourceRevision) {
    return { status: 'BLOCKED', reason: 'SOURCE_BYTES_REVISION_MISMATCH' };
  }

  let sourceText;
  try {
    sourceText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { status: 'BLOCKED', reason: 'SOURCE_BYTES_INVALID_UTF8' };
  }
  if (!Buffer.from(sourceText, 'utf8').equals(bytes)) {
    return { status: 'BLOCKED', reason: 'SOURCE_BYTES_UTF8_ROUNDTRIP_MISMATCH' };
  }
  if (qualified.row.byteEnd > bytes.length) {
    return { status: 'BLOCKED', reason: 'SYMBOL_BYTE_SPAN_OUT_OF_SOURCE_BOUNDS' };
  }

  const spanBytes = bytes.subarray(qualified.row.byteStart, qualified.row.byteEnd);
  try {
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(spanBytes);
  } catch {
    return { status: 'BLOCKED', reason: 'SYMBOL_SPAN_NOT_UTF8_BOUNDARY' };
  }

  return {
    status: 'BYTE_IDENTITY_MATCH_NOT_ADMITTED',
    sourceBindingAuthority: 'NOT_VERIFIED',
    row: qualified.row,
    sourceByteLength: bytes.length,
    spanChecksum: `sha256:${createHash('sha256').update(spanBytes).digest('hex')}`,
  };
}

export function verifySymbolTocAgainstSourceBindingV1({ symbol, candidate, sourceBytes, sourceBinding, bindingContext }) {
  const qualified = qualifySymbolTocRowV1({ symbol, candidate });
  if (qualified.status === 'BLOCKED') return qualified;
  if (!sourceBinding || !bindingContext
    || bindingContext.sourceRef !== qualified.row.sourceRef
    || bindingContext.workspaceRevision !== qualified.row.workspaceRevision
    || sourceBinding.sourceRevision !== qualified.row.sourceRevision
    || sourceBinding.contentDigest !== qualified.row.sourceRevision
    || typeof sourceBinding.bindingChecksum !== 'string'
    || !sourceBinding.bindingChecksum.trim()) {
    return { status: 'BLOCKED', reason: 'CANONICAL_SOURCE_BINDING_MISMATCH' };
  }

  const byteReadback = verifySourceBytesAgainstBindingV1(sourceBinding, sourceBytes);
  if (!byteReadback.verified) return { status: 'BLOCKED', reason: byteReadback.status };

  const spanReadback = verifySymbolTocSourceBytesV1({ symbol, candidate, sourceBytes });
  if (spanReadback.status !== 'BYTE_IDENTITY_MATCH_NOT_ADMITTED') return spanReadback;
  return {
    ...spanReadback,
    status: 'SOURCE_BINDING_AND_SPAN_MATCH_NOT_ADMITTED',
    sourceBindingAuthority: 'RESOLVED_BINDING_BYTES_MATCHED_NOT_AUTHORITY',
    bindingChecksum: sourceBinding.bindingChecksum,
  };
}

export function verifySymbolTocExactReaderReadbackV1({ symbol, candidate, sourceBytes, readerResult }) {
  const spanReadback = verifySymbolTocSourceBytesV1({ symbol, candidate, sourceBytes });
  if (spanReadback.status !== 'BYTE_IDENTITY_MATCH_NOT_ADMITTED') return spanReadback;
  if (!readerResult || readerResult.file_found !== true || readerResult.span_found !== true) {
    return { status: 'BLOCKED', reason: 'EXACT_SOURCE_READER_READBACK_UNAVAILABLE' };
  }

  const readerSourceRevision = typeof readerResult.file_sha256 === 'string'
    ? `sha256:${readerResult.file_sha256.replace(/^sha256:/, '')}`
    : null;
  const readerSpanChecksum = typeof readerResult.span_sha256 === 'string'
    ? `sha256:${readerResult.span_sha256.replace(/^sha256:/, '')}`
    : null;
  if (readerSourceRevision !== spanReadback.row.sourceRevision) {
    return { status: 'BLOCKED', reason: 'EXACT_SOURCE_READER_REVISION_MISMATCH' };
  }
  if (readerResult.file_byte_length !== spanReadback.sourceByteLength
    || readerResult.span_byte_length !== spanReadback.row.byteEnd - spanReadback.row.byteStart
    || readerSpanChecksum !== spanReadback.spanChecksum
    || readerResult.span_utf8_valid !== true) {
    return { status: 'BLOCKED', reason: 'EXACT_SOURCE_READER_SPAN_MISMATCH' };
  }

  return {
    ...spanReadback,
    status: 'EXACT_SOURCE_READER_MATCH_NOT_ADMITTED',
    exactSourceReaderEvidenceRef: readerResult.evidence_ref ?? null,
  };
}
