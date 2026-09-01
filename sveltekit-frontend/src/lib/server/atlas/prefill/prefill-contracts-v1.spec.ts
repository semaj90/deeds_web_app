import { describe, expect, it } from 'vitest';
import { buildCanonicalPacketHashV1, canonicalSha256V1 } from './canonical-hash-v1.js';
import { buildOrdinalRegistryV1 } from './ordinal-registry-v1.js';
import { buildPromptPlanV1 } from './prompt-plan-v1.js';
import {
  buildPrefillArtifactIdentityV1,
  buildPrefillContentIdentityV1,
  buildPrefillReceiptV1,
} from './prefill-contracts-v1.js';

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

    expect(physicalA.contentIdentityChecksum).toBe(physicalB.contentIdentityChecksum);
    expect(physicalA.checksumSha256).not.toBe(physicalB.checksumSha256);

    const receipt = buildPrefillReceiptV1({
      requestId: 'req-1',
      workflowId: 'wf-1',
      dagNodeId: 'prefill-1',
      contentIdentity: logical,
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
});
