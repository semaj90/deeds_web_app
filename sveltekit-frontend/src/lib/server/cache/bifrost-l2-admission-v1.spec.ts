import { describe, expect, it } from 'vitest';
import {
  BIFROST_L2_MIN_SIMILARITY_V1,
  evaluateBifrostL2AdmissionV1,
  type SemanticReuseCacheEntryV1,
  type SemanticReuseContextV1,
} from './bifrost-l2-admission-v1.js';

const codeContext: SemanticReuseContextV1 = {
  modelId: 'embeddinggemma',
  modelArtifactRevision: 'sha256:model-1',
  representationId: 'semantic_768',
  dimension: 768,
  embeddingRecipeRevision: 'semantic_768:recipe-1',
  inputPolicyRevision: 'query-policy-1',
  domainTaxonomyId: 'parent-atlas-domain-taxonomy',
  domainTaxonomyRevision: 'taxonomy-rev-1',
  domainId: 'code',
  retrievalIntentId: 'GRAPH',
  taskIntentId: 'RESEARCH',
  revisionScope: { kind: 'WORKSPACE', workspaceRevisionKey: 'git:abc123' },
};

const cacheEntry: SemanticReuseCacheEntryV1 = {
  context: codeContext,
  answerArtifact: { ref: 'artifact:answer-1', checksum: 'sha256:answer-1', valid: true },
};

describe('Bifrost L2 semantic reuse admission', () => {
  it('admits only a complete, matching code context at the 0.82 floor', () => {
    expect(BIFROST_L2_MIN_SIMILARITY_V1).toBe(0.82);
    expect(evaluateBifrostL2AdmissionV1({
      similarity: 0.82,
      requestContext: codeContext,
      cacheEntry,
    })).toEqual({ admitted: true, reason: 'ADMITTED' });
  });

  it.each([
    ['missing request context', null, cacheEntry, 'REQUEST_CONTEXT_MISSING'],
    ['missing cached metadata', codeContext, null, 'CACHE_METADATA_MISSING'],
    ['low similarity', codeContext, cacheEntry, 'BELOW_SIMILARITY_THRESHOLD'],
    ['different model', { ...codeContext, modelId: 'other-model' }, cacheEntry, 'MODEL_MISMATCH'],
    ['different representation', { ...codeContext, representationId: 'mrl_512', dimension: 512 }, cacheEntry, 'REPRESENTATION_MISMATCH'],
    ['different recipe', { ...codeContext, embeddingRecipeRevision: 'recipe-2' }, cacheEntry, 'EMBEDDING_RECIPE_MISMATCH'],
    ['different model artifact', { ...codeContext, modelArtifactRevision: 'sha256:model-2' }, cacheEntry, 'MODEL_MISMATCH'],
    ['different input policy', { ...codeContext, inputPolicyRevision: 'document-policy-1' }, cacheEntry, 'EMBEDDING_RECIPE_MISMATCH'],
    ['different domain', { ...codeContext, domainId: 'legal' }, cacheEntry, 'DOMAIN_MISMATCH'],
    ['different intent', { ...codeContext, taskIntentId: 'REPAIR' }, cacheEntry, 'INTENT_MISMATCH'],
    ['different workspace revision', { ...codeContext, revisionScope: { kind: 'WORKSPACE', workspaceRevisionKey: 'git:def456' } }, cacheEntry, 'REVISION_MISMATCH'],
    ['invalid answer artifact', codeContext, { ...cacheEntry, answerArtifact: { ...cacheEntry.answerArtifact, valid: false } }, 'ANSWER_ARTIFACT_UNPROVEN'],
  ] as const)('fails closed for %s', (_label, requestContext, entry, reason) => {
    expect(evaluateBifrostL2AdmissionV1({
      similarity: _label === 'low similarity' ? 0.81 : 0.9,
      requestContext: requestContext as SemanticReuseContextV1 | null,
      cacheEntry: entry as SemanticReuseCacheEntryV1 | null,
    })).toEqual({ admitted: false, reason });
  });

  it('requires both legal corpus and evidence manifest revisions', () => {
    const legal: SemanticReuseContextV1 = {
      modelId: 'embeddinggemma',
      modelArtifactRevision: 'sha256:model-1',
      representationId: 'semantic_768',
      dimension: 768,
      embeddingRecipeRevision: 'semantic_768:recipe-1',
      inputPolicyRevision: 'query-policy-1',
      domainTaxonomyId: 'parent-atlas-domain-taxonomy',
      domainTaxonomyRevision: 'taxonomy-rev-1',
      domainId: 'legal',
      retrievalIntentId: 'LEXICAL',
      taskIntentId: 'RESEARCH',
      revisionScope: { kind: 'CORPUS', legalCorpusRevision: 'corpus-1', evidenceManifestRevision: 'evidence-1' },
    };
    const legalEntry: SemanticReuseCacheEntryV1 = { ...cacheEntry, context: legal };
    expect(evaluateBifrostL2AdmissionV1({ similarity: 0.9, requestContext: legal, cacheEntry: legalEntry }))
      .toEqual({ admitted: true, reason: 'ADMITTED' });
    expect(evaluateBifrostL2AdmissionV1({
      similarity: 0.9,
      requestContext: {
        ...legal,
        revisionScope: { kind: 'CORPUS', legalCorpusRevision: 'corpus-1', evidenceManifestRevision: '' },
      },
      cacheEntry: legalEntry,
    })).toEqual({ admitted: false, reason: 'REVISION_MISMATCH' });
  });
});
