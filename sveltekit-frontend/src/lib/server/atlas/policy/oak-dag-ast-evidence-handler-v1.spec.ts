import { beforeEach, describe, expect, it, vi } from 'vitest';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('$lib/server/atlas/integration/atlas-ast-evidence-reader-v1.js', () => ({ readAtlasAstEvidenceV1: read }));

describe('oak AST evidence DAG handler', () => {
  beforeEach(() => read.mockReset());

  it('binds atlas_ast_nodes to the strict persisted AST reader', async () => {
    read.mockResolvedValueOnce({ matchedTreeNodeIds: 1, rows: [], readOnly: true });
    const { createOakDagAstEvidenceHandlerV1 } = await import('./oak-dag-ast-evidence-handler-v1.js');
    const handler = createOakDagAstEvidenceHandlerV1();

    expect(handler.implementationRef).toBe('sveltekit-frontend/src/lib/server/atlas/integration/atlas-ast-evidence-reader-v1.ts#readAtlasAstEvidenceV1');
    await expect(handler.run({
      action: {} as never,
      parentResults: [],
      binding: { boundArguments: { treeNodeIds: ['node:1'], sourceRevision: 'rev:1' }, action: {} } as never,
    })).resolves.toMatchObject({ matchedTreeNodeIds: 1 });
    expect(read).toHaveBeenCalledWith({ treeNodeIds: ['node:1'], sourceRevision: 'rev:1' });
  });

  it('rejects missing source revision before reading', async () => {
    const { createOakDagAstEvidenceHandlerV1 } = await import('./oak-dag-ast-evidence-handler-v1.js');
    const handler = createOakDagAstEvidenceHandlerV1();

    await expect(handler.run({
      action: {} as never,
      parentResults: [],
      binding: { boundArguments: { treeNodeIds: ['node:1'], sourceRevision: '' }, action: {} } as never,
    })).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
