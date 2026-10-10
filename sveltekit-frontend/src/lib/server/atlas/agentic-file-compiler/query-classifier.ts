import { sha256Stable } from './contracts.js';

export type QueryOperation = 'ANSWER' | 'INSPECT' | 'FILE_MUTATION' | 'VALIDATE' | 'INDEX' | 'WORKFLOW';
export type MutationKind = 'CREATE' | 'PATCH' | 'RENAME' | 'DELETE';

export interface QueryClassificationV1 {
  schema: 'atlas.query-classification.v1';
  requestId: string;
  rawQuery: string;
  operation: QueryOperation;
  mutationKind?: MutationKind | null;
  domains: string[];
  artifactKinds: string[];
  targetHints: string[];
  symbols: string[];
  retrievalNeeds: { lexical: boolean; ast: boolean; semantic: boolean; graph: boolean };
  exactPromotionRequired: boolean;
  requiresMutation: boolean;
  requiresValidation: boolean;
  producerRevision: string;
  checksum: string;
}

const FILE_HINT = /(?:^|\s)([\w./\\-]+\.(?:ts|tsx|js|mjs|mts|svelte|sql|okf|json|yaml|yml|py|rs|go|cu|cuh))(?:\s|$)/gi;
const SYMBOL_HINT = /(?:method|function|class|type|interface|variable|symbol)s?\s+[`"']?([A-Za-z_$][\w$]*)/gi;

function uniq(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }

export function classifyAtlasQuery(input: { requestId: string; query: string; producerRevision?: string }): QueryClassificationV1 {
  const rawQuery = input.query.trim();
  if (!rawQuery) throw new Error('query must not be empty');
  const lower = rawQuery.toLowerCase();
  const create = /\b(create|add|new file|scaffold)\b/.test(lower);
  const remove = /\b(delete|remove file)\b/.test(lower);
  const rename = /\brename|move file\b/.test(lower);
  const patch = /\b(update|patch|edit|modify|fix|implement)\b/.test(lower);
  const requiresMutation = create || remove || rename || patch;
  const operation: QueryOperation = requiresMutation ? 'FILE_MUTATION' : /\bvalidate|test|check\b/.test(lower) ? 'VALIDATE' : /\bworkflow|dag\b/.test(lower) ? 'WORKFLOW' : /\bindex|reindex\b/.test(lower) ? 'INDEX' : 'INSPECT';
  const mutationKind: MutationKind | null = create ? 'CREATE' : remove ? 'DELETE' : rename ? 'RENAME' : patch ? 'PATCH' : null;
  const codeLookup = /\b(code|source|file|function|method|class|symbol|implementation|assembler|caller|callee)\b/.test(lower);
  const crossComponentRelation = /\b(connect(?:s|ed|ing)?|call(?:s|ed|ing)?|invok(?:e|es|ed|ing)|integrat(?:e|es|ed|ion)|handoff|relationship|between)\b/.test(lower);
  const targetHints = uniq([...rawQuery.matchAll(FILE_HINT)].map((m) => m[1]!.replaceAll('\\', '/')));
  const symbols = uniq([...rawQuery.matchAll(SYMBOL_HINT)].map((m) => m[1]!));
  const artifactKinds = uniq(targetHints.map((p) => p.endsWith('.sql') ? 'migration_script' : p.endsWith('.okf') ? 'okf_schema' : /\.(ts|tsx|js|mjs|mts|svelte)$/.test(p) ? 'source_module' : 'UNKNOWN'));
  const domains = uniq([
    lower.includes('parent atlas') || lower.includes('atlas') ? 'parent-atlas' : '',
    /\b(cache|caching|redis|valkey|bitfrost)\b/.test(lower) ? 'cache' : '',
    /\b(agent|mcp|tools?)\b/.test(lower) ? 'agent' : '',
    /\b(ace|assembler)\b|\bcontext[\s_-]*manifest\b/.test(lower) ? 'ace' : '',
    lower.includes('retrieval') || lower.includes('cagra') || lower.includes('diskann') || lower.includes('qdrant') ? 'retrieval' : '',
    lower.includes('workflow') || lower.includes('mastra') || lower.includes('dag') ? 'workflow' : '',
  ]);
  const retrievalNeeds = {
    lexical: true,
    ast: requiresMutation || symbols.length > 0 || artifactKinds.includes('source_module') || codeLookup,
    semantic: !/^\s*(delete|rename)\s+[^\s]+\s*$/i.test(rawQuery),
    graph: requiresMutation || /\bdependency|caller|callee|relation|graph|n-ary\b/i.test(rawQuery) || (codeLookup && crossComponentRelation),
  };
  const base = {
    schema: 'atlas.query-classification.v1' as const, requestId: input.requestId, rawQuery, operation,
    mutationKind, domains, artifactKinds, targetHints, symbols, retrievalNeeds,
    exactPromotionRequired: requiresMutation, requiresMutation, requiresValidation: requiresMutation || operation === 'VALIDATE',
    producerRevision: input.producerRevision ?? 'query-classifier-v1',
  };
  return { ...base, checksum: sha256Stable(base) };
}
