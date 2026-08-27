import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FeatureRelationshipV1 } from './feature-intelligence.js';

export const relationshipAuthoritySchema = z.enum(['KAG_TAXONOMY', 'FEATURE_INTELLIGENCE']);

export const relationshipKernelParticipantSchema = z.object({
  canonicalId: z.string().min(1),
  role: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  entityType: z.string().min(1).nullable(),
  entityRevision: z.string().min(1).nullable(),
  sourceRef: z.string().min(1).nullable(),
}).strict();

export const relationshipKernelSchema = z.object({
  schema: z.literal('atlas.relationship-kernel.v1'),
  relationshipId: z.string().min(1),
  authority: relationshipAuthoritySchema,
  relationType: z.string().min(1),
  participants: z.array(relationshipKernelParticipantSchema).min(1),
  evidenceRefs: z.array(z.string().min(1)),
  sourceRef: z.string().min(1).nullable(),
  sourceRevision: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1).nullable(),
  graphRevision: z.string().min(1).nullable(),
  relationshipRevision: z.string().min(1).nullable(),
  producerRevision: z.string().min(1),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export type RelationshipAuthority = z.infer<typeof relationshipAuthoritySchema>;
export type RelationshipKernelParticipantV1 = z.infer<typeof relationshipKernelParticipantSchema>;
export type RelationshipKernelV1 = z.infer<typeof relationshipKernelSchema>;

/**
 * KAG_TAXONOMY is closed-vocabulary: every predicate it may ever mint is a
 * literal string authored by a human in entity-concept-taxonomy-v1.ts. Update
 * this list only in lockstep with a new create*V1 producer in that file.
 *
 * FEATURE_INTELLIGENCE is deliberately NOT given an equivalent closed list —
 * ontology-hyperedge-synthesis.ts derives relation_type from open-vocabulary
 * NLP-extracted predicate text (tuple.predicate), so it cannot be enumerated.
 * The only enforceable rule for an open vocabulary is that it must never mint
 * one of KAG_TAXONOMY's reserved names.
 */
export const KAG_TAXONOMY_RELATION_TYPES = ['ENTITY_CLASSIFIED_AS', 'CONCEPT_BROADER_THAN', 'CONCEPT_PART_OF'] as const;

/**
 * REL-OWNER-07: reject cross-domain relation-type collisions before a kernel
 * is built. Two independent producers must never mint the same relation-type
 * name meaning two different things across domains.
 */
export function assertRelationTypeNamespace(relationType: string, authority: RelationshipAuthority): void {
  const isReserved = (KAG_TAXONOMY_RELATION_TYPES as readonly string[]).includes(relationType);
  if (authority === 'KAG_TAXONOMY' && !isReserved) {
    throw new Error(
      `RELATIONSHIP_KERNEL_UNREGISTERED_KAG_TAXONOMY_RELATION_TYPE:${relationType}`,
    );
  }
  if (authority === 'FEATURE_INTELLIGENCE' && isReserved) {
    throw new Error(
      `RELATIONSHIP_KERNEL_RELATION_TYPE_COLLISION:${relationType}:reserved_for_KAG_TAXONOMY`,
    );
  }
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function canonicalizeParticipants(
  participants: readonly RelationshipKernelParticipantV1[],
): RelationshipKernelParticipantV1[] {
  return participants
    .map((participant) => relationshipKernelParticipantSchema.parse({
      ...participant,
      canonicalId: participant.canonicalId.trim(),
      role: participant.role.trim(),
      entityType: participant.entityType?.trim() || null,
      entityRevision: participant.entityRevision?.trim() || null,
      sourceRef: participant.sourceRef?.trim() || null,
    }))
    .sort((left, right) =>
      left.role.localeCompare(right.role) ||
      left.canonicalId.localeCompare(right.canonicalId) ||
      (left.entityType ?? '').localeCompare(right.entityType ?? ''),
    )
    .map((participant, ordinal) => ({ ...participant, ordinal }));
}

export interface RelationshipKernelBuildInput {
  relationshipId: string;
  authority: RelationshipAuthority;
  relationType: string;
  participants: readonly RelationshipKernelParticipantV1[];
  evidenceRefs?: readonly string[];
  sourceRef?: string | null;
  sourceRevision?: string | null;
  workspaceRevision?: string | null;
  graphRevision?: string | null;
  relationshipRevision?: string | null;
  producerRevision: string;
}

export function buildRelationshipKernel(input: RelationshipKernelBuildInput): RelationshipKernelV1 {
  assertRelationTypeNamespace(input.relationType.trim(), input.authority);
  const payload = {
    schema: 'atlas.relationship-kernel.v1' as const,
    relationshipId: input.relationshipId.trim(),
    authority: input.authority,
    relationType: input.relationType.trim(),
    participants: canonicalizeParticipants(input.participants),
    evidenceRefs: stableUnique(input.evidenceRefs ?? []),
    sourceRef: input.sourceRef?.trim() || null,
    sourceRevision: input.sourceRevision?.trim() || null,
    workspaceRevision: input.workspaceRevision?.trim() || null,
    graphRevision: input.graphRevision?.trim() || null,
    relationshipRevision: input.relationshipRevision?.trim() || null,
    producerRevision: input.producerRevision.trim(),
  };
  return relationshipKernelSchema.parse({ ...payload, checksum: checksum(payload) });
}

/** Compile Feature Intelligence semantics without making the kernel writable. */
export function featureRelationshipToKernel(
  relationship: FeatureRelationshipV1,
): RelationshipKernelV1 {
  return buildRelationshipKernel({
    relationshipId: relationship.relationship_id,
    authority: 'FEATURE_INTELLIGENCE',
    relationType: relationship.relationship_type,
    participants: relationship.participants.map((participant) => ({
      canonicalId: participant.entity_id,
      role: participant.role,
      ordinal: 0,
      entityType: participant.entity_type,
      entityRevision: participant.entity_revision ?? null,
      sourceRef: participant.source_ref ?? relationship.source_ref,
    })),
    evidenceRefs: relationship.evidence_refs,
    sourceRef: relationship.source_ref,
    sourceRevision: relationship.source_revision,
    workspaceRevision: typeof relationship.metadata.workspace_revision === 'string'
      ? relationship.metadata.workspace_revision
      : null,
    graphRevision: typeof relationship.metadata.graph_revision === 'string'
      ? relationship.metadata.graph_revision
      : null,
    relationshipRevision: relationship.relationship_revision,
    producerRevision: relationship.producer_revision,
  });
}
