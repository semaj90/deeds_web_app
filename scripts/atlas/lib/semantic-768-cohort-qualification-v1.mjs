const clean = (value) => String(value ?? '').trim();
const validRevision = (value) => /^sha256:[0-9a-f]{64}$/i.test(clean(value));
const validDigest = (value) => /^(?:sha256:)?[0-9a-f]{64}$/i.test(clean(value));

export function evaluateSemantic768Candidate(candidate, row, candidateIdentityBound) {
  const binding = (candidate.representationBindings ?? []).find((item) => item.representationId === 'semantic_768');
  const expectedModelRevision = clean(binding?.modelRevision ?? candidate.semanticRevision);
  const embeddingModel = clean(row?.embedding_model);
  const embeddingVersion = clean(row?.embedding_version);
  const encoderId = clean(row?.encoder_id);
  const versionPrefix = embeddingModel ? `semantic_768:${embeddingModel}:` : '';
  // Some PG18 rows store the complete representation revision in embedding_version;
  // do not prepend the same model identity a second time. Older rows may store only
  // a short version and encoder separately, in which case compose the pinned form.
  const actualModelRevision = versionPrefix && embeddingVersion.startsWith(versionPrefix)
    ? embeddingVersion
    : ['semantic_768', embeddingModel, embeddingVersion, encoderId].filter(Boolean).join(':');
  const checks = {
    candidateIdentityBound: candidateIdentityBound === true && candidate.degradedIdentity !== true,
    sourceRevision: validRevision(candidate.sourceRevision) && clean(row?.source_revision) === clean(candidate.sourceRevision),
    workspaceRevision: validRevision(candidate.workspaceRevision) && clean(row?.workspace_revision) === clean(candidate.workspaceRevision),
    representationRevision: clean(row?.representation_revision).length > 0,
    vectorDigest: validDigest(row?.embedding_digest),
    vectorPresent: row?.content_embedding_768 !== null && row?.content_embedding_768 !== undefined,
    dimension: clean(row?.embedding_dimension) === '768',
    producerMetadata: Boolean(clean(row?.embedding_model) && clean(row?.embedding_version) && clean(row?.encoder_id)),
    modelRevision: expectedModelRevision.length > 0 && actualModelRevision === expectedModelRevision,
  };
  return { qualified: Object.values(checks).every(Boolean), checks, actualModelRevision };
}
