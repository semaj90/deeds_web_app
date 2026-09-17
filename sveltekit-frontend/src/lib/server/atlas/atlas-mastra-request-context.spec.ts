import { describe, expect, it } from 'vitest';
import { createAtlasRequestContext } from './atlas-mastra-adapter.js';

describe('Atlas Mastra request context', () => {
  it('preserves caller-owned workspace and packet revisions', async () => {
    const context = await createAtlasRequestContext({
      runId: 'run-1',
      threadId: 'thread-1',
      resourceId: 'resource-1',
      workspaceId: 'workspace-1',
      packetKey: 'packet-1',
      workspaceRevision: 'workspace-rev-1',
      packetRevision: 'packet-rev-1',
    });

    expect(context.atlasRuntime.workspaceRevision).toBe('workspace-rev-1');
    expect(context.atlasRuntime.packetRevision).toBe('packet-rev-1');
  });

  it('does not invent revisions for legacy callers', async () => {
    const context = await createAtlasRequestContext({
      runId: 'run-2',
      threadId: 'thread-2',
      resourceId: 'resource-2',
      workspaceId: 'workspace-2',
      packetKey: 'packet-2',
    });

    expect(context.atlasRuntime.workspaceRevision).toBe('');
    expect(context.atlasRuntime.packetRevision).toBe('');
  });
});
