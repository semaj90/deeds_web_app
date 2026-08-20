import { describe, expect, it } from 'vitest';
import { executeCompiledAstQuery } from './compiled-ast-query-executor.js';

function input(queryText: string, code: string) {
  return {
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
    producerRevision: 'executor-test',
  };
}

describe('compiled ast query executor', () => {
  it('executes the compiled structural relation and strict post-filters', async () => {
    const code = `
      async function retryHandler() {
        const attemptCount = 1;
        return attemptCount;
      }

      function otherHandler() {
        const attemptCount = 2;
        return attemptCount;
      }
    `;

    const result = await executeCompiledAstQuery(input('find variable attemptCount inside retry handler', code));

    expect(result.structuralMatcherExecutedByAstGrep).toBe(true);
    expect(result.postFilterAcceptedCount).toBe(1);
    expect(result.topK.rows).toHaveLength(1);
    expect(result.topK.rows[0]?.candidate.name).toBe('attemptCount');
    expect(result.topK.rows[0]?.candidate.requiresCanonicalTreeJoin).toBe(true);
    expect(result.logicalLaneVoteAdded).toBe(false);
    expect(result.canonicalWritesAllowed).toBe(false);
  });

  it('filters exported async functions containing await', async () => {
    const code = `
      export async function search() {
        await Promise.resolve();
        return 1;
      }

      async function internalSearch() {
        await Promise.resolve();
        return 2;
      }

      export function syncSearch() {
        return 3;
      }
    `;

    const result = await executeCompiledAstQuery(input('find exported async function search containing await', code));

    expect(result.topK.rows.map((row) => row.candidate.name)).toEqual(['search']);
    expect(result.postFilterRejectedCount).toBeGreaterThanOrEqual(0);
  });

  it('recognizes arrow-function declarations separately from ordinary variables', async () => {
    const code = `
      const rerankCandidates = async () => 1;
      const rerankThreshold = 10;
    `;

    const result = await executeCompiledAstQuery(input('find async arrow function rerankCandidates', code));

    expect(result.topK.rows).toHaveLength(1);
    expect(result.topK.rows[0]?.candidate.name).toBe('rerankCandidates');
    expect(result.topK.rows[0]?.candidate.declarationForm).toBe('ARROW_FUNCTION');
  });

  it('keeps source/revision coordinates and does not invent canonical identity', async () => {
    const code = `export function scoreCandidate(value: number) { return value + 1; }`;
    const result = await executeCompiledAstQuery(input('find exported function scoreCandidate', code));
    const candidate = result.topK.rows[0]?.candidate;

    expect(candidate?.sourceRef).toBe('src:example.ts');
    expect(candidate?.workspaceRevision).toBe('ws-1');
    expect(candidate?.sourceRevision).toBe('src-1');
    expect(candidate?.treeNodeId).toBeNull();
    expect(candidate?.symbolVersionId).toBeNull();
  });

  it('is deterministic for the same code and query', async () => {
    const code = `
      function alpha() { return 1; }
      function beta() { return 2; }
    `;
    const a = await executeCompiledAstQuery(input('find function beta', code));
    const b = await executeCompiledAstQuery(input('find function beta', code));
    expect(a).toEqual(b);
  });
});
