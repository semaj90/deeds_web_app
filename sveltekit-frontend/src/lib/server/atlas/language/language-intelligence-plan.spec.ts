import { describe, expect, it } from 'vitest';
import {
  LanguageSemanticEvidenceV1Schema,
  normalizedReferenceBreadth,
  planLanguageIntelligence,
} from './language-intelligence-plan.js';

describe('language intelligence planning', () => {
  it('uses Tree-sitter for structure and ts-morph for TypeScript semantics', () => {
    const plan = planLanguageIntelligence({
      schema: 'atlas.language-intelligence-planning-input.v1',
      language: 'TYPESCRIPT',
      operations: ['STRUCTURE', 'STRUCTURED_VALUE_EXTRACTION', 'TYPES', 'DEFINITIONS', 'REFERENCES'],
      treeSitterAvailable: true,
      tsMorphAvailable: true,
      lspAvailable: true,
      mutationSensitive: false,
      workspaceRevision: 'ws-1',
      sourceRevision: 'src-1',
      producerRevision: 'test',
    });
    expect(plan.stages.find((stage) => stage.engine === 'TREE_SITTER')?.role).toBe('STRUCTURAL_OWNER');
    expect(plan.stages.find((stage) => stage.engine === 'TS_MORPH')?.role).toBe('LANGUAGE_SPECIALIST');
    expect(plan.treeSitterOwnsStructuralCoordinates).toBe(true);
    expect(plan.semanticEnrichmentMayNotReorderMembers).toBe(true);
  });

  it('uses LSP as the primary semantic layer for non-TypeScript languages', () => {
    const plan = planLanguageIntelligence({
      schema: 'atlas.language-intelligence-planning-input.v1',
      language: 'PYTHON',
      operations: ['STRUCTURE', 'DEFINITIONS', 'REFERENCES', 'DIAGNOSTICS'],
      treeSitterAvailable: true,
      tsMorphAvailable: true,
      lspAvailable: true,
      mutationSensitive: false,
      workspaceRevision: 'ws-1',
      sourceRevision: 'src-1',
      producerRevision: 'test',
    });
    expect(plan.stages.find((stage) => stage.engine === 'LSP')?.primary).toBe(true);
    expect(plan.stages.some((stage) => stage.engine === 'TS_MORPH')).toBe(false);
  });

  it('fails closed when structural extraction has no Tree-sitter owner', () => {
    expect(() => planLanguageIntelligence({
      schema: 'atlas.language-intelligence-planning-input.v1',
      language: 'RUST',
      operations: ['STRUCTURE'],
      treeSitterAvailable: false,
      tsMorphAvailable: false,
      lspAvailable: true,
      mutationSensitive: false,
      workspaceRevision: 'ws-1',
      sourceRevision: 'src-1',
      producerRevision: 'test',
    })).toThrow(/TREE_SITTER_REQUIRED/);
  });

  it('keeps rename as a proposal even when ts-morph can perform the rename', () => {
    const plan = planLanguageIntelligence({
      schema: 'atlas.language-intelligence-planning-input.v1',
      language: 'TYPESCRIPT',
      operations: ['RENAME_PROPOSAL'],
      treeSitterAvailable: true,
      tsMorphAvailable: true,
      lspAvailable: true,
      mutationSensitive: true,
      workspaceRevision: 'ws-1',
      sourceRevision: 'src-1',
      producerRevision: 'test',
    });
    expect(plan.stages[0]?.authority).toBe('MUTATION_PROPOSAL_ONLY');
    expect(plan.directMutationAllowed).toBe(false);
    expect(plan.mutationRequiresDagAuthorization).toBe(true);
  });

  it('requires source_ref even for compiler semantic observations', () => {
    expect(() => LanguageSemanticEvidenceV1Schema.parse({
      schema: 'atlas.language-semantic-evidence.v1',
      observationId: 'obs-1',
      language: 'TYPESCRIPT',
      engine: 'TS_MORPH',
      authority: 'COMPILER_SEMANTIC_OBSERVATION',
      relationKind: 'REFERENCES',
      subjectCanonicalId: 'S1',
      objectCanonicalId: 'S2',
      symbolName: 'foo',
      typeText: '() => void',
      coordinate: {
        sourceRef: '',
        filePath: 'src/a.ts',
        startByte: null,
        endByte: null,
        startChar: 4,
        endChar: 7,
        startLine: 1,
        endLine: 1,
        treeNodeId: null,
        symbolVersionId: null,
      },
      evidenceRefs: ['file:a.ts#1'],
      workspaceRevision: 'ws-1',
      sourceRevision: 'src-1',
      grammarRevision: null,
      semanticEngineRevision: 'ts-morph-test',
      requiresCanonicalPromotion: true,
      canonicalWritesAllowed: false,
      producerRevision: 'test',
    })).toThrow();
  });

  it('normalizes reference breadth without making reference count a truth score', () => {
    expect(normalizedReferenceBreadth(0)).toBe(0);
    expect(normalizedReferenceBreadth(64)).toBeCloseTo(1, 10);
    expect(normalizedReferenceBreadth(10_000)).toBe(1);
  });
});
