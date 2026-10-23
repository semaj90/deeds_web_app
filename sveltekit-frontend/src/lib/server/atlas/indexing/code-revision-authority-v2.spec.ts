import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveCodeSourceRevisionV1 } from '../identity/code-source-revision-v1.js';
import { buildWorkspaceRevisionRecordV1, buildWorkspaceSourceBindingsV1 } from '../identity/workspace-source-binding-v1.js';
import { deriveCodeRevisionAuthorityV2, codeRevisionAuthorityV2Schema } from './code-revision-authority-v2.js';

const workspaceRoot = path.resolve('/fixture/workspace');
const producerRevision = 'code-revision-authority-v2:test';
const sourceText = 'export const exactSource = true;\n';

function fixture() {
  const source = deriveCodeSourceRevisionV1(sourceText);
  const entry = {
    sourceRef: 'src/exact.ts',
    sourceRevision: source.sourceRevision,
    contentDigest: source.contentDigest,
    byteLength: source.byteLength,
    gitBlobOid: null,
  };
  const workspace = buildWorkspaceRevisionRecordV1({
    repositoryId: 'fixture/parent-atlas',
    gitObjectFormat: 'sha1',
    baseCommitOid: 'a'.repeat(40),
    baseTreeOid: 'b'.repeat(40),
    gitHeadRef: 'refs/heads/fixture',
    dirty: true,
    entries: [entry],
    generatedAt: '2026-10-22T00:00:00.000Z',
    producerRevision,
  });
  const [binding] = buildWorkspaceSourceBindingsV1({
    record: workspace.record,
    entries: workspace.entries,
    trackedAtBaseCommit: new Map([['src/exact.ts', false]]),
    dirtyRelativeToBaseCommit: new Map([['src/exact.ts', true]]),
    producerRevision,
  });
  return { workspace, binding };
}

describe('CodeRevisionAuthorityV2', () => {
  it('binds exact bytes and the workspace manifest without authorizing writes', () => {
    const { workspace, binding } = fixture();
    const result = deriveCodeRevisionAuthorityV2({
      workspaceRoot,
      absoluteSourcePath: path.resolve(workspaceRoot, binding.sourceRef),
      sourceBytes: Buffer.from(sourceText, 'utf8'),
      workspaceRecord: workspace.record,
      sourceBinding: binding,
      producerRevision,
    });

    expect(result.workspaceRevision).toBe(workspace.record.workspaceRevision);
    expect(result.sourceRevision).toBe(`sha256:${binding.contentDigest}`);
    expect(result.sourceByteLength).toBe(Buffer.byteLength(sourceText, 'utf8'));
    expect(result.gitCommitIsProvenanceOnly).toBe(true);
    expect(result.callerSuppliedWorkspaceRevisionAccepted).toBe(false);
    expect(result.callerSuppliedSourceRevisionAccepted).toBe(false);
    expect(result.canonicalWritesAllowed).toBe(false);
    expect(() => codeRevisionAuthorityV2Schema.parse({ ...result, canonicalWritesAllowed: true })).toThrow();
  });

  it('rejects a source path or workspace binding that disagrees with its authority records', () => {
    const { workspace, binding } = fixture();
    const common = { workspaceRoot, workspaceRecord: workspace.record, sourceBinding: binding, producerRevision };

    expect(() => deriveCodeRevisionAuthorityV2({
      ...common,
      absoluteSourcePath: path.resolve(workspaceRoot, 'src/other.ts'),
      sourceBytes: Buffer.from(sourceText, 'utf8'),
    })).toThrow(/CODE_REVISION_SOURCE_BINDING_REF_MISMATCH/);

    expect(() => deriveCodeRevisionAuthorityV2({
      ...common,
      absoluteSourcePath: path.resolve(workspaceRoot, binding.sourceRef),
      sourceBytes: Buffer.from(sourceText, 'utf8'),
      sourceBinding: { ...binding, workspaceRevision: `sha256:${'f'.repeat(64)}` },
    })).toThrow('CODE_REVISION_WORKSPACE_BINDING_REVISION_MISMATCH');

    expect(() => deriveCodeRevisionAuthorityV2({
      ...common,
      absoluteSourcePath: path.resolve(workspaceRoot, binding.sourceRef),
      sourceBytes: Buffer.from(`${sourceText}changed`, 'utf8'),
    })).toThrow('CODE_REVISION_SOURCE_BYTES_BINDING_MISMATCH');
    expect(() => deriveCodeRevisionAuthorityV2({
      ...common,
      absoluteSourcePath: path.resolve(workspaceRoot, binding.sourceRef),
      sourceBytes: Uint8Array.of(0xff),
    })).toThrow('CODE_REVISION_SOURCE_BYTES_NOT_UTF8');
  });
});
