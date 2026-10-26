import type { OntologyLinkedTupleV1 } from '../contracts/ontology-linked-tuple-v1.js';
import {
  createNaryFactProposalV1,
  type NaryFactProposalV1,
} from './nary-fact-proposal-v1.js';
import {
  resolveParticipantObservationsV1,
  type CanonicalParticipantOwnerV1,
  type ParticipantResolutionBatchV1,
} from './participant-resolver-v1.js';
import {
  loadOkfPredicatePolicyV1,
  type FeaturePredicateDegreeV1,
  type FeaturePredicatePolicyResolutionV1,
} from './okf-predicate-policy-resolver-v1.js';

export interface OntologyTupleNaryProposalContextV1 {
  workspaceRevision: string;
  graphRevision: string;
  producerRevision: string;
  predicateResolution?: OntologyTuplePredicateResolutionV1;
}

export type OntologyTuplePredicateResolutionV1 =
  | {
    status: 'RESOLVED';
    predicate: string;
    registryDocumentSha256: string;
    registrySchemaSha256: string;
  }
  | {
    status: 'UNRESOLVED';
    reasonCode: string;
  };

function validSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export interface OntologyTupleNaryProposalResultV1 extends ParticipantResolutionBatchV1 {
  proposal: NaryFactProposalV1 | null;
  reasonCode?: string;
}

export interface OntologyTupleNaryPolicyProposalResultV1 extends OntologyTupleNaryProposalResultV1 {
  predicatePolicy: FeaturePredicatePolicyResolutionV1;
}

/** Converts only a current, verified, genuinely n-ary ontology tuple into a proposal. */
export function proposeOntologyLinkedTupleNaryFactV1(
  tuple: OntologyLinkedTupleV1,
  context: OntologyTupleNaryProposalContextV1,
  owners: readonly CanonicalParticipantOwnerV1[],
): OntologyTupleNaryProposalResultV1 {
  const predicateResolution = context.predicateResolution;
  if (!predicateResolution || predicateResolution.status !== 'RESOLVED') {
    return {
      status: 'REJECTED',
      participants: [],
      resolutions: [],
      unresolvedFields: [],
      evidenceRefs: tuple.evidenceRefs,
      proposal: null,
      reasonCode: predicateResolution?.status === 'UNRESOLVED'
        ? predicateResolution.reasonCode
        : 'ONTOLOGY_TUPLE_PREDICATE_POLICY_UNRESOLVED',
    };
  }
  if (!predicateResolution.predicate.trim()
    || !validSha256(predicateResolution.registryDocumentSha256)
    || !validSha256(predicateResolution.registrySchemaSha256)) {
    return {
      status: 'REJECTED',
      participants: [],
      resolutions: [],
      unresolvedFields: [],
      evidenceRefs: tuple.evidenceRefs,
      proposal: null,
      reasonCode: 'ONTOLOGY_TUPLE_PREDICATE_POLICY_INVALID',
    };
  }
  if (tuple.evidenceState !== 'ACTIVE_VERIFIED') {
    return { status: 'REJECTED', participants: [], resolutions: [], unresolvedFields: [], evidenceRefs: tuple.evidenceRefs, proposal: null, reasonCode: 'ONTOLOGY_TUPLE_NOT_ACTIVE_VERIFIED' };
  }
  if (!tuple.packetKey || !tuple.provenance.sourceRevision || !tuple.provenance.graphRevision) {
    return { status: 'REJECTED', participants: [], resolutions: [], unresolvedFields: [], evidenceRefs: tuple.evidenceRefs, proposal: null, reasonCode: 'ONTOLOGY_TUPLE_LINEAGE_INCOMPLETE' };
  }
  if (tuple.provenance.graphRevision !== context.graphRevision) {
    return { status: 'REJECTED', participants: [], resolutions: [], unresolvedFields: [], evidenceRefs: tuple.evidenceRefs, proposal: null, reasonCode: 'ONTOLOGY_TUPLE_GRAPH_REVISION_MISMATCH' };
  }

  const resolutions = resolveParticipantObservationsV1(tuple.participants.map((participant) => ({
    field: participant.entityKind,
    role: participant.role,
    entityType: participant.entityKind.toUpperCase(),
    canonicalId: participant.entityId,
    evidenceRefs: tuple.evidenceRefs,
    literalValue: participant.label ?? null,
  })), owners);
  if (resolutions.status !== 'RESOLVED' || resolutions.participants.length < 3) {
    return { ...resolutions, proposal: null, reasonCode: resolutions.participants.length < 3 ? 'ONTOLOGY_TUPLE_ARITY_BELOW_THREE' : 'ONTOLOGY_TUPLE_PARTICIPANTS_NOT_PROVEN' };
  }

  return {
    ...resolutions,
    proposal: createNaryFactProposalV1({
      sourceRef: tuple.sourceRef,
      sourceRevision: tuple.provenance.sourceRevision,
      workspaceRevision: context.workspaceRevision,
      packetKey: tuple.packetKey,
      graphRevision: context.graphRevision,
      producerRevision: context.producerRevision,
      ontologyRevision: tuple.provenance.ontologyRevision ?? null,
      predicate: predicateResolution.predicate,
      predicatePolicy: {
        schema: 'atlas.okf.predicate-policy-ref.v1',
        registryDocumentSha256: predicateResolution.registryDocumentSha256,
        registrySchemaSha256: predicateResolution.registrySchemaSha256,
      },
      participants: resolutions.participants,
      evidenceRefs: tuple.evidenceRefs,
      admission: 'PROPOSED',
    }),
  };
}

export async function proposeOntologyLinkedTupleWithOkfPolicyV1(
  tuple: OntologyLinkedTupleV1,
  context: Omit<OntologyTupleNaryProposalContextV1, 'predicateResolution'>,
  predicate: string,
  owners: readonly CanonicalParticipantOwnerV1[],
): Promise<OntologyTupleNaryPolicyProposalResultV1> {
  const entityTypeCount = new Set(tuple.participants.map((participant) => participant.entityKind)).size;
  const degree: FeaturePredicateDegreeV1 = entityTypeCount >= 4
    ? 'nary'
    : entityTypeCount === 3
      ? 'ternary'
      : entityTypeCount === 2
        ? 'binary'
        : 'unary';
  const policy = await loadOkfPredicatePolicyV1(predicate, degree);
  if (policy.resolution.status !== 'RESOLVED' || !policy.traversalEligible) {
    return {
      status: 'REJECTED',
      participants: [],
      resolutions: [],
      unresolvedFields: [],
      evidenceRefs: tuple.evidenceRefs,
      proposal: null,
      reasonCode: policy.resolution.status === 'UNRESOLVED'
        ? policy.resolution.reasonCode
        : 'PREDICATE_NOT_TRAVERSAL_ELIGIBLE',
      predicatePolicy: policy,
    };
  }
  return {
    ...proposeOntologyLinkedTupleNaryFactV1(tuple, {
    ...context,
    predicateResolution: policy.resolution,
    }, owners),
    predicatePolicy: policy,
  };
}
