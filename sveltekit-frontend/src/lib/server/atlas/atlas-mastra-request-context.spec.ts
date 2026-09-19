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

  it('rejects missing workspace revisions', async () => {
    await expect(createAtlasRequestContext({
      runId: 'run-2',
      threadId: 'thread-2',
      resourceId: 'resource-2',
      workspaceId: 'workspace-2',
      packetKey: 'packet-2',
      workspaceRevision: '',
      packetRevision: 'packet-rev-2',
    })).rejects.toThrow('ADMITTED_WORKSPACE_REVISION_REQUIRED');
  });

  it('rejects missing packet revisions', async () => {
    await expect(createAtlasRequestContext({
      runId: 'run-3',
      threadId: 'thread-3',
      resourceId: 'resource-3',
      workspaceId: 'workspace-3',
      packetKey: 'packet-3',
      workspaceRevision: 'workspace-rev-3',
      packetRevision: '',
    })).rejects.toThrow('PACKET_REVISION_REQUIRED');
  });
});
