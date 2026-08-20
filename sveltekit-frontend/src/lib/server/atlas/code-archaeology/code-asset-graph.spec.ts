import { describe, expect, it } from 'vitest';
import {
  CodeAssetGraphV1Schema,
  classifyCodeAssetDomains,
  codeAssetEdgeId,
  codeAssetId,
  normalizeCodeAssetSourceRef,
  repairEvidenceCodeAsset,
  reusableCodeAsset,
} from './code-asset-graph.js';

describe('Parent Atlas code archaeology graph', () => {
  it('normalizes source refs without replacing them with backend-local IDs', () => {
    expect(normalizeCodeAssetSourceRef('.\\sveltekit-frontend\\src\\lib\\x.ts'))
      .toBe('sveltekit-frontend/src/lib/x.ts');
  });

  it('builds stable source-scoped asset IDs', () => {
    const a = codeAssetId({ sourceRef: 'src/lib/search.ts', kind: 'FUNCTION', qualifiedName: 'search' });
    const b = codeAssetId({ sourceRef: './src/lib/search.ts', kind: 'FUNCTION', qualifiedName: 'search' });
    const c = codeAssetId({ sourceRef: 'src/lib/other.ts', kind: 'FUNCTION', qualifiedName: 'search' });
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('classifies indexing/ranking/cache/GPU implementation owners as multiple features, not votes', () => {
    const domains = classifyCodeAssetDomains(
      'src/lib/server/atlas/retrieval/cagra-reranker.ts',
      'build CAGRA top-k index and cache candidate features with cuVS/CUDA',
    );
    expect(domains).toEqual(expect.arrayContaining(['INDEXING', 'RETRIEVAL', 'RANKING', 'CACHE', 'CUVS', 'CUDA']));
    expect(reusableCodeAsset(domains, 'FUNCTION')).toBe(true);
  });

  it('recognizes ACE/RLM/BitFrost and sidecar ownership', () => {
    const domains = classifyCodeAssetDomains(
      'sveltekit-frontend/src/lib/server/atlas/rlm/rlm-search-adapter.ts',
      'ACE ContextManifest uses BitFrost Valkey cache through sidecar',
    );
    expect(domains).toEqual(expect.arrayContaining(['ACE', 'RLM', 'CACHE', 'BITFROST', 'SIDECAR']));
  });

  it('marks AST/repair/validation code as repair-evidence candidates', () => {
    expect(repairEvidenceCodeAsset(classifyCodeAssetDomains('ast error fixing mutation validator rollback'))).toBe(true);
    expect(repairEvidenceCodeAsset(['SEMANTIC'])).toBe(false);
  });

  it('builds revision-qualified deterministic edge IDs', () => {
    const edge = codeAssetEdgeId({
      fromAssetId: 'a'.repeat(64),
      relation: 'USES_SIDECAR',
      toAssetId: 'b'.repeat(64),
      sourceRevision: 'source-r1',
    });
    expect(edge).toMatch(/^[a-f0-9]{64}$/);
    expect(codeAssetEdgeId({
      fromAssetId: 'a'.repeat(64), relation: 'USES_SIDECAR', toAssetId: 'b'.repeat(64), sourceRevision: 'source-r2',
    })).not.toBe(edge);
  });

  it('validates a non-destructive JSON graph manifest', () => {
    const fileId = codeAssetId({ sourceRef: 'src/search.ts', kind: 'FILE', qualifiedName: 'src/search.ts' });
    const fnId = codeAssetId({ sourceRef: 'src/search.ts', kind: 'FUNCTION', qualifiedName: 'search' });
    const edgeId = codeAssetEdgeId({ fromAssetId: fileId, relation: 'CONTAINS', toAssetId: fnId, sourceRevision: 'r1' });
    const graph = CodeAssetGraphV1Schema.parse({
      schema: 'atlas.code-asset-graph.v1',
      graphId: 'c'.repeat(64),
      workspaceRevision: 'w1',
      extractionRevision: 'e1',
      generatedAt: '2026-08-19T19:00:00.000Z',
      sourceRoots: ['sveltekit-frontend/src'],
      nodes: [
        {
          schema: 'atlas.code-asset-node.v1', assetId: fileId, kind: 'FILE', name: 'search.ts',
          qualifiedName: 'src/search.ts', sourceRef: 'src/search.ts', language: 'typescript', span: null,
          domains: ['RETRIEVAL'], exported: false, async: false, signature: '', sourceRevision: 'r1',
          workspaceRevision: 'w1', tags: [], reusableForNewFileCreation: true, repairEvidenceCandidate: false,
          canonicalWritesAllowed: false, producerRevision: 'test',
        },
        {
          schema: 'atlas.code-asset-node.v1', assetId: fnId, kind: 'FUNCTION', name: 'search',
          qualifiedName: 'search', sourceRef: 'src/search.ts', language: 'typescript',
          span: { startLine: 1, startColumn: 0, endLine: 3, endColumn: 1 },
          domains: ['RETRIEVAL', 'RANKING'], exported: true, async: true, signature: 'async function search()',
          sourceRevision: 'r1', workspaceRevision: 'w1', tags: [], reusableForNewFileCreation: true,
          repairEvidenceCandidate: false, canonicalWritesAllowed: false, producerRevision: 'test',
        },
      ],
      edges: [{
        schema: 'atlas.code-asset-edge.v1', edgeId, fromAssetId: fileId, toAssetId: fnId, relation: 'CONTAINS',
        sourceRef: 'src/search.ts', confidence: 1, exact: true, evidence: 'AST containment', sourceRevision: 'r1',
        canonicalWritesAllowed: false, producerRevision: 'test',
      }],
      statistics: { files: 1, symbols: 1, schemas: 0, sidecars: 0, edges: 1 },
      invariants: {
        sourceRefRequired: true, originalsPreserved: true, noMoves: true, noDeletes: true,
        canonicalWritesAllowed: false, executorMultiplicityAddsVotes: false,
      },
      producerRevision: 'test',
    });
    expect(graph.invariants.noDeletes).toBe(true);
    expect(graph.invariants.canonicalWritesAllowed).toBe(false);
  });
});
