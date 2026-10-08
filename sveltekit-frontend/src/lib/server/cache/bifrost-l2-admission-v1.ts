export type SemanticReuseRevisionScopeV1 =
  | {
      kind: 'WORKSPACE';
      workspaceRevisionKey: string;
    }
  | {
      kind: 'CORPUS';
      legalCorpusRevision: string;
      evidenceManifestRevision: string;
    };

export interface SemanticReuseContextV1 {
  modelId: string;
  modelArtifactRevision: string;
  representationId: string;
  dimension: number;
  embeddingRecipeRevision: string;
  inputPolicyRevision: string;
  domainTaxonomyId: string;
  domainTaxonomyRevision: string;
  domainId: string;
  retrievalIntentId: string;
  taskIntentId: string;
  revisionScope: SemanticReuseRevisionScopeV1;
}

export interface SemanticReuseCacheEntryV1 {
  context: SemanticReuseContextV1;
  answerArtifact: {
    ref: string;
    checksum: string;
    valid: boolean;
  };
}

export type BifrostL2AdmissionReasonV1 =
  | 'ADMITTED'
  | 'BELOW_SIMILARITY_THRESHOLD'
  | 'REQUEST_CONTEXT_MISSING'
  | 'CACHE_METADATA_MISSING'
  | 'MODEL_MISMATCH'
  | 'REPRESENTATION_MISMATCH'
  | 'EMBEDDING_RECIPE_MISMATCH'
  | 'DOMAIN_MISMATCH'
  | 'INTENT_MISMATCH'
  | 'REVISION_MISMATCH'
  | 'ANSWER_ARTIFACT_UNPROVEN';

export interface BifrostL2AdmissionResultV1 {
  admitted: boolean;
  reason: BifrostL2AdmissionReasonV1;
}

export const BIFROST_L2_MIN_SIMILARITY_V1 = 0.82;

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function evaluateBifrostL2AdmissionV1(input: {
  similarity: number;
  requestContext: SemanticReuseContextV1 | null;
  cacheEntry: SemanticReuseCacheEntryV1 | null;
}): BifrostL2AdmissionResultV1 {
  if (!Number.isFinite(input.similarity) || input.similarity < BIFROST_L2_MIN_SIMILARITY_V1) {
    return { admitted: false, reason: 'BELOW_SIMILARITY_THRESHOLD' };
  }
  if (!input.requestContext) return { admitted: false, reason: 'REQUEST_CONTEXT_MISSING' };
  if (!input.cacheEntry) return { admitted: false, reason: 'CACHE_METADATA_MISSING' };

  const { requestContext, cacheEntry } = input;
  if (!cacheEntry.context || !cacheEntry.answerArtifact || !requestContext.revisionScope || !cacheEntry.context.revisionScope) {
    return { admitted: false, reason: 'CACHE_METADATA_MISSING' };
  }
  const cachedContext = cacheEntry.context;
  const requestFields = [
    requestContext.modelId,
    requestContext.modelArtifactRevision,
    requestContext.representationId,
    requestContext.embeddingRecipeRevision,
    requestContext.inputPolicyRevision,
    requestContext.domainTaxonomyId,
    requestContext.domainTaxonomyRevision,
    requestContext.domainId,
    requestContext.retrievalIntentId,
    requestContext.taskIntentId,
  ];
  const cachedFields = [
    cachedContext.modelId,
    cachedContext.modelArtifactRevision,
    cachedContext.representationId,
    cachedContext.embeddingRecipeRevision,
    cachedContext.inputPolicyRevision,
    cachedContext.domainTaxonomyId,
    cachedContext.domainTaxonomyRevision,
    cachedContext.domainId,
    cachedContext.retrievalIntentId,
    cachedContext.taskIntentId,
  ];
  if (![...requestFields, ...cachedFields].every(hasText)) {
    return { admitted: false, reason: 'CACHE_METADATA_MISSING' };
  }
  if (requestContext.modelId !== cachedContext.modelId) {
    return { admitted: false, reason: 'MODEL_MISMATCH' };
  }
  if (
    !/^embeddinggemma(?::|$)/i.test(requestContext.modelId) ||
    requestContext.modelArtifactRevision !== cachedContext.modelArtifactRevision
  ) {
    return { admitted: false, reason: 'MODEL_MISMATCH' };
  }
  if (requestContext.representationId !== 'semantic_768' || requestContext.dimension !== 768) {
    return { admitted: false, reason: 'REPRESENTATION_MISMATCH' };
  }
  if (
    requestContext.representationId !== cachedContext.representationId ||
    requestContext.dimension !== cachedContext.dimension
  ) {
    return { admitted: false, reason: 'REPRESENTATION_MISMATCH' };
  }
  if (requestContext.embeddingRecipeRevision !== cachedContext.embeddingRecipeRevision) {
    return { admitted: false, reason: 'EMBEDDING_RECIPE_MISMATCH' };
  }
  if (requestContext.inputPolicyRevision !== cachedContext.inputPolicyRevision) {
    return { admitted: false, reason: 'EMBEDDING_RECIPE_MISMATCH' };
  }
  if (
    requestContext.domainTaxonomyId !== cachedContext.domainTaxonomyId ||
    requestContext.domainTaxonomyRevision !== cachedContext.domainTaxonomyRevision ||
    requestContext.domainId !== cachedContext.domainId
  ) {
    return { admitted: false, reason: 'DOMAIN_MISMATCH' };
  }
  if (
    requestContext.retrievalIntentId !== cachedContext.retrievalIntentId ||
    requestContext.taskIntentId !== cachedContext.taskIntentId
  ) {
    return { admitted: false, reason: 'INTENT_MISMATCH' };
  }

  if (requestContext.revisionScope.kind === 'WORKSPACE') {
    if (
      cachedContext.revisionScope.kind !== 'WORKSPACE' ||
      !hasText(requestContext.revisionScope.workspaceRevisionKey) ||
      requestContext.revisionScope.workspaceRevisionKey !== cachedContext.revisionScope.workspaceRevisionKey
    ) {
      return { admitted: false, reason: 'REVISION_MISMATCH' };
    }
  } else if (
    requestContext.revisionScope.kind !== 'CORPUS' ||
    cachedContext.revisionScope.kind !== 'CORPUS' ||
    !hasText(requestContext.revisionScope.legalCorpusRevision) ||
    !hasText(requestContext.revisionScope.evidenceManifestRevision) ||
    requestContext.revisionScope.legalCorpusRevision !== cachedContext.revisionScope.legalCorpusRevision ||
    requestContext.revisionScope.evidenceManifestRevision !== cachedContext.revisionScope.evidenceManifestRevision
  ) {
    return { admitted: false, reason: 'REVISION_MISMATCH' };
  }

  if (
    !cacheEntry.answerArtifact.valid ||
    !hasText(cacheEntry.answerArtifact.ref) ||
    !hasText(cacheEntry.answerArtifact.checksum)
  ) {
    return { admitted: false, reason: 'ANSWER_ARTIFACT_UNPROVEN' };
  }

  return { admitted: true, reason: 'ADMITTED' };
}
