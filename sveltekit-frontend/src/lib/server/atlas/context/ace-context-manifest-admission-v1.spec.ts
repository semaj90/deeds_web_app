import { describe, expect, it } from 'vitest';
import {
  admitCurrentAceContextManifestV1,
  buildAceContextManifestAdmissionV1,
  buildLiveAceRetrievalCacheHandoffV1,
  retrievalCacheIdentityFromAceManifestV1,
} from './ace-context-manifest-admission-v1.js';
import { aceTopkRevisionedKeyV1 } from '../../ace/cache-keys.js';
import { parseAceRepairPacketV1 } from '../../../../../../packages/parent-atlas/src/core/ace-repair-packet-v1.js';

const snapshot = {
  schema: 'atlas.candidate-feature-snapshot.v1' as const,
  candidateSnapshotRevision: 'candidate:r1',
  ordinalMapChecksum: 'a'.repeat(64),
  workspaceRevision: 'workspace:r1',
  featureRevision: 'feature:r1',
  rowCount: 1,
  rows: [{
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: 0,
    canonicalId: 'canonical:1',
    packetKey: 'packet:1',
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: 'workspace:r1',
    sourceRevision: 'source:r1',
    graphRevision: 'graph:r1',
    semanticRevision: 'semantic:r1',
    featureRevision: 'feature:r1',
    representationBindings: [],
    laneMask: ['semantic'] as const,
    evidenceRefs: ['evidence:1'],
  }],
  snapshotChecksum: 'b'.repeat(64),
  identityAuthority: false as const,
  canonicalOwnerChanged: false as const,
  producerRevision: 'producer:r1',
};

describe('AceContextManifestAdmissionV1', () => {
  it('builds deterministic V2 identity from an existing snapshot', () => {
    const a = buildAceContextManifestAdmissionV1({
      snapshot,
      requestId: 'request:1',
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    });
    const b = buildAceContextManifestAdmissionV1({
      snapshot,
      requestId: 'request:1',
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    });
    expect(a.manifest.identityChecksum).toBe(b.manifest.identityChecksum);
    expect(a.manifest.v1.evidenceRefs).toEqual(['evidence:1']);
    expect(a.canonicalAuthority).toBe(false);
  });

  it('rejects an ordinal that is not in the snapshot', () => {
    expect(() => buildAceContextManifestAdmissionV1({
      snapshot,
      requestId: 'request:1',
      selectedOrdinals: [1],
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    })).toThrow('ACE_MANIFEST_ORDINAL_NOT_IN_SNAPSHOT:1');
  });

  it('binds the canonical selected ordinal set and its evidence into the V2 identity', () => {
    const twoRows = {
      ...snapshot,
      rowCount: 2,
      rows: [
        snapshot.rows[0]!,
        {
          ...snapshot.rows[0]!,
          candidateOrdinal: 1,
          canonicalId: 'canonical:2',
          packetKey: 'packet:2',
          sourceRevision: 'source:r2',
          evidenceRefs: ['evidence:2'],
        },
      ],
    };
    const build = (selectedOrdinals: number[]) => buildAceContextManifestAdmissionV1({
      snapshot: twoRows,
      requestId: 'request:selected-set',
      selectedOrdinals,
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    });

    const canonicalOrder = build([1, 0, 1]);
    const reversedOrder = build([0, 1]);
    const subset = build([0]);

    expect(canonicalOrder.selectedOrdinalSetChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(canonicalOrder.selectedOrdinalSetChecksum).toBe(reversedOrder.selectedOrdinalSetChecksum);
    expect(canonicalOrder.manifest.identityChecksum).toBe(reversedOrder.manifest.identityChecksum);
    expect(canonicalOrder.manifest.identityChecksum).not.toBe(subset.manifest.identityChecksum);
    expect(canonicalOrder.manifest.v1.selectedNodeKeys).toEqual(['canonical:1', 'canonical:2']);
    expect(canonicalOrder.manifest.v1.evidenceRefs).toEqual(['evidence:1', 'evidence:2']);
    expect(canonicalOrder.sourceRevisionSetChecksum).not.toBe(subset.sourceRevisionSetChecksum);
    expect(canonicalOrder.canonicalAuthority).toBe(false);
  });

  it('composes an ACE repair descriptor through the existing ContextManifest owner without authority', () => {
    const candidateSnapshotRevision = `sha256:${'4'.repeat(64)}`;
    const ordinalMapChecksum = 'a'.repeat(64);
    const sourceRevision = `sha256:${'3'.repeat(64)}`;
    const repairPacket = parseAceRepairPacketV1({
      schema: 'atlas.ace-repair-packet.v1',
      requestId: 'request:repair-context-fixture',
      candidateSnapshotRevision,
      ordinalMapChecksum: `sha256:${ordinalMapChecksum}`,
      selectedCandidateOrdinals: [0],
      packetRefs: ['packet:1'],
      sourceRefs: ['docs/runtime.md'],
      sourceRevisions: [sourceRevision],
      evidenceRefs: ['evidence:1'],
      diagnosticRef: 'diagnostic:1',
      structuralEvidenceRefs: [],
      documentationRuleRefs: ['api-rule:1'],
      graphEvidenceRefs: [],
      representationRefs: [],
      canonicalAuthority: false,
      writesPerformed: false,
    });
    const fixtureSnapshot = {
      ...snapshot,
      candidateSnapshotRevision,
      ordinalMapChecksum,
      rows: [{ ...snapshot.rows[0]!, sourceRevision, evidenceRefs: repairPacket.evidenceRefs }],
    };

    const admission = buildAceContextManifestAdmissionV1({
      snapshot: fixtureSnapshot,
      requestId: repairPacket.requestId,
      selectedOrdinals: repairPacket.selectedCandidateOrdinals,
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:repair-fixture',
      acePlaybookRevision: 'playbook:repair-fixture',
      representationRevision: 'semantic:repair-fixture',
      graphRevision: null,
    });

    expect(admission.manifest.v1.snapshotId).toBe(repairPacket.candidateSnapshotRevision);
    expect(admission.manifest.identityInput.ordinalMapChecksum).toBe(ordinalMapChecksum);
    expect(admission.manifest.v1.evidenceRefs).toEqual(repairPacket.evidenceRefs);
    expect(admission.canonicalAuthority).toBe(false);
  });

  it('derives cache identity only from complete manifest and explicit runtime fields', () => {
    const admission = buildAceContextManifestAdmissionV1({
      snapshot,
      requestId: 'request:1',
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    });
    const identity = retrievalCacheIdentityFromAceManifestV1(admission, {
      queryHash: 'query:r1',
      model: 'embeddinggemma',
      dim: 768,
      workspaceRevision: 'workspace:r1',
      contextPolicyRevision: 'context:r1',
    });
    expect(identity?.candidateSnapshotRevision).toBe(snapshot.candidateSnapshotRevision);
    expect(identity?.featureRevision).toBe(snapshot.featureRevision);
    expect(retrievalCacheIdentityFromAceManifestV1(admission, {
      queryHash: 'query:r1', model: 'embeddinggemma', dim: 768,
      workspaceRevision: '', contextPolicyRevision: 'context:r1',
    })).toBeNull();
  });
});

describe('admitCurrentAceContextManifestV1', () => {
  it('returns no manifest when the current feature snapshot is blocked', () => {
    const featureAdmission = currentCandidateAdmissionFixture();
    const result = admitCurrentAceContextManifestV1({
      featureAdmission,
      requestId: 'request:blocked',
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    });
    expect(result.status).toBe('BLOCKED_FEATURE_SNAPSHOT');
    expect(result.manifest).toBeNull();
    expect(result.writesPerformed).toBe(false);
  });
});

function currentCandidateAdmissionFixture() {
  return {
    schema: 'atlas.current-candidate-feature-admission.v1' as const,
    status: 'BLOCKED_SEMANTIC' as const,
    candidateSnapshotRevision: 'candidate:r1',
    workspaceRevision: 'workspace:r1',
    featureRevision: 'feature:r1',
    ordinalMapChecksum: 'a'.repeat(64),
    rowCount: 0,
    snapshot: null,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
    reason: 'BLOCKED_SEMANTIC',
  };
}

describe('buildLiveAceRetrievalCacheHandoffV1 (server-owned caller handoff)', () => {
  const admit = (over: Record<string, unknown> = {}, snap = snapshot) => buildAceContextManifestAdmissionV1({
    snapshot: snap, requestId: 'request:1', tokenBudget: 512, retrievalPolicyRevision: 'policy:r1',
    acePlaybookRevision: 'playbook:r1', representationRevision: 'semantic:r1', graphRevision: 'graph:r1', ...over,
  });
  const runtime = { queryHash: 'q'.repeat(16), model: 'embeddinggemma', dim: 768, workspaceRevision: 'sha256:' + 'c'.repeat(64), contextPolicyRevision: 'ctx:r1' };
  const key = (h: ReturnType<typeof buildLiveAceRetrievalCacheHandoffV1>) => {
    if (h.status !== 'ADMITTED') throw new Error('expected ADMITTED: ' + h.reason);
    return aceTopkRevisionedKeyV1(h.retrievalCacheIdentity);
  };

  it('complete admitted manifest -> ADMITTED, no writes, no authority', () => {
    const h = buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit(), ...runtime });
    expect(h.status).toBe('ADMITTED');
    expect(h.canonicalAuthority).toBe(false);
    expect(h.writesPerformed).toBe(false);
  });

  it('changing workspace, policy, representation, feature, source, model, context policy or query -> different key', () => {
    const base = key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit(), ...runtime }));
    const variants = [
      key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit(), ...runtime, workspaceRevision: 'sha256:' + 'd'.repeat(64) })),
      key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit({ retrievalPolicyRevision: 'policy:r2' }), ...runtime })),
      key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit({ representationRevision: 'semantic:r2' }), ...runtime })),
      key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit({}, { ...snapshot, candidateSnapshotRevision: 'candidate:r2', rows: [{ ...snapshot.rows[0], sourceRevision: 'source:r2' }] }), ...runtime })), // a new source revision arrives as a NEW snapshot
      key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit({}, { ...snapshot, featureRevision: 'feature:r2', rows: [{ ...snapshot.rows[0], featureRevision: 'feature:r2' }] }), ...runtime })),
      key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit(), ...runtime, model: 'other-model' })),
      key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit(), ...runtime, contextPolicyRevision: 'ctx:r2' })),
      key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit(), ...runtime, queryHash: 'z'.repeat(16) })),
    ];
    variants.forEach((v, i) => expect(v, `variant ${i}`).not.toBe(base));
    expect(new Set([base, ...variants]).size).toBe(variants.length + 1);
  });

  it('CHARACTERIZATION: the strict key has no direct sourceRevision field; a source change with the SAME snapshot id and ordinal map does not change it', () => {
    const base = key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit(), ...runtime }));
    const sameSnapshotNewSource = key(buildLiveAceRetrievalCacheHandoffV1({
      admittedManifest: admit({}, { ...snapshot, rows: [{ ...snapshot.rows[0], sourceRevision: 'source:r2' }] }), ...runtime }));
    // Invalidation on source change therefore depends on the snapshot producer minting a new candidateSnapshotRevision / ordinalMapChecksum.
    expect(sameSnapshotNewSource).toBe(base);
  });

  it('is deterministic for identical inputs', () => {
    expect(key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit(), ...runtime })))
      .toBe(key(buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit(), ...runtime })));
  });

  it('missing or synthetic runtime/manifest revisions -> BLOCKED with a reason, no identity', () => {
    const blocked = (over: Record<string, unknown>, manifest = admit()) =>
      buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: manifest, ...runtime, ...over });
    expect(blocked({ workspaceRevision: '  ' })).toMatchObject({ status: 'BLOCKED', reason: 'WORKSPACE_REVISION_REQUIRED', retrievalCacheIdentity: null });
    expect(blocked({ workspaceRevision: 'latest' }).reason).toBe('WORKSPACE_REVISION_SYNTHETIC');
    expect(blocked({ workspaceRevision: '2026-09-26T10:00:00Z' }).reason).toBe('WORKSPACE_REVISION_SYNTHETIC');
    expect(blocked({ contextPolicyRevision: '' }).reason).toBe('CONTEXT_POLICY_REVISION_REQUIRED');
    expect(blocked({ dim: 0 }).reason).toBe('DIMENSION_INVALID');
    expect(blocked({ model: '' }).reason).toBe('MODEL_REQUIRED');
    expect(blocked({}, admit({ representationRevision: null })).reason).toBe('REPRESENTATION_REVISION_REQUIRED');
    expect(blocked({}, { manifest: null } as never).reason).toBe('MANIFEST_INVALID');
  });

  it('extra client-style fields cannot override server-supplied revisions or manifest-owned ones', () => {
    const forged = { ...runtime, sourceRevision: 'forged', representationRevision: 'forged', featureRevision: 'forged', retrievalPolicyRevision: 'forged' };
    const h = buildLiveAceRetrievalCacheHandoffV1({ admittedManifest: admit(), ...forged } as never);
    expect(h.status).toBe('ADMITTED');
    if (h.status === 'ADMITTED') {
      expect(h.retrievalCacheIdentity.representationRevision).toBe('semantic:r1');
      expect(h.retrievalCacheIdentity.featureRevision).toBe('feature:r1');
      expect(h.retrievalCacheIdentity.retrievalPolicyRevision).toBe('policy:r1');
      expect(h.retrievalCacheIdentity.workspaceRevision).toBe(runtime.workspaceRevision);
    }
  });
});
