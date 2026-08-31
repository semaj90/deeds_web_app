import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

/**
 * AtlasOntologyKernelSchemaV1 — the `S` half of OaK's `K = (S, F)`.
 *
 * This is a compiled, checksum-sealed VIEW over identity/relation shapes
 * that already exist in this repo (`OntologyLinkedTupleV1`,
 * `HyperedgeV1`) — it does not define new entity/relation semantics of its
 * own. `entityTypes`/`relationTypes` here are the bounded vocabulary an
 * agent operating under this kernel is allowed to name; anything not
 * listed cannot be referenced by a kernel-bound function.
 *
 * OWL projection + HermiT formal verification (OAK-03) is NOT implemented
 * here — that requires a real external OWL reasoner dependency decision
 * this repo hasn't made yet. `verificationStatus` starts at `UNVERIFIED`
 * and stays there until that integration exists; do not set it to
 * `VERIFIED` by hand.
 */
export const kernelEntityTypeSchema = z.object({
  entityTypeId: id,
  label: z.string().min(1),
  sourceContract: z.enum(['ontology-linked-tuple-v1', 'hyperedge-contract', 'symbol-registry', 'other']),
  identityFields: z.array(z.string().min(1)).min(1),
}).strict();

export const kernelRelationTypeSchema = z.object({
  relationTypeId: id,
  label: z.string().min(1),
  arity: z.union([z.literal('binary'), z.literal('n-ary')]),
  sourceContract: z.enum(['ontology-linked-tuple-v1', 'hyperedge-contract', 'other']),
  participantRoles: z.array(z.string().min(1)).min(1),
}).strict();

export const kernelConstraintSchema = z.object({
  constraintId: id,
  kind: z.enum(['DISJOINT_CLASSES', 'DOMAIN_RANGE', 'PROPERTY_RESTRICTION', 'CARDINALITY']),
  appliesTo: z.array(id).min(1),
  description: z.string().min(1),
}).strict();

export const atlasOntologyKernelSchemaV1Schema = z.object({
  schema: z.literal('atlas.ontology-kernel-schema.v1').default('atlas.ontology-kernel-schema.v1'),
  schemaId: id,
  taskClass: z.string().min(1),
  entityTypes: z.array(kernelEntityTypeSchema).min(1),
  relationTypes: z.array(kernelRelationTypeSchema),
  constraints: z.array(kernelConstraintSchema),
  identityRules: z.array(z.string().min(1)),
  verificationStatus: z.enum(['UNVERIFIED', 'VERIFIED', 'REJECTED']).default('UNVERIFIED'),
  schemaChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  producerRevision: revision,
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const entityIds = new Set(value.entityTypes.map((e) => e.entityTypeId));
  for (const relation of value.relationTypes) {
    if (relation.relationTypeId && entityIds.size === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relationTypes'], message: 'Cannot declare relation types with zero entity types' });
    }
  }
  for (const constraint of value.constraints) {
    for (const ref of constraint.appliesTo) {
      if (!entityIds.has(ref) && !value.relationTypes.some((r) => r.relationTypeId === ref)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['constraints'], message: `Constraint ${constraint.constraintId} references undeclared type ${ref}` });
      }
    }
  }
  if (value.verificationStatus === 'VERIFIED') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['verificationStatus'], message: 'OAK-03 (OWL/HermiT verification) is not implemented — VERIFIED cannot be set by hand' });
  }
});

export type AtlasOntologyKernelSchemaV1 = z.infer<typeof atlasOntologyKernelSchemaV1Schema>;

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

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function buildAtlasOntologyKernelSchemaV1(input: {
  schemaId: string;
  taskClass: string;
  entityTypes: z.infer<typeof kernelEntityTypeSchema>[];
  relationTypes?: z.infer<typeof kernelRelationTypeSchema>[];
  constraints?: z.infer<typeof kernelConstraintSchema>[];
  identityRules?: string[];
  producerRevision: string;
}): AtlasOntologyKernelSchemaV1 {
  const body = {
    schema: 'atlas.ontology-kernel-schema.v1' as const,
    schemaId: input.schemaId,
    taskClass: input.taskClass,
    entityTypes: input.entityTypes,
    relationTypes: input.relationTypes ?? [],
    constraints: input.constraints ?? [],
    identityRules: input.identityRules ?? [],
    verificationStatus: 'UNVERIFIED' as const,
    producerRevision: input.producerRevision,
    canonicalAuthority: false as const,
  };
  return atlasOntologyKernelSchemaV1Schema.parse({ ...body, schemaChecksum: sha256(body) });
}
