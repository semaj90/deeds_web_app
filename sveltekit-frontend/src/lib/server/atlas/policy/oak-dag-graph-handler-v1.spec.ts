import { beforeEach, describe, expect, it, vi } from 'vitest';

const { expand } = vi.hoisted(() => ({ expand: vi.fn() }));
vi.mock('$lib/server/atlas/graph/graph-expansion-adapter.js', () => ({ expandAtlasGraph: expand }));

describe('oak graph DAG handler', () => {
  beforeEach(() => expand.mockReset());

  it('binds graph expansion to the existing bounded adapter', async () => {
    expand.mockResolvedValueOnce({ nodes: [], edges: [], status: 'PROVEN' });
    const { createOakDagGraphHandlerV1 } = await import('./oak-dag-graph-handler-v1.js');
    const handler = createOakDagGraphHandlerV1();
    const args = {
      packetKey: 'packet:1', maxHops: 1, graphRevision: 'graph:1',
      workspaceRevision: 'workspace:1', graphOrdinalMapChecksum: 'a'.repeat(64),
    };

    expect(handler.implementationRef).toBe('sveltekit-frontend/src/lib/server/atlas/graph/graph-expansion-adapter.ts#expandAtlasGraph');
    await expect(handler.run({ action: {} as never, parentResults: [], binding: { boundArguments: args, action: {} } as never }))
      .resolves.toMatchObject({ status: 'PROVEN' });
    expect(expand).toHaveBeenCalledWith(args);
  });

  it('rejects missing graph lineage before adapter invocation', async () => {
    const { createOakDagGraphHandlerV1 } = await import('./oak-dag-graph-handler-v1.js');
    const handler = createOakDagGraphHandlerV1();

    await expect(handler.run({ action: {} as never, parentResults: [], binding: { boundArguments: { packetKey: 'packet:1', maxHops: 1 }, action: {} } as never }))
      .rejects.toThrow();
    expect(expand).not.toHaveBeenCalled();
  });
});
