const clean = (value) => String(value ?? '').trim();
const validRevision = (value) => /^sha256:[0-9a-f]{64}$/i.test(clean(value));
const validDigest = (value) => /^(?:sha256:)?[0-9a-f]{64}$/i.test(clean(value));

export function evaluateSemantic768Candidate(candidate, row, identityAuthority) {
  const binding = (candidate.representationBindings ?? []).find((item) => item.representationId === 'semantic_768');
  const expectedModelRevision = clean(binding?.modelRevision ?? candidate.semanticRevision);
  const actualModelRevision = [
    'semantic_768',
    clean(row?.embedding_model),
    clean(row?.embedding_version),
    clean(row?.encoder_id),
  ].join(':');
  const checks = {
    identityAuthority: identityAuthority === true && candidate.degradedIdentity !== true,
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
