import { describe, expect, it } from 'vitest';

import { deriveCodeSourceRevisionV1 } from '../identity/code-source-revision-v1.js';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
} from '../identity/workspace-source-binding-v1.js';
import { prepareGraphSnapshotRevisionPreflightV1 } from './graph-snapshot-revision-preflight-v1.js';

const SOURCE_REF = 'src/a.ts';
const source = deriveCodeSourceRevisionV1('export const a = 1;\n');
const entry = {
  sourceRef: SOURCE_REF,
  sourceRevision: source.sourceRevision,
  contentDigest: source.contentDigest,
  byteLength: source.byteLength,
  gitBlobOid: '3'.repeat(40),
};
const built = buildWorkspaceRevisionRecordV1({
  repositoryId: 'semaj90/deeds_web_app',
  gitObjectFormat: 'sha1',
  baseCommitOid: '1'.repeat(40),
  baseTreeOid: '2'.repeat(40),
  gitHeadRef: 'refs/heads/main',
  dirty: false,
  entries: [entry],
  generatedAt: '2026-08-21T20:00:00.000Z',
  producerRevision: 'test:graph-preflight:v1',
});
const bindings = buildWorkspaceSourceBindingsV1({
  record: built.record,
  entries: built.entries,
  trackedAtBaseCommit: new Map([[SOURCE_REF, true]]),
  dirtyRelativeToBaseCommit: new Map([[SOURCE_REF, false]]),
  producerRevision: 'test:graph-preflight:v1',
});

function preflight(nodes: Array<{ nodeKey: string; sourceRef?: string | null }>) {
  return prepareGraphSnapshotRevisionPreflightV1({
    snapshotId: '11111111-1111-4111-8111-111111111111',
    workspaceRecord: built.record,
    workspaceBindings: bindings,
    graphNodes: nodes,
    identityContractVersion: 'identity:v1',
    parserContractVersion: 'parser:v1',
    sourceInventoryHash: 'a'.repeat(64),
    topologyHash: 'b'.repeat(64),
    policyHash: 'c'.repeat(64),
    producerRevision: 'test:graph-preflight:v1',
  });
}

describe('GraphSnapshotRevisionPreflightV1', () => {
  it('allows persistence only with logical workspace binding and complete source coverage', () => {
    const result = preflight([
      { nodeKey: 'source', sourceRef: SOURCE_REF },
      { nodeKey: 'repo', sourceRef: null },
    ]);
    expect(result.receipt.applyAllowed).toBe(true);
    expect(result.receipt.blockers).toEqual([]);
    expect(result.receipt.snapshotRevision.workspaceRevision).toBe(built.record.workspaceRevision);
    expect(result.receipt.snapshotRevision.sourceInventoryRevision).toBe(`sha256:${'a'.repeat(64)}`);
    expect(result.nodes[0]?.sourceRevision).toBe(source.sourceRevision);
    expect(result.nodes[1]?.sourceRevision).toBeNull();
    expect(result.revisionColumns.workspace_revision).toBe(built.record.workspaceRevision);
  });

  it('blocks persistence when a source-backed node is missing authoritative binding', () => {
    const result = preflight([{ nodeKey: 'missing', sourceRef: 'src/missing.ts' }]);
    expect(result.receipt.applyAllowed).toBe(false);
    expect(result.receipt.blockers).toContain('GRAPH_SOURCE_REVISION_COVERAGE_INCOMPLETE');
    expect(result.nodes[0]?.sourceRevision).toBeNull();
  });

  it('never substitutes Git commit or cache epoch for logical workspaceRevision', () => {
    const result = preflight([{ nodeKey: 'source', sourceRef: SOURCE_REF }]);
    expect(result.receipt.snapshotRevision.workspaceRevision).not.toBe(built.record.baseCommitOid);
    expect(result.receipt.snapshotRevision.workspaceRevision).not.toBe('41');
    expect(result.receipt.snapshotRevision.workspaceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('is deterministic for the same world state and snapshot occurrence', () => {
    const first = preflight([{ nodeKey: 'source', sourceRef: SOURCE_REF }]);
    const second = preflight([{ nodeKey: 'source', sourceRef: SOURCE_REF }]);
    expect(second.receipt.preflightChecksum).toBe(first.receipt.preflightChecksum);
    expect(second.receipt.snapshotRevision.graphRevision).toBe(first.receipt.snapshotRevision.graphRevision);
    expect(second.receipt.sourceBinding.bindingChecksum).toBe(first.receipt.sourceBinding.bindingChecksum);
  });
});
