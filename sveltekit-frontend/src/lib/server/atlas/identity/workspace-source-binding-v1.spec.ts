import { describe, expect, it } from 'vitest';
import { deriveCodeSourceRevisionV1 } from './code-source-revision-v1.js';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
  workspaceSourceBindingV1Schema,
  type WorkspaceSourceManifestEntryV1,
} from './workspace-source-binding-v1.js';

const COMMIT = '1'.repeat(40);
const TREE = '2'.repeat(40);
const BLOB_A = '3'.repeat(40);
const BLOB_B = '4'.repeat(40);

function entry(sourceRef: string, source: string, gitBlobOid: string | null): WorkspaceSourceManifestEntryV1 {
  const revision = deriveCodeSourceRevisionV1(source);
  return {
    sourceRef,
    sourceRevision: revision.sourceRevision,
    contentDigest: revision.contentDigest,
    byteLength: revision.byteLength,
    gitBlobOid,
  };
}

function build(entries: WorkspaceSourceManifestEntryV1[]) {
  return buildWorkspaceRevisionRecordV1({
    repositoryId: 'semaj90/deeds_web_app',
    gitObjectFormat: 'sha1',
    baseCommitOid: COMMIT,
    baseTreeOid: TREE,
    gitHeadRef: 'refs/heads/main',
    dirty: true,
    entries,
    generatedAt: '2026-08-21T20:00:00.000Z',
    producerRevision: 'workspace-source-binding:test:v1',
  });
}

describe('WorkspaceRevisionRecordV1', () => {
  it('is deterministic regardless of input enumeration order', () => {
    const a = entry('src/a.ts', 'export const a = 1;\n', BLOB_A);
    const b = entry('src/b.ts', 'export const b = 2;\n', BLOB_B);
    const left = build([a, b]);
    const right = build([b, a]);
    expect(left.record.workspaceRevision).toBe(right.record.workspaceRevision);
    expect(left.record.sourceManifestDigest).toBe(right.record.sourceManifestDigest);
    expect(left.entries.map((item) => item.sourceRef)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('changes when exact working-tree bytes change even with the same Git HEAD', () => {
    const original = build([entry('src/a.ts', 'export const a = 1;\n', BLOB_A)]);
    const dirty = build([entry('src/a.ts', 'export const a = 2;\n', BLOB_A)]);
    expect(original.record.baseCommitOid).toBe(dirty.record.baseCommitOid);
    expect(original.record.workspaceRevision).not.toBe(dirty.record.workspaceRevision);
  });

  it('changes on rename even when Git content/blob provenance is unchanged', () => {
    const before = build([entry('src/a.ts', 'same bytes\n', BLOB_A)]);
    const after = build([entry('src/renamed.ts', 'same bytes\n', BLOB_A)]);
    expect(before.entries[0].gitBlobOid).toBe(after.entries[0].gitBlobOid);
    expect(before.record.workspaceRevision).not.toBe(after.record.workspaceRevision);
  });

  it('keeps Git commit changes as provenance when the indexed byte manifest is identical', () => {
    const base = build([entry('src/a.ts', 'same bytes\n', BLOB_A)]);
    const next = buildWorkspaceRevisionRecordV1({
      repositoryId: 'semaj90/deeds_web_app',
      gitObjectFormat: 'sha1',
      baseCommitOid: '9'.repeat(40),
      baseTreeOid: '8'.repeat(40),
      gitHeadRef: 'refs/heads/main',
      dirty: false,
      entries: base.entries,
      generatedAt: '2026-08-21T20:01:00.000Z',
      producerRevision: 'workspace-source-binding:test:v1',
    });
    expect(next.record.baseCommitOid).not.toBe(base.record.baseCommitOid);
    expect(next.record.workspaceRevision).toBe(base.record.workspaceRevision);
  });

  it('rejects duplicate source refs instead of silently selecting one', () => {
    const a = entry('src/a.ts', 'one', BLOB_A);
    const b = entry('src/a.ts', 'two', BLOB_B);
    expect(() => build([a, b])).toThrow(/DUPLICATE_SOURCE_REF/);
  });
});

describe('WorkspaceSourceBindingV1', () => {
  it('binds ordinal + source revision to one workspace revision while staying non-authoritative', () => {
    const source = entry('src/a.ts', 'export const a = 1;\n', BLOB_A);
    const { record, entries } = build([source]);
    const bindings = buildWorkspaceSourceBindingsV1({
      record,
      entries,
      trackedAtBaseCommit: new Map([['src/a.ts', true]]),
      dirtyRelativeToBaseCommit: new Map([['src/a.ts', false]]),
      producerRevision: 'workspace-source-binding:test:v1',
    });
    expect(bindings).toHaveLength(1);
    expect(bindings[0].workspaceRevision).toBe(record.workspaceRevision);
    expect(bindings[0].sourceRevision).toBe(source.sourceRevision);
    expect(bindings[0].sourceManifestOrdinal).toBe(0);
    expect(bindings[0].canonicalAuthority).toBe(false);
  });

  it('does not assign a base-commit blob to an untracked file', () => {
    const source = entry('src/new.ts', 'new file\n', null);
    const { record, entries } = build([source]);
    const [binding] = buildWorkspaceSourceBindingsV1({
      record,
      entries,
      trackedAtBaseCommit: new Map([['src/new.ts', false]]),
      dirtyRelativeToBaseCommit: new Map([['src/new.ts', true]]),
      producerRevision: 'workspace-source-binding:test:v1',
    });
    expect(binding.gitBlobOid).toBeNull();
    expect(binding.dirtyRelativeToBaseCommit).toBe(true);
  });

  it('rejects a Git blob OID with the wrong repository hash format', () => {
    const source = entry('src/a.ts', 'x', BLOB_A);
    const { record } = build([source]);
    expect(() => workspaceSourceBindingV1Schema.parse({
      schema: 'atlas.workspace-source-binding.v1',
      workspaceRevision: record.workspaceRevision,
      sourceRef: source.sourceRef,
      sourceRevision: source.sourceRevision,
      contentDigest: source.contentDigest,
      byteLength: source.byteLength,
      gitObjectFormat: 'sha1',
      baseCommitOid: COMMIT,
      gitBlobOid: 'f'.repeat(64),
      trackedAtBaseCommit: true,
      dirtyRelativeToBaseCommit: false,
      sourceManifestOrdinal: 0,
      readOnlyObservation: true,
      canonicalAuthority: false,
      producerRevision: 'test',
      checksum: 'a'.repeat(64),
    })).toThrow();
  });
});
