import { describe, expect, it } from 'vitest';
import { runAstQuerySemanticPipeline } from './ast-query-semantic-pipeline.js';

function input(queryText: string, code: string, semanticTopK = 8) {
  return {
    schema: 'atlas.ast-query-semantic-pipeline-input.v1' as const,
    structural: {
      schema: 'atlas.execute-compiled-ast-query-input.v1' as const,
      extraction: {
        schema: 'atlas.ast-grep-structural-extraction-input.v1' as const,
        code,
        filePath: '/workspace/example.ts',
        sourceRef: 'src:example.ts',
        language: 'TYPESCRIPT' as const,
        workspaceRevision: 'ws-1',
        sourceRevision: 'src-1',
        producerRevision: 'extract-test',
      },
      compile: {
        schema: 'atlas.ast-query-rule-compile-input.v1' as const,
        queryText,
        k: 16,
        preferredSourceRef: null,
        rankingRevision: 'rank-test',
        compilerRevision: 'compiler-test',
        producerRevision: 'compile-test',
      },
      producerRevision: 'structural-test',
    },
    tsConfigFilePath: null,
    semanticEngineRevision: 'ts-morph-27-test',
    semanticTopK,
    producerRevision: 'pipeline-test',
  };
}

describe('AST query semantic pipeline', () => {
  it('keeps structural order while enriching Top-K with compiler semantics', async () => {
    const code = `
      export function scoreCandidate(value: number): number { return value + 1; }
      export function scoreCandidates(values: number[]): number[] { return values.map(scoreCandidate); }
      const result = scoreCandidate(4);
    `;
    const result = await runAstQuerySemanticPipeline(input('find exported function scoreCandidate', code));

    expect(result.attemptedSemanticCandidates).toBeGreaterThanOrEqual(1);
    expect(result.enrichedSemanticCandidates).toBeGreaterThanOrEqual(1);
    expect(result.rows[0]?.structuralRank).toBe(result.structural.topK.rows[0]?.rank);
    expect(result.rows[0]?.semantic.semanticEvidence.engine).toBe('TS_MORPH');
    expect(result.structuralRankingPreserved).toBe(true);
    expect(result.semanticEnrichmentMayNotReorderCandidates).toBe(true);
  });

  it('enriches only the requested semantic Top-K', async () => {
    const code = `
      export function alpha() { return 1; }
      export function beta() { return 2; }
      export function gamma() { return 3; }
    `;
    const result = await runAstQuerySemanticPipeline(input('find exported function', code, 1));

    expect(result.attemptedSemanticCandidates).toBe(1);
    expect(result.rows.length + result.failures.length).toBe(1);
  });

  it('does not convert ts-morph enrichment into another retrieval vote or canonical write', async () => {
    const code = `export const rerankCandidates = (values: number[]) => values;`;
    const result = await runAstQuerySemanticPipeline(input('find exported arrow function rerankCandidates', code));

    expect(result.logicalLane).toBe('ast');
    expect(result.logicalLaneVoteAdded).toBe(false);
    expect(result.canonicalWritesAllowed).toBe(false);
    expect(result.treeSitterCanonicalJoinStillRequired).toBe(true);
    expect(result.exactPromotionRequired).toBe(true);
    expect(result.rows[0]?.semantic.candidate.treeNodeId).toBeNull();
  });
});
