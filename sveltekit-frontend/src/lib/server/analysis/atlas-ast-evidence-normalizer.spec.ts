import { describe, expect, it } from 'vitest';
import {
  assertNativeStructuralProvenanceForPromotion,
  normalizeAtlasAstEvidence,
} from './atlas-ast-evidence-normalizer.js';

const evidence = (lineStart: number, overrides: {
  name?: string;
  sourceRevision?: string;
  nodeType?: string;
  kind?: string;
  sourceRef?: string;
  native?: boolean;
} = {}) => ({
  schema: 'atlas.ast.evidence.v1' as const,
  engine: 'treesitter-chunker',
  engine_version: '4.0.0',
  language: 'typescript',
  file_path: overrides.sourceRef ?? 'src/example.ts',
  source_revision: overrides.sourceRevision ?? 'revision-a',
  chunks: [{
    upstream_chunk_id: 'legacy-chunk-id',
    ...(overrides.native === false ? {} : {
      node_id: 'node:consiliency:hello',
      file_id: 'file:consiliency:example',
      symbol_id: 'symbol:consiliency:hello',
      chunk_id: 'chunk:consiliency:hello',
      parent_route: ['module', 'Example'],
      parent_context: 'Example',
      route: ['module', 'Example', overrides.name ?? 'hello'],
    }),
    node_type: overrides.nodeType ?? 'function_declaration',
    kind: overrides.kind ?? 'function',
    name: overrides.name ?? 'hello',
    start_byte: lineStart === 1 ? 0 : 12,
    end_byte: lineStart === 1 ? 32 : 44,
    start_line: lineStart,
    start_column: 0,
    end_line: lineStart,
    end_column: 32,
    calls: [], imports: [], exports: [],
  }],
  edges: [{
    from_evidence_key: 'sample:hello', to_evidence_key: 'helper', type: 'CALLS' as const,
    evidence_start_line: 1, evidence_start_column: 0, evidence_end_line: 1, evidence_end_column: 32,
    resolved: false, resolution: 'unresolved',
  }],
  diagnostics: [],
});

describe('atlas AST evidence normalizer', () => {
  it('preserves native Consiliency ids, hierarchy, and byte spans', () => {
    const normalized = normalizeAtlasAstEvidence(evidence(1));
    const symbol = normalized.symbols[0]!;
    expect(symbol.nativeNodeId).toBe('node:consiliency:hello');
    expect(symbol.nativeFileId).toBe('file:consiliency:example');
    expect(symbol.nativeSymbolId).toBe('symbol:consiliency:hello');
    expect(symbol.nativeChunkId).toBe('chunk:consiliency:hello');
    expect(symbol.parentRoute).toEqual(['module', 'Example']);
    expect(symbol.parentContext).toBe('Example');
    expect(symbol.treeNodeId).toBe('node:consiliency:hello');
    expect(symbol.treeNodeIdProvenance).toBe('consiliency_native_node_id');
    expect(symbol.compatibilityTreeNodeId).toMatch(/^[a-f0-9]{64}$/);
    expect(symbol.span.startByte).toBe(0);
    expect(normalized.nativeProvenance.complete).toBe(true);
    expect(() => assertNativeStructuralProvenanceForPromotion(normalized)).not.toThrow();
  });

  it('blocks compatibility-only evidence from GIS promotion', () => {
    const normalized = normalizeAtlasAstEvidence(evidence(1, { native: false }));
    const symbol = normalized.symbols[0]!;
    expect(symbol.treeNodeId).toBe(symbol.compatibilityTreeNodeId);
    expect(symbol.treeNodeIdProvenance).toBe('atlas_legacy_compatibility_hash');
    expect(symbol.identityStatus).toBe('compatibility_only_blocked_from_promotion');
    expect(normalized.nativeProvenance.complete).toBe(false);
    expect(() => assertNativeStructuralProvenanceForPromotion(normalized)).toThrow(/NATIVE_PROVENANCE|COMPATIBILITY/);
  });

  it('keeps native node identity stable when only source span moves', () => {
    const first = normalizeAtlasAstEvidence(evidence(1)).symbols[0]!;
    const shifted = normalizeAtlasAstEvidence(evidence(2)).symbols[0]!;
    expect(shifted.treeNodeId).toBe(first.treeNodeId);
    expect(shifted.span.startLine).not.toBe(first.span.startLine);
    expect(shifted.span.startByte).not.toBe(first.span.startByte);
  });

  it('leaves canonical GIS identities null', () => {
    const symbol = normalizeAtlasAstEvidence(evidence(1)).symbols[0]!;
    expect(symbol.symbolId).toBeNull();
    expect(symbol.symbolVersionId).toBeNull();
    expect(symbol.packetKey).toBeNull();
  });
});
