import { describe, expect, it } from 'vitest';
import { buildContextManifestV2 } from './context-manifest-v2.js';
import type { ContextManifestV1 } from './graph-runtime-contracts.js';

const V1: ContextManifestV1 = {
  schema: 'atlas.context-manifest.v1',
  requestId: 'req:cm2-test-1',
  snapshotId: 'snap:1',
  graphRevision: 'graph:338',
  query: 'find the reranker',
  candidateBucket: 32,
  candidateCount: 12,
  tokenBudget: 4096,
  selectedNodeKeys: ['packet:a', 'packet:b'],
  evidenceRefs: ['packet:a', 'packet:b'],
  producerRevision: 'context-manifest:test',
};

const IDENTITY_INPUT = {
  selectedOrdinalSetChecksum: 'ord-checksum-1',
  evidenceRevisions: {
    sourceRevision: 'src:1',
    representationRevision: 'sem768:r1',
    featureRevision: 'feat:1',
    ontologyRevision: null,
    modelRevision: 'model:gemma4:1',
    promptTemplateRevision: 'prompt:1',
  },
  ordinalMapChecksum: 'ordinal-map-checksum-1',
  retrievalPolicyRevision: 'policy:1',
  acePlaybookRevision: 'playbook:1',
};

describe('CM-02: ContextManifestV2', () => {
  it('carries every V1 field through unchanged', () => {
    const v2 = buildContextManifestV2(V1, IDENTITY_INPUT);
    expect(v2.v1).toEqual(V1);
    expect(v2.schema).toBe('atlas.context-manifest.v2');
  });

  it('produces a deterministic 64-hex identityChecksum for identical input', () => {
    const first = buildContextManifestV2(V1, IDENTITY_INPUT);
    const second = buildContextManifestV2(V1, IDENTITY_INPUT);
    expect(first.identityChecksum).toBe(second.identityChecksum);
    expect(first.identityChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes the checksum when only a routing/policy revision changes, not the underlying V1 evidence', () => {
    const original = buildContextManifestV2(V1, IDENTITY_INPUT);
    const rePlanned = buildContextManifestV2(V1, {
      ...IDENTITY_INPUT,
      retrievalPolicyRevision: 'policy:2',
    });
    expect(rePlanned.identityChecksum).not.toBe(original.identityChecksum);
    expect(rePlanned.v1.selectedNodeKeys).toEqual(original.v1.selectedNodeKeys);
  });

  it('changes the checksum when the underlying V1 requestId/snapshotId changes, even with identical revision inputs', () => {
    const original = buildContextManifestV2(V1, IDENTITY_INPUT);
    const differentSnapshot = buildContextManifestV2({ ...V1, snapshotId: 'snap:2' }, IDENTITY_INPUT);
    expect(differentSnapshot.identityChecksum).not.toBe(original.identityChecksum);
  });

  it('accepts null evidence revisions (not every lane has run yet) without becoming invalid', () => {
    const v2 = buildContextManifestV2(V1, {
      ...IDENTITY_INPUT,
      evidenceRevisions: {
        sourceRevision: null,
        representationRevision: null,
        featureRevision: null,
        ontologyRevision: null,
        modelRevision: null,
        promptTemplateRevision: null,
      },
    });
    expect(v2.identityInput.evidenceRevisions.sourceRevision).toBeNull();
    expect(v2.identityChecksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
