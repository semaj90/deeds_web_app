// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildAceCompletionCacheKey,
  buildAceGenerationControlsSignatureV1,
  buildAcePacketCacheKey,
  buildAcePromptPreflightCacheKeyV1,
  assessAceExactAnswerCacheAdmissionV1,
  buildAceRevisionedExactAnswerCacheKeyV1,
  generatePromptCacheKey,
  hashStr,
} from '$lib/server/cache-keys.js';
import { buildContextPrefixIdentityV1 } from '$lib/server/atlas/prefill/context-prefix-identity-v1.js';

describe('ACE cache keys', () => {
  it('derives a stable packet key from routing inputs', () => {
    const key = buildAcePacketCacheKey({
      model: 'gemma4-rotorquant:latest-iq4xs.gguf',
      stablePrefixHash: hashStr('stable-prefix'),
      userIntent: 'summarize cluster 42',
      routingSignature: 'atlas+trace',
      dynamicContextSignature: 'ctx-1',
      dayBucket: '2026-05-19',
    });

    expect(key).toMatch(/^ace:packet:[a-f0-9]{64}$/);
  });

  it('separates completion cache entries by user query hash', () => {
    const packetKey = buildAcePacketCacheKey({
      model: 'gemma4-rotorquant:latest-iq4xs.gguf',
      stablePrefixHash: hashStr('stable-prefix'),
      userIntent: 'legal retrieval',
      routingSignature: 'atlas+trace',
      dynamicContextSignature: 'ctx-1',
      dayBucket: '2026-05-19',
    });

    const q1 = buildAceCompletionCacheKey(packetKey, hashStr('what is hearsay?'));
    const q2 = buildAceCompletionCacheKey(packetKey, hashStr('what is relevance?'));

    expect(q1).toMatch(/^ace:completion:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(q2).toMatch(/^ace:completion:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(q1).not.toBe(q2);
  });

  it('invalidates exact-answer packet keys when generation controls change', () => {
    const base = {
      model: 'ornith-1.5-9b',
      stablePrefixHash: hashStr('stable-prefix'),
      userIntent: 'same query',
      routingSignature: 'ace',
      dynamicContextSignature: 'context:r1',
      generationControlsSignature: buildAceGenerationControlsSignatureV1({ temperature: 0.3, maxTokens: 512 }),
      dayBucket: '2026-09-07',
    };
    const first = buildAcePacketCacheKey(base);
    expect(
      buildAcePacketCacheKey({
        ...base,
        generationControlsSignature: buildAceGenerationControlsSignatureV1({ temperature: 0.7, maxTokens: 512 }),
      })
    ).not.toBe(first);
    expect(
      buildAcePacketCacheKey({
        ...base,
        generationControlsSignature: buildAceGenerationControlsSignatureV1({ temperature: 0.3, maxTokens: 1024 }),
      })
    ).not.toBe(first);
  });

  it('binds available context-manifest identity to exact-answer packet keys', () => {
    const base = {
      model: 'ornith-1.5-9b',
      stablePrefixHash: hashStr('stable-prefix'),
      userIntent: 'same query',
      generationControlsSignature: buildAceGenerationControlsSignatureV1({ temperature: 0.3, maxTokens: 512 }),
      dayBucket: '2026-09-07',
    };
    const first = buildAcePacketCacheKey({ ...base, contextManifestIdentity: { revision: 'r1' } });
    expect(buildAcePacketCacheKey({ ...base, contextManifestIdentity: { revision: 'r2' } })).not.toBe(first);
  });

  it('invalidates exact-answer packet keys when rendered messages change', () => {
    const base = {
      model: 'ornith-1.5-9b',
      stablePrefixHash: hashStr('stable-prefix'),
      userIntent: 'same query',
      generationControlsSignature: buildAceGenerationControlsSignatureV1({ temperature: 0.3, maxTokens: 512 }),
      dayBucket: '2026-09-07',
    };
    const first = buildAcePacketCacheKey({ ...base, renderedRequestChecksum: 'rendered:r1' });
    expect(buildAcePacketCacheKey({ ...base, renderedRequestChecksum: 'rendered:r2' })).not.toBe(first);
  });

  it('canonicalizes nested generation-control objects', () => {
    expect(buildAceGenerationControlsSignatureV1({
      temperature: 0.3,
      maxTokens: 512,
      toolChoice: { type: 'function', function: { name: 'search' } },
    })).toBe(buildAceGenerationControlsSignatureV1({
      temperature: 0.3,
      maxTokens: 512,
      toolChoice: { function: { name: 'search' }, type: 'function' },
    }));
  });

  it('admits exact-answer reuse only with complete V2 and runtime identity', () => {
    const result = assessAceExactAnswerCacheAdmissionV1({
      contextManifestV2: {
        schema: 'atlas.context-manifest.v2',
        identityChecksum: 'a'.repeat(64),
        identityInput: {
          evidenceRevisions: {
            sourceRevision: 'source:r1',
            representationRevision: 'representation:r1',
            featureRevision: 'feature:r1',
            ontologyRevision: 'ontology:r1',
            modelRevision: 'model:r1',
            promptTemplateRevision: 'prompt:r1',
          },
        },
      },
      modelRevision: 'model:r1',
      chatTemplateRevision: 'chat:r1',
      toolSchemaRevision: 'tools:r1',
      promptTemplateRevision: 'prompt:r1',
      renderedRequestChecksum: 'rendered:r1',
      generationControlsSignature: 'controls:r1',
    });
    expect(result).toEqual({ admitted: true, manifestIdentityChecksum: 'a'.repeat(64) });
  });

  it('rejects legacy or incomplete manifest identity', () => {
    expect(assessAceExactAnswerCacheAdmissionV1({
      contextManifestV2: { schema: 'atlas.context-manifest.v1' },
      modelRevision: 'model:r1',
      chatTemplateRevision: 'chat:r1',
      toolSchemaRevision: 'tools:r1',
      promptTemplateRevision: 'prompt:r1',
      renderedRequestChecksum: 'rendered:r1',
      generationControlsSignature: 'controls:r1',
    })).toEqual({ admitted: false, reason: 'INVALID_CONTEXT_MANIFEST_V2' });

    expect(assessAceExactAnswerCacheAdmissionV1({
      contextManifestV2: {
        schema: 'atlas.context-manifest.v2',
        identityChecksum: 'a'.repeat(64),
        identityInput: { evidenceRevisions: { sourceRevision: 'source:r1' } },
      },
    })).toEqual({ admitted: false, reason: 'MISSING_REPRESENTATION_REVISION' });
  });

  it('rejects missing rendered request or generation identity', () => {
    const base = {
      contextManifestV2: {
        schema: 'atlas.context-manifest.v2',
        identityChecksum: 'a'.repeat(64),
        identityInput: {
          evidenceRevisions: {
            sourceRevision: 'source:r1', representationRevision: 'representation:r1',
            featureRevision: 'feature:r1', ontologyRevision: 'ontology:r1',
            modelRevision: 'model:r1', promptTemplateRevision: 'prompt:r1',
          },
        },
      },
      modelRevision: 'model:r1',
      chatTemplateRevision: 'chat:r1',
      toolSchemaRevision: 'tools:r1',
      promptTemplateRevision: 'prompt:r1',
    };
    expect(assessAceExactAnswerCacheAdmissionV1({ ...base, generationControlsSignature: 'controls:r1' }))
      .toEqual({ admitted: false, reason: 'MISSING_RENDERED_REQUEST_CHECKSUM' });
    expect(assessAceExactAnswerCacheAdmissionV1({ ...base, renderedRequestChecksum: 'rendered:r1' }))
      .toEqual({ admitted: false, reason: 'MISSING_GENERATION_CONTROLS_SIGNATURE' });
  });

  it('builds one canonical V2 completion key and rejects incomplete admission', () => {
    const base = {
      contextManifestV2: {
        schema: 'atlas.context-manifest.v2',
        identityChecksum: 'a'.repeat(64),
        identityInput: {
          evidenceRevisions: {
            sourceRevision: 'source:r1', representationRevision: 'representation:r1',
            featureRevision: 'feature:r1', ontologyRevision: 'ontology:r1',
            modelRevision: 'model:r1', promptTemplateRevision: 'prompt:r1',
          },
        },
      },
      userQueryHash: 'query:r1',
      modelRevision: 'model:r1',
      chatTemplateRevision: 'chat:r1',
      toolSchemaRevision: 'tools:r1',
      promptTemplateRevision: 'prompt:r1',
      renderedRequestChecksum: 'rendered:r1',
      generationControlsSignature: 'controls:r1',
    };
    const first = buildAceRevisionedExactAnswerCacheKeyV1(base);
    expect(first).toMatch(/^ace:completion:v2:[a-f0-9]{64}$/);
    expect(buildAceRevisionedExactAnswerCacheKeyV1({ ...base, userQueryHash: 'query:r2' })).not.toBe(first);
    expect(() => buildAceRevisionedExactAnswerCacheKeyV1({ ...base, chatTemplateRevision: null }))
      .toThrow('ACE_EXACT_CACHE_NOT_ADMISSIBLE:MISSING_CHAT_TEMPLATE_REVISION');
  });

  it('fixture-proves complete identity reuse and invalidation across every output-affecting field', () => {
    const base = {
      contextManifestV2: {
        schema: 'atlas.context-manifest.v2',
        identityChecksum: 'a'.repeat(64),
        identityInput: {
          evidenceRevisions: {
            sourceRevision: 'source:r1',
            representationRevision: 'representation:r1',
            featureRevision: 'feature:r1',
            ontologyRevision: 'ontology:r1',
            modelRevision: 'model:r1',
            promptTemplateRevision: 'prompt:r1',
          },
        },
      },
      userQueryHash: 'query:r1',
      modelRevision: 'model:r1',
      chatTemplateRevision: 'chat:r1',
      toolSchemaRevision: 'tools:r1',
      promptTemplateRevision: 'prompt:r1',
      renderedRequestChecksum: 'rendered:r1',
      generationControlsSignature: 'controls:r1',
    };

    const cache = new Map<string, string>();
    const first = buildAceRevisionedExactAnswerCacheKeyV1(base);
    cache.set(first, 'fixture-answer');
    expect(cache.get(buildAceRevisionedExactAnswerCacheKeyV1(base))).toBe('fixture-answer');

    const changedManifestModel = structuredClone(base.contextManifestV2) as typeof base.contextManifestV2;
    changedManifestModel.identityChecksum = 'c'.repeat(64);
    changedManifestModel.identityInput.evidenceRevisions.modelRevision = 'model:r2';
    const changedManifestPrompt = structuredClone(base.contextManifestV2) as typeof base.contextManifestV2;
    changedManifestPrompt.identityChecksum = 'd'.repeat(64);
    changedManifestPrompt.identityInput.evidenceRevisions.promptTemplateRevision = 'prompt:r2';

    const changedInputs = [
      { userQueryHash: 'query:r2' },
      { chatTemplateRevision: 'chat:r2' },
      { toolSchemaRevision: 'tools:r2' },
      { renderedRequestChecksum: 'rendered:r2' },
      { generationControlsSignature: 'controls:r2' },
      { contextManifestV2: { ...base.contextManifestV2, identityChecksum: 'b'.repeat(64) } },
      { contextManifestV2: changedManifestModel, modelRevision: 'model:r2' },
      { contextManifestV2: changedManifestPrompt, promptTemplateRevision: 'prompt:r2' },
    ];

    for (const change of changedInputs) {
      const changed = buildAceRevisionedExactAnswerCacheKeyV1({ ...base, ...change });
      expect(changed).not.toBe(first);
      expect(cache.get(changed)).toBeUndefined();
    }

    const missingManifestRevisions = [
      'sourceRevision', 'representationRevision', 'featureRevision',
      'ontologyRevision', 'modelRevision', 'promptTemplateRevision',
    ] as const;
    for (const field of missingManifestRevisions) {
      const manifest = structuredClone(base.contextManifestV2) as typeof base.contextManifestV2;
      delete (manifest.identityInput.evidenceRevisions as Record<string, unknown>)[field];
      expect(assessAceExactAnswerCacheAdmissionV1({ ...base, contextManifestV2: manifest }))
        .toMatchObject({ admitted: false });
    }
  });

  it('binds an opted-in prompt key to ContextPrefixIdentityV1', () => {
    const identity = buildContextPrefixIdentityV1({
      modelRevision: 'model:r1',
      templateRevision: 'template:r1',
      toolSchemaRevision: 'tools:r1',
      systemPolicyRevision: 'policy:r1',
      stableEvidenceRevision: 'evidence:r1',
      stablePrefix: 'stable prefix',
    });
    const base = {
      model: 'ornith-1.5-9b',
      stablePrefix: 'stable prefix',
      userIntent: 'same query',
      dayBucket: '2026-09-06',
    };
    const keyA = generatePromptCacheKey({ ...base, contextPrefixIdentity: identity });
    const keyB = generatePromptCacheKey({
      ...base,
      contextPrefixIdentity: buildContextPrefixIdentityV1({
        modelRevision: 'model:r2',
        templateRevision: 'template:r1',
        toolSchemaRevision: 'tools:r1',
        systemPolicyRevision: 'policy:r1',
        stableEvidenceRevision: 'evidence:r1',
        stablePrefix: 'stable prefix',
      }),
    });
    expect(keyA).not.toBe(keyB);
  });

  it('preserves the legacy prompt key when identity is not supplied', () => {
    const base = {
      model: 'ornith-1.5-9b',
      stablePrefix: 'stable prefix',
      userIntent: 'same query',
      dayBucket: '2026-09-06',
    };
    expect(generatePromptCacheKey(base)).toBe(generatePromptCacheKey({ ...base, contextPrefixIdentity: undefined }));
  });

  it('invalidates ACE preflight keys when model, tools, or evidence changes', () => {
    const base = {
      query: 'why did this build fail?',
      pipeline: 'ace',
      modelRevision: 'ornith:r1',
      systemPromptHash: 'system:r1',
      toolDefinitionsHash: 'tools:r1',
      repositoryRevision: 'repo:r1',
      backend: 'bifrost',
      sourceRefs: ['src/a.ts'],
      chunkIds: ['chunk:a'],
      packetKeys: ['packet:a'],
      contextManifestIdentity: { featureRevision: 'feature:r1' },
    };
    const first = buildAcePromptPreflightCacheKeyV1(base);
    expect(buildAcePromptPreflightCacheKeyV1({ ...base, modelRevision: 'ornith:r2' })).not.toBe(first);
    expect(buildAcePromptPreflightCacheKeyV1({ ...base, toolDefinitionsHash: 'tools:r2' })).not.toBe(first);
    expect(buildAcePromptPreflightCacheKeyV1({ ...base, sourceRefs: ['src/b.ts'] })).not.toBe(first);
  });

  it('canonicalizes preflight evidence collections', () => {
    const base = {
      query: 'same',
      pipeline: 'ace',
      modelRevision: 'model:r1',
      systemPromptHash: 'system:r1',
      toolDefinitionsHash: 'tools:r1',
      repositoryRevision: 'repo:r1',
      backend: 'bifrost',
    };
    expect(buildAcePromptPreflightCacheKeyV1({ ...base, sourceRefs: ['b', 'a', 'a'] }))
      .toBe(buildAcePromptPreflightCacheKeyV1({ ...base, sourceRefs: ['a', 'b'] }));
  });

});
