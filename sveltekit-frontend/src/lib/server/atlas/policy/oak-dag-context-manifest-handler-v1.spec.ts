import { beforeEach, describe, expect, it, vi } from 'vitest';

const { build } = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock('$lib/server/ace/ace-context-manifest.js', () => ({ buildContextManifestFromACE: build }));

describe('oak ContextManifest DAG handler', () => {
  beforeEach(() => build.mockReset());

  it('binds the exact ACE compiler without starting retrieval', async () => {
    build.mockReturnValueOnce({ manifest: { manifest_id: 'manifest:1' }, selected: [], rejected: [], prompt_packets: [] });
    const { createOakDagContextManifestHandlerV1 } = await import('./oak-dag-context-manifest-handler-v1.js');
    const handler = createOakDagContextManifestHandlerV1();
    const context = { ragChunks: [], kbChunks: [], caseChunks: [], docChunks: [], kagNeighbors: [], chatHistory: [], entities: {} };

    expect(handler.implementationRef).toBe('parent-atlas.context-manifest.ace.v1');
    await expect(handler.run({ action: {} as never, parentResults: [], binding: { boundArguments: { context, options: { request_id: 'request:1' } }, action: {} } as never }))
      .resolves.toMatchObject({ manifest: { manifest_id: 'manifest:1' } });
    expect(build).toHaveBeenCalledWith(context, { request_id: 'request:1' });
  });

  it('rejects an unassembled context before compilation', async () => {
    const { createOakDagContextManifestHandlerV1 } = await import('./oak-dag-context-manifest-handler-v1.js');
    const handler = createOakDagContextManifestHandlerV1();
    await expect(handler.run({ action: {} as never, parentResults: [], binding: { boundArguments: { context: {}, options: { request_id: 'request:1' } }, action: {} } as never })).rejects.toThrow('OAK_CONTEXT_ACE_INPUT_INVALID');
    expect(build).not.toHaveBeenCalled();
  });
});
