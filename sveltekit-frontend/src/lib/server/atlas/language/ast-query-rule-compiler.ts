import { z } from 'zod';
import {
  AstGrepQueryIntentSchema,
  AstGrepStructuralTopKQueryV1Schema,
  identifierTokens,
  type AstGrepQueryIntent,
  type AstGrepStructuralTopKQueryV1,
} from './ast-grep-structural-topk.js';

/**
 * Deterministically compiles a small, auditable subset of natural-language
 * structural intent into ast-grep NapiConfig-compatible rule objects.
 *
 * User text is never copied into `pattern` or `regex`. The generated matcher
 * consists only of allowlisted Tree-sitter kinds and relational operators.
 * Name/export/async intent remains an explicit post-filter/ranking feature.
 */

const SAFE_TARGET_KINDS = [
  'function_declaration',
  'method_definition',
  'variable_declarator',
  'class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
] as const;

const SAFE_RELATED_KINDS = [
  ...SAFE_TARGET_KINDS,
  'arrow_function',
  'await_expression',
  'call_expression',
  'return_statement',
  'import_statement',
  'decorator',
  'catch_clause',
  'try_statement',
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement',
] as const;

export const SafeAstGrepTargetKindSchema = z.enum(SAFE_TARGET_KINDS);
export type SafeAstGrepTargetKind = z.infer<typeof SafeAstGrepTargetKindSchema>;

export const SafeAstGrepRelatedKindSchema = z.enum(SAFE_RELATED_KINDS);
export type SafeAstGrepRelatedKind = z.infer<typeof SafeAstGrepRelatedKindSchema>;

export const CompiledAstRelationV1Schema = z.object({
  relation: z.enum(['inside', 'has', 'precedes', 'follows']),
  relatedKinds: z.array(SafeAstGrepRelatedKindSchema).min(1),
  stopBy: z.enum(['neighbor', 'end']),
  sourcePhrase: z.string().min(1),
}).strict();
export type CompiledAstRelationV1 = z.infer<typeof CompiledAstRelationV1Schema>;

export const AstQueryPostFiltersV1Schema = z.object({
  requireExported: z.boolean(),
  requireAsync: z.boolean(),
  requireArrowFunction: z.boolean(),
  symbolNameTokens: z.array(z.string().regex(/^[a-z0-9]+$/)).max(32),
  ancestorNameTokens: z.array(z.string().regex(/^[a-z0-9]+$/)).max(16),
}).strict();
export type AstQueryPostFiltersV1 = z.infer<typeof AstQueryPostFiltersV1Schema>;

const SafeKindRuleSchema = z.object({ kind: SafeAstGrepRelatedKindSchema }).strict();
const SafeAnyRuleSchema = z.object({ any: z.array(SafeKindRuleSchema).min(1) }).strict();
const SafeRelatedRuleSchema = z.object({
  any: z.array(SafeKindRuleSchema).min(1),
  stopBy: z.enum(['neighbor', 'end']),
}).strict();
const SafeRelationalRuleSchema = z.union([
  z.object({ inside: SafeRelatedRuleSchema }).strict(),
  z.object({ has: SafeRelatedRuleSchema }).strict(),
  z.object({ precedes: SafeRelatedRuleSchema }).strict(),
  z.object({ follows: SafeRelatedRuleSchema }).strict(),
]);
const SafeTopLevelClauseSchema = z.union([SafeKindRuleSchema, SafeAnyRuleSchema, SafeRelationalRuleSchema]);

export const SafeAstGrepNapiConfigV1Schema = z.object({
  rule: z.object({ all: z.array(SafeTopLevelClauseSchema).min(1) }).strict(),
}).strict();
export type SafeAstGrepNapiConfigV1 = z.infer<typeof SafeAstGrepNapiConfigV1Schema>;

export const AstQueryRuleCompileInputV1Schema = z.object({
  schema: z.literal('atlas.ast-query-rule-compile-input.v1'),
  queryText: z.string().trim().min(1).max(4096),
  k: z.number().int().positive().max(10_000),
  preferredSourceRef: z.string().min(1).nullable(),
  rankingRevision: z.string().min(1),
  compilerRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type AstQueryRuleCompileInputV1 = z.infer<typeof AstQueryRuleCompileInputV1Schema>;

export const AstQueryRuleCompileResultV1Schema = z.object({
  schema: z.literal('atlas.ast-query-rule-compile-result.v1'),
  normalizedQuery: z.string().min(1),
  intent: AstGrepQueryIntentSchema,
  targetKinds: z.array(SafeAstGrepTargetKindSchema).min(1),
  relations: z.array(CompiledAstRelationV1Schema).max(8),
  postFilters: AstQueryPostFiltersV1Schema,
  napiConfig: SafeAstGrepNapiConfigV1Schema,
  topKQuery: AstGrepStructuralTopKQueryV1Schema,
  deterministic: z.literal(true),
  userTextEmbeddedInMatcher: z.literal(false),
  rawPatternCompilationAllowed: z.literal(false),
  rawRegexCompilationAllowed: z.literal(false),
  treeSitterRemainsCanonicalStructureOwner: z.literal(true),
  exactPromotionRequired: z.literal(true),
  logicalLane: z.literal('ast'),
  logicalLaneVoteAdded: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  compilerRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type AstQueryRuleCompileResultV1 = z.infer<typeof AstQueryRuleCompileResultV1Schema>;

const GENERIC_QUERY_WORDS = new Set([
  'find', 'show', 'locate', 'search', 'list', 'get', 'give', 'me', 'the', 'a', 'an',
  'function', 'functions', 'method', 'methods', 'handler', 'handlers', 'callback', 'callbacks',
  'variable', 'variables', 'const', 'let', 'var', 'class', 'classes', 'interface', 'interfaces',
  'type', 'types', 'alias', 'aliases', 'enum', 'enums', 'symbol', 'symbols', 'definition',
  'definitions', 'defined', 'declaration', 'declarations', 'exported', 'export', 'async',
  'asynchronous', 'arrow', 'inside', 'within', 'in', 'containing', 'contains', 'contain', 'has',
  'with', 'after', 'following', 'follows', 'before', 'preceding', 'precedes', 'await', 'call',
  'calls', 'return', 'returns', 'import', 'imports', 'decorator', 'decorators', 'catch', 'try',
  'loop', 'loops', 'anywhere', 'that', 'which', 'where', 'code', 'named', 'called', 'of', 'for',
]);

function normalizeQuery(queryText: string): string {
  return queryText.trim().replace(/\s+/g, ' ').toLowerCase();
}

function hasWord(query: string, word: string): boolean {
  return new RegExp(`(?:^|\\b)${word}(?:\\b|$)`, 'i').test(query);
}

function inferIntent(query: string): AstGrepQueryIntent {
  if (/\b(variable|variables|const|let|var)\b/i.test(query)) return 'VARIABLE';
  if (/\b(class|classes|interface|interfaces|type|types|enum|enums)\b/i.test(query)) return 'TYPE';
  if (/\b(function|functions|method|methods|handler|handlers|callback|callbacks)\b/i.test(query)) return 'FUNCTION';
  return 'ANY';
}

function targetKindsFor(intent: AstGrepQueryIntent, query: string): SafeAstGrepTargetKind[] {
  if (intent === 'VARIABLE') return ['variable_declarator'];
  if (intent === 'TYPE') {
    if (/\bclass(?:es)?\b/i.test(query)) return ['class_declaration'];
    if (/\binterface(?:s)?\b/i.test(query)) return ['interface_declaration'];
    if (/\benum(?:s)?\b/i.test(query)) return ['enum_declaration'];
    if (/\btype\s+alias(?:es)?\b/i.test(query)) return ['type_alias_declaration'];
    return ['class_declaration', 'interface_declaration', 'type_alias_declaration', 'enum_declaration'];
  }
  if (intent === 'FUNCTION') {
    if (/\bmethod(?:s)?\b/i.test(query)) return ['method_definition'];
    if (/\barrow\b/i.test(query)) return ['variable_declarator'];
    return ['function_declaration', 'method_definition', 'variable_declarator'];
  }
  return [...SAFE_TARGET_KINDS];
}

function relation(relationKind: CompiledAstRelationV1['relation'], relatedKinds: SafeAstGrepRelatedKind[], stopBy: 'neighbor' | 'end', sourcePhrase: string): CompiledAstRelationV1 {
  return CompiledAstRelationV1Schema.parse({ relation: relationKind, relatedKinds, stopBy, sourcePhrase });
}

function compileRelations(query: string): { relations: CompiledAstRelationV1[]; ancestorNameTokens: string[] } {
  const relations: CompiledAstRelationV1[] = [];
  const ancestorNameTokens: string[] = [];

  const insideMatch = query.match(/\b(?:inside|within)\s+([a-z0-9_$-]+)(?:\s+(handler|function|method|class|catch|try|loop))?/i);
  if (insideMatch) {
    const descriptor = insideMatch[1]?.toLowerCase() ?? '';
    const category = insideMatch[2]?.toLowerCase() ?? descriptor;
    if (category === 'handler' || category === 'function' || category === 'method') {
      relations.push(relation('inside', ['function_declaration', 'method_definition', 'arrow_function'], 'end', insideMatch[0]));
      if (descriptor && descriptor !== category && !GENERIC_QUERY_WORDS.has(descriptor)) ancestorNameTokens.push(...identifierTokens(descriptor));
    } else if (category === 'class') {
      relations.push(relation('inside', ['class_declaration'], 'end', insideMatch[0]));
    } else if (category === 'catch') {
      relations.push(relation('inside', ['catch_clause'], 'end', insideMatch[0]));
    } else if (category === 'try') {
      relations.push(relation('inside', ['try_statement'], 'end', insideMatch[0]));
    } else if (category === 'loop') {
      relations.push(relation('inside', ['for_statement', 'for_in_statement', 'while_statement', 'do_statement'], 'end', insideMatch[0]));
    }
  }

  if (/\b(?:contain(?:s|ing)?|has|with)\s+(?:an?\s+)?await\b/i.test(query)) {
    relations.push(relation('has', ['await_expression'], 'end', 'contains await'));
  }
  if (/\b(?:contain(?:s|ing)?|has|with)\s+(?:a\s+)?call\b/i.test(query)) {
    relations.push(relation('has', ['call_expression'], 'end', 'contains call'));
  }
  if (/\b(?:contain(?:s|ing)?|has|with)\s+(?:a\s+)?return\b/i.test(query)) {
    relations.push(relation('has', ['return_statement'], 'end', 'contains return'));
  }
  if (/\b(?:after|following|follows)\s+(?:an?\s+)?import\b/i.test(query)) {
    relations.push(relation('follows', ['import_statement'], 'end', 'after import'));
  }
  if (/\b(?:after|following|follows)\s+(?:a\s+)?decorator\b/i.test(query)) {
    relations.push(relation('follows', ['decorator'], hasWord(query, 'anywhere') ? 'end' : 'neighbor', 'after decorator'));
  }
  if (/\b(?:before|preceding|precedes)\s+(?:a\s+)?return\b/i.test(query)) {
    relations.push(relation('precedes', ['return_statement'], 'end', 'before return'));
  }

  return {
    relations,
    ancestorNameTokens: [...new Set(ancestorNameTokens)].sort(),
  };
}

function compilePostFilters(query: string, ancestorNameTokens: readonly string[]): AstQueryPostFiltersV1 {
  const allTokens = identifierTokens(query);
  const ancestor = new Set(ancestorNameTokens);
  const symbolNameTokens = allTokens
    .filter((token) => !GENERIC_QUERY_WORDS.has(token))
    .filter((token) => !ancestor.has(token))
    .sort();
  return AstQueryPostFiltersV1Schema.parse({
    requireExported: /\bexported\b/i.test(query),
    requireAsync: /\b(?:async|asynchronous)\b/i.test(query),
    requireArrowFunction: /\barrow\b/i.test(query),
    symbolNameTokens: [...new Set(symbolNameTokens)],
    ancestorNameTokens: [...new Set(ancestorNameTokens)].sort(),
  });
}

function anyKindRule(kinds: readonly SafeAstGrepRelatedKind[]) {
  return kinds.length === 1
    ? { kind: kinds[0] }
    : { any: kinds.map((kind) => ({ kind })) };
}

export function compileSafeAstGrepNapiConfig(input: {
  targetKinds: readonly SafeAstGrepTargetKind[];
  relations: readonly CompiledAstRelationV1[];
}): SafeAstGrepNapiConfigV1 {
  const targetKinds = input.targetKinds.map((kind) => SafeAstGrepTargetKindSchema.parse(kind));
  const relations = input.relations.map((value) => CompiledAstRelationV1Schema.parse(value));
  const all: Array<Record<string, unknown>> = [anyKindRule(targetKinds)];
  for (const item of relations) {
    all.push({
      [item.relation]: {
        any: item.relatedKinds.map((kind) => ({ kind })),
        stopBy: item.stopBy,
      },
    });
  }
  return SafeAstGrepNapiConfigV1Schema.parse({ rule: { all } });
}

export function compileAstQueryRule(value: AstQueryRuleCompileInputV1): AstQueryRuleCompileResultV1 {
  const input = AstQueryRuleCompileInputV1Schema.parse(value);
  const normalizedQuery = normalizeQuery(input.queryText);
  const intent = inferIntent(normalizedQuery);
  const targetKinds = targetKindsFor(intent, normalizedQuery);
  const { relations, ancestorNameTokens } = compileRelations(normalizedQuery);
  const postFilters = compilePostFilters(normalizedQuery, ancestorNameTokens);
  const napiConfig = compileSafeAstGrepNapiConfig({ targetKinds, relations });

  const topKQuery: AstGrepStructuralTopKQueryV1 = AstGrepStructuralTopKQueryV1Schema.parse({
    schema: 'atlas.ast-grep-structural-topk-query.v1',
    queryText: input.queryText,
    intent,
    k: input.k,
    preferredSourceRef: input.preferredSourceRef,
    // Rich/multiple relations are executed from the compiled NapiConfig before
    // serialized-candidate ranking. Do not squeeze them back into the legacy
    // single-relation field.
    requiredRelation: null,
    rankingRevision: input.rankingRevision,
  });

  return AstQueryRuleCompileResultV1Schema.parse({
    schema: 'atlas.ast-query-rule-compile-result.v1',
    normalizedQuery,
    intent,
    targetKinds,
    relations,
    postFilters,
    napiConfig,
    topKQuery,
    deterministic: true,
    userTextEmbeddedInMatcher: false,
    rawPatternCompilationAllowed: false,
    rawRegexCompilationAllowed: false,
    treeSitterRemainsCanonicalStructureOwner: true,
    exactPromotionRequired: true,
    logicalLane: 'ast',
    logicalLaneVoteAdded: false,
    canonicalWritesAllowed: false,
    compilerRevision: input.compilerRevision,
    producerRevision: input.producerRevision,
  });
}
