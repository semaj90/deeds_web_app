import { createHash } from 'node:crypto';

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function validUtf8(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return Buffer.from(text, 'utf8').equals(bytes);
  } catch {
    return false;
  }
}

export function qualifyChunkSourceSpanV1({ sourceBytes, chunkContent, sourceRef, startByte, endByte }) {
  if (!(Buffer.isBuffer(sourceBytes) || sourceBytes instanceof Uint8Array)
    || typeof chunkContent !== 'string' || !chunkContent.length
    || typeof sourceRef !== 'string' || !sourceRef.trim()) {
    return { status: 'BLOCKED', reason: 'SOURCE_OR_CHUNK_IDENTITY_MISSING' };
  }

  const source = Buffer.from(sourceBytes);
  const content = Buffer.from(chunkContent, 'utf8');
  if (!validUtf8(source)) return { status: 'BLOCKED', reason: 'SOURCE_BYTES_NOT_VALID_UTF8' };

  let byteStart;
  let byteEnd;
  let method;
  if (startByte !== undefined || endByte !== undefined) {
    if (!Number.isSafeInteger(startByte) || !Number.isSafeInteger(endByte)
      || startByte < 0 || endByte <= startByte || endByte > source.length) {
      return { status: 'BLOCKED', reason: 'CLAIMED_SOURCE_SPAN_INVALID' };
    }
    byteStart = startByte;
    byteEnd = endByte;
    if (!source.subarray(byteStart, byteEnd).equals(content)) {
      return { status: 'BLOCKED', reason: 'CLAIMED_SOURCE_SPAN_CONTENT_MISMATCH' };
    }
    method = 'EXACT_PRODUCER_BYTE_RANGE';
  } else {
    const first = source.indexOf(content);
    if (first < 0) return { status: 'BLOCKED', reason: 'CHUNK_CONTENT_NOT_FOUND_IN_SOURCE' };
    if (source.indexOf(content, first + 1) >= 0) {
      return { status: 'BLOCKED', reason: 'CHUNK_CONTENT_AMBIGUOUS_IN_SOURCE' };
    }
    byteStart = first;
    byteEnd = first + content.length;
    method = 'UNIQUE_EXACT_CONTENT_MATCH';
  }

  if (!validUtf8(source.subarray(0, byteStart)) || !validUtf8(source.subarray(byteStart, byteEnd))) {
    return { status: 'BLOCKED', reason: 'SOURCE_SPAN_NOT_UTF8_ALIGNED' };
  }

  return {
    status: 'BYTE_MATCH_NOT_ADMITTED',
    sourceRef,
    sourceRevision: sha256(source),
    sourceByteLength: source.length,
    startByte: byteStart,
    endByte: byteEnd,
    sourceSpanDigest: sha256(source.subarray(byteStart, byteEnd)),
    method,
    sourceAuthority: 'NOT_VERIFIED',
    evidenceAdmitted: false,
  };
}

export function verifyChunkSourceSpanReadbackV1({ descriptor, sourceBytes, chunkBytes, expectedSourceRef, expectedSourceRevision }) {
  if (!descriptor || descriptor.status !== 'BYTE_MATCH_NOT_ADMITTED'
    || descriptor.sourceAuthority !== 'NOT_VERIFIED' || descriptor.evidenceAdmitted !== false
    || !['EXACT_PRODUCER_BYTE_RANGE', 'UNIQUE_EXACT_CONTENT_MATCH'].includes(descriptor.method)
    || descriptor.sourceRef !== expectedSourceRef
    || descriptor.sourceRevision !== expectedSourceRevision
    || !(Buffer.isBuffer(sourceBytes) || sourceBytes instanceof Uint8Array)
    || !(Buffer.isBuffer(chunkBytes) || chunkBytes instanceof Uint8Array)) {
    return { verified: false, reason: 'SPAN_DESCRIPTOR_SCOPE_INVALID' };
  }

  const source = Buffer.from(sourceBytes);
  const content = Buffer.from(chunkBytes);
  if (!validUtf8(source) || !validUtf8(content)) return { verified: false, reason: 'SPAN_READBACK_UTF8_INVALID' };
  if (descriptor.sourceByteLength !== source.length || descriptor.sourceRevision !== sha256(source)) {
    return { verified: false, reason: 'SPAN_READBACK_SOURCE_DIGEST_MISMATCH' };
  }
  if (!Number.isSafeInteger(descriptor.startByte) || !Number.isSafeInteger(descriptor.endByte)
    || descriptor.startByte < 0 || descriptor.endByte <= descriptor.startByte || descriptor.endByte > source.length) {
    return { verified: false, reason: 'SPAN_READBACK_OFFSETS_INVALID' };
  }

  const span = source.subarray(descriptor.startByte, descriptor.endByte);
  if (!span.equals(content)) return { verified: false, reason: 'SPAN_READBACK_CONTENT_MISMATCH' };
  if (descriptor.sourceSpanDigest !== sha256(span)) return { verified: false, reason: 'SPAN_READBACK_DIGEST_MISMATCH' };

  return {
    verified: true,
    status: 'BYTE_READBACK_MATCH_NOT_ADMITTED',
    sourceRef: expectedSourceRef,
    sourceRevision: expectedSourceRevision,
    startByte: descriptor.startByte,
    endByte: descriptor.endByte,
    sourceSpanDigest: descriptor.sourceSpanDigest,
    method: descriptor.method,
    sourceAuthority: 'NOT_VERIFIED',
    evidenceAdmitted: false,
  };
}

export function qualifyChunkLineageRowsV1({ sourceBytes, sourceRef, sourceRevision, chunks }) {
  if (!(Buffer.isBuffer(sourceBytes) || sourceBytes instanceof Uint8Array)
    || typeof sourceRef !== 'string' || !sourceRef.trim()
    || typeof sourceRevision !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(sourceRevision)
    || !Array.isArray(chunks)) {
    return { status: 'BLOCKED', reason: 'CHUNK_LINEAGE_SCOPE_INVALID', qualifiedChunks: [], blockedChunks: [] };
  }

  const source = Buffer.from(sourceBytes);
  const actualSourceRevision = sha256(source);
  if (actualSourceRevision.toLowerCase() !== sourceRevision.toLowerCase()) {
    return { status: 'BLOCKED', reason: 'CHUNK_LINEAGE_SOURCE_REVISION_MISMATCH', qualifiedChunks: [], blockedChunks: [] };
  }

  const frequencies = new Map();
  for (const chunk of chunks) {
    const canonicalChunkId = typeof chunk?.canonicalChunkId === 'string' ? chunk.canonicalChunkId.trim() : '';
    if (canonicalChunkId) frequencies.set(canonicalChunkId, (frequencies.get(canonicalChunkId) ?? 0) + 1);
  }
  const reportedDuplicates = new Set();
  const qualifiedChunks = [];
  const blockedChunks = [];
  for (const chunk of chunks) {
    const canonicalChunkId = typeof chunk?.canonicalChunkId === 'string' ? chunk.canonicalChunkId.trim() : '';
    if (!canonicalChunkId) {
      blockedChunks.push({ canonicalChunkId: null, reason: 'CHUNK_ID_MISSING_OR_DUPLICATE' });
      continue;
    }
    if (frequencies.get(canonicalChunkId) > 1) {
      if (!reportedDuplicates.has(canonicalChunkId)) {
        blockedChunks.push({ canonicalChunkId, reason: 'CHUNK_ID_MISSING_OR_DUPLICATE' });
        reportedDuplicates.add(canonicalChunkId);
      }
      continue;
    }
    if (chunk.contentVariantCount !== 1 || typeof chunk.content !== 'string' || !chunk.content.length) {
      blockedChunks.push({ canonicalChunkId, reason: chunk.contentVariantCount > 1 ? 'CHUNK_CONTENT_AMBIGUOUS' : 'CHUNK_CONTENT_MISSING' });
      continue;
    }
    const span = qualifyChunkSourceSpanV1({ sourceBytes: source, chunkContent: chunk.content, sourceRef, });
    if (span.status !== 'BYTE_MATCH_NOT_ADMITTED' || span.sourceRevision.toLowerCase() !== sourceRevision.toLowerCase()) {
      blockedChunks.push({ canonicalChunkId, reason: span.reason ?? 'CHUNK_SOURCE_SPAN_UNQUALIFIED' });
      continue;
    }
    qualifiedChunks.push({
      canonicalChunkId,
      sourceRef,
      sourceRevision: actualSourceRevision,
      startByte: span.startByte,
      endByte: span.endByte,
      sourceSpanDigest: span.sourceSpanDigest,
      status: 'CHUNK_SOURCE_BYTES_MATCH_NOT_ADMITTED',
      canonicalAuthority: false,
      evidenceAdmitted: false,
    });
  }

  return {
    status: blockedChunks.length === 0 ? 'SOURCE_CHUNKS_QUALIFIED_NOT_ADMITTED' : 'PARTIAL_SOURCE_CHUNK_QUALIFICATION_NOT_ADMITTED',
    sourceRef,
    sourceRevision: actualSourceRevision,
    qualifiedChunks,
    blockedChunks,
    canonicalAuthority: false,
    evidenceAdmitted: false,
  };
}
