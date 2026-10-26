import { describe, expect, it } from 'vitest';
import {
  SymbolEvidenceV1Schema,
  SYMBOL_EVIDENCE_SCHEMA,
  AST_DEFINED,
  SOURCE_PROVEN,
  SEMANTIC_HIT,
  GRAPH_LINKED,
  isCandidateEligible,
  type SymbolEvidenceV1,
} from './symbol-evidence-v1.js';

describe('SymbolEvidenceV1 Contract & Bitmask Eligibility', () => {
  const validEvidence: SymbolEvidenceV1 = {
    schema: SYMBOL_EVIDENCE_SCHEMA,
    upstreamChunkId: 'chunk_8095_ast_42',
    nativeSymbolId: 'sym_fn_calculateScore',
    treeNodeId: 'node_function_declaration_102',
    packetKey: 'pkt:repo:deeds:file:src/lib/score.ts',
    sourceRef: {
      repositoryId: 'deeds-web-app',
      normalizedPath: 'src/lib/score.ts',
      contentSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      startByte: 120,
      endByte: 450,
    },
    ast: {
      nodeType: 'function_declaration',
      symbolKind: 'function',
      name: 'calculateScore',
      signature: '(doc: DocFeatures) => number',
      parentAstPath: 'Program/ExportNamedDeclaration/FunctionDeclaration',
      parseError: false,
    },
    evidenceStatus: 'PROVEN',
  };

  it('validates a conformant Tree-sitter symbol evidence record', () => {
    const parsed = SymbolEvidenceV1Schema.parse(validEvidence);
    expect(parsed.schema).toBe(SYMBOL_EVIDENCE_SCHEMA);
    expect(parsed.ast.name).toBe('calculateScore');
    expect(parsed.sourceRef.endByte).toBeGreaterThan(parsed.sourceRef.startByte);
  });

  it('allows nullable nativeSymbolId when tree-sitter provides syntax but canonical ID is unresolved', () => {
    const unaliased = {
      ...validEvidence,
      nativeSymbolId: null,
      treeNodeId: null,
      packetKey: null,
    };
    const parsed = SymbolEvidenceV1Schema.parse(unaliased);
    expect(parsed.nativeSymbolId).toBeNull();
  });

  it('fails closed when endByte does not exceed startByte', () => {
    const invalidSpans = [
      { ...validEvidence, sourceRef: { ...validEvidence.sourceRef, startByte: 100, endByte: 100 } },
      { ...validEvidence, sourceRef: { ...validEvidence.sourceRef, startByte: 200, endByte: 100 } },
    ];
    for (const invalid of invalidSpans) {
      expect(() => SymbolEvidenceV1Schema.parse(invalid)).toThrow(
        /SOURCE_REF_END_BYTE_MUST_EXCEED_START_BYTE/
      );
    }
  });

  it('computes bitmask eligibility matching Parent Atlas candidate gating rules', () => {
    // Four candidate functions:
    // A: AST defined, Source linked, Semantic match -> Eligible
    // B: AST defined, Source not linked, Semantic match -> Ineligible
    // C: AST defined, Source linked, Semantic miss -> Eligible (lexical fallback)
    // D: AST not defined, Source linked, Semantic match -> Ineligible

    const candidateA = AST_DEFINED | SOURCE_PROVEN | SEMANTIC_HIT; // 0b0111
    const candidateB = AST_DEFINED | SEMANTIC_HIT;                 // 0b0101 (missing SOURCE_PROVEN)
    const candidateC = AST_DEFINED | SOURCE_PROVEN;                // 0b0011 (no SEMANTIC_HIT)
    const candidateD = SOURCE_PROVEN | SEMANTIC_HIT;               // 0b0110 (missing AST_DEFINED)

    expect(isCandidateEligible(candidateA)).toBe(true);
    expect(isCandidateEligible(candidateB)).toBe(false);
    expect(isCandidateEligible(candidateC)).toBe(true);
    expect(isCandidateEligible(candidateD)).toBe(false);
  });
});
