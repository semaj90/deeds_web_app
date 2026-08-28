/** Pure REL-01A classification helpers. */

export const CURRENT_COHORT_PREDICATE = 'USES_CONCEPT';

export const CurrentCohortClassification = Object.freeze({
  CURRENT_EXACT_UNIQUE: 'CURRENT_EXACT_UNIQUE',
  NO_EXACT_GRAPHIFY_SOURCE: 'NO_EXACT_GRAPHIFY_SOURCE',
  EXACT_WRONG_WORKSPACE: 'EXACT_WRONG_WORKSPACE',
  EXACT_MULTIPLE_CURRENT_GRAPHIFY_ROWS: 'EXACT_MULTIPLE_CURRENT_GRAPHIFY_ROWS',
  MISSING_WORKSPACE_REVISION: 'MISSING_WORKSPACE_REVISION',
  INVALID_WORKSPACE_REVISION: 'INVALID_WORKSPACE_REVISION',
  MISSING_CODE_SOURCE_REVISION: 'MISSING_CODE_SOURCE_REVISION',
  MISSING_CONTENT_HASH: 'MISSING_CONTENT_HASH',
});

const clean = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

export function requireCurrentWorkspaceRevision(value) {
  const revision = clean(value);
  if (!revision) throw new Error('FEATURE_ONTOLOGY_CURRENT_COHORT_WORKSPACE_REVISION_REQUIRED');
  if (!/^sha256:[0-9a-f]{64}$/i.test(revision)) {
    throw new Error(`FEATURE_ONTOLOGY_CURRENT_COHORT_INVALID_WORKSPACE_REVISION:${revision}`);
  }
  return revision;
}

export function classifyFeatureOntologyCurrentBinding({ tuple, graphifyMatches, currentWorkspaceRevision }) {
  const expected = requireCurrentWorkspaceRevision(currentWorkspaceRevision);
  const matches = Array.isArray(graphifyMatches) ? graphifyMatches : [];
  if (matches.length === 0) return { classification: CurrentCohortClassification.NO_EXACT_GRAPHIFY_SOURCE, eligible: false, currentMatches: [] };
  const currentMatches = matches.filter((row) => clean(row.workspace_revision) === expected);
  if (currentMatches.length === 0) {
    const missing = matches.some((row) => !clean(row.workspace_revision));
    const invalid = matches.some((row) => clean(row.workspace_revision) && !/^sha256:[0-9a-f]{64}$/i.test(clean(row.workspace_revision)));
    return { classification: missing ? CurrentCohortClassification.MISSING_WORKSPACE_REVISION : invalid ? CurrentCohortClassification.INVALID_WORKSPACE_REVISION : CurrentCohortClassification.EXACT_WRONG_WORKSPACE, eligible: false, currentMatches };
  }
  if (currentMatches.length !== 1) return { classification: CurrentCohortClassification.EXACT_MULTIPLE_CURRENT_GRAPHIFY_ROWS, eligible: false, currentMatches };
  const match = currentMatches[0];
  if (!clean(match.code_source_revision)) return { classification: CurrentCohortClassification.MISSING_CODE_SOURCE_REVISION, eligible: false, currentMatches };
  if (!clean(match.content_hash)) return { classification: CurrentCohortClassification.MISSING_CONTENT_HASH, eligible: false, currentMatches };
  return {
    classification: CurrentCohortClassification.CURRENT_EXACT_UNIQUE,
    eligible: true,
    currentMatches,
    binding: {
      tupleId: clean(tuple?.id), packetKey: clean(tuple?.packet_key), tupleSourceRef: clean(tuple?.source_ref),
      graphifyFileId: clean(match.file_id), graphifyWorkspaceId: clean(match.workspace_id), graphifySourceRef: clean(match.source_ref),
      workspaceRevision: expected, codeSourceRevision: clean(match.code_source_revision), sourceRevision: clean(match.source_revision),
      contentHash: clean(match.content_hash), byteLength: Number.isFinite(Number(match.byte_length)) ? Number(match.byte_length) : null,
      ontologyVersion: clean(tuple?.ontology_version), extractorVersion: clean(tuple?.extractor_version), predicate: clean(tuple?.predicate),
      featureKey: clean(tuple?.feature_key), subjectType: clean(tuple?.subject_type), subjectId: clean(tuple?.subject_id),
      objectType: clean(tuple?.object_type), objectId: clean(tuple?.object_id),
    },
  };
}

export function summarizeFeatureOntologyCurrentCohort(classifiedRows) {
  const rows = Array.isArray(classifiedRows) ? classifiedRows : [];
  const byClassification = {};
  const sourceRefs = new Set();
  for (const row of rows) {
    const classification = row?.classification ?? 'UNKNOWN';
    byClassification[classification] = (byClassification[classification] ?? 0) + 1;
    if (row?.eligible && row.binding?.tupleSourceRef) sourceRefs.add(row.binding.tupleSourceRef);
  }
  const eligibleUsesConceptTuples = rows.filter((row) => row?.eligible).length;
  return {
    tuplesInspected: rows.length,
    byClassification,
    eligibleUsesConceptTuples,
    eligibleExactSourceRefs: sourceRefs.size,
    status: eligibleUsesConceptTuples > 0 ? 'CURRENT_RELATIONSHIP_COHORT_FOUND' : 'CURRENT_RELATIONSHIP_COHORT_EMPTY',
  };
}
