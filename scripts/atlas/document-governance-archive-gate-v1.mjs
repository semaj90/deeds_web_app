export function evaluateDocumentArchiveCandidateV1(record, {
  recordsById,
  activeReferences = [],
  referenceAuditComplete = false,
  archiveExemptionRef = null,
} = {}) {
  const blockers = [];
  const normalizedPath = typeof record.path === 'string' ? record.path.replaceAll('\\', '/') : '';
  if (normalizedPath.startsWith('openspec/changes/') || record.documentKind?.startsWith('OPENSPEC_')) {
    blockers.push('OPENSPEC_OWNED_ARCHIVE_LIFECYCLE');
  }
  if (record.status !== 'SUPERSEDED') blockers.push('DOCUMENT_NOT_SUPERSEDED');
  if (record.supersessionStatus !== 'VALIDATED') blockers.push('SUPERSESSION_NOT_VALIDATED');
  if (!record.supersededBy?.length) blockers.push('REPLACEMENT_NOT_DECLARED');
  if (!record.validation?.linksChecked) blockers.push('REPLACEMENT_LINKS_NOT_CHECKED');
  if (!referenceAuditComplete || !record.validation?.referencesChecked) blockers.push('ACTIVE_REFERENCE_AUDIT_NOT_PROVEN');
  else if (activeReferences.includes(record.path)) blockers.push('ACTIVE_DOCUMENT_REFERENCE_EXISTS');

  for (const replacementId of record.supersededBy ?? []) {
    const replacement = recordsById?.get(replacementId);
    if (!replacement) blockers.push(`REPLACEMENT_LINK_UNRESOLVED:${replacementId}`);
    else if (!(replacement.supersedes ?? []).includes(record.documentId)) {
      blockers.push(`REPLACEMENT_LINK_NOT_RECIPROCAL:${replacementId}`);
    }
  }

  const openSpec = record.openspec;
  if (openSpec?.change) {
    if (openSpec.completedTasks === null || openSpec.totalTasks === null || openSpec.completedTasks !== openSpec.totalTasks) {
      blockers.push('OPENSPEC_CHANGE_INCOMPLETE');
    }
  } else if (typeof archiveExemptionRef !== 'string' || !archiveExemptionRef.trim()) {
    blockers.push('OPENSPEC_BINDING_OR_EXEMPTION_MISSING');
  }

  if (record.validation?.status !== 'PASSED') blockers.push('VALIDATION_NOT_PASSED');
  if (!record.validation?.smokePassed) blockers.push('SMOKE_NOT_PASSED');
  if (!record.validation?.testsPassed) blockers.push('TESTS_NOT_PASSED');
  if ((record.validation?.contradictions ?? []).length) blockers.push('CONTRADICTIONS_PRESENT');

  return {
    documentId: record.documentId,
    path: record.path,
    candidate: blockers.length === 0,
    blockers: [...new Set(blockers)].sort(),
    canonicalAuthority: false,
    archiveApplied: false,
  };
}

export function auditDocumentArchiveCandidatesV1(records) {
  const recordsById = new Map(records.map((record) => [record.documentId, record]));
  const candidates = records.filter((record) => record.status === 'SUPERSEDED'
    || (record.supersededBy ?? []).length > 0
    || record.archive?.eligible === true);
  const results = candidates.map((record) => evaluateDocumentArchiveCandidateV1(record, {
    recordsById,
    // This registry checker does not own a repository-wide active-reference
    // scan, so a record boolean alone cannot admit an archive candidate.
    referenceAuditComplete: false,
    activeReferences: [],
  }));
  return {
    reviewedDocuments: results.length,
    eligibleCandidates: results.filter((result) => result.candidate).length,
    blockedCandidates: results.filter((result) => !result.candidate).length,
    noCandidateReason: results.length === 0 ? 'NO_SUPERSESSION_OR_ARCHIVE_CANDIDATES' : null,
    results,
    writesPerformed: false,
    canonicalAuthority: false,
  };
}
