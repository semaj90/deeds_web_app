import { describe, expect, it } from 'vitest';
import { normalizeAtlasAstEvidence } from './atlas-ast-evidence-normalizer.js';

const evidence = (lineStart: number, overrides: { name?: string; sourceRevision?: string; nodeType?: string; kind?: string; sourceRef?: string } = {}) => ({
  schema: 'atlas.ast.evidence.v1' as const,
  engine: 'treesitter-chunker',
  engine_version: '4.0.0',
  language: 'typescript',
  file_path: overrides.sourceRef ?? 'src/example.ts',
  source_revision: overrides.sourceRevision ?? 'revision-a',
  chunks: [{
    upstream_chunk_id: 'upstream-line-dependent-id',
    node_type: overrides.nodeType ?? 'function_declaration',
    kind: overrides.kind ?? 'function',
    name: overrides.name ?? 'hello',
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

  it('keeps upstream IDs as provenance and leaves canonical identities for persistence', () => {
    const normalized = normalizeAtlasAstEvidence(evidence(1));
    const symbol = normalized.symbols[0];

    expect(symbol?.upstreamChunkId).toBe('upstream-line-dependent-id');
    expect(symbol?.treeNodeId).toMatch(/^[a-f0-9]{64}$/);
    expect(symbol?.symbolId).toBeNull();
    expect(symbol?.symbolVersionId).toBeNull();
    expect(symbol?.packetKey).toBeNull();
    expect(symbol?.identityStatus).toBe('structural_pending_canonical_persistence');
    expect(normalized.edges[0]?.type).toBe('CALLS');
    expect(normalized.edges[0]?.resolved).toBe(false);
    expect(normalized.symbols.every((item) => !item.qualifiedSymbol.startsWith('call_'))).toBe(true);
  });

  it('keeps logical tree identity stable when only the source span moves', () => {
    const first = normalizeAtlasAstEvidence(evidence(1)).symbols[0];
    const shifted = normalizeAtlasAstEvidence(evidence(2)).symbols[0];

    expect(shifted?.treeNodeId).toBe(first?.treeNodeId);
    expect(shifted?.span.startLine).not.toBe(first?.span.startLine);
    expect(shifted?.span.startByte).not.toBe(first?.span.startByte);
  });

  it('keeps an unrelated sibling insertion from changing the target identity', () => {
    const first = normalizeAtlasAstEvidence(evidence(4)).symbols[0];
    const withSibling = normalizeAtlasAstEvidence(evidence(5)).symbols[0];

    expect(withSibling?.treeNodeId).toBe(first?.treeNodeId);
    expect(withSibling?.qualifiedSymbol).toBe('hello');
  });

  it('keeps logical identity across a body-only revision while source revision changes', () => {
    const first = normalizeAtlasAstEvidence(evidence(1, { sourceRevision: 'revision-a' })).symbols[0];
    const mutated = normalizeAtlasAstEvidence(evidence(1, { sourceRevision: 'revision-b' })).symbols[0];

    expect(mutated?.treeNodeId).toBe(first?.treeNodeId);
    expect(mutated?.symbolId).toBeNull();
    expect(mutated?.symbolVersionId).toBeNull();
  });

  it('changes logical identity when a symbol is renamed', () => {
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
