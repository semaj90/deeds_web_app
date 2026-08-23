import { describe, expect, it } from 'vitest';

import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
  type WorkspaceSourceManifestEntryV1,
} from '../identity/workspace-source-binding-v1.js';
import { evaluateGraphifyWorkspaceManifestCompletenessV1 } from './graphify-workspace-manifest-completeness-v1.js';

const entries: WorkspaceSourceManifestEntryV1[] = [
  {
    sourceRef: 'src/a.ts',
    sourceRevision: `sha256:${'a'.repeat(64)}`,
    contentDigest: 'a'.repeat(64),
    byteLength: 10,
    gitBlobOid: '1'.repeat(40),
  },
  {
    sourceRef: 'src/b.ts',
    sourceRevision: `sha256:${'b'.repeat(64)}`,
    contentDigest: 'b'.repeat(64),
    byteLength: 20,
    gitBlobOid: '2'.repeat(40),
  },
];

function fixture() {
  const built = buildWorkspaceRevisionRecordV1({
    repositoryId: 'semaj90/deeds_web_app',
    gitObjectFormat: 'sha1',
    baseCommitOid: 'c'.repeat(40),
    baseTreeOid: 'd'.repeat(40),
    gitHeadRef: 'refs/heads/test',
    dirty: false,
    entries,
    generatedAt: '2026-08-22T03:45:00.000Z',
    producerRevision: 'test.workspace-origin.v1',
  });
  const tracked = new Map(entries.map((entry) => [entry.sourceRef, true]));
  const dirty = new Map(entries.map((entry) => [entry.sourceRef, false]));
  const bindings = buildWorkspaceSourceBindingsV1({
    record: built.record,
    entries: built.entries,
    trackedAtBaseCommit: tracked,
    dirtyRelativeToBaseCommit: dirty,
    producerRevision: 'test.workspace-origin.v1',
  });
  const runId = '11111111-1111-4111-8111-111111111111';
  return {
    record: built.record,
    bindings,
    run: {
      runId,
      workspaceRevision: built.record.workspaceRevision,
      sourceManifestDigest: built.record.sourceManifestDigest,
      sourceManifestSourceCount: built.record.sourceCount,
    },
    persisted: bindings.map((binding) => ({
      sourceRef: binding.sourceRef,
      codeSourceRevision: binding.sourceRevision,
      contentHash: binding.contentDigest,
      byteLength: binding.byteLength,
      lastSeenRunId: runId,
    })),
  };
}

describe('GraphifyWorkspaceManifestCompletenessV1', () => {
  it('admits graph consumption only when the complete persisted manifest matches exactly', () => {
    const f = fixture();
    const receipt = evaluateGraphifyWorkspaceManifestCompletenessV1({
      workspaceRecord: f.record,
      sourceBindings: f.bindings,
      persistedRun: f.run,
      persistedSources: f.persisted,
      producerRevision: 'test.completeness.v1',
    });
    expect(receipt.status).toBe('COMPLETE');
    expect(receipt.complete).toBe(true);
    expect(receipt.graphMayConsumeWorkspaceRevision).toBe(true);
    expect(receipt.expectedSourceCount).toBe(2);
    expect(receipt.persistedSourceCount).toBe(2);
    expect(receipt.matchedSourceCount).toBe(2);
    expect(receipt.canonicalWritesAttempted).toBe(false);
  });

  it('does not let a bounded single-row canary prove the full workspace', () => {
    const f = fixture();
    const receipt = evaluateGraphifyWorkspaceManifestCompletenessV1({
      workspaceRecord: f.record,
      sourceBindings: f.bindings,
      persistedRun: f.run,
      persistedSources: f.persisted.slice(0, 1),
      producerRevision: 'test.completeness.v1',
    });
    expect(receipt.status).toBe('SOURCE_COUNT_MISMATCH');
    expect(receipt.complete).toBe(false);
    expect(receipt.graphMayConsumeWorkspaceRevision).toBe(false);
    expect(receipt.blockers).toContain('FULL_WORKSPACE_SOURCE_COUNT_REQUIRED');
  });

  it('rejects a same-count source substitution instead of accepting count equality', () => {
    const f = fixture();
    const persisted = f.persisted.map((row) => ({ ...row }));
    persisted[1] = {
      ...persisted[1],
      codeSourceRevision: `sha256:${'e'.repeat(64)}`,
      contentHash: 'e'.repeat(64),
    };
    const receipt = evaluateGraphifyWorkspaceManifestCompletenessV1({
      workspaceRecord: f.record,
      sourceBindings: f.bindings,
      persistedRun: f.run,
      persistedSources: persisted,
      producerRevision: 'test.completeness.v1',
    });
    expect(receipt.status).toBe('SOURCE_BINDING_MISMATCH');
    expect(receipt.complete).toBe(false);
    expect(receipt.blockers).toContain('PERSISTED_SOURCE_BINDING_MISMATCH:src/b.ts');
  });

  it('rejects a run whose manifest digest/count does not bind the workspace record', () => {
    const f = fixture();
    const receipt = evaluateGraphifyWorkspaceManifestCompletenessV1({
      workspaceRecord: f.record,
      sourceBindings: f.bindings,
      persistedRun: { ...f.run, sourceManifestDigest: 'f'.repeat(64) },
      persistedSources: f.persisted,
      producerRevision: 'test.completeness.v1',
    });
    expect(receipt.status).toBe('RUN_LINEAGE_MISMATCH');
    expect(receipt.complete).toBe(false);
    expect(receipt.graphMayConsumeWorkspaceRevision).toBe(false);
  });

  it('rejects persisted rows associated with another run', () => {
    const f = fixture();
    const persisted = f.persisted.map((row, index) => index === 0
      ? { ...row, lastSeenRunId: '22222222-2222-4222-8222-222222222222' }
      : row);
    const receipt = evaluateGraphifyWorkspaceManifestCompletenessV1({
      workspaceRecord: f.record,
      sourceBindings: f.bindings,
      persistedRun: f.run,
      persistedSources: persisted,
      producerRevision: 'test.completeness.v1',
    });
    expect(receipt.status).toBe('SOURCE_BINDING_MISMATCH');
    expect(receipt.complete).toBe(false);
    expect(receipt.blockers).toContain('SOURCE_NOT_BOUND_TO_RUN:src/a.ts');
  });
});
