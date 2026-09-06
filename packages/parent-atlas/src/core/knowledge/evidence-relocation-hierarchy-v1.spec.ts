import { describe, expect, it } from 'vitest';
import { buildContextualTextAnchorV1 } from './evidence-relocation-v1.js';
import { relocateEvidenceHierarchyV1, type EvidenceRelocationAttemptV1 } from './evidence-relocation-hierarchy-v1.js';
import { sha256TextV1 } from './stable-json-v1.js';

const miss = async (): Promise<EvidenceRelocationAttemptV1> => ({ status: 'MISS' });

function input(sourceText = 'before\nneedle\nafter\n') {
  return {
    relocationRevision: 'relocation:v1',
    currentSourceRef: 'src/a.ts',
    currentSourceRevision: 'source:r2',
    currentSourceText: sourceText,
    contextAnchor: buildContextualTextAnchorV1('before\nneedle\nafter\n', 2, 2),
  };
}

describe('relocateEvidenceHierarchyV1', () => {
  it('prefers exact revision/symbol/AST/LSP owners before textual fallback', async () => {
    const calls: string[] = [];
    const result = await relocateEvidenceHierarchyV1(input(), {
      exactSourceRevision: async () => { calls.push('exact'); return { status: 'MISS' }; },
      symbolVersion: async () => { calls.push('symbol'); return { status: 'RESOLVED', candidate: { sourceRef: 'src/a.ts', sourceRevision: 'source:r2', contentChecksum: sha256TextV1('needle\n'), byteRange: { startByte: 7, endByte: 14 }, lineRange: { startLine: 2, endLine: 2 }, stableSymbolId: 'symbol:needle', symbolVersionId: 'symbol-version:needle:r2', evidenceRefs: ['symbol-registry:r2'] } }; },
      treeSitterOccurrence: async () => { calls.push('ast'); return { status: 'MISS' }; },
      lspCompilerLocation: async () => { calls.push('lsp'); return { status: 'MISS' }; },
    });
    expect(result.status).toBe('RESOLVED');
    expect(result.stage).toBe('SYMBOL_VERSION');
    expect(calls).toEqual(['exact', 'symbol']);
  });

  it('fails closed on structural ambiguity instead of dropping to text', async () => {
    let lspCalled = false;
    const result = await relocateEvidenceHierarchyV1(input(), {
      exactSourceRevision: miss,
      symbolVersion: async () => ({ status: 'AMBIGUOUS', candidateCount: 2, evidenceRefs: ['symbol:ambiguous'] }),
      treeSitterOccurrence: miss,
      lspCompilerLocation: async () => { lspCalled = true; return { status: 'MISS' }; },
    });
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.stage).toBe('SYMBOL_VERSION');
    expect(lspCalled).toBe(false);
  });

  it('uses exact-text/context-anchor relocation only after all structural owners miss', async () => {
    const result = await relocateEvidenceHierarchyV1(input('zero\nbefore\nneedle\nafter\n'), {
      exactSourceRevision: miss,
      symbolVersion: miss,
      treeSitterOccurrence: miss,
      lspCompilerLocation: miss,
    });
    expect(result.status).toBe('RESOLVED');
    expect(result.stage).toBe('EXACT_TEXT');
    expect(result.attemptStages).toEqual(['EXACT_SOURCE_REVISION', 'SYMBOL_VERSION', 'TREE_SITTER_OCCURRENCE', 'LSP_COMPILER_LOCATION', 'EXACT_TEXT']);
  });
});
