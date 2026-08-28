/**
 * Pure classification helpers for the read-only REL-01A current-workspace
 * feature-ontology cohort audit.
 *
 * This module never normalizes, basename-matches, suffix-matches, or fuzzy-matches
 * source refs. Only literal source_ref equality may be promotion-eligible.
 */

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
  if (!revision.startsWith('sha256:')) {
    throw new Error(`FEATURE_ONTOLOGY_CURRENT_COHORT_INVALID_WORKSPACE_REVISION:${revision}`);
  }
  return revision;
}

export function classifyFeatureOntologyCurrentBinding({
  tuple,
  graphifyMatches,
  currentWorkspaceRevision,
}) {
  const expectedWorkspaceRevision = requireCurrentWorkspaceRevision(currentWorkspaceRevision);
  const matches = Array.isArray(graphifyMatches) ? graphifyMatches : [];

  if (matches.length === 0) {
    return {
      classification: CurrentCohortClassification.NO_EXACT_GRAPHIFY_SOURCE,
      eligible: false,
      currentMatches: [],
    };
  }

  const currentMatches = matches.filter(
    (row) => clean(row.workspace_revision) === expectedWorkspaceRevision,
  );

  if (currentMatches.length === 0) {
    const hasMissingWorkspace = matches.some((row) => clean(row.workspace_revision) === null);
    const hasInvalidWorkspace = matches.some((row) => {
      const revision = clean(row.workspace_revision);
      return revision !== null && !revision.startsWith('sha256:');
    });
    return {
      classification: hasMissingWorkspace
        ? CurrentCohortClassification.MISSING_WORKSPACE_REVISION
        : hasInvalidWorkspace
          ? CurrentCohortClassification.INVALID_WORKSPACE_REVISION
          : CurrentCohortClassification.EXACT_WRONG_WORKSPACE,
      eligible: false,
      currentMatches,
    };
  }

  if (currentMatches.length !== 1) {
    return {
      classification: CurrentCohortClassification.EXACT_MULTIPLE_CURRENT_GRAPHIFY_ROWS,
      eligible: false,
      currentMatches,
    };
  }

  const match = currentMatches[0];
  const workspaceRevision = clean(match.workspace_revision);
  if (!workspaceRevision) {
    return {
      classification: CurrentCohortClassification.MISSING_WORKSPACE_REVISION,
      eligible: false,
      currentMatches,
    };
  }
  if (!workspaceRevision.startsWith('sha256:')) {
    return {
      classification: CurrentCohortClassification.INVALID_WORKSPACE_REVISION,
      eligible: false,
      currentMatches,
    };
  }
  if (!clean(match.code_source_revision)) {
    return {
      classification: CurrentCohortClassification.MISSING_CODE_SOURCE_REVISION,
      eligible: false,
      currentMatches,
    };
  }
  if (!clean(match.content_hash)) {
    return {
      classification: CurrentCohortClassification.MISSING_CONTENT_HASH,
      eligible: false,
      currentMatches,
    };
  }

  return {
    classification: CurrentCohortClassification.CURRENT_EXACT_UNIQUE,
    eligible: true,
    currentMatches,
    binding: {
      tupleId: clean(tuple?.id),
      packetKey: clean(tuple?.packet_key),
      tupleSourceRef: clean(tuple?.source_ref),
      graphifyFileId: clean(match.file_id),
      graphifyWorkspaceId: clean(match.workspace_id),
      graphifySourceRef: clean(match.source_ref),
      workspaceRevision,
      codeSourceRevision: clean(match.code_source_revision),
      sourceRevision: clean(match.source_revision),
      contentHash: clean(match.content_hash),
      byteLength: Number.isFinite(Number(match.byte_length)) ? Number(match.byte_length) : null,
      ontologyVersion: clean(tuple?.ontology_version),
      extractorVersion: clean(tuple?.extractor_version),
      predicate: clean(tuple?.predicate),
      featureKey: clean(tuple?.feature_key),
      subjectType: clean(tuple?.subject_type),
      subjectId: clean(tuple?.subject_id),
      objectType: clean(tuple?.object_type),
      objectId: clean(tuple?.object_id),
    },
  };
}

export function summarizeFeatureOntologyCurrentCohort(classifiedRows) {
  const rows = Array.isArray(classifiedRows) ? classifiedRows : [];
  const byClassification = {};
  let eligibleUsesConceptTuples = 0;
  const eligibleSourceRefs = new Set();

  for (const row of rows) {
    const classification = row?.classification ?? 'UNKNOWN';
    byClassification[classification] = (byClassification[classification] ?? 0) + 1;
    if (row?.eligible) {
      eligibleUsesConceptTuples += 1;
      const sourceRef = clean(row?.binding?.tupleSourceRef);
      if (sourceRef) eligibleSourceRefs.add(sourceRef);
    }
  }

  return {
    tuplesInspected: rows.length,
    byClassification,
    eligibleUsesConceptTuples,
    eligibleExactSourceRefs: eligibleSourceRefs.size,
    status: eligibleUsesConceptTuples > 0
      ? 'CURRENT_RELATIONSHIP_COHORT_FOUND'
      : 'CURRENT_RELATIONSHIP_COHORT_EMPTY',
  };
}
