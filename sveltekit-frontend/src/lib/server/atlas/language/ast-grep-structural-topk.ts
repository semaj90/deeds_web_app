import { z } from 'zod';
import type { SgNode } from '@ast-grep/napi';

/**
 * ast-grep is a structural-query executor over Tree-sitter syntax. It can
 * nominate functions/variables/types very quickly, but it is not the canonical
 * tree-node identity owner and it does not resolve compiler semantics.
 *
 * This module therefore:
 *  1. extracts exact structural matches from @ast-grep/napi,
 *  2. ranks those matches deterministically for a query,
 *  3. preserves source/revision coordinates,
 *  4. leaves treeNodeId/symbolVersionId null until the canonical Tree-sitter /
 *     symbol owner joins them,
 *  5. never adds an extra AST-lane vote and never authorizes mutation.
 */

export const AstGrepEntityKindSchema = z.enum([
  'FUNCTION',
  'METHOD',
  'VARIABLE',
  'CLASS',
  'INTERFACE',
  'TYPE_ALIAS',
  'ENUM',
]);
export type AstGrepEntityKind = z.infer<typeof AstGrepEntityKindSchema>;

export const AstGrepQueryIntentSchema = z.enum(['ANY', 'FUNCTION', 'VARIABLE', 'TYPE']);
export type AstGrepQueryIntent = z.infer<typeof AstGrepQueryIntentSchema>;

export const AstGrepRelationSchema = z.enum(['inside', 'has', 'precedes', 'follows']);
export type AstGrepRelation = z.infer<typeof AstGrepRelationSchema>;

export const AstGrepRequiredRelationV1Schema = z.object({
  relation: AstGrepRelationSchema,
  surroundingKind: z.string().min(1),
}).strict();
export type AstGrepRequiredRelationV1 = z.infer<typeof AstGrepRequiredRelationV1Schema>;

export const AstGrepStructuralExtractionInputV1Schema = z.object({
  schema: z.literal('atlas.ast-grep-structural-extraction-input.v1'),
  code: z.string(),
  filePath: z.string().min(1),
  sourceRef: z.string().min(1),
  language: z.enum(['TYPESCRIPT', 'JAVASCRIPT', 'TSX', 'JSX']),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type AstGrepStructuralExtractionInputV1 = z.infer<typeof AstGrepStructuralExtractionInputV1Schema>;

export const AstGrepStructuralCandidateV1Schema = z.object({
  schema: z.literal('atlas.ast-grep-structural-candidate.v1'),
  entityKind: AstGrepEntityKindSchema,
  declarationForm: z.enum([
    'FUNCTION_DECLARATION',
    'METHOD_DEFINITION',
    'ARROW_FUNCTION',
    'VARIABLE_DECLARATOR',
    'CLASS_DECLARATION',
    'INTERFACE_DECLARATION',
    'TYPE_ALIAS_DECLARATION',
    'ENUM_DECLARATION',
  ]),
  name: z.string().min(1),
  nodeKind: z.string().min(1),
  signature: z.string().min(1),
  isExported: z.boolean(),
  isAsync: z.boolean(),
  sourceRef: z.string().min(1),
  filePath: z.string().min(1),
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  startLine: z.number().int().nonnegative(),
  startColumn: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  endColumn: z.number().int().nonnegative(),
  treeNodeId: z.string().min(1).nullable(),
  symbolVersionId: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  engine: z.literal('AST_GREP_NAPI'),
  structuralMatchExactForDeclaredRule: z.literal(true),
  requiresCanonicalTreeJoin: z.literal(true),
  logicalLane: z.literal('ast'),
  logicalLaneVoteAdded: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.endByte < value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be >= startByte' });
  }
});
export type AstGrepStructuralCandidateV1 = z.infer<typeof AstGrepStructuralCandidateV1Schema>;

export const AstGrepStructuralTopKQueryV1Schema = z.object({
  schema: z.literal('atlas.ast-grep-structural-topk-query.v1'),
  queryText: z.string().min(1),
  intent: AstGrepQueryIntentSchema,
  k: z.number().int().positive().max(10_000),
  preferredSourceRef: z.string().min(1).nullable(),
  requiredRelation: AstGrepRequiredRelationV1Schema.nullable(),
  rankingRevision: z.string().min(1),
}).strict();
export type AstGrepStructuralTopKQueryV1 = z.infer<typeof AstGrepStructuralTopKQueryV1Schema>;

export const AstGrepStructuralRankFeaturesV1Schema = z.object({
  exactNameMatch: z.boolean(),
  prefixNameMatch: z.boolean(),
  identifierTokenOverlapPermille: z.number().int().min(0).max(1000),
  kindIntentMatch: z.boolean(),
  exported: z.boolean(),
  requiredRelationMatch: z.boolean(),
  preferredSourceMatch: z.boolean(),
}).strict();
export type AstGrepStructuralRankFeaturesV1 = z.infer<typeof AstGrepStructuralRankFeaturesV1Schema>;

export const RankedAstGrepStructuralCandidateV1Schema = z.object({
  candidate: AstGrepStructuralCandidateV1Schema,
  features: AstGrepStructuralRankFeaturesV1Schema,
  scoreMilli: z.number().int().nonnegative(),
  rank: z.number().int().positive(),
}).strict();
export type RankedAstGrepStructuralCandidateV1 = z.infer<typeof RankedAstGrepStructuralCandidateV1Schema>;

export const AstGrepStructuralTopKResultV1Schema = z.object({
  schema: z.literal('atlas.ast-grep-structural-topk-result.v1'),
  query: AstGrepStructuralTopKQueryV1Schema,
  totalCandidates: z.number().int().nonnegative(),
  returnedCandidates: z.number().int().nonnegative(),
  rows: z.array(RankedAstGrepStructuralCandidateV1Schema),
  rankingDeterministic: z.literal(true),
  candidateGenerationExactForDeclaredRules: z.literal(true),
  rankingIsHeuristic: z.literal(true),
  exactPromotionRequired: z.literal(true),
  treeSitterRemainsCanonicalStructureOwner: z.literal(true),
  logicalLane: z.literal('ast'),
  logicalLaneVoteAdded: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type AstGrepStructuralTopKResultV1 = z.infer<typeof AstGrepStructuralTopKResultV1Schema>;

type FieldReadableNode = SgNode & { field(name: string): SgNode | null };

function field(node: SgNode, name: string): SgNode | null {
  return (node as FieldReadableNode).field(name);
}

function detectRuntimeLang(
  lang: AstGrepStructuralExtractionInputV1['language'],
  values: typeof import('@ast-grep/napi'),
) {
  switch (lang) {
    case 'TYPESCRIPT': return values.Lang.TypeScript;
    case 'JAVASCRIPT': return values.Lang.JavaScript;
    case 'TSX':
    case 'JSX':
      return values.Lang.Tsx;
  }
}

function firstNonEmptyLine(text: string, maxChars = 240): string {
  return (text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? text).trim().slice(0, maxChars) || '<empty>';
}

function isExported(node: SgNode): boolean {
  if (node.text().trimStart().startsWith('export ')) return true;
  return node.ancestors().some((ancestor) => ancestor.kind() === 'export_statement');
}

function isAsync(node: SgNode): boolean {
  return /^async\b/.test(node.text().trimStart()) || /\basync\b/.test(firstNonEmptyLine(node.text(), 120));
}

function nodeName(node: SgNode): string | null {
  const byField = field(node, 'name')?.text()?.trim();
  if (byField) return byField;
  const firstIdentifier = node.find({ rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] } });
  return firstIdentifier?.text()?.trim() || null;
}

function relationMatches(node: SgNode, required: AstGrepRequiredRelationV1 | null): boolean {
  if (!required) return true;
  const matcher = { rule: { kind: required.surroundingKind } };
  switch (required.relation) {
    case 'inside': return node.inside(matcher);
    case 'has': return node.has(matcher);
    case 'precedes': return node.precedes(matcher);
    case 'follows': return node.follows(matcher);
  }
}

function toCandidate(input: AstGrepStructuralExtractionInputV1, node: SgNode, value: {
  entityKind: AstGrepEntityKind;
  declarationForm: AstGrepStructuralCandidateV1['declarationForm'];
  name?: string | null;
}): AstGrepStructuralCandidateV1 | null {
  const name = (value.name ?? nodeName(node))?.trim();
  if (!name) return null;
  const range = node.range();
  return AstGrepStructuralCandidateV1Schema.parse({
    schema: 'atlas.ast-grep-structural-candidate.v1',
    entityKind: value.entityKind,
    declarationForm: value.declarationForm,
    name,
    nodeKind: node.kind(),
    signature: firstNonEmptyLine(node.text()),
    isExported: isExported(node),
    isAsync: isAsync(node),
    sourceRef: input.sourceRef,
    filePath: input.filePath,
    startByte: range.start.index,
    endByte: range.end.index,
    startLine: range.start.line,
    startColumn: range.start.column,
    endLine: range.end.line,
    endColumn: range.end.column,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    engine: 'AST_GREP_NAPI',
    structuralMatchExactForDeclaredRule: true,
    requiresCanonicalTreeJoin: true,
    logicalLane: 'ast',
    logicalLaneVoteAdded: false,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}

/**
 * Extract TypeScript/JavaScript structural symbol candidates using the real
 * @ast-grep/napi parser. `findAll` is intentionally used instead of recursive
 * JS traversal to minimize Rust<->Node FFI crossings.
 */
export async function extractAstGrepStructuralCandidates(
  value: AstGrepStructuralExtractionInputV1,
): Promise<AstGrepStructuralCandidateV1[]> {
  const input = AstGrepStructuralExtractionInputV1Schema.parse(value);
  const astGrep = await import('@ast-grep/napi');
  const parsed = await astGrep.parseAsync(detectRuntimeLang(input.language, astGrep), input.code);
  const root = parsed.root();
  const candidates: AstGrepStructuralCandidateV1[] = [];
  const seen = new Set<string>();

  const add = (node: SgNode, spec: Parameters<typeof toCandidate>[2]) => {
    const candidate = toCandidate(input, node, spec);
    if (!candidate) return;
    const identity = `${candidate.startByte}:${candidate.endByte}:${candidate.nodeKind}:${candidate.entityKind}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    candidates.push(candidate);
  };

  for (const node of root.findAll({ rule: { kind: 'function_declaration' } })) {
    add(node, { entityKind: 'FUNCTION', declarationForm: 'FUNCTION_DECLARATION' });
  }
  for (const node of root.findAll({ rule: { kind: 'method_definition' } })) {
    add(node, { entityKind: 'METHOD', declarationForm: 'METHOD_DEFINITION' });
  }
  for (const node of root.findAll({ rule: { kind: 'variable_declarator' } })) {
    const valueNode = field(node, 'value');
    add(node, {
      entityKind: valueNode?.kind() === 'arrow_function' ? 'FUNCTION' : 'VARIABLE',
      declarationForm: valueNode?.kind() === 'arrow_function' ? 'ARROW_FUNCTION' : 'VARIABLE_DECLARATOR',
      name: field(node, 'name')?.text() ?? null,
    });
  }
  for (const node of root.findAll({ rule: { kind: 'class_declaration' } })) {
    add(node, { entityKind: 'CLASS', declarationForm: 'CLASS_DECLARATION' });
  }
  for (const node of root.findAll({ rule: { kind: 'interface_declaration' } })) {
    add(node, { entityKind: 'INTERFACE', declarationForm: 'INTERFACE_DECLARATION' });
  }
  for (const node of root.findAll({ rule: { kind: 'type_alias_declaration' } })) {
    add(node, { entityKind: 'TYPE_ALIAS', declarationForm: 'TYPE_ALIAS_DECLARATION' });
  }
  for (const node of root.findAll({ rule: { kind: 'enum_declaration' } })) {
    add(node, { entityKind: 'ENUM', declarationForm: 'ENUM_DECLARATION' });
  }

  return candidates.sort((a, b) =>
    a.startByte - b.startByte
    || a.endByte - b.endByte
    || a.entityKind.localeCompare(b.entityKind)
    || a.name.localeCompare(b.name));
}

const QUERY_STOP_WORDS = new Set([
  'a', 'an', 'and', 'the', 'find', 'show', 'locate', 'function', 'functions',
  'variable', 'variables', 'method', 'methods', 'class', 'classes', 'symbol',
  'symbols', 'definition', 'definitions', 'code', 'named', 'called', 'for', 'of',
]);

export function identifierTokens(value: string): string[] {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase();
  return [...new Set(spaced.split(/\s+/).filter(Boolean).filter((token) => !QUERY_STOP_WORDS.has(token)))];
}

function tokenOverlapPermille(queryTokens: readonly string[], candidateTokens: readonly string[]): number {
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
  const q = new Set(queryTokens);
  const c = new Set(candidateTokens);
  let intersection = 0;
  for (const token of q) if (c.has(token)) intersection += 1;
  const union = new Set([...q, ...c]).size;
  return union === 0 ? 0 : Math.floor((1000 * intersection) / union);
}

function intentMatches(intent: AstGrepQueryIntent, kind: AstGrepEntityKind): boolean {
  if (intent === 'ANY') return true;
  if (intent === 'FUNCTION') return kind === 'FUNCTION' || kind === 'METHOD';
  if (intent === 'VARIABLE') return kind === 'VARIABLE';
  return kind === 'CLASS' || kind === 'INTERFACE' || kind === 'TYPE_ALIAS' || kind === 'ENUM';
}

function normalizeIdentifier(value: string): string {
  return identifierTokens(value).join('');
}

export function rankAstGrepStructuralTopK(input: {
  candidates: readonly AstGrepStructuralCandidateV1[];
  query: AstGrepStructuralTopKQueryV1;
  producerRevision: string;
}): AstGrepStructuralTopKResultV1 {
  const query = AstGrepStructuralTopKQueryV1Schema.parse(input.query);
  const candidates = input.candidates.map((candidate) => AstGrepStructuralCandidateV1Schema.parse(candidate));
  const queryTokens = identifierTokens(query.queryText);
  const queryNormalized = queryTokens.join('');

  const scored = candidates.flatMap((candidate) => {
    const relationMatch = query.requiredRelation ? false : true;
    // Relation filtering is evaluated during combined extraction+ranking where
    // the live SgNode is still available. Pure ranking over serialized
    // candidates cannot reconstruct parent/sibling relations.
    if (query.requiredRelation && relationMatch === false) return [];

    const candidateTokens = identifierTokens(candidate.name);
    const candidateNormalized = candidateTokens.join('');
    const exactNameMatch = queryNormalized.length > 0 && candidateNormalized === queryNormalized;
    const prefixNameMatch = queryNormalized.length > 0
      && !exactNameMatch
      && (candidateNormalized.startsWith(queryNormalized) || queryNormalized.startsWith(candidateNormalized));
    const identifierTokenOverlapPermille = tokenOverlapPermille(queryTokens, candidateTokens);
    const kindIntentMatch = intentMatches(query.intent, candidate.entityKind);
    const preferredSourceMatch = query.preferredSourceRef !== null && candidate.sourceRef === query.preferredSourceRef;
    const features = AstGrepStructuralRankFeaturesV1Schema.parse({
      exactNameMatch,
      prefixNameMatch,
      identifierTokenOverlapPermille,
      kindIntentMatch,
      exported: candidate.isExported,
      requiredRelationMatch: query.requiredRelation === null,
      preferredSourceMatch,
    });

    // Integer-only score keeps tie behavior stable across JS engines/platforms.
    const scoreMilli =
      (features.exactNameMatch ? 4000 : 0)
      + (features.prefixNameMatch ? 800 : 0)
      + features.identifierTokenOverlapPermille * 2
      + (features.kindIntentMatch ? 1200 : 0)
      + (features.exported ? 150 : 0)
      + (features.requiredRelationMatch ? 0 : 600)
      + (features.preferredSourceMatch ? 300 : 0);

    return [{ candidate, features, scoreMilli }];
  });

  const ordered = scored.sort((a, b) =>
    b.scoreMilli - a.scoreMilli
    || Number(b.features.exported) - Number(a.features.exported)
    || a.candidate.sourceRef.localeCompare(b.candidate.sourceRef)
    || a.candidate.startByte - b.candidate.startByte
    || a.candidate.entityKind.localeCompare(b.candidate.entityKind)
    || a.candidate.name.localeCompare(b.candidate.name));

  const rows = ordered.slice(0, Math.min(query.k, ordered.length)).map((row, index) =>
    RankedAstGrepStructuralCandidateV1Schema.parse({ ...row, rank: index + 1 }));

  return AstGrepStructuralTopKResultV1Schema.parse({
    schema: 'atlas.ast-grep-structural-topk-result.v1',
    query,
    totalCandidates: candidates.length,
    returnedCandidates: rows.length,
    rows,
    rankingDeterministic: true,
    candidateGenerationExactForDeclaredRules: true,
    rankingIsHeuristic: true,
    exactPromotionRequired: true,
    treeSitterRemainsCanonicalStructureOwner: true,
    logicalLane: 'ast',
    logicalLaneVoteAdded: false,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}

/**
 * Combined helper that can honor ast-grep's relational predicates while the
 * live syntax nodes are available. It intentionally reruns the small extraction
 * set rather than pretending parent/sibling relations survive serialization.
 */
export async function extractAndRankAstGrepStructuralTopK(input: {
  extraction: AstGrepStructuralExtractionInputV1;
  query: AstGrepStructuralTopKQueryV1;
  producerRevision: string;
}): Promise<AstGrepStructuralTopKResultV1> {
  const extraction = AstGrepStructuralExtractionInputV1Schema.parse(input.extraction);
  const query = AstGrepStructuralTopKQueryV1Schema.parse(input.query);
  const astGrep = await import('@ast-grep/napi');
  const parsed = await astGrep.parseAsync(detectRuntimeLang(extraction.language, astGrep), extraction.code);
  const root = parsed.root();
  const selected: AstGrepStructuralCandidateV1[] = [];
  const seen = new Set<string>();

  const addIf = (node: SgNode, spec: Parameters<typeof toCandidate>[2]) => {
    if (!relationMatches(node, query.requiredRelation)) return;
    const candidate = toCandidate(extraction, node, spec);
    if (!candidate) return;
    const identity = `${candidate.startByte}:${candidate.endByte}:${candidate.nodeKind}:${candidate.entityKind}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    selected.push(candidate);
  };

  for (const node of root.findAll({ rule: { kind: 'function_declaration' } })) {
    addIf(node, { entityKind: 'FUNCTION', declarationForm: 'FUNCTION_DECLARATION' });
  }
  for (const node of root.findAll({ rule: { kind: 'method_definition' } })) {
    addIf(node, { entityKind: 'METHOD', declarationForm: 'METHOD_DEFINITION' });
  }
  for (const node of root.findAll({ rule: { kind: 'variable_declarator' } })) {
    const valueNode = field(node, 'value');
    addIf(node, {
      entityKind: valueNode?.kind() === 'arrow_function' ? 'FUNCTION' : 'VARIABLE',
      declarationForm: valueNode?.kind() === 'arrow_function' ? 'ARROW_FUNCTION' : 'VARIABLE_DECLARATOR',
      name: field(node, 'name')?.text() ?? null,
    });
  }
  for (const node of root.findAll({ rule: { kind: 'class_declaration' } })) {
    addIf(node, { entityKind: 'CLASS', declarationForm: 'CLASS_DECLARATION' });
  }
  for (const node of root.findAll({ rule: { kind: 'interface_declaration' } })) {
    addIf(node, { entityKind: 'INTERFACE', declarationForm: 'INTERFACE_DECLARATION' });
  }
  for (const node of root.findAll({ rule: { kind: 'type_alias_declaration' } })) {
    addIf(node, { entityKind: 'TYPE_ALIAS', declarationForm: 'TYPE_ALIAS_DECLARATION' });
  }
  for (const node of root.findAll({ rule: { kind: 'enum_declaration' } })) {
    addIf(node, { entityKind: 'ENUM', declarationForm: 'ENUM_DECLARATION' });
  }

  const withoutRelation = { ...query, requiredRelation: null } as AstGrepStructuralTopKQueryV1;
  const result = rankAstGrepStructuralTopK({ candidates: selected, query: withoutRelation, producerRevision: input.producerRevision });
  return AstGrepStructuralTopKResultV1Schema.parse({
    ...result,
    query,
    rows: result.rows.map((row) => ({
      ...row,
      features: { ...row.features, requiredRelationMatch: true },
      scoreMilli: row.scoreMilli + (query.requiredRelation ? 600 : 0),
    })),
  });
}
