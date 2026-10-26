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

describe('readAtlasCanonicalAstEvidenceV1', () => {
  const request = {
    treeNodeId: 'node:1',
    symbolVersionId: 'symbol-version:1',
    canonicalId: 'symbol:stable:1',
    packetKey: 'packet:1',
    sourceRef: 'src/example.ts#example',
    sourceRevision: 'source:r1',
    workspaceRevision: 'workspace:r1',
  };
  const canonicalRow = {
    treeNodeId: request.treeNodeId,
    symbolVersionId: request.symbolVersionId,
    canonicalId: request.canonicalId,
    packetKey: request.packetKey,
    sourceRef: request.sourceRef,
    sourceRevision: request.sourceRevision,
    workspaceRevision: request.workspaceRevision,
    sourceContentHash: 'a'.repeat(64),
    startByte: 10,
    endByte: 24,
  };

  it('reads and verifies canonical symbol, packet, source, workspace, and byte-span bindings', async () => {
    queryMock.mockResolvedValue({ rows: [canonicalRow] });
    const { readAtlasCanonicalAstEvidenceV1 } = await import('./atlas-ast-evidence-reader-v1.js');
    await expect(readAtlasCanonicalAstEvidenceV1(request)).resolves.toEqual(canonicalRow);
    expect(queryMock.mock.calls.at(-1)?.[0]).toContain('JOIN atlas_symbol_versions sv');
    expect(queryMock.mock.calls.at(-1)?.[1]).toEqual([
      request.treeNodeId,
      request.canonicalId,
      request.packetKey,
      request.sourceRef,
      request.sourceRevision,
      request.workspaceRevision,
    ]);
  });

  it('refuses missing or ambiguous canonical bindings', async () => {
    const { readAtlasCanonicalAstEvidenceV1, AtlasAstEvidenceReadErrorV1 } = await import('./atlas-ast-evidence-reader-v1.js');
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(readAtlasCanonicalAstEvidenceV1(request)).rejects.toMatchObject({ code: 'AST_EVIDENCE_CANONICAL_BINDING_MISSING' });
    queryMock.mockResolvedValueOnce({ rows: [canonicalRow, { ...canonicalRow, symbolVersionId: 'symbol-version:2' }] });
    await expect(readAtlasCanonicalAstEvidenceV1(request)).rejects.toBeInstanceOf(AtlasAstEvidenceReadErrorV1);
  });

  it('rejects a caller-selected symbol version that differs from the database binding', async () => {
    queryMock.mockResolvedValue({ rows: [{ ...canonicalRow, symbolVersionId: 'symbol-version:other' }] });
    const { readAtlasCanonicalAstEvidenceV1 } = await import('./atlas-ast-evidence-reader-v1.js');
    await expect(readAtlasCanonicalAstEvidenceV1(request)).rejects.toMatchObject({ code: 'AST_EVIDENCE_CANONICAL_BINDING_MISSING' });
  });
});
