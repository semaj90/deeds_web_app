import { describe, expect, it } from 'vitest';
import {
  compileAstQueryRule,
  compileSafeAstGrepNapiConfig,
  SafeAstGrepNapiConfigV1Schema,
} from './ast-query-rule-compiler.js';

function compile(queryText: string) {
  return compileAstQueryRule({
    schema: 'atlas.ast-query-rule-compile-input.v1',
    queryText,
    k: 64,
    preferredSourceRef: null,
    rankingRevision: 'rank-test',
    compilerRevision: 'compiler-test',
    producerRevision: 'test',
  });
}

describe('AST query → bounded ast-grep rule compiler', () => {
  it('compiles a variable inside a named handler without embedding user text in the matcher', () => {
    const result = compile('find variable inside retry handler');

    expect(result.intent).toBe('VARIABLE');
    expect(result.targetKinds).toEqual(['variable_declarator']);
    expect(result.relations).toEqual([
      expect.objectContaining({
        relation: 'inside',
        relatedKinds: ['function_declaration', 'method_definition', 'arrow_function'],
        stopBy: 'end',
      }),
    ]);
    expect(result.postFilters.ancestorNameTokens).toContain('retry');
    expect(result.postFilters.symbolNameTokens).not.toContain('retry');
    expect(JSON.stringify(result.napiConfig)).not.toContain('retry');
    expect(result.userTextEmbeddedInMatcher).toBe(false);
    expect(result.rawPatternCompilationAllowed).toBe(false);
    expect(result.rawRegexCompilationAllowed).toBe(false);
  });

  it('compiles exported async function containing await into target+relation+post-filters', () => {
    const result = compile('find exported async functions containing await');

    expect(result.intent).toBe('FUNCTION');
    expect(result.targetKinds).toEqual([
      'function_declaration',
      'method_definition',
      'variable_declarator',
    ]);
    expect(result.postFilters.requireExported).toBe(true);
    expect(result.postFilters.requireAsync).toBe(true);
    expect(result.relations).toEqual([
      expect.objectContaining({ relation: 'has', relatedKinds: ['await_expression'], stopBy: 'end' }),
    ]);
    expect(result.napiConfig.rule.all).toHaveLength(2);
  });

  it('compiles arrow function name intent while keeping name matching out of the executable rule', () => {
    const result = compile('find arrow function rerankCandidates');

    expect(result.intent).toBe('FUNCTION');
    expect(result.targetKinds).toEqual(['variable_declarator']);
    expect(result.postFilters.requireArrowFunction).toBe(true);
    expect(result.postFilters.symbolNameTokens).toEqual(expect.arrayContaining(['rerank', 'candidates']));
    const serialized = JSON.stringify(result.napiConfig);
    expect(serialized).not.toContain('rerank');
    expect(serialized).not.toContain('candidates');
  });

  it('uses neighbor scope for an immediately preceding decorator unless anywhere is explicit', () => {
    const near = compile('find method after decorator');
    const anywhere = compile('find method after decorator anywhere');

    expect(near.targetKinds).toEqual(['method_definition']);
    expect(near.relations[0]).toMatchObject({ relation: 'follows', relatedKinds: ['decorator'], stopBy: 'neighbor' });
    expect(anywhere.relations[0]).toMatchObject({ relation: 'follows', relatedKinds: ['decorator'], stopBy: 'end' });
  });

  it('uses explicit all clauses for target and multiple independent relations', () => {
    const result = compile('find async function containing await containing return');

    expect(result.relations.map((row) => row.relation)).toEqual(['has', 'has']);
    expect(result.napiConfig.rule.all).toHaveLength(3);
    expect(result.napiConfig.rule.all[1]).toEqual({
      has: { any: [{ kind: 'await_expression' }], stopBy: 'end' },
    });
    expect(result.napiConfig.rule.all[2]).toEqual({
      has: { any: [{ kind: 'return_statement' }], stopBy: 'end' },
    });
  });

  it('does not compile regex/pattern-looking user input into executable pattern or regex fields', () => {
    const result = compile('find function /.*$/ pattern $A regex (?=evil)');
    const serialized = JSON.stringify(result.napiConfig);

    expect(serialized).not.toContain('pattern');
    expect(serialized).not.toContain('regex');
    expect(serialized).not.toContain('.*$');
    expect(serialized).not.toContain('(?=evil)');
    expect(result.rawPatternCompilationAllowed).toBe(false);
    expect(result.rawRegexCompilationAllowed).toBe(false);
  });

  it('is deterministic for identical inputs', () => {
    const a = compile('find variable inside retry handler');
    const b = compile('find variable inside retry handler');
    expect(a).toEqual(b);
  });

  it('produces a NapiConfig shape accepted by the local Zod boundary', () => {
    const config = compileSafeAstGrepNapiConfig({
      targetKinds: ['function_declaration', 'method_definition'],
      relations: [
        {
          relation: 'has',
          relatedKinds: ['await_expression'],
          stopBy: 'end',
          sourcePhrase: 'contains await',
        },
      ],
    });

    expect(SafeAstGrepNapiConfigV1Schema.parse(config)).toEqual(config);
    expect(config).toEqual({
      rule: {
        all: [
          { any: [{ kind: 'function_declaration' }, { kind: 'method_definition' }] },
          { has: { any: [{ kind: 'await_expression' }], stopBy: 'end' } },
        ],
      },
    });
  });

  it('keeps the Atlas authority boundaries explicit', () => {
    const result = compile('find exported async function containing await');
    expect(result.treeSitterRemainsCanonicalStructureOwner).toBe(true);
    expect(result.exactPromotionRequired).toBe(true);
    expect(result.logicalLane).toBe('ast');
    expect(result.logicalLaneVoteAdded).toBe(false);
    expect(result.canonicalWritesAllowed).toBe(false);
    expect(result.topKQuery.requiredRelation).toBeNull();
  });
});
