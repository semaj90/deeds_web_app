import { createHash } from 'node:crypto';
import { z } from 'zod';
import { classifyStructuralQueryV1, type StructuralQueryPlanV1 } from './structural-query-plan-v1.js';

export const keywordEvidenceV1Schema = z.object({
  schema: z.literal('atlas.keyword-evidence.v1'),
  query: z.string().min(1),
  queryDigest: z.string().regex(/^[a-f0-9]{64}$/),
  exactTerms: z.array(z.string().min(1)).max(50),
  identifierTerms: z.array(z.string().min(1)).max(50),
  pathTerms: z.array(z.string().min(1)).max(20),
  rgQuery: z.object({ mode: z.literal('fixed-strings'), terms: z.array(z.string().min(1)).max(50) }).strict(),
  astGrepQuery: z.object({
    mode: z.enum(['cst', 'ast', 'signature']),
    plan: z.custom<StructuralQueryPlanV1>(),
  }).strict(),
  evidenceOnly: z.literal(true),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type KeywordEvidenceV1 = z.infer<typeof keywordEvidenceV1Schema>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function unique(values: string[], max: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort().slice(0, max);
}

/** Deterministically plans bounded exact and structural evidence queries; it never executes them. */
export function planKeywordEvidenceV1(queryInput: string): KeywordEvidenceV1 {
  const query = queryInput.trim();
  if (!query) throw new Error('KEYWORD_EVIDENCE_QUERY_EMPTY');

  const paths = query.match(/(?:[A-Za-z0-9_.-]+[\\/])+[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9]{1,8})?/g) ?? [];
  const tokens = query.match(/[\p{L}\p{N}_$.-]+/gu) ?? [];
  const exactTerms = unique(tokens.filter((token) => token.length > 1), 50);
  const identifierTerms = unique(tokens.filter((token) => /[A-Z_$]/.test(token) || /[_$.-]/.test(token)), 50);
  const pathTerms = unique(paths, 20);
  const astGrepPlan = classifyStructuralQueryV1(query);

  return keywordEvidenceV1Schema.parse({
    schema: 'atlas.keyword-evidence.v1',
    query,
    queryDigest: sha256(query),
    exactTerms,
    identifierTerms,
    pathTerms,
    rgQuery: { mode: 'fixed-strings', terms: exactTerms },
    astGrepQuery: { mode: astGrepPlan.astGrepMode, plan: astGrepPlan },
    evidenceOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
