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

export function validateFreshOntologyCandidate(candidate) {
  const errors = [];
  const row = candidate ?? {};
  if (row.schema !== FRESH_ONTOLOGY_CANDIDATE_SCHEMA) errors.push('schema');
  for (const field of ['candidateId', 'packetKey', 'sourceRef', 'sourceRevision', 'workspaceRevision', 'extractorRevision']) {
    if (!clean(row[field])) errors.push(`${field}:required`);
  }
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
    if (!clean(span.text)) errors.push('sourceSpan.text:required_for_grounded_candidate');
  }
  if (row.canonicalAuthority !== false) errors.push('canonicalAuthority:false_required');
  if (row.status !== 'REVIEW_REQUIRED') errors.push('status:REVIEW_REQUIRED_required');
  return { valid: errors.length === 0, errors };
}

export function normalizeFreshOntologyCandidate(input) {
  const candidate = {
    schema: FRESH_ONTOLOGY_CANDIDATE_SCHEMA,
    candidateId: clean(input?.candidateId),
    packetKey: clean(input?.packetKey),
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
      text: clean(input.sourceSpan.text),
    },
    status: 'REVIEW_REQUIRED',
    canonicalAuthority: false,
  };
  const validation = validateFreshOntologyCandidate(candidate);
  if (!validation.valid) throw new Error(`FRESH_ONTOLOGY_CANDIDATE_INVALID:${validation.errors.join(',')}`);
  return candidate;
}
