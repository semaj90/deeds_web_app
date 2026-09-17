import { describe, expect, it } from 'vitest';
import {
  assertAtlasRuntimeRevisionQualified,
  createAtlasRuntimeContext,
  isAtlasRuntimeRevisionQualified,
} from './atlas-runtime-context.js';

const base = {
  runId: 'run',
  threadId: 'thread',
  resourceId: 'resource',
  workspaceId: 'workspace',
  packetKey: 'packet',
};

describe('Atlas runtime revision boundary', () => {
  it('preserves missing revisions instead of synthesizing timestamps', () => {
    const runtime = createAtlasRuntimeContext(base);
    expect(runtime.workspaceRevision).toBe('');
    expect(runtime.packetRevision).toBe('');
    expect(isAtlasRuntimeRevisionQualified(runtime)).toBe(false);
    expect(() => assertAtlasRuntimeRevisionQualified(runtime)).toThrow('ATLAS_RUNTIME_REVISION_UNQUALIFIED');
  });

  it('recognizes caller-owned revision-qualified context', () => {
    const runtime = createAtlasRuntimeContext({
      ...base,
      workspaceRevision: 'sha256:workspace',
      packetRevision: 'sha256:packet',
    });
    expect(isAtlasRuntimeRevisionQualified(runtime)).toBe(true);
    expect(() => assertAtlasRuntimeRevisionQualified(runtime)).not.toThrow();
  });
});
