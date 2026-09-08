import { describe, expect, it } from 'vitest';
import { buildCanonicalPacketHashV1, canonicalSha256V1 } from './canonical-hash-v1.js';
import { buildOrdinalRegistryV1 } from './ordinal-registry-v1.js';
import { buildPromptPlanV1 } from './prompt-plan-v1.js';
import {
  buildPrefillArtifactIdentityV1,
  buildContextPrefixIdentityFromPrefillContentV1,
  buildPrefillContentIdentityV1,
  buildPrefillReceiptV1,
} from './prefill-contracts-v1.js';
import { buildContextPrefixIdentityV1, buildContextPrefixReuseObservationV1 } from './context-prefix-identity-v1.js';

const H = (value: string) => canonicalSha256V1(value);

describe('CanonicalPacketHashV1', () => {
  it('normalizes set order without changing ordered sequence semantics', () => {
    const first = buildCanonicalPacketHashV1({
      schemaVersion: 'packet.v1',
      canonicalId: 'c1',
      packetKey: 'p1',
      setIds: ['b', 'a', 'a'],
      orderedIds: ['x', 'y'],
      normalizedText: { label: 'Cafe\u0301' },
      sourceRevisions: ['r2', 'r1'],
    });
    const second = buildCanonicalPacketHashV1({
      schemaVersion: 'packet.v1',
      canonicalId: 'c1',
      packetKey: 'p1',
      setIds: ['a', 'b'],
      orderedIds: ['x', 'y'],
      normalizedText: { label: 'Café' },
      sourceRevisions: ['r1', 'r2'],
    });
    const reordered = buildCanonicalPacketHashV1({
      schemaVersion: 'packet.v1',
      canonicalId: 'c1',
      packetKey: 'p1',
      setIds: ['a', 'b'],
      orderedIds: ['y', 'x'],
      normalizedText: { label: 'Café' },
      sourceRevisions: ['r1', 'r2'],
    });

    expect(first.hash).toBe(second.hash);
    expect(reordered.hash).not.toBe(first.hash);
  });
});

describe('OrdinalRegistryV1', () => {
  it('keeps ordinals snapshot-local and rejects duplicate tensor rows', () => {
    const base = {
      registryRevision: 'ord:r1',
      workspaceRevision: 'ws:r1',
      sourceRevisionSetHash: H('sources'),
      graphRevision: 'graph:r1',
      representationRevision: 'semantic:r1',
    };

    const registry = buildOrdinalRegistryV1({
      ...base,
      entries: [
        { canonicalId: 'b', packetKey: 'pb', symbolVersionId: null, treeNodeId: null, semanticOrdinal: 1, graphOrdinal: 2, tensorRow: 1 },
        { canonicalId: 'a', packetKey: 'pa', symbolVersionId: 's1', treeNodeId: 't1', semanticOrdinal: 0, graphOrdinal: 1, tensorRow: 0 },
      ],
    });

    expect(registry.entries.map((entry) => entry.canonicalId)).toEqual(['a', 'b']);
    expect(() => buildOrdinalRegistryV1({
      ...base,
      entries: [
        { canonicalId: 'a', packetKey: 'pa', symbolVersionId: null, treeNodeId: null, semanticOrdinal: 0, graphOrdinal: 0, tensorRow: 0 },
        { canonicalId: 'b', packetKey: 'pb', symbolVersionId: null, treeNodeId: null, semanticOrdinal: 1, graphOrdinal: 1, tensorRow: 0 },
      ],
    })).toThrow(/duplicate tensorRow/);
  });
});

describe('compiled prefill identity', () => {
  it('separates logical content identity from physical KV artifact identity', () => {
    const manifest = H('manifest');
    const plan = buildPromptPlanV1({
      requestId: 'req-1',
      contextManifestChecksum: manifest,
      tokenizerRevision: 'tok:r1',
      promptTemplateRevision: 'prompt:r2',
      instructionRevision: 'instruction:r5',
      segments: [
        { ordinal: 0, kind: 'SYSTEM', packetKey: null, evidenceRefs: [], contentChecksum: H('system'), tokenCount: 12 },
        { ordinal: 1, kind: 'EVIDENCE', packetKey: 'packet:a', evidenceRefs: ['ev:1'], contentChecksum: H('evidence'), tokenCount: 30 },
      ],
    });

    const logical = buildPrefillContentIdentityV1({
      contextManifestChecksum: manifest,
      promptPlanChecksum: plan.checksumSha256,
      canonicalPacketSetHash: H('packets'),
      modelRevision: 'model:r7',
      adapterRevision: null,
      tokenizerRevision: 'tok:r1',
      promptTemplateRevision: 'prompt:r2',
      instructionRevision: 'instruction:r5',
      evidenceRevisionSetHash: H('evidence-revisions'),
      acePolicyRevision: 'ace-policy:r1',
      bitfrostRevision: 'bitfrost:r1',
      residencyPlanChecksum: H('residency-plan'),
      gpuExecutionIdentity: 'gpu:rtx3060ti:cuda12.1',
    });

    const physicalA = buildPrefillArtifactIdentityV1({
      contentIdentityChecksum: logical.checksumSha256,
      backendRevision: 'llama:r1',
      kvLayoutRevision: 'kv:r1',
      kvDtype: 'F16',
      quantizationRevision: null,
      ropeConfigRevision: 'rope:r1',
      tensorArtifactChecksums: [H('kv-a')],
    });
    const physicalB = buildPrefillArtifactIdentityV1({
      contentIdentityChecksum: logical.checksumSha256,
      backendRevision: 'tensorrt:r2',
      kvLayoutRevision: 'kv:r2',
      kvDtype: 'BF16',
      quantizationRevision: null,
      ropeConfigRevision: 'rope:r1',
      tensorArtifactChecksums: [H('kv-b')],
    });
    const contextPrefixIdentity = buildContextPrefixIdentityV1({
      modelRevision: 'model:r7',
      templateRevision: 'prompt:r2',
      toolSchemaRevision: 'tools:r1',
      systemPolicyRevision: 'policy:r1',
      stableEvidenceRevision: 'evidence:r1',
      stablePrefix: 'stable system policy and tool contract',
    });
    const composedContextPrefixIdentity = buildContextPrefixIdentityFromPrefillContentV1({
      contentIdentity: logical,
      stablePrefix: 'stable system policy and tool contract',
      toolSchemaRevision: 'tools:r1',
      systemPolicyRevision: 'policy:r1',
    });
    const contextPrefixReuseObservation = buildContextPrefixReuseObservationV1({
      identity: contextPrefixIdentity,
      stablePrefix: 'stable system policy and tool contract',
      previousStablePrefix: 'stable system policy and tool contract\nold suffix',
      cachedPrefillTokens: 80,
      newPrefillTokens: 20,
      observedAt: '2026-09-06T20:00:00.000Z',
    });

    expect(physicalA.contentIdentityChecksum).toBe(physicalB.contentIdentityChecksum);
    expect(physicalA.checksumSha256).not.toBe(physicalB.checksumSha256);
    expect(plan.contextLimitTokens).toBe(65_536);
    expect(plan.reservedOutputTokens).toBe(8_192);
    expect(plan.maxInputTokens).toBe(57_344);

    const receipt = buildPrefillReceiptV1({
      requestId: 'req-1',
      workflowId: 'wf-1',
      dagNodeId: 'prefill-1',
      contentIdentity: logical,
      contextPrefixIdentity,
      contextPrefixReuseObservation,
      physicalArtifact: physicalA,
      selectedPacketKeys: ['packet:a'],
      evidenceRefs: ['ev:1'],
      ordinalRegistryChecksum: H('ordinal-registry'),
      promptTokenCount: 42,
      cacheStatus: 'MISS_COMPILED',
      deterministicContextConstruction: true,
      numericalParityMode: 'TOLERANCE_CROSS_ENV',
      producerRevision: 'prefill-compiler:r1',
      emittedAt: '2026-08-21T15:40:00.000Z',
    });

    expect(receipt.contentIdentity.checksumSha256).toBe(logical.checksumSha256);
    expect(receipt.contextPrefixIdentity?.checksum).toBe(contextPrefixIdentity.checksum);
    expect(composedContextPrefixIdentity.modelRevision).toBe(logical.modelRevision);
    expect(composedContextPrefixIdentity.templateRevision).toBe(logical.promptTemplateRevision);
    expect(composedContextPrefixIdentity.stableEvidenceRevision).toBe(logical.evidenceRevisionSetHash);
    expect(receipt.contextPrefixReuseObservation?.prefixReuseRatio).toBe(0.8);

    const mismatchedPrefixIdentity = buildContextPrefixIdentityV1({
      modelRevision: 'different-model',
      templateRevision: 'prompt:r2',
      toolSchemaRevision: 'tools:r1',
      systemPolicyRevision: 'policy:r1',
      stableEvidenceRevision: 'evidence:r1',
      stablePrefix: 'stable system policy and tool contract',
    });
    expect(() => buildPrefillReceiptV1({
      requestId: 'req-1',
      workflowId: 'wf-1',
      dagNodeId: 'prefill-1',
      contentIdentity: logical,
      contextPrefixIdentity: mismatchedPrefixIdentity,
      contextPrefixReuseObservation: null,
      physicalArtifact: physicalA,
      selectedPacketKeys: ['packet:a'],
      evidenceRefs: ['ev:1'],
      ordinalRegistryChecksum: H('ordinal-registry'),
      promptTokenCount: 42,
      cacheStatus: 'MISS_COMPILED',
      deterministicContextConstruction: true,
      numericalParityMode: 'TOLERANCE_CROSS_ENV',
      producerRevision: 'prefill-compiler:r1',
      emittedAt: '2026-08-21T15:40:00.000Z',
    })).toThrow('prefill context prefix model revision does not match content identity');

    expect(() => buildPrefillReceiptV1({
      requestId: 'req-1',
      workflowId: 'wf-1',
      dagNodeId: 'prefill-1',
      contentIdentity: logical,
      contextPrefixIdentity: null,
      contextPrefixReuseObservation,
      physicalArtifact: physicalA,
      selectedPacketKeys: ['packet:a'],
      evidenceRefs: ['ev:1'],
      ordinalRegistryChecksum: H('ordinal-registry'),
      promptTokenCount: 42,
      cacheStatus: 'MISS_COMPILED',
      deterministicContextConstruction: true,
      numericalParityMode: 'TOLERANCE_CROSS_ENV',
      producerRevision: 'prefill-compiler:r1',
      emittedAt: '2026-08-21T15:40:00.000Z',
    })).toThrow('prefill context prefix reuse observation requires context prefix identity');
  });

  it('rejects prefill content identity missing the ACE/BitFrost boundary fields', () => {
    const manifest = H('manifest-2');
    const base = {
      contextManifestChecksum: manifest,
      promptPlanChecksum: H('plan-2'),
      canonicalPacketSetHash: H('packets-2'),
      modelRevision: 'model:r8',
      adapterRevision: null as string | null,
      tokenizerRevision: 'tok:r2',
      promptTemplateRevision: 'prompt:r3',
      instructionRevision: 'instruction:r6',
      evidenceRevisionSetHash: H('evidence-revisions-2'),
    };

    expect(() =>
      buildPrefillContentIdentityV1({
        ...base,
        acePolicyRevision: 'ace-policy:r2',
        bitfrostRevision: 'bitfrost:r2',
        residencyPlanChecksum: H('residency-plan-2'),
        gpuExecutionIdentity: 'gpu:rtx3060ti:cuda12.1',
        // @ts-expect-error missing/extra field must be rejected by the strict schema
        extraUnknownField: 'not-allowed',
      }),
    ).toThrow();

    const complete = buildPrefillContentIdentityV1({
      ...base,
      acePolicyRevision: 'ace-policy:r2',
      bitfrostRevision: 'bitfrost:r2',
      residencyPlanChecksum: H('residency-plan-2'),
      gpuExecutionIdentity: 'gpu:rtx3060ti:cuda12.1',
    });
    expect(complete.acePolicyRevision).toBe('ace-policy:r2');
    expect(complete.bitfrostRevision).toBe('bitfrost:r2');
    expect(complete.residencyPlanChecksum).toBe(H('residency-plan-2'));
    expect(complete.gpuExecutionIdentity).toBe('gpu:rtx3060ti:cuda12.1');
  });

  it('rejects a prompt plan that exceeds the reserved-output budget', () => {
    expect(() => buildPromptPlanV1({
      requestId: 'req-budget',
      contextManifestChecksum: H('manifest-budget'),
      tokenizerRevision: 'tok:r1',
      promptTemplateRevision: 'prompt:r1',
      instructionRevision: 'instruction:r1',
      contextLimitTokens: 1_024,
      reservedOutputTokens: 256,
      maxInputTokens: 768,
      segments: [
        { ordinal: 0, kind: 'SYSTEM', packetKey: null, evidenceRefs: [], contentChecksum: H('system-budget'), tokenCount: 769 },
      ],
    })).toThrow(/exceeds maxInputTokens/);
  });

  it('rejects a budget whose input and output reservations exceed the context limit', () => {
    expect(() => buildPromptPlanV1({
      requestId: 'req-invalid-budget',
      contextManifestChecksum: H('manifest-invalid-budget'),
      tokenizerRevision: 'tok:r1',
      promptTemplateRevision: 'prompt:r1',
      instructionRevision: 'instruction:r1',
      contextLimitTokens: 1_024,
      reservedOutputTokens: 512,
      maxInputTokens: 513,
      segments: [
        { ordinal: 0, kind: 'SYSTEM', packetKey: null, evidenceRefs: [], contentChecksum: H('system-invalid-budget'), tokenCount: 1 },
      ],
    })).toThrow(/exceeds contextLimitTokens/);
  });
});
