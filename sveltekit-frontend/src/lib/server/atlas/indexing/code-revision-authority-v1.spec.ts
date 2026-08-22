import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { deriveCodeSourceRevisionV1 } from '../identity/code-source-revision-v1.js';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
  type WorkspaceSourceManifestEntryV1,
} from '../identity/workspace-source-binding-v1.js';
import {
  CODE_REVISION_AUTHORITY_REVISION,
  deriveCodeRevisionAuthorityV1,
} from './code-revision-authority-v1.js';

const workspaceRoot = path.resolve('/fixture/workspace');
const sourcePath = path.join(workspaceRoot, 'src', 'example.ts');
const gitCommit = 'a'.repeat(40);
const gitTree = 'b'.repeat(40);
const gitBlob = 'c'.repeat(40);

function origin(sourceText: string) {
  const source = deriveCodeSourceRevisionV1(sourceText);
  const entry: WorkspaceSourceManifestEntryV1 = {
    sourceRef: 'src/example.ts',
    sourceRevision: source.sourceRevision,
    contentDigest: source.contentDigest,
    byteLength: source.byteLength,
    gitBlobOid: gitBlob,
  };
  const built = buildWorkspaceRevisionRecordV1({
    repositoryId: 'semaj90/deeds_web_app',
    gitObjectFormat: 'sha1',
    baseCommitOid: gitCommit,
    baseTreeOid: gitTree,
    gitHeadRef: 'refs/heads/main',
    dirty: false,
    entries: [entry],
    generatedAt: '2026-08-21T19:00:00.000Z',
    producerRevision: 'test:workspace-origin:v1',
  });
  const [binding] = buildWorkspaceSourceBindingsV1({
    record: built.record,
    entries: built.entries,
    trackedAtBaseCommit: new Map([['src/example.ts', true]]),
    dirtyRelativeToBaseCommit: new Map([['src/example.ts', false]]),
    producerRevision: 'test:workspace-origin:v1',
  });
  return { record: built.record, binding };
}

function authority(sourceText = 'export const answer = 42;\n') {
  const { record, binding } = origin(sourceText);
  return deriveCodeRevisionAuthorityV1({
    workspaceRoot,
    absoluteSourcePath: sourcePath,
    workspaceRecord: record,
    sourceBinding: binding,
    producerRevision: 'test:code-revision-authority:v2',
  });
}

describe('CodeRevisionAuthorityV1', () => {
  it('consumes the canonical source-manifest workspace revision and keeps Git as provenance', () => {
    const result = authority();
    expect(result.authorityRevision).toBe(CODE_REVISION_AUTHORITY_REVISION);
    expect(result.workspaceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.workspaceRevisionKind).toBe('SHA256_SOURCE_MANIFEST');
    expect(result.workspaceRevision).toBe(`sha256:${result.workspaceSourceManifestDigest}`);
    expect(result.baseGitCommitOid).toBe(gitCommit);
    expect(result.baseGitTreeOid).toBe(gitTree);
    expect(result.gitCommitIsProvenanceOnly).toBe(true);
    expect(result.sourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.sourceRevisionKind).toBe('SHA256_EXACT_UTF8_SOURCE_BYTES');
    expect(result.sourceRef).toBe('src/example.ts');
    expect(result.workspaceRevisionCreatedByWriter).toBe(true);
    expect(result.sourceRevisionCreatedByWriter).toBe(true);
    expect(result.callerSuppliedWorkspaceRevisionAccepted).toBe(false);
    expect(result.callerSuppliedSourceRevisionAccepted).toBe(false);
    expect(result.canonicalWritesAllowed).toBe(false);
    expect(result.authorityChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same workspace record and source binding', () => {
    const first = authority('export function f() { return 1; }\n');
    const second = authority('export function f() { return 1; }\n');
    expect(second).toEqual(first);
  });

  it('changes both source and workspace revision when indexed source bytes change', () => {
    const first = authority('export const x = 1;\n');
    const second = authority('export const x = 2;\n');
    expect(second.baseGitCommitOid).toBe(first.baseGitCommitOid);
    expect(second.workspaceRevision).not.toBe(first.workspaceRevision);
    expect(second.sourceRevision).not.toBe(first.sourceRevision);
    expect(second.sourceContentDigest).not.toBe(first.sourceContentDigest);
  });

  it('rejects a source outside the workspace root', () => {
    const { record, binding } = origin('export const x = 1;\n');
    expect(() => deriveCodeRevisionAuthorityV1({
      workspaceRoot,
      absoluteSourcePath: path.resolve('/elsewhere/example.ts'),
      workspaceRecord: record,
      sourceBinding: binding,
      producerRevision: 'test:code-revision-authority:v2',
    })).toThrow('CODE_REVISION_SOURCE_OUTSIDE_WORKSPACE');
  });

  it('rejects a binding from a different workspace revision', () => {
    const left = origin('export const x = 1;\n');
    const right = origin('export const x = 2;\n');
    expect(() => deriveCodeRevisionAuthorityV1({
      workspaceRoot,
      absoluteSourcePath: sourcePath,
      workspaceRecord: left.record,
      sourceBinding: right.binding,
      producerRevision: 'test:code-revision-authority:v2',
    })).toThrow('CODE_REVISION_WORKSPACE_BINDING_REVISION_MISMATCH');
  });
});
