import { describe, expect, it } from 'vitest';
import { normalizeAtlasAstEvidence } from './atlas-ast-evidence-normalizer.js';

const evidence = (
  lineStart: number,
  overrides: {
    name?: string;
    sourceRevision?: string;
    nodeType?: string;
    kind?: string;
    sourceRef?: string;
    nativeIds?: boolean;
  } = {},
) => ({
  schema: 'atlas.ast.evidence.v1' as const,
  engine: 'treesitter-chunker',
  engine_version: '4.0.0',
  language: 'typescript',
  file_path: overrides.sourceRef ?? 'src/example.ts',
  source_revision: overrides.sourceRevision ?? 'revision-a',
  chunks: [{
    upstream_chunk_id: overrides.nativeIds === false ? undefined : 'chunk-native-1',
    upstream_node_id: overrides.nativeIds === false ? undefined : 'node-native-1',
    upstream_file_id: overrides.nativeIds === false ? undefined : 'file-native-1',
    upstream_symbol_id: overrides.nativeIds === false ? undefined : 'symbol-native-1',
    node_type: overrides.nodeType ?? 'function_declaration',
    kind: overrides.kind ?? 'function',
    name: overrides.name ?? 'hello',
    parent_route: ['module', 'hello'],
    parent_context: 'module',
    start_byte: lineStart === 1 ? 0 : 12,
    end_byte: lineStart === 1 ? 32 : 44,
    start_line: lineStart,
    start_column: 0,
    end_line: lineStart,
    end_column: 32,
    calls: [],
    imports: [],
    exports: [],
  }],
  edges: [{
    from_evidence_key: 'sample:hello',
    to_evidence_key: 'helper',
    type: 'CALLS' as const,
    evidence_start_line: 1,
    evidence_start_column: 0,
    evidence_end_line: 1,
    evidence_end_column: 32,
    resolved: false,
    resolution: 'unresolved',
  }],
  diagnostics: [],
});

describe('atlas AST evidence normalizer', () => {
  it('repeats the same normalized graph deterministically for the same revision', () => {
    const first = normalizeAtlasAstEvidence(evidence(1));
    const second = normalizeAtlasAstEvidence(evidence(1));

    expect(second.symbols).toEqual(first.symbols);
    expect(second.edges).toEqual(first.edges);
    expect(second.diagnostics).toEqual(first.diagnostics);
    expect(second.sourceRevision).toBe(first.sourceRevision);
  });

  it('preserves native Consiliency IDs and leaves canonical identities for GIS persistence', () => {
    const normalized = normalizeAtlasAstEvidence(evidence(1));
    const symbol = normalized.symbols[0];

    expect(symbol?.upstreamChunkId).toBe('chunk-native-1');
    expect(symbol?.upstreamNodeId).toBe('node-native-1');
    expect(symbol?.upstreamFileId).toBe('file-native-1');
    expect(symbol?.upstreamSymbolId).toBe('symbol-native-1');
    expect(symbol?.parentRoute).toEqual(['module', 'hello']);
    expect(symbol?.parentContext).toBe('module');

    expect(symbol?.treeNodeId).toMatch(/^[a-f0-9]{64}$/);
    expect(symbol?.treeNodeIdSource).toBe('atlas_compatibility_hash');
    expect(symbol?.symbolId).toBeNull();
    expect(symbol?.symbolVersionId).toBeNull();
    expect(symbol?.packetKey).toBeNull();
    expect(symbol?.identityStatus).toBe('structural_pending_canonical_persistence');

    expect(normalized.provenance).toEqual({
      nativeNodeIdCount: 1,
      nativeFileIdCount: 1,
      nativeSymbolIdCount: 1,
      upstreamChunkIdCount: 1,
      compatibilityTreeNodeIdCount: 1,
    });
    expect(normalized.edges[0]?.type).toBe('CALLS');
    expect(normalized.edges[0]?.resolved).toBe(false);
    expect(normalized.symbols.every((item) => !item.qualifiedSymbol.startsWith('call_'))).toBe(true);
  });

  it('reports missing native provenance without manufacturing canonical identity', () => {
    const normalized = normalizeAtlasAstEvidence(evidence(1, { nativeIds: false }));
    const symbol = normalized.symbols[0];

    expect(symbol?.upstreamNodeId).toBeNull();
    expect(symbol?.upstreamFileId).toBeNull();
    expect(symbol?.upstreamSymbolId).toBeNull();
    expect(symbol?.upstreamChunkId).toBeNull();
    expect(symbol?.symbolId).toBeNull();
    expect(symbol?.symbolVersionId).toBeNull();
    expect(normalized.provenance.nativeNodeIdCount).toBe(0);
    expect(normalized.provenance.nativeSymbolIdCount).toBe(0);
  });

  it('keeps the compatibility coordinate stable when only the source span moves', () => {
    const first = normalizeAtlasAstEvidence(evidence(1)).symbols[0];
    const shifted = normalizeAtlasAstEvidence(evidence(2)).symbols[0];

    expect(shifted?.treeNodeId).toBe(first?.treeNodeId);
    expect(shifted?.span.startLine).not.toBe(first?.span.startLine);
    expect(shifted?.span.startByte).not.toBe(first?.span.startByte);
  });

  it('uses parent hierarchy in the compatibility coordinate', () => {
    const base = evidence(1);
    const changedParent = evidence(1);
    changedParent.chunks[0] = {
      ...changedParent.chunks[0],
      parent_route: ['module', 'OtherContainer', 'hello'],
      parent_context: 'OtherContainer',
    };

    const first = normalizeAtlasAstEvidence(base).symbols[0];
    const second = normalizeAtlasAstEvidence(changedParent).symbols[0];

    expect(second?.treeNodeId).not.toBe(first?.treeNodeId);
  });

  it('keeps the compatibility coordinate across a body-only revision while source revision changes', () => {
    const first = normalizeAtlasAstEvidence(evidence(1, { sourceRevision: 'revision-a' })).symbols[0];
    const mutated = normalizeAtlasAstEvidence(evidence(1, { sourceRevision: 'revision-b' })).symbols[0];

    expect(mutated?.treeNodeId).toBe(first?.treeNodeId);
    expect(mutated?.symbolId).toBeNull();
    expect(mutated?.symbolVersionId).toBeNull();
  });

  it('changes the compatibility coordinate when a symbol is renamed', () => {
    const first = normalizeAtlasAstEvidence(evidence(1, { name: 'foo' })).symbols[0];
    const renamed = normalizeAtlasAstEvidence(evidence(1, { name: 'bar' })).symbols[0];

    expect(renamed?.treeNodeId).not.toBe(first?.treeNodeId);
  });

  it('keeps same-named symbols distinct across source scopes', () => {
    const classA = normalizeAtlasAstEvidence(evidence(1, { name: 'foo', sourceRef: 'src/class-a.ts' })).symbols[0];
    const classB = normalizeAtlasAstEvidence(evidence(1, { name: 'foo', sourceRef: 'src/class-b.ts' })).symbols[0];

    expect(classA?.treeNodeId).not.toBe(classB?.treeNodeId);
  });
});
