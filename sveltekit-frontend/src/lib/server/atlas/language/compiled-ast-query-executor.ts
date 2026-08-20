import { z } from 'zod';
import type { SgNode } from '@ast-grep/napi';
import {
  AstGrepStructuralCandidateV1Schema,
  AstGrepStructuralExtractionInputV1Schema,
  AstGrepStructuralTopKResultV1Schema,
  identifierTokens,
  rankAstGrepStructuralTopK,
  type AstGrepStructuralCandidateV1,
  type AstGrepStructuralExtractionInputV1,
  type AstGrepStructuralTopKResultV1,
} from './ast-grep-structural-topk.js';
import {
  AstQueryRuleCompileInputV1Schema,
  AstQueryRuleCompileResultV1Schema,
  compileAstQueryRule,
  type AstQueryRuleCompileInputV1,
  type AstQueryRuleCompileResultV1,
} from './ast-query-rule-compiler.js';

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
  return (text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? text)
    .trim()
    .slice(0, maxChars) || '<empty>';
}

function nodeName(node: SgNode): string | null {
  const byField = field(node, 'name')?.text()?.trim();
  if (byField) return byField;
  const firstIdentifier = node.find({
    rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
  });
  return firstIdentifier?.text()?.trim() || null;
}

function isExported(node: SgNode): boolean {
  if (node.text().trimStart().startsWith('export ')) return true;
  return node.ancestors().some((ancestor) => ancestor.kind() === 'export_statement');
}

function isAsync(node: SgNode): boolean {
  const text = firstNonEmptyLine(node.text(), 160);
  return /^async\b/.test(text) || /\basync\b/.test(text);
}

function isArrowFunctionDeclaration(node: SgNode): boolean {
  return node.kind() === 'variable_declarator' && field(node, 'value')?.kind() === 'arrow_function';
}

function toCandidate(
  extraction: AstGrepStructuralExtractionInputV1,
  node: SgNode,
): AstGrepStructuralCandidateV1 | null {
  const kind = node.kind();
  const name = nodeName(node);
  if (!name) return null;

  let entityKind: AstGrepStructuralCandidateV1['entityKind'];
  let declarationForm: AstGrepStructuralCandidateV1['declarationForm'];

  switch (kind) {
    case 'function_declaration':
      entityKind = 'FUNCTION';
      declarationForm = 'FUNCTION_DECLARATION';
      break;
    case 'method_definition':
      entityKind = 'METHOD';
      declarationForm = 'METHOD_DEFINITION';
      break;
    case 'variable_declarator':
      if (isArrowFunctionDeclaration(node)) {
        entityKind = 'FUNCTION';
        declarationForm = 'ARROW_FUNCTION';
      } else {
        entityKind = 'VARIABLE';
        declarationForm = 'VARIABLE_DECLARATOR';
      }
      break;
    case 'class_declaration':
      entityKind = 'CLASS';
      declarationForm = 'CLASS_DECLARATION';
      break;
    case 'interface_declaration':
      entityKind = 'INTERFACE';
      declarationForm = 'INTERFACE_DECLARATION';
      break;
    case 'type_alias_declaration':
      entityKind = 'TYPE_ALIAS';
      declarationForm = 'TYPE_ALIAS_DECLARATION';
      break;
    case 'enum_declaration':
      entityKind = 'ENUM';
      declarationForm = 'ENUM_DECLARATION';
      break;
    default:
      return null;
  }

  const range = node.range();
  return AstGrepStructuralCandidateV1Schema.parse({
    schema: 'atlas.ast-grep-structural-candidate.v1',
    entityKind,
    declarationForm,
    name,
    nodeKind: kind,
    signature: firstNonEmptyLine(node.text()),
    isExported: isExported(node),
    isAsync: isAsync(node),
    sourceRef: extraction.sourceRef,
    filePath: extraction.filePath,
    startByte: range.start.index,
    endByte: range.end.index,
    startLine: range.start.line,
    startColumn: range.start.column,
    endLine: range.end.line,
    endColumn: range.end.column,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: extraction.workspaceRevision,
    sourceRevision: extraction.sourceRevision,
    engine: 'AST_GREP_NAPI',
    structuralMatchExactForDeclaredRule: true,
    requiresCanonicalTreeJoin: true,
    logicalLane: 'ast',
    logicalLaneVoteAdded: false,
    canonicalWritesAllowed: false,
    producerRevision: extraction.producerRevision,
  });
}

function containsAllTokens(text: string, required: readonly string[]): boolean {
  if (required.length === 0) return true;
  const available = new Set(identifierTokens(text));
  return required.every((token) => available.has(token));
}

function ancestorNames(node: SgNode): string[] {
  const names: string[] = [];
  for (const ancestor of node.ancestors()) {
    const name = nodeName(ancestor);
    if (name) names.push(name);
  }
  return names;
}

export const CompiledAstQueryPostFilterReceiptV1Schema = z.object({
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  nodeKind: z.string().min(1),
  exportedMatch: z.boolean(),
  asyncMatch: z.boolean(),
  arrowFunctionMatch: z.boolean(),
  symbolNameMatch: z.boolean(),
  ancestorNameMatch: z.boolean(),
  accepted: z.boolean(),
}).strict();
export type CompiledAstQueryPostFilterReceiptV1 = z.infer<typeof CompiledAstQueryPostFilterReceiptV1Schema>;

export const ExecuteCompiledAstQueryInputV1Schema = z.object({
  schema: z.literal('atlas.execute-compiled-ast-query-input.v1'),
  extraction: AstGrepStructuralExtractionInputV1Schema,
  compile: AstQueryRuleCompileInputV1Schema,
  producerRevision: z.string().min(1),
}).strict();
export type ExecuteCompiledAstQueryInputV1 = z.infer<typeof ExecuteCompiledAstQueryInputV1Schema>;

export const ExecuteCompiledAstQueryResultV1Schema = z.object({
  schema: z.literal('atlas.execute-compiled-ast-query-result.v1'),
  compiled: AstQueryRuleCompileResultV1Schema,
  structuralMatchCount: z.number().int().nonnegative(),
  postFilterAcceptedCount: z.number().int().nonnegative(),
  postFilterRejectedCount: z.number().int().nonnegative(),
  postFilterReceipts: z.array(CompiledAstQueryPostFilterReceiptV1Schema),
  topK: AstGrepStructuralTopKResultV1Schema,
  structuralMatcherExecutedByAstGrep: z.literal(true),
  userTextEmbeddedInMatcher: z.literal(false),
  treeSitterCanonicalJoinStillRequired: z.literal(true),
  compilerSemanticEnrichmentStillRequired: z.literal(true),
  logicalLane: z.literal('ast'),
  logicalLaneVoteAdded: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type ExecuteCompiledAstQueryResultV1 = z.infer<typeof ExecuteCompiledAstQueryResultV1Schema>;

function applyPostFilters(input: {
  node: SgNode;
  candidate: AstGrepStructuralCandidateV1;
  compiled: AstQueryRuleCompileResultV1;
}): CompiledAstQueryPostFilterReceiptV1 {
  const { node, candidate, compiled } = input;
  const post = compiled.postFilters;
  const exportedMatch = !post.requireExported || candidate.isExported;
  const asyncMatch = !post.requireAsync || candidate.isAsync;
  const arrowFunctionMatch = !post.requireArrowFunction || candidate.declarationForm === 'ARROW_FUNCTION';
  const symbolNameMatch = containsAllTokens(candidate.name, post.symbolNameTokens);
  const ancestorNameMatch = post.ancestorNameTokens.length === 0
    || ancestorNames(node).some((name) => containsAllTokens(name, post.ancestorNameTokens));
  const accepted = exportedMatch
    && asyncMatch
    && arrowFunctionMatch
    && symbolNameMatch
    && ancestorNameMatch;

  return CompiledAstQueryPostFilterReceiptV1Schema.parse({
    startByte: candidate.startByte,
    endByte: candidate.endByte,
    nodeKind: candidate.nodeKind,
    exportedMatch,
    asyncMatch,
    arrowFunctionMatch,
    symbolNameMatch,
    ancestorNameMatch,
    accepted,
  });
}

/**
 * Executes the bounded rule compiler against ast-grep while SgNode relations
 * are still live, applies deterministic post-filters, then delegates ordering
 * to the existing structural Top-K ranker.
 */
export async function executeCompiledAstQuery(
  value: ExecuteCompiledAstQueryInputV1,
): Promise<ExecuteCompiledAstQueryResultV1> {
  const input = ExecuteCompiledAstQueryInputV1Schema.parse(value);
  const compiled = compileAstQueryRule(input.compile);
  const extraction = input.extraction;
  const astGrep = await import('@ast-grep/napi');
  const parsed = await astGrep.parseAsync(detectRuntimeLang(extraction.language, astGrep), extraction.code);
  const root = parsed.root();

  // The compiler schema is deliberately narrower than ast-grep NapiConfig.
  // Cast only at this boundary; user text cannot populate arbitrary matcher
  // fields because the compiler's Zod schema has already rejected them.
  const nodes = root.findAll(compiled.napiConfig as Parameters<typeof root.findAll>[0]);
  const seen = new Set<string>();
  const candidates: AstGrepStructuralCandidateV1[] = [];
  const receipts: CompiledAstQueryPostFilterReceiptV1[] = [];

  for (const node of nodes) {
    const candidate = toCandidate(extraction, node);
    if (!candidate) continue;
    const identity = `${candidate.startByte}:${candidate.endByte}:${candidate.nodeKind}:${candidate.entityKind}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    const receipt = applyPostFilters({ node, candidate, compiled });
    receipts.push(receipt);
    if (receipt.accepted) candidates.push(candidate);
  }

  const topK: AstGrepStructuralTopKResultV1 = rankAstGrepStructuralTopK({
    candidates,
    query: compiled.topKQuery,
    producerRevision: input.producerRevision,
  });

  const postFilterAcceptedCount = receipts.filter((receipt) => receipt.accepted).length;
  return ExecuteCompiledAstQueryResultV1Schema.parse({
    schema: 'atlas.execute-compiled-ast-query-result.v1',
    compiled,
    structuralMatchCount: receipts.length,
    postFilterAcceptedCount,
    postFilterRejectedCount: receipts.length - postFilterAcceptedCount,
    postFilterReceipts: receipts.sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte),
    topK,
    structuralMatcherExecutedByAstGrep: true,
    userTextEmbeddedInMatcher: false,
    treeSitterCanonicalJoinStillRequired: true,
    compilerSemanticEnrichmentStillRequired: true,
    logicalLane: 'ast',
    logicalLaneVoteAdded: false,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}
