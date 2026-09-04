import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
  type WorkspaceSourceManifestEntryV1,
} from '../identity/workspace-source-binding-v1.js';
import { buildRevisionAuthorityEnvelopeV1 } from '../identity/revision-authority-envelope-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from '../features/candidate-feature-snapshot-v1.js';
import {
  buildSearchRuntimeFeatureBundleV1,
  createSearchRuntimeFeatureBundleProviderV1,
  verifySearchRuntimeFeatureBundleV1,
} from './search-runtime-feature-bundle-provider-v1.js';
import { admitRlmResultToAceFeatureSnapshotV1 } from '../rlm/rlm-ace-feature-admission-v1.js';

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function fixture(requestId = 'req-a') {
  const contentDigest = sha('export const value = 1;\n');
  const entry: WorkspaceSourceManifestEntryV1 = {
    sourceRef: 'src/value.ts',
    sourceRevision: `sha256:${contentDigest}`,
    contentDigest,
    byteLength: 24,
    gitBlobOid: 'c'.repeat(40),
  };
  const { record, entries } = buildWorkspaceRevisionRecordV1({
    repositoryId: 'semaj90/deeds_web_app',
    gitObjectFormat: 'sha1',
    baseCommitOid: 'a'.repeat(40),
    baseTreeOid: 'b'.repeat(40),
    gitHeadRef: 'refs/heads/main',
    dirty: false,
    entries: [entry],
    generatedAt: '2026-09-02T00:00:00.000Z',
    producerRevision: 'workspace-fixture-v1',
  });
  const bindings = buildWorkspaceSourceBindingsV1({
    record,
    entries,
    trackedAtBaseCommit: new Map([['src/value.ts', true]]),
    dirtyRelativeToBaseCommit: new Map([['src/value.ts', false]]),
    producerRevision: 'binding-fixture-v1',
  });
  const revisionAuthority = buildRevisionAuthorityEnvelopeV1({ record, bindings });
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'snapshot-r1',
    workspaceRevision: record.workspaceRevision,
    producerRevision: 'ordinal-fixture-v1',
    candidates: [{
      canonicalId: 'candidate:value',
      packetKey: 'packet:value',
      sourceRef: 'src/value.ts',
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: record.workspaceRevision,
      sourceRevision: entry.sourceRevision,
      graphRevision: 'graph-r1',
      semanticRevision: 'semantic-r1',
      degradedIdentity: false,
      evidenceRefs: ['evidence:value'],
      representationBindings: [],
    }],
  });
  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap,
    featureRevision: 'feature-r1',
    producerRevision: 'feature-fixture-v1',
    rows: [{
      schema: 'atlas.candidate-feature-row.v1',
      candidateOrdinal: 0,
      canonicalId: 'candidate:value',
      packetKey: 'packet:value',
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: record.workspaceRevision,
      sourceRevision: entry.sourceRevision,
      graphRevision: 'graph-r1',
      semanticRevision: 'semantic-r1',
      featureRevision: 'feature-r1',
      representationBindings: [],
      laneMask: ['semantic'],
      evidenceRefs: ['evidence:value'],
    }],
  });
  return { requestId, ordinalMap, snapshot, revisionAuthority };
}

const rlmRequest = {
  requestId: 'req-a',
  workspaceRevision: 'workspace-r1',
  policyRevision: 'policy-r1',
  query: 'value',
  budget: {
    maxDepth: 1,
    maxSubcalls: 1,
    maxSearchCalls: 1,
    maxGraphExpansions: 1,
    maxProcessLookups: 1,
    maxPacketHydrations: 1,
    maxSourceReads: 1,
    maxPacketsHydrated: 1,
    maxTokens: 128,
    deadlineMs: 1000,
  },
};
const rlmResult = {
  response: { packets: [], topPacketKeys: ['packet:value'], metadata: {} as never, provenance: {} as never },
  trace: {
    requestId: 'req-a',
    workspaceRevision: 'workspace-r1',
    policyRevision: 'policy-r1',
    depthReached: 0,
    subcalls: 0,
    steps: [],
    status: 'COMPLETED' as const,
  },
};

describe('SearchRuntime feature bundle v1', () => {
  it('keeps logical identity stable across request envelopes', () => {
    const a = buildSearchRuntimeFeatureBundleV1(fixture('req-a'));
    const b = buildSearchRuntimeFeatureBundleV1(fixture('req-b'));
    expect(a.bundleLogicalChecksum).toBe(b.bundleLogicalChecksum);
    expect(a.bundleEnvelopeChecksum).not.toBe(b.bundleEnvelopeChecksum);
    expect(a.snapshot.snapshotChecksum).toBe(b.snapshot.snapshotChecksum);
    verifySearchRuntimeFeatureBundleV1(a);
    verifySearchRuntimeFeatureBundleV1(b);
  });

  it('binds the canonical workspace authority and revision sets', () => {
    const bundle = buildSearchRuntimeFeatureBundleV1(fixture());
    expect(bundle.workspaceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(bundle.workspaceRevision).toBe(bundle.revisionAuthority.workspaceRevision);
    expect(bundle.revisionAuthority.revisionStatus).toBe('EXACT');
    expect(bundle.revisionAuthority.syntheticRevisionCount).toBe(0);
    expect(bundle.sourceRevisionSetChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.graphRevisionSetChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.semanticRevisionSetChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects authority from a different workspace', () => {
    const input = fixture();
    const other = fixture();
    const tamperedAuthority = {
      ...other.revisionAuthority,
      workspaceRevision: `sha256:${'f'.repeat(64)}`,
    };
    expect(() => buildSearchRuntimeFeatureBundleV1({ ...input, revisionAuthority: tamperedAuthority as never }))
      .toThrow();
  });

  it('hands RLM the sealed snapshot without rematerializing it', async () => {
    const input = fixture();
    const provider = createSearchRuntimeFeatureBundleProviderV1(async () => input);
    const expected = buildSearchRuntimeFeatureBundleV1(input);
    const admitted = await admitRlmResultToAceFeatureSnapshotV1({
      provider,
      request: rlmRequest,
      result: rlmResult,
    });
    expect(admitted.status).toBe('ADMITTED');
    if (admitted.status !== 'ADMITTED') throw new Error('expected admitted');
    expect(admitted.bundle.bundleLogicalChecksum).toBe(expected.bundleLogicalChecksum);
    expect(admitted.snapshot.snapshotChecksum).toBe(expected.snapshot.snapshotChecksum);
    expect(admitted.snapshot).toEqual(admitted.bundle.snapshot);
  });
});
