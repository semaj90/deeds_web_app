import { createHash } from 'node:crypto';

export function buildLangExtractProbeInputV1({
  sourceBytes,
  sourceRef,
  sourceRevision,
  workspaceRevision,
  packetKey,
  maxChars = 50_000,
}) {
  if (!Buffer.isBuffer(sourceBytes)) {
    return { status: 'UNAVAILABLE_SOURCE_BYTES_INVALID', reason: 'SOURCE_BYTES_MUST_BE_BUFFER' };
  }
  const fields = [sourceRef, sourceRevision, workspaceRevision, packetKey];
  if (!fields.every((value) => typeof value === 'string' && value.trim())) {
    return { status: 'UNAVAILABLE_BINDING_INCOMPLETE', reason: 'SOURCE_PACKET_WORKSPACE_LINEAGE_REQUIRED' };
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(sourceRevision)) {
    return { status: 'UNAVAILABLE_SOURCE_REVISION_INVALID', reason: 'SOURCE_REVISION_MUST_BE_SHA256' };
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
  } catch {
    return { status: 'UNAVAILABLE_SOURCE_BYTES_NOT_UTF8', reason: 'SOURCE_BYTES_NOT_VALID_UTF8' };
  }
  const inputChecksum = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  if (sourceRevision !== inputChecksum) {
    return { status: 'UNAVAILABLE_SOURCE_REVISION_MISMATCH', reason: 'SOURCE_BYTES_DO_NOT_MATCH_SOURCE_REVISION', inputChecksum };
  }
  if (!Number.isInteger(maxChars) || maxChars < 1 || text.length > maxChars) {
    return { status: 'UNAVAILABLE_SOURCE_EXCEEDS_LIMIT', reason: 'TRUNCATION_FORBIDDEN_FOR_GROUNDED_PROBE', inputChecksum, inputCharCount: text.length };
  }
  return {
    status: 'READY_SOURCE_BYTES_BOUND',
    sourceRef,
    sourceRevision,
    workspaceRevision,
    packetKey,
    inputChecksum,
    inputCharCount: text.length,
    text,
  };
}

export function validateLangExtractSourceSpansV1({ payload, sourceBytes, binding, inputChecksum }) {
  if (!payload || typeof payload !== 'object' || !payload.metadata || typeof payload.metadata !== 'object') {
    return { status: 'REJECTED_RESPONSE_SHAPE', validatedCount: 0, spanResults: [] };
  }
  const execution = payload.metadata.grounded_execution;
  const requestBinding = execution?.requestBinding;
  if (!requestBinding || requestBinding.status !== 'SOURCE_BYTES_BOUND') {
    return { status: 'REJECTED_SIDECAR_SOURCE_BINDING', validatedCount: 0, spanResults: [] };
  }
  if (
    requestBinding.sourceRef !== binding.sourceRef
    || requestBinding.sourceRevision !== binding.sourceRevision
    || requestBinding.workspaceRevision !== binding.workspaceRevision
    || requestBinding.packetKey !== binding.packetKey
  ) {
    return { status: 'REJECTED_REQUEST_BINDING_MISMATCH', validatedCount: 0, spanResults: [] };
  }
  const expectedInputChecksum = inputChecksum.replace(/^sha256:/, '');
  if (execution.inputChecksum !== expectedInputChecksum) {
    return { status: 'REJECTED_INPUT_CHECKSUM_MISMATCH', validatedCount: 0, spanResults: [] };
  }
  const extractions = payload.metadata.grounded_extractions;
  if (!Array.isArray(extractions)) {
    return { status: 'REJECTED_EXTRACTION_SHAPE', validatedCount: 0, spanResults: [] };
  }
  const spanResults = extractions.map((extraction, ordinal) => {
    const startByte = extraction?.start_byte ?? extraction?.startByte;
    const endByte = extraction?.end_byte ?? extraction?.endByte;
    const text = extraction?.text ?? extraction?.extraction_text ?? extraction?.extractionText;
    if (!Number.isInteger(startByte) || !Number.isInteger(endByte) || startByte < 0 || endByte <= startByte || endByte > sourceBytes.length || typeof text !== 'string') {
      return { ordinal, status: 'REJECTED_SPAN_BOUNDS_OR_SHAPE' };
    }
    const spanBytes = sourceBytes.subarray(startByte, endByte);
    let spanText;
    try {
      spanText = new TextDecoder('utf-8', { fatal: true }).decode(spanBytes);
    } catch {
      return { ordinal, startByte, endByte, status: 'REJECTED_SPAN_NOT_UTF8_BOUNDARY' };
    }
    if (spanText !== text) return { ordinal, startByte, endByte, status: 'REJECTED_SPAN_TEXT_MISMATCH' };
    return {
      ordinal,
      extractionClass: String(extraction?.class ?? extraction?.extraction_class ?? extraction?.extractionClass ?? 'UNKNOWN'),
      startByte,
      endByte,
      spanChecksum: `sha256:${createHash('sha256').update(spanBytes).digest('hex')}`,
      status: 'SOURCE_SPAN_READBACK_MATCH',
    };
  });
  const rejected = spanResults.some((item) => item.status !== 'SOURCE_SPAN_READBACK_MATCH');
  return {
    status: rejected ? 'REJECTED_SPAN_READBACK' : spanResults.length ? 'SOURCE_SPAN_READBACK_MATCH' : 'NO_EXACT_EXTRACTIONS',
    validatedCount: rejected ? 0 : spanResults.length,
    spanResults,
  };
}
