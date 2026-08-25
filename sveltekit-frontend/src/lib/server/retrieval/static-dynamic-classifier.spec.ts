import { describe, expect, it } from 'vitest';
import { classifyStaticDynamic, staticDynamicScore } from './static-dynamic-classifier.js';

describe('classifyStaticDynamic', () => {
  it('classifies declarative kinds as static regardless of source text', () => {
    expect(classifyStaticDynamic({ nodeKind: 'type' })).toBe('static');
    expect(classifyStaticDynamic({ nodeKind: 'interface' })).toBe('static');
    expect(classifyStaticDynamic({ nodeKind: 'schema' })).toBe('static');
    expect(classifyStaticDynamic({ nodeKind: 'import' })).toBe('static');
    expect(classifyStaticDynamic({ nodeKind: 'export' })).toBe('static');
  });

  it('classifies runtime-executed kinds as dynamic regardless of source text', () => {
    expect(classifyStaticDynamic({ nodeKind: 'route' })).toBe('dynamic');
    expect(classifyStaticDynamic({ nodeKind: 'test' })).toBe('dynamic');
    expect(classifyStaticDynamic({ nodeKind: 'call_site' })).toBe('dynamic');
  });

  it('classifies a pure function with no dynamic markers as static', () => {
    const result = classifyStaticDynamic({
      nodeKind: 'function',
      sourceText: 'function add(a: number, b: number) { return a + b; }',
    });
    expect(result).toBe('static');
  });

  it('classifies a side-effecting function as dynamic', () => {
    const result = classifyStaticDynamic({
      nodeKind: 'function',
      sourceText: 'async function loadUser(id: string) { return await fetch(`/api/users/${id}`); }',
    });
    expect(result).toBe('dynamic');
  });

  it('classifies a method touching process.env as dynamic', () => {
    const result = classifyStaticDynamic({
      nodeKind: 'method',
      sourceText: 'getHost() { return process.env.HOST ?? "localhost"; }',
    });
    expect(result).toBe('dynamic');
  });

  it('returns undefined for function/method/constructor with no source text — does not guess', () => {
    expect(classifyStaticDynamic({ nodeKind: 'function' })).toBeUndefined();
    expect(classifyStaticDynamic({ nodeKind: 'method' })).toBeUndefined();
    expect(classifyStaticDynamic({ nodeKind: 'constructor' })).toBeUndefined();
  });

  it('returns undefined for coarse kinds regardless of source text', () => {
    expect(classifyStaticDynamic({ nodeKind: 'class', sourceText: 'anything' })).toBeUndefined();
    expect(classifyStaticDynamic({ nodeKind: 'module', sourceText: 'anything' })).toBeUndefined();
    expect(classifyStaticDynamic({ nodeKind: 'file', sourceText: 'anything' })).toBeUndefined();
    expect(classifyStaticDynamic({ nodeKind: 'parameter', sourceText: 'anything' })).toBeUndefined();
  });
});

describe('staticDynamicScore', () => {
  it('returns undefined when the label is undefined — never fabricates a neutral score', () => {
    expect(staticDynamicScore(undefined)).toBeUndefined();
  });

  it('scores the favored label as 1 and the other as 0, defaulting to favoring static', () => {
    expect(staticDynamicScore('static')).toBe(1);
    expect(staticDynamicScore('dynamic')).toBe(0);
  });

  it('respects an explicit favor override', () => {
    expect(staticDynamicScore('dynamic', 'dynamic')).toBe(1);
    expect(staticDynamicScore('static', 'dynamic')).toBe(0);
  });
});
