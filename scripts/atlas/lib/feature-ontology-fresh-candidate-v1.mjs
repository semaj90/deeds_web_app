import crypto from 'node:crypto';

/**
 * Pure contract for fresh, reviewable ontology candidates.
 *
 * This adapter validates output from a future extractor; it never derives a
 * concept from a path and never promotes or persists a tuple.
 */

const sha256Revision = /^sha256:[0-9a-f]{64}$/i;

const clean = (value) => {
  const result = String(value ?? '').trim();
  return result || null;
};

export const FRESH_ONTOLOGY_CANDIDATE_SCHEMA = 'atlas.feature-ontology-fresh-candidate.v1';

export function verifyFreshOntologySourceSpan(sourceText, startChar, endChar, expectedText) {
  if (typeof sourceText !== 'string') return { valid: false, reason: 'SOURCE_TEXT_REQUIRED' };
  if (!Number.isInteger(startChar) || !Number.isInteger(endChar) || startChar < 0 || endChar <= startChar || endChar > sourceText.length) {
    return { valid: false, reason: 'CHAR_SPAN_OUT_OF_RANGE' };
  }
  const splitsSurrogatePair = (offset) => offset > 0 && offset < sourceText.length
    && sourceText.charCodeAt(offset - 1) >= 0xd800 && sourceText.charCodeAt(offset - 1) <= 0xdbff
    && sourceText.charCodeAt(offset) >= 0xdc00 && sourceText.charCodeAt(offset) <= 0xdfff;
  if (splitsSurrogatePair(startChar) || splitsSurrogatePair(endChar)) return { valid: false, reason: 'CHAR_SPAN_SPLITS_SURROGATE_PAIR' };
  const actualText = sourceText.slice(startChar, endChar);
  if (actualText !== expectedText) return { valid: false, reason: 'SPAN_TEXT_MISMATCH' };
  const utf8 = Buffer.from(sourceText, 'utf8');
  const startByte = Buffer.byteLength(sourceText.slice(0, startChar), 'utf8');
  const endByte = Buffer.byteLength(sourceText.slice(0, endChar), 'utf8');
  const bytesText = utf8.subarray(startByte, endByte).toString('utf8');
  if (bytesText !== expectedText) return { valid: false, reason: 'UTF8_BYTE_SPAN_MISMATCH' };
  return { valid: true, startChar, endChar, startByte, endByte, text: actualText };
}

export function verifyFreshOntologyCandidateSourceReadback(candidate, sourceBytes) {
  if (!Buffer.isBuffer(sourceBytes) && !(sourceBytes instanceof Uint8Array)) return { valid: false, reason: 'SOURCE_BYTES_REQUIRED' };
  const bytes = Buffer.from(sourceBytes);
  const sourceRevision = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  if (sourceRevision !== candidate?.sourceRevision) return { valid: false, reason: 'SOURCE_BYTES_REVISION_MISMATCH' };
  let sourceText;
  try {
    sourceText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { valid: false, reason: 'SOURCE_BYTES_INVALID_UTF8' };
  }
  if (!Buffer.from(sourceText, 'utf8').equals(bytes)) return { valid: false, reason: 'SOURCE_BYTES_UTF8_ROUNDTRIP_MISMATCH' };
  if (candidate?.sourceSpanGrounded !== true) return { valid: false, reason: 'CANDIDATE_NOT_MARKED_GROUNDED' };
  const span = candidate.sourceSpan ?? {};
  const verified = verifyFreshOntologySourceSpan(sourceText, span.startChar, span.endChar, span.text);
  if (!verified.valid) return verified;
  if (verified.startByte !== span.startByte || verified.endByte !== span.endByte) return { valid: false, reason: 'SOURCE_SPAN_BYTE_OFFSETS_MISMATCH' };
  return { ...verified, sourceRevision, sourceByteLength: bytes.length };
}

export function validateFreshOntologyCandidate(candidate) {
  const errors = [];
  const row = candidate ?? {};
  if (row.schema !== FRESH_ONTOLOGY_CANDIDATE_SCHEMA) errors.push('schema');
  for (const field of ['candidateId', 'sourceRef', 'sourceRevision', 'workspaceRevision', 'extractorRevision']) {
    if (!clean(row[field])) errors.push(`${field}:required`);
  }
  if (row.identityStatus !== 'SOURCE_ONLY_UNBOUND') errors.push('identityStatus:source_only_required');
  if (clean(row.packetKey)) errors.push('packetKey:must_be_absent_until_atlas_identity_join');
  for (const field of ['sourceRevision', 'workspaceRevision']) {
    if (clean(row[field]) && !sha256Revision.test(clean(row[field]))) errors.push(`${field}:sha256_required`);
  }
  if (clean(row.predicate) !== 'USES_CONCEPT') errors.push('predicate:USES_CONCEPT_required');
  if (!clean(row.subjectId)) errors.push('subjectId:required');
  if (!clean(row.objectId)) errors.push('objectId:required');
  if (!Array.isArray(row.evidenceRefs) || row.evidenceRefs.length === 0) errors.push('evidenceRefs:required');
  if (row.sourceSpanGrounded === true) {
    const span = row.sourceSpan ?? {};
    if (!Number.isInteger(span.startChar) || !Number.isInteger(span.endChar) || span.endChar <= span.startChar) errors.push('sourceSpan:required_for_grounded_candidate');
    if (!Number.isInteger(span.startByte) || !Number.isInteger(span.endByte) || span.startByte < 0 || span.endByte <= span.startByte) errors.push('sourceSpan:verified_byte_offsets_required');
    if (!clean(span.text)) errors.push('sourceSpan.text:required_for_grounded_candidate');
  }
  if (row.canonicalAuthority !== false) errors.push('canonicalAuthority:false_required');
  if (row.status !== 'REVIEW_REQUIRED') errors.push('status:REVIEW_REQUIRED_required');
  return { valid: errors.length === 0, errors };
}

export function normalizeFreshOntologyCandidate(input) {
  if (clean(input?.packetKey) || (clean(input?.identityStatus) && input.identityStatus !== 'SOURCE_ONLY_UNBOUND')) {
    throw new Error('FRESH_ONTOLOGY_CANDIDATE_CANONICAL_IDENTITY_REQUIRES_ATLAS_JOIN');
  }
  const candidate = {
    schema: FRESH_ONTOLOGY_CANDIDATE_SCHEMA,
    candidateId: clean(input?.candidateId),
    packetKey: null,
    identityStatus: 'SOURCE_ONLY_UNBOUND',
    sourceRef: clean(input?.sourceRef),
    sourceRevision: clean(input?.sourceRevision),
    workspaceRevision: clean(input?.workspaceRevision),
    subjectType: clean(input?.subjectType) || 'SOURCE',
    subjectId: clean(input?.subjectId),
    predicate: 'USES_CONCEPT',
    objectType: clean(input?.objectType) || 'CONCEPT',
    objectId: clean(input?.objectId),
    objectValue: clean(input?.objectValue),
    evidenceRefs: [...new Set((Array.isArray(input?.evidenceRefs) ? input.evidenceRefs : []).map(clean).filter(Boolean))].sort(),
    extractorRevision: clean(input?.extractorRevision),
    confidence: Number.isFinite(Number(input?.confidence)) ? Number(input.confidence) : null,
    evidenceModes: [...new Set((Array.isArray(input?.evidenceModes) ? input.evidenceModes : ['SEMANTIC_INFERRED']).map(clean).filter(Boolean))].sort(),
    sourceSpanGrounded: input?.sourceSpanGrounded === true,
    sourceSpan: input?.sourceSpan && {
      startChar: Number(input.sourceSpan.startChar),
      endChar: Number(input.sourceSpan.endChar),
      startByte: Number(input.sourceSpan.startByte),
      endByte: Number(input.sourceSpan.endByte),
      text: String(input.sourceSpan.text ?? ''),
    },
    status: 'REVIEW_REQUIRED',
    canonicalAuthority: false,
  };
  const validation = validateFreshOntologyCandidate(candidate);
  if (!validation.valid) throw new Error(`FRESH_ONTOLOGY_CANDIDATE_INVALID:${validation.errors.join(',')}`);
  return candidate;
}
