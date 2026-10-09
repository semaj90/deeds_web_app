import { describe, expect, it } from 'vitest';
import {
  extractAndRankAstGrepStructuralTopK,
  extractAstGrepStructuralCandidates,
  identifierTokens,
  rankAstGrepStructuralTopK,
} from './ast-grep-structural-topk.js';

const SOURCE = `
export async function retrieveCandidates(query: string) {
  const semanticScore = 1;
  const localCounter = 2;
  return semanticScore + localCounter;
}

const rerankCandidates = (rows: number[]) => rows;
const unrelatedValue = 42;

export class SearchRuntime {
  runSearch() {
    const nestedValue = 9;
    return nestedValue;
  }
}
`;

const EXTRACTION = {
  schema: 'atlas.ast-grep-structural-extraction-input.v1' as const,
  code: SOURCE,
  filePath: 'src/search.ts',
  sourceRef: 'src/search.ts#rev-7',
  language: 'TYPESCRIPT' as const,
  workspaceRevision: 'ws-7',
  sourceRevision: 'src-7',
  producerRevision: 'test',
};

describe('ast-grep structural top-K', () => {
  it('tokenizes camelCase/snake-like query text deterministically', () => {
    expect(identifierTokens('find rerankCandidates function')).toEqual(['rerank', 'candidates']);
    expect(identifierTokens('semantic_score variable')).toEqual(['semantic', 'score']);
  });

  it('extracts named functions, arrow functions, variables, classes, and methods', async () => {
    const rows = await extractAstGrepStructuralCandidates(EXTRACTION);
    const names = rows.map((row) => `${row.entityKind}:${row.name}`);

    expect(names).toContain('FUNCTION:retrieveCandidates');
    expect(names).toContain('FUNCTION:rerankCandidates');
    expect(names).toContain('VARIABLE:semanticScore');
    expect(names).toContain('VARIABLE:unrelatedValue');
    expect(names).toContain('CLASS:SearchRuntime');
    expect(names).toContain('METHOD:runSearch');

    for (const row of rows) {
      expect(row.sourceRef).toBe('src/search.ts#rev-7');
      expect(row.treeNodeId).toBeNull();
      expect(row.symbolVersionId).toBeNull();
      expect(row.logicalLane).toBe('ast');
      expect(row.logicalLaneVoteAdded).toBe(false);
      expect(row.canonicalWritesAllowed).toBe(false);
    }
  });

  it('does not emit destructuring patterns as named variable symbols', async () => {
    const rows = await extractAstGrepStructuralCandidates({
      ...EXTRACTION,
      code: 'const { Pool } = pkg; const [first, second] = values; const { options: config = {} } = input;',
    });

    expect(rows.filter((row) => row.nodeKind === 'variable_declarator')).toEqual([]);
  });

  it('uses only JavaScript grammar node kinds for JavaScript inputs', async () => {
    const rows = await extractAstGrepStructuralCandidates({
      ...EXTRACTION,
      code: 'export function addBlocker(value) { return value; }',
      filePath: 'scripts/example.mjs',
      sourceRef: 'scripts/example.mjs',
      language: 'JAVASCRIPT',
    });

    expect(rows.map((row) => `${row.entityKind}:${row.name}`)).toContain('FUNCTION:addBlocker');
    expect(rows.every((row) => row.filePath === 'scripts/example.mjs')).toBe(true);
  });

  it('reports UTF-8 byte spans when non-ASCII text precedes a declaration', async () => {
    const code = '// 🐉\nexport function addBlocker(value) { return value; }';
    const rows = await extractAstGrepStructuralCandidates({
      ...EXTRACTION,
      code,
      filePath: 'scripts/example.mjs',
      sourceRef: 'scripts/example.mjs',
      language: 'JAVASCRIPT',
    });
    const declaration = rows.find((row) => row.name === 'addBlocker');
    const bytes = Buffer.from(code, 'utf8');

    expect(declaration).toBeDefined();
    expect(bytes.subarray(declaration!.startByte, declaration!.endByte).toString('utf8'))
      .toBe('function addBlocker(value) { return value; }');
    expect(declaration!.startByte).toBe(Buffer.byteLength('// 🐉\nexport ', 'utf8'));
  });

  it('keeps UTF-8 byte spans for Unicode-prefixed TypeScript enums and methods', async () => {
    const code = '// 🧬\nexport enum SearchState { Idle, Ready }\nexport class SearchRunner { run() { return SearchState.Ready; } }';
    const rows = await extractAstGrepStructuralCandidates({
      ...EXTRACTION,
      code,
      filePath: 'src/search-state.ts',
      sourceRef: 'src/search-state.ts',
      language: 'TYPESCRIPT',
    });
    const enumCandidate = rows.find((row) => row.entityKind === 'ENUM' && row.name === 'SearchState');
    const methodCandidate = rows.find((row) => row.entityKind === 'METHOD' && row.name === 'run');
    const bytes = Buffer.from(code, 'utf8');

    expect(enumCandidate).toBeDefined();
    expect(bytes.subarray(enumCandidate!.startByte, enumCandidate!.endByte).toString('utf8'))
      .toBe('enum SearchState { Idle, Ready }');
    expect(enumCandidate!.startByte).toBe(Buffer.byteLength('// 🧬\nexport ', 'utf8'));
    expect(methodCandidate).toBeDefined();
    expect(bytes.subarray(methodCandidate!.startByte, methodCandidate!.endByte).toString('utf8'))
      .toBe('run() { return SearchState.Ready; }');
  });

  it('ranks exact/prefix identifier matches above generic exported candidates', async () => {
    const candidates = await extractAstGrepStructuralCandidates(EXTRACTION);
    const result = rankAstGrepStructuralTopK({
      candidates,
      query: {
        schema: 'atlas.ast-grep-structural-topk-query.v1',
        queryText: 'find rerank candidates function',
        intent: 'FUNCTION',
        k: 3,
        preferredSourceRef: null,
        requiredRelation: null,
        rankingRevision: 'rank-1',
      },
      producerRevision: 'test',
    });

    expect(result.rows[0]?.candidate.name).toBe('rerankCandidates');
    expect(result.rows[0]?.features.exactNameMatch).toBe(true);
    expect(result.rankingDeterministic).toBe(true);
    expect(result.exactPromotionRequired).toBe(true);
  });

  it('uses deterministic source coordinates as tie breakers rather than backend order', async () => {
    const candidates = await extractAstGrepStructuralCandidates(EXTRACTION);
    const variables = candidates.filter((candidate) => candidate.entityKind === 'VARIABLE');
    const query = {
      schema: 'atlas.ast-grep-structural-topk-query.v1' as const,
      queryText: 'variable',
      intent: 'VARIABLE' as const,
      k: variables.length,
      preferredSourceRef: null,
      requiredRelation: null,
      rankingRevision: 'rank-1',
    };
    const a = rankAstGrepStructuralTopK({ candidates: variables, query, producerRevision: 'test' });
    const b = rankAstGrepStructuralTopK({ candidates: [...variables].reverse(), query, producerRevision: 'test' });
    expect(a.rows.map((row) => row.candidate.name)).toEqual(b.rows.map((row) => row.candidate.name));
  });

  it('can structurally restrict variables to nodes inside a function', async () => {
    const result = await extractAndRankAstGrepStructuralTopK({
      extraction: EXTRACTION,
      query: {
        schema: 'atlas.ast-grep-structural-topk-query.v1',
        queryText: 'semantic score variable',
        intent: 'VARIABLE',
        k: 10,
        preferredSourceRef: null,
        requiredRelation: { relation: 'inside', surroundingKind: 'function_declaration' },
        rankingRevision: 'rank-1',
      },
      producerRevision: 'test',
    });

    expect(result.rows.map((row) => row.candidate.name)).toContain('semanticScore');
    expect(result.rows.map((row) => row.candidate.name)).not.toContain('unrelatedValue');
    expect(result.rows.every((row) => row.features.requiredRelationMatch)).toBe(true);
  });
});
