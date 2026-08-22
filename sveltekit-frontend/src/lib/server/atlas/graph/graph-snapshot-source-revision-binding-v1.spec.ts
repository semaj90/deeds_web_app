import { describe, expect, it } from 'vitest';

import { deriveCodeSourceRevisionV1 } from '../identity/code-source-revision-v1.js';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
} from '../identity/workspace-source-binding-v1.js';
import { bindGraphSnapshotNodeSourceRevisionsV1 } from './graph-snapshot-source-revision-binding-v1.js';

const COMMIT = '1'.repeat(40);
const TREE = '2'.repeat(40);
const BLOB_A = '3'.repeat(40);
const BLOB_B = '4'.repeat(40);

function source(sourceRef: string, text: string, gitBlobOid: string) {
  const revision = deriveCodeSourceRevisionV1(text);
  return {
    sourceRef,
    sourceRevision: revision.sourceRevision,
    contentDigest: revision.contentDigest,
    byteLength: revision.byteLength,
    gitBlobOid,
  };
}

function workspace() {
  const entries = [
    source('src/a.ts', 'export const a = 1;\n', BLOB_A),
    source('src/b.ts', 'export const b = 2;\n', BLOB_B),
  ];
  const built = buildWorkspaceRevisionRecordV1({
    repositoryId: 'semaj90/deeds_web_app',
    gitObjectFormat: 'sha1',
    baseCommitOid: COMMIT,
    baseTreeOid: TREE,
    gitHeadRef: 'refs/heads/main',
    dirty: false,
    entries,
    generatedAt: '2026-08-21T20:00:00.000Z',
    producerRevision: 'test:graph-source-binding:v1',
  });
  const bindings = buildWorkspaceSourceBindingsV1({
    record: built.record,
    entries: built.entries,
    trackedAtBaseCommit: new Map([['src/a.ts', true], ['src/b.ts', true]]),
    dirtyRelativeToBaseCommit: new Map([['src/a.ts', false], ['src/b.ts', false]]),
    producerRevision: 'test:graph-source-binding:v1',
  });
  return { record: built.record, bindings };
}

describe('GraphSnapshotSourceRevisionBindingV1', () => {
  it('binds exact workspace source revisions and allows complete coverage', () => {
    const { record, bindings } = workspace();
    const result = bindGraphSnapshotNodeSourceRevisionsV1({
      workspaceRecord: record,
      bindings,
      producerRevision: 'test:graph-source-binding:v1',
      nodes: [
        { nodeKey: 'a', sourceRef: 'src/a.ts' },
        { nodeKey: 'b', sourceRef: 'src\\b.ts' },
        { nodeKey: 'repo', sourceRef: null },
      ],
    });

    expect(result.nodes[0]?.sourceRevision).toBe(bindings[0]?.sourceRevision);
    expect(result.nodes[1]?.sourceRevision).toBe(bindings[1]?.sourceRevision);
    expect(result.nodes[2]?.sourceRevision).toBeNull();
    expect(result.receipt).toMatchObject({
      workspaceRevision: record.workspaceRevision,
      sourceBackedNodeCount: 2,
      boundNodeCount: 2,
      unboundNodeCount: 0,
      uniqueSourceRefCount: 2,
      missingSourceRefs: [],
      completeCoverage: true,
      applyAllowed: true,
    });
  });

  it('fails the APPLY gate when a source-backed graph node is not in the workspace manifest', () => {
    const { record, bindings } = workspace();
    const result = bindGraphSnapshotNodeSourceRevisionsV1({
      workspaceRecord: record,
      bindings,
      producerRevision: 'test:graph-source-binding:v1',
      nodes: [
        { nodeKey: 'a', sourceRef: 'src/a.ts' },
        { nodeKey: 'missing', sourceRef: 'src/missing.ts' },
      ],
    });

    expect(result.nodes[1]?.sourceRevision).toBeNull();
    expect(result.receipt.completeCoverage).toBe(false);
    expect(result.receipt.applyAllowed).toBe(false);
    expect(result.receipt.unboundNodeCount).toBe(1);
    expect(result.receipt.missingSourceRefs).toEqual(['src/missing.ts']);
  });

  it('rejects source bindings from a different workspace world revision', () => {
    const { record, bindings } = workspace();
    expect(() => bindGraphSnapshotNodeSourceRevisionsV1({
      workspaceRecord: { ...record, workspaceRevision: `sha256:${'f'.repeat(64)}` },
      bindings,
      producerRevision: 'test:graph-source-binding:v1',
      nodes: [{ nodeKey: 'a', sourceRef: 'src/a.ts' }],
    })).toThrow();
  });

  it('rejects conflicting duplicate source bindings rather than selecting one', () => {
    const { record, bindings } = workspace();
    const conflicting = {
      ...bindings[0]!,
      sourceRevision: `sha256:${'e'.repeat(64)}`,
      contentDigest: 'e'.repeat(64),
    };
    expect(() => bindGraphSnapshotNodeSourceRevisionsV1({
      workspaceRecord: record,
      bindings: [bindings[0]!, conflicting],
      producerRevision: 'test:graph-source-binding:v1',
      nodes: [{ nodeKey: 'a', sourceRef: 'src/a.ts' }],
    })).toThrow();
  });

  it('is deterministic for the same workspace bindings and graph nodes', () => {
    const { record, bindings } = workspace();
    const input = {
      workspaceRecord: record,
      bindings,
      producerRevision: 'test:graph-source-binding:v1',
      nodes: [{ nodeKey: 'a', sourceRef: 'src/a.ts' }, { nodeKey: 'b', sourceRef: 'src/b.ts' }],
    };
    const first = bindGraphSnapshotNodeSourceRevisionsV1(input);
    const second = bindGraphSnapshotNodeSourceRevisionsV1(input);
    expect(second.receipt.bindingChecksum).toBe(first.receipt.bindingChecksum);
    expect(second.nodes).toEqual(first.nodes);
  });
});
