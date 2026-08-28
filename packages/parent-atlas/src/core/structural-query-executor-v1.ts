import { createHash } from 'node:crypto';
import { z } from 'zod';
import { astGrepObservationSchema, type AstGrepObservationV1 } from './structural-symbol.js';
import { StructuralQueryPlanV1Schema, type StructuralQueryPlanV1 } from './structural-query-plan-v1.js';

const predicateKinds: Record<StructuralQueryPlanV1['structuralPredicates'][number], string[]> = {
  DECLARES: ['declare', 'declaration', 'definition', 'function_declaration', 'method_definition'],
  CALLS: ['call', 'call_expression', 'invocation'],
  IMPORTS: ['import', 'import_statement'],
  EXPORTS: ['export', 'export_statement'],
  EXTENDS: ['extend', 'extends', 'heritage'],
  IMPLEMENTS: ['implement', 'implements'],
  REFERENCES: ['reference', 'references', 'identifier', 'type_reference'],
  INSIDE: ['inside', 'nested', 'member'],
  HAS: ['has', 'contains', 'containing'],
  FOLLOWS: ['follows', 'following'],
  PRECEDES: ['precedes', 'preceding'],
};

export const structuralQueryMatchV1Schema = z.object({
  observationId: z.string().min(1),
  ruleId: z.string().min(1),
  observationKind: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  byteStart: z.number().int().nonnegative(),
  byteEnd: z.number().int().positive(),
  captures: z.record(z.string(), z.string()),
  confidence: z.number().finite().min(0).max(1),
  matchReason: z.array(z.enum(['NODE_KIND', 'PREDICATE', 'TARGET_SYMBOL', 'LITERAL_TERM'])).min(1),
  rank: z.number().int().positive(),
  candidateOrdinal: z.null(),
}).strict();

export const structuralQueryResultV1Schema = z.object({
  schema: z.literal('atlas.structural-query-result.v1'),
  queryDigest: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  extractorRevision: z.string().min(1),
  matches: z.array(structuralQueryMatchV1Schema),
  resultChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
  promotionEligible: z.literal(false),
  executable: z.literal(false),
}).strict();

export type StructuralQueryMatchV1 = z.infer<typeof structuralQueryMatchV1Schema>;
export type StructuralQueryResultV1 = z.infer<typeof structuralQueryResultV1Schema>;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function hasTerm(observation: AstGrepObservationV1, term: string): boolean {
  const needle = normalized(term);
  return [observation.observation_kind, observation.rule_id, ...Object.values(observation.captures)]
    .some((value) => normalized(value).includes(needle));
}

function matchesObservation(plan: StructuralQueryPlanV1, observation: AstGrepObservationV1): StructuralQueryMatchV1['matchReason'] {
  const reasons: StructuralQueryMatchV1['matchReason'] = [];
  if (plan.nodeKinds.some((kind) => normalized(kind) === normalized(observation.observation_kind))) reasons.push('NODE_KIND');
  if (plan.structuralPredicates.some((predicate) => predicateKinds[predicate].some((kind) => hasTerm(observation, kind)))) reasons.push('PREDICATE');
  if (plan.targetSymbols.some((symbol) => hasTerm(observation, symbol))) reasons.push('TARGET_SYMBOL');
  if (plan.literalTerms.some((term) => hasTerm(observation, term))) reasons.push('LITERAL_TERM');
  return reasons;
}

/**
 * Queries already-grounded ast-grep observations. It does not invoke a parser,
 * resolve Atlas identity, write a projection, or assign CandidateOrdinal.
 */
export function executeStructuralQueryV1(input: {
  plan: StructuralQueryPlanV1;
  observations: readonly AstGrepObservationV1[];
}): StructuralQueryResultV1 {
  const plan = StructuralQueryPlanV1Schema.parse(input.plan);
  const observations = input.observations.map((value) => astGrepObservationSchema.parse(value));
  const sourceRefs = [...new Set(observations.map((value) => value.source_ref))];
  const revisions = [...new Set(observations.map((value) => value.source_revision))];
  const extractorRevisions = [...new Set(observations.map((value) => value.extractor_revision))];
  if (sourceRefs.length > 1 || revisions.length > 1 || extractorRevisions.length > 1) throw new Error('STRUCTURAL_QUERY_MIXED_OBSERVATION_COORDINATES');
  const matches = plan.enabled ? observations.flatMap((observation) => {
    const matchReason = matchesObservation(plan, observation);
    if (matchReason.length === 0) return [];
    return [{
      observationId: observation.observation_id,
      ruleId: observation.rule_id,
      observationKind: observation.observation_kind,
      sourceRef: observation.source_ref,
      sourceRevision: observation.source_revision,
      byteStart: observation.byte_start,
      byteEnd: observation.byte_end,
      captures: observation.captures,
      confidence: observation.confidence,
      matchReason,
      rank: 0,
      candidateOrdinal: null,
    } satisfies StructuralQueryMatchV1];
  }).sort((a, b) => a.byteStart - b.byteStart || a.byteEnd - b.byteEnd || a.observationId.localeCompare(b.observationId))
    .map((match, index) => ({ ...match, rank: index + 1 })) : [];
  const result = {
    schema: 'atlas.structural-query-result.v1' as const,
    queryDigest: plan.queryDigest,
    sourceRef: sourceRefs[0] ?? 'none',
    sourceRevision: revisions[0] ?? 'none',
    extractorRevision: extractorRevisions[0] ?? 'none',
    matches,
    resultChecksum: digest(matches),
    canonicalAuthority: false as const,
    promotionEligible: false as const,
    executable: false as const,
  };
  return structuralQueryResultV1Schema.parse(result);
}
