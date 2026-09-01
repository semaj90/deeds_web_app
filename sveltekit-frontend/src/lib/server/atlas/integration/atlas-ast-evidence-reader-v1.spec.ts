import { describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
vi.mock('$lib/server/db/client.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));

const row = {
  treeNodeId: 'node:1', sourceRef: 'src/example.ts', sourceRevision: 'rev:1',
  sourceContentHash: 'hash:1', nodeKind: 'function', qualifiedSymbol: 'example',
  parserLanguage: 'typescript', startByte: 0, endByte: 12,
};

describe('readAtlasAstEvidenceV1', () => {
  it('reads revision-qualified AST rows without writes', async () => {
    queryMock.mockResolvedValue({ rows: [row] });
    const { readAtlasAstEvidenceV1 } = await import('./atlas-ast-evidence-reader-v1.js');
    await expect(readAtlasAstEvidenceV1({ treeNodeIds: ['node:1'], sourceRevision: 'rev:1' })).resolves.toMatchObject({
      matchedTreeNodeIds: 1, readOnly: true, canonicalAuthority: false, writesPerformed: false,
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toContain('FROM atlas_ast_nodes');
  });

  it('fails closed when a row has a different source revision', async () => {
    queryMock.mockResolvedValue({ rows: [{ ...row, sourceRevision: 'rev:2' }] });
    const { readAtlasAstEvidenceV1, AtlasAstEvidenceReadErrorV1 } = await import('./atlas-ast-evidence-reader-v1.js');
    await expect(readAtlasAstEvidenceV1({ treeNodeIds: ['node:1'], sourceRevision: 'rev:1' }))
      .rejects.toBeInstanceOf(AtlasAstEvidenceReadErrorV1);
  });

  it('rejects a missing required source revision before querying', async () => {
    queryMock.mockClear();
    const { readAtlasAstEvidenceV1 } = await import('./atlas-ast-evidence-reader-v1.js');
    await expect(readAtlasAstEvidenceV1({ treeNodeIds: ['node:1'], sourceRevision: '' })).rejects.toThrow('AST_EVIDENCE_REVISION_MISSING');
    expect(queryMock).not.toHaveBeenCalled();
  });
});
