import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CODE_REVISION_AUTHORITY_REVISION,
  deriveCodeRevisionAuthorityV1,
} from './code-revision-authority-v1.js';

const workspaceRoot = path.resolve('/fixture/workspace');
const sourcePath = path.join(workspaceRoot, 'src', 'example.ts');
const gitHead = 'a'.repeat(40);
const resolver = () => gitHead;

describe('CodeRevisionAuthorityV1', () => {
  it('creates workspace and source revisions inside the writer boundary', () => {
    const result = deriveCodeRevisionAuthorityV1({
      workspaceRoot,
      absoluteSourcePath: sourcePath,
      sourceText: 'export const answer = 42;\n',
      producerRevision: 'test:code-revision-authority:v1',
      workspaceRevisionResolver: resolver,
    });

    expect(result.authorityRevision).toBe(CODE_REVISION_AUTHORITY_REVISION);
    expect(result.workspaceRevision).toBe(gitHead);
    expect(result.workspaceRevisionKind).toBe('GIT_COMMIT_SHA');
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

  it('is deterministic for the same Git revision, source path and exact bytes', () => {
    const input = {
      workspaceRoot,
      absoluteSourcePath: sourcePath,
      sourceText: 'export function f() { return 1; }\n',
      producerRevision: 'test:code-revision-authority:v1',
      workspaceRevisionResolver: resolver,
    };
    const first = deriveCodeRevisionAuthorityV1(input);
    const second = deriveCodeRevisionAuthorityV1(input);
    expect(second).toEqual(first);
  });

  it('changes only source revision when exact source bytes change under the same Git revision', () => {
    const first = deriveCodeRevisionAuthorityV1({
      workspaceRoot,
      absoluteSourcePath: sourcePath,
      sourceText: 'export const x = 1;\n',
      producerRevision: 'test:code-revision-authority:v1',
      workspaceRevisionResolver: resolver,
    });
    const second = deriveCodeRevisionAuthorityV1({
      workspaceRoot,
      absoluteSourcePath: sourcePath,
      sourceText: 'export const x = 2;\n',
      producerRevision: 'test:code-revision-authority:v1',
      workspaceRevisionResolver: resolver,
    });
    expect(second.workspaceRevision).toBe(first.workspaceRevision);
    expect(second.sourceRevision).not.toBe(first.sourceRevision);
    expect(second.sourceContentDigest).not.toBe(first.sourceContentDigest);
  });

  it('rejects a source outside the workspace root', () => {
    expect(() => deriveCodeRevisionAuthorityV1({
      workspaceRoot,
      absoluteSourcePath: path.resolve('/elsewhere/example.ts'),
      sourceText: 'export const x = 1;\n',
      producerRevision: 'test:code-revision-authority:v1',
      workspaceRevisionResolver: resolver,
    })).toThrow('CODE_REVISION_SOURCE_OUTSIDE_WORKSPACE');
  });

  it('rejects an invalid workspace revision from the internal resolver', () => {
    expect(() => deriveCodeRevisionAuthorityV1({
      workspaceRoot,
      absoluteSourcePath: sourcePath,
      sourceText: 'export const x = 1;\n',
      producerRevision: 'test:code-revision-authority:v1',
      workspaceRevisionResolver: () => 'caller-string-not-a-git-sha',
    })).toThrow('CODE_REVISION_WORKSPACE_REVISION_INVALID');
  });
});
