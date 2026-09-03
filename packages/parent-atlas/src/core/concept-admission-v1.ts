import { createHash } from 'node:crypto';
import { z } from 'zod';

const revision = z.string().min(1);
const checksum = z.string().regex(/^(sha256:)?[a-f0-9]{64}$/);

/** Raw labels are observations from packets, traces, or grounded NLP. */
export const rawConceptLabelV1Schema = z.object({
  schema: z.literal('atlas.raw-concept-label.v1').default('atlas.raw-concept-label.v1'),
  normalizedLabel: z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
  rawLabels: z.array(z.string().min(1)).min(1),
  sources: z.array(z.enum(['atlas_packets.concept_ids', 'agent_traces.selected_concepts', 'langextract'])).min(1),
  occurrences: z.number().int().nonnegative(),
  sourceRevision: revision.nullable().default(null),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export const conceptAdmissionStatusV1 = ['ADMITTED', 'UNMAPPED', 'AMBIGUOUS', 'REVISION_UNPROVEN'] as const;

export const conceptAdmissionDecisionV1Schema = z.object({
  schema: z.literal('atlas.concept-admission-decision.v1').default('atlas.concept-admission-decision.v1'),
  normalizedLabel: z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
  classId: z.string().min(1).nullable(),
  status: z.enum(conceptAdmissionStatusV1),
  mappingRevision: revision,
  ontologyRevision: revision.nullable().default(null),
  sourceRevision: revision.nullable().default(null),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  canonicalAuthority: z.literal(false).default(false),
  writesPerformed: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'ADMITTED' && (!value.classId || !value.ontologyRevision || !value.sourceRevision)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'ADMITTED requires classId, ontologyRevision, and sourceRevision' });
  }
  if (value.status !== 'ADMITTED' && value.classId !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['classId'], message: 'Non-admitted decisions cannot carry a classId' });
  }
});

export const conceptIntegrationReceiptV1Schema = z.object({
  schema: z.literal('atlas.concept-integration-receipt.v1').default('atlas.concept-integration-receipt.v1'),
  mappingRevision: revision,
  ontologyRevision: revision.nullable().default(null),
  rawLabelCount: z.number().int().nonnegative(),
  admittedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  ambiguousCount: z.number().int().nonnegative(),
  decisionsChecksum: checksum,
  neo4jProjectionAllowed: z.literal(false).default(false),
  valkeyPopulationAllowed: z.literal(false).default(false),
  writesPerformed: z.literal(false).default(false),
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export type RawConceptLabelV1 = z.infer<typeof rawConceptLabelV1Schema>;
export type ConceptAdmissionDecisionV1 = z.infer<typeof conceptAdmissionDecisionV1Schema>;
export type ConceptIntegrationReceiptV1 = z.infer<typeof conceptIntegrationReceiptV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

export function checksumConceptDecisions(decisions: readonly ConceptAdmissionDecisionV1[]): string {
  const normalized = decisions.map((decision) => conceptAdmissionDecisionV1Schema.parse(decision)).sort((a, b) => a.normalizedLabel.localeCompare(b.normalizedLabel));
  return createHash('sha256').update(stableJson(normalized), 'utf8').digest('hex');
}

export function buildConceptIntegrationReceiptV1(input: {
  mappingRevision: string;
  ontologyRevision?: string | null;
  decisions: readonly ConceptAdmissionDecisionV1[];
}): ConceptIntegrationReceiptV1 {
  const decisions = input.decisions.map((decision) => conceptAdmissionDecisionV1Schema.parse(decision));
  return conceptIntegrationReceiptV1Schema.parse({
    schema: 'atlas.concept-integration-receipt.v1',
    mappingRevision: input.mappingRevision,
    ontologyRevision: input.ontologyRevision ?? null,
    rawLabelCount: decisions.length,
    admittedCount: decisions.filter((decision) => decision.status === 'ADMITTED').length,
    rejectedCount: decisions.filter((decision) => decision.status === 'UNMAPPED' || decision.status === 'REVISION_UNPROVEN').length,
    ambiguousCount: decisions.filter((decision) => decision.status === 'AMBIGUOUS').length,
    decisionsChecksum: checksumConceptDecisions(decisions),
    neo4jProjectionAllowed: false,
    valkeyPopulationAllowed: false,
    writesPerformed: false,
    canonicalAuthority: false,
  });
}
