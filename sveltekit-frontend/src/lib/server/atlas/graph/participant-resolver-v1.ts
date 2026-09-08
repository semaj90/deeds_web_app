import { z } from 'zod';
import { compareUtf8 } from '../features/canonical-candidate-v1.js';

export const ParticipantResolutionStatusV1Schema = z.enum([
  'RESOLVED',
  'UNRESOLVED',
  'AMBIGUOUS',
  'REJECTED',
]);

export const CanonicalParticipantOwnerV1Schema = z.object({
  canonicalId: z.string().min(1),
  entityType: z.string().min(1),
  entityRevision: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
}).strict();

export const ParticipantObservationV1Schema = z.object({
  field: z.string().min(1),
  role: z.string().min(1),
  entityType: z.string().min(1),
  canonicalId: z.string().min(1).nullable().optional(),
  entityRevision: z.string().min(1).nullable().optional(),
  sourceRef: z.string().min(1).nullable().optional(),
  evidenceRefs: z.array(z.string().min(1)),
  literalValue: z.string().nullable().optional(),
}).strict();

export type ParticipantResolutionStatusV1 = z.infer<typeof ParticipantResolutionStatusV1Schema>;
export type CanonicalParticipantOwnerV1 = z.infer<typeof CanonicalParticipantOwnerV1Schema>;
export type ParticipantObservationV1 = z.infer<typeof ParticipantObservationV1Schema>;

export const ParticipantResolutionV1Schema = z.object({
  field: z.string().min(1),
  role: z.string().min(1),
  status: ParticipantResolutionStatusV1Schema,
  entityType: z.string().min(1),
  canonicalId: z.string().min(1).optional(),
  entityRevision: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
  evidenceRefs: z.array(z.string().min(1)),
  literalValue: z.string().nullable().optional(),
  reasonCode: z.string().min(1),
}).strict();

export type ParticipantResolutionV1 = z.infer<typeof ParticipantResolutionV1Schema>;

export const ParticipantResolutionBatchV1Schema = z.object({
  status: ParticipantResolutionStatusV1Schema,
  participants: z.array(z.object({
    canonicalId: z.string().min(1),
    role: z.string().min(1),
    entityType: z.string().min(1),
    entityRevision: z.string().min(1).optional(),
    sourceRef: z.string().min(1).optional(),
  }).strict()),
  resolutions: z.array(ParticipantResolutionV1Schema),
  unresolvedFields: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
}).strict();

export type ParticipantResolutionBatchV1 = z.infer<typeof ParticipantResolutionBatchV1Schema>;

function normalizeEvidenceRefs(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(compareUtf8);
}

function ownerMatchesObservation(
  owner: CanonicalParticipantOwnerV1,
  observation: ParticipantObservationV1,
): boolean {
  return owner.entityType === observation.entityType
    && (observation.entityRevision == null || owner.entityRevision === observation.entityRevision)
    && (observation.sourceRef == null || owner.sourceRef === observation.sourceRef);
}

/**
 * Resolves an observed participant only through an existing canonical owner.
 * Literal values are deliberately returned as evidence, never converted into
 * canonical IDs. This is a pure admission-preparation function: it performs
 * no registry lookup and no database or graph write.
 */
export function resolveParticipantObservationV1(
  input: ParticipantObservationV1,
  owners: readonly CanonicalParticipantOwnerV1[],
): ParticipantResolutionV1 {
  const observation = ParticipantObservationV1Schema.parse(input);
  const evidenceRefs = normalizeEvidenceRefs(observation.evidenceRefs);
  const base = {
    field: observation.field,
    role: observation.role,
    entityType: observation.entityType,
    evidenceRefs,
    ...(observation.literalValue !== undefined ? { literalValue: observation.literalValue } : {}),
  };

  if (!observation.canonicalId) {
    return ParticipantResolutionV1Schema.parse({
      ...base,
      status: 'UNRESOLVED',
      reasonCode: 'CANONICAL_ID_NOT_SUPPLIED',
    });
  }

  const matchingOwners = owners
    .map((owner) => CanonicalParticipantOwnerV1Schema.parse(owner))
    .filter((owner) => owner.canonicalId === observation.canonicalId);

  if (matchingOwners.length === 0) {
    return ParticipantResolutionV1Schema.parse({
      ...base,
      status: 'REJECTED',
      canonicalId: observation.canonicalId,
      reasonCode: 'CANONICAL_OWNER_NOT_FOUND',
    });
  }

  if (matchingOwners.length === 1 && !ownerMatchesObservation(matchingOwners[0], observation)) {
    return ParticipantResolutionV1Schema.parse({
      ...base,
      status: 'REJECTED',
      canonicalId: observation.canonicalId,
      reasonCode: 'CANONICAL_OWNER_ATTRIBUTES_MISMATCH',
    });
  }

  const compatibleOwners = matchingOwners.filter((owner) => ownerMatchesObservation(owner, observation));
  if (matchingOwners.length > 1 || compatibleOwners.length !== 1) {
    return ParticipantResolutionV1Schema.parse({
      ...base,
      status: 'AMBIGUOUS',
      canonicalId: observation.canonicalId,
      reasonCode: matchingOwners.length > 1
        ? 'CANONICAL_OWNER_MULTIPLE'
        : 'CANONICAL_OWNER_ATTRIBUTES_AMBIGUOUS',
    });
  }

  const owner = compatibleOwners[0];

  return ParticipantResolutionV1Schema.parse({
    ...base,
    status: 'RESOLVED',
    canonicalId: owner.canonicalId,
    ...(owner.entityRevision !== undefined ? { entityRevision: owner.entityRevision } : {}),
    ...(owner.sourceRef !== undefined ? { sourceRef: owner.sourceRef } : {}),
    reasonCode: 'CANONICAL_OWNER_CONFIRMED',
  });
}

/** Returns a closed result suitable for the proposal layer; never fabricates a participant. */
export function resolveParticipantObservationsV1(
  inputs: readonly ParticipantObservationV1[],
  owners: readonly CanonicalParticipantOwnerV1[],
): ParticipantResolutionBatchV1 {
  const resolutions = inputs.map((input) => resolveParticipantObservationV1(input, owners));
  const resolved = resolutions.filter((resolution) => resolution.status === 'RESOLVED');
  const unresolvedFields = resolutions
    .filter((resolution) => resolution.status !== 'RESOLVED')
    .map((resolution) => resolution.field)
    .sort(compareUtf8);
  const evidenceRefs = normalizeEvidenceRefs(resolutions.flatMap((resolution) => resolution.evidenceRefs));

  const status: ParticipantResolutionStatusV1 = resolutions.every((resolution) => resolution.status === 'RESOLVED')
    ? 'RESOLVED'
    : resolutions.some((resolution) => resolution.status === 'REJECTED')
      ? 'REJECTED'
      : resolutions.some((resolution) => resolution.status === 'AMBIGUOUS')
        ? 'AMBIGUOUS'
        : 'UNRESOLVED';

  return ParticipantResolutionBatchV1Schema.parse({
    status,
    participants: status === 'RESOLVED'
      ? resolved.map((resolution) => ({
        canonicalId: resolution.canonicalId!,
        role: resolution.role,
        entityType: resolution.entityType,
        ...(resolution.entityRevision !== undefined ? { entityRevision: resolution.entityRevision } : {}),
        ...(resolution.sourceRef !== undefined ? { sourceRef: resolution.sourceRef } : {}),
      }))
      : [],
    resolutions,
    unresolvedFields,
    evidenceRefs,
  });
}
