import { createHash } from 'node:crypto';
import { z } from 'zod';

export const StructuralQueryPlanV1Schema = z.object({
  schema: z.literal('atlas.structural-query-plan.v1'),
  query: z.string().min(1),
  queryDigest: z.string().regex(/^[a-f0-9]{64}$/),
  enabled: z.boolean(),
  literalTerms: z.array(z.string().min(1)),
  nodeKinds: z.array(z.string().min(1)),
  structuralPredicates: z.array(z.enum([
    'DECLARES', 'CALLS', 'IMPORTS', 'EXPORTS', 'EXTENDS', 'IMPLEMENTS',
    'REFERENCES', 'INSIDE', 'HAS', 'FOLLOWS', 'PRECEDES',
  ])),
  astGrepMode: z.enum(['cst', 'ast', 'signature']),
  targetSymbols: z.array(z.string().min(1)),
  canonicalAuthority: z.literal(false),
  executable: z.literal(false),
}).strict();

export type StructuralQueryPlanV1 = z.infer<typeof StructuralQueryPlanV1Schema>;

const STRUCTURAL_TERMS = /\b(where|find|show|which|calls?|called|imports?|imported|exports?|extends?|implements?|references?|inside|within|declares?|definition|function|method|class|type|interface|parameter|return|throws?|checksum|revision|symbol)\b/i;
const NODE_KIND_HINTS = [
  ['function', 'function_declaration'], ['method', 'method_definition'], ['class', 'class_declaration'],
  ['interface', 'interface_declaration'], ['type', 'type_alias_declaration'], ['import', 'import_statement'],
  ['export', 'export_statement'], ['call', 'call_expression'], ['parameter', 'required_parameter'],
] as const;

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function words(query: string): string[] {
  return [...new Set(query.split(/[^A-Za-z0-9_:$.-]+/).map((value) => value.trim()).filter((value) => value.length >= 2))].sort();
}

export function classifyStructuralQueryV1(queryInput: string): StructuralQueryPlanV1 {
  const query = queryInput.trim();
  if (!query) throw new Error('STRUCTURAL_QUERY_EMPTY');
  const lower = query.toLowerCase();
  const structuralPredicates: StructuralQueryPlanV1['structuralPredicates'] = [];
  const add = (predicate: StructuralQueryPlanV1['structuralPredicates'][number]) => {
    if (!structuralPredicates.includes(predicate)) structuralPredicates.push(predicate);
  };
  if (/\bcall|called|invoke|invokes\b/.test(lower)) add('CALLS');
  if (/\bimport|imports|imported\b/.test(lower)) add('IMPORTS');
  if (/\bexport|exports|exported\b/.test(lower)) add('EXPORTS');
  if (/\bextend|extends|inherit\b/.test(lower)) add('EXTENDS');
  if (/\bimplement|implements\b/.test(lower)) add('IMPLEMENTS');
  if (/\brefer|references|used by|use of\b/.test(lower)) add('REFERENCES');
  if (/\binside|within|under\b/.test(lower)) add('INSIDE');
  if (/\bdefine|declares?|definition\b/.test(lower)) add('DECLARES');
  if (/\b(has|containing|contains)\b/.test(lower)) add('HAS');
  const nodeKinds = NODE_KIND_HINTS.filter(([hint]) => lower.includes(hint)).map(([, kind]) => kind);
  const literalTerms = words(query);
  const targetSymbols = literalTerms.filter((term) => /[A-Z_$]|[_:$.-]/.test(term) && !/^(where|which|show|find)$/i.test(term));
  const enabled = STRUCTURAL_TERMS.test(query) || structuralPredicates.length > 0 || nodeKinds.length > 0;
  const astGrepMode = structuralPredicates.length > 0 || nodeKinds.length > 0 ? 'ast' : 'signature';
  return StructuralQueryPlanV1Schema.parse({
    schema: 'atlas.structural-query-plan.v1', query, queryDigest: digest(query), enabled,
    literalTerms, nodeKinds, structuralPredicates, astGrepMode, targetSymbols,
    canonicalAuthority: false, executable: false,
  });
}
