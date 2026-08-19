import { z } from 'zod';
import {
  AstGrepStructuralCandidateV1Schema,
  type AstGrepStructuralCandidateV1,
} from './ast-grep-structural-topk.js';

/**
 * Gate between structural nominations and canonical Tree-sitter identity.
 *
 * A byte-span/name match is evidence of correspondence, not sufficient proof
 * that an upstream hash is the canonical treeNodeId. Pending/provisional IDs
 * therefore remain evidence only. Only a structural owner explicitly marking
 * an identity as canonical may populate candidate.treeNodeId.
 */

export const CanonicalStructuralIdentityStatusSchema = z.enum([
  'structural_pending_canonical_persistence',
  'canonical_structural_identity',
]);
export type CanonicalStructuralIdentityStatus = z.infer<typeof CanonicalStructuralIdentityStatusSchema>;

export const CanonicalStructuralObservationV1Schema = z.object({
  schema: z.literal('atlas.canonical-structural-observation.v1'),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  treeNodeId: z.string().min(1),
  symbolVersionId: z.string().min(1).nullable(),
  identityStatus: CanonicalStructuralIdentityStatusSchema,
  nodeKind: z.string().min(1),
  qualifiedSymbol: z.string(),
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  grammarRevision: z.string().min(1).nullable(),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.endByte < value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be >= startByte' });
  }
});
export type CanonicalStructuralObservationV1 = z.infer<typeof CanonicalStructuralObservationV1Schema>;

export const AstCanonicalCoordinateJoinStatusSchema = z.enum([
  'CANONICAL_JOINED',
  'PROVISIONAL_MATCH_ONLY',
  'NO_MATCH',
  'AMBIGUOUS_MATCH',
  'REVISION_MISMATCH',
]);
export type AstCanonicalCoordinateJoinStatus = z.infer<typeof AstCanonicalCoordinateJoinStatusSchema>;

export const AstCanonicalCoordinateJoinInputV1Schema = z.object({
  schema: z.literal('atlas.ast-canonical-coordinate-join-input.v1'),
  candidate: AstGrepStructuralCandidateV1Schema,
  observations: z.array(CanonicalStructuralObservationV1Schema),
  producerRevision: z.string().min(1),
}).strict();
export type AstCanonicalCoordinateJoinInputV1 = z.infer<typeof AstCanonicalCoordinateJoinInputV1Schema>;

export const AstCanonicalCoordinateJoinResultV1Schema = z.object({
  schema: z.literal('atlas.ast-canonical-coordinate-join-result.v1'),
  status: AstCanonicalCoordinateJoinStatusSchema,
  candidateBefore: AstGrepStructuralCandidateV1Schema,
  candidateAfter: AstGrepStructuralCandidateV1Schema,
  matchedObservation: CanonicalStructuralObservationV1Schema.nullable(),
  matchingObservationCount: z.number().int().nonnegative(),
  provisionalIdentityObserved: z.boolean(),
  canonicalIdentityPromoted: z.boolean(),
  spanMatchRequired: z.literal(true),
  sourceRevisionMatchRequired: z.literal(true),
  sourceRefMatchRequired: z.literal(true),
  canonicalOwnerAttestationRequired: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  logicalLane: z.literal('ast'),
  logicalLaneVoteAdded: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type AstCanonicalCoordinateJoinResultV1 = z.infer<typeof AstCanonicalCoordinateJoinResultV1Schema>;

function cleanSourceRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
}

function nodeKindsCompatible(candidateKind: string, observationKind: string): boolean {
  const c = candidateKind.toLowerCase();
  const o = observationKind.toLowerCase();
  if (c === o) return true;
  if (c.includes('function') && o.includes('function')) return true;
  if (c.includes('method') && o.includes('method')) return true;
  if (c.includes('class') && o.includes('class')) return true;
  if (c.includes('interface') && o.includes('interface')) return true;
  if (c.includes('type') && o.includes('type')) return true;
  if (c.includes('enum') && o.includes('enum')) return true;
  if (c.includes('variable') && (o.includes('variable') || o.includes('function'))) return true;
  return false;
}

function baseResult(input: AstCanonicalCoordinateJoinInputV1, values: {
  status: AstCanonicalCoordinateJoinStatus;
  candidateAfter: AstGrepStructuralCandidateV1;
  matchedObservation: CanonicalStructuralObservationV1 | null;
  matchingObservationCount: number;
  provisionalIdentityObserved: boolean;
  canonicalIdentityPromoted: boolean;
}): AstCanonicalCoordinateJoinResultV1 {
  return AstCanonicalCoordinateJoinResultV1Schema.parse({
    schema: 'atlas.ast-canonical-coordinate-join-result.v1',
    status: values.status,
    candidateBefore: input.candidate,
    candidateAfter: values.candidateAfter,
    matchedObservation: values.matchedObservation,
    matchingObservationCount: values.matchingObservationCount,
    provisionalIdentityObserved: values.provisionalIdentityObserved,
    canonicalIdentityPromoted: values.canonicalIdentityPromoted,
    spanMatchRequired: true,
    sourceRevisionMatchRequired: true,
    sourceRefMatchRequired: true,
    canonicalOwnerAttestationRequired: true,
    canonicalWritesAllowed: false,
    logicalLane: 'ast',
    logicalLaneVoteAdded: false,
    producerRevision: input.producerRevision,
  });
}

export function joinAstCandidateToCanonicalCoordinates(
  value: AstCanonicalCoordinateJoinInputV1,
): AstCanonicalCoordinateJoinResultV1 {
  const input = AstCanonicalCoordinateJoinInputV1Schema.parse(value);
  const candidate = input.candidate;
  const sameSource = input.observations.filter((observation) =>
    cleanSourceRef(observation.sourceRef) === cleanSourceRef(candidate.sourceRef)
    || cleanSourceRef(observation.sourceRef) === cleanSourceRef(candidate.filePath));

  if (sameSource.length > 0 && !sameSource.some((observation) => observation.sourceRevision === candidate.sourceRevision)) {
    return baseResult(input, {
      status: 'REVISION_MISMATCH',
      candidateAfter: candidate,
      matchedObservation: null,
      matchingObservationCount: 0,
      provisionalIdentityObserved: false,
      canonicalIdentityPromoted: false,
    });
  }

  const matches = sameSource.filter((observation) =>
    observation.sourceRevision === candidate.sourceRevision
    && observation.startByte === candidate.startByte
    && observation.endByte === candidate.endByte
    && nodeKindsCompatible(candidate.nodeKind, observation.nodeKind)
    && (!observation.qualifiedSymbol || observation.qualifiedSymbol === candidate.name));

  if (matches.length === 0) {
    return baseResult(input, {
      status: 'NO_MATCH',
      candidateAfter: candidate,
      matchedObservation: null,
      matchingObservationCount: 0,
      provisionalIdentityObserved: false,
      canonicalIdentityPromoted: false,
    });
  }

  if (matches.length > 1) {
    return baseResult(input, {
      status: 'AMBIGUOUS_MATCH',
      candidateAfter: candidate,
      matchedObservation: null,
      matchingObservationCount: matches.length,
      provisionalIdentityObserved: matches.some((row) => row.identityStatus === 'structural_pending_canonical_persistence'),
      canonicalIdentityPromoted: false,
    });
  }

  const match = matches[0]!;
  if (match.identityStatus !== 'canonical_structural_identity') {
    return baseResult(input, {
      status: 'PROVISIONAL_MATCH_ONLY',
      candidateAfter: candidate,
      matchedObservation: match,
      matchingObservationCount: 1,
      provisionalIdentityObserved: true,
      canonicalIdentityPromoted: false,
    });
  }

  const candidateAfter = AstGrepStructuralCandidateV1Schema.parse({
    ...candidate,
    treeNodeId: match.treeNodeId,
    symbolVersionId: match.symbolVersionId,
    requiresCanonicalTreeJoin: false,
  });
  return baseResult(input, {
    status: 'CANONICAL_JOINED',
    candidateAfter,
    matchedObservation: match,
    matchingObservationCount: 1,
    provisionalIdentityObserved: false,
    canonicalIdentityPromoted: true,
  });
}
