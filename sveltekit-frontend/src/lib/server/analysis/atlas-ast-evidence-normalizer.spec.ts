import { describe, expect, it } from 'vitest';
import { normalizeAtlasAstEvidence } from './atlas-ast-evidence-normalizer.js';

const evidence = (lineStart: number) => ({
  schema: 'atlas.ast.evidence.v1' as const,
  engine: 'treesitter-chunker',
  engine_version: '4.0.0',
  language: 'typescript',
  file_path: 'src/example.ts',
  source_revision: 'revision-a',
  chunks: [{
    upstream_chunk_id: 'upstream-line-dependent-id',
    node_type: 'function_declaration',
    kind: 'function',
    name: 'hello',
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
});
