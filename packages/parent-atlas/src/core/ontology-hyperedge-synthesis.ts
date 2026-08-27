import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ontologyTupleSchema,
  type OntologyTupleV1,
} from './external-doc-knowledge-fabric.js';
import {
  buildFeatureRelationship,
  type FeatureRelationshipV1,
  type RelationshipParticipantV1,
} from './feature-intelligence.js';

export const hyperedgeSynthesisRejectionSchema = z.enum([
  'UNGROUNDED',
  'INSUFFICIENT_PARTICIPANTS',
  'REVISION_MISMATCH',
  'SUPERSEDED',
  'DEGRADED_EVIDENCE',
  'AMBIGUOUS_RELATION',
  'MISSING_PARTICIPANT_ID',
  'MISSING_PRODUCER_REVISION',
]);

export type HyperedgeSynthesisRejection = z.infer<typeof hyperedgeSynthesisRejectionSchema>;

const synthesisInputSchema = z.object({
  tuple: ontologyTupleSchema,
  participant_entity_ids: z.array(z.string().min(1)).max(32),
  source_ref: z.string().min(1),
  source_revision: z.string().min(1),
  ontology_revision: z.string().min(1),
  producer_revision: z.string().min(1),
  evidence_state: z.enum(['ACTIVE_VERIFIED', 'DEGRADED', 'UNVERIFIED']).default('ACTIVE_VERIFIED'),
  lifecycle: z.enum(['ACTIVE', 'SUPERSEDED']).default('ACTIVE'),
  relation_revision: z.string().min(1).nullable().default(null),
}).strict();

export type OntologyHyperedgeSynthesisInput = z.input<typeof synthesisInputSchema>;

export type HyperedgeSynthesisResultV1 =
  | {
      status: 'ELIGIBLE';
      hyperedge: FeatureRelationshipV1;
      source_tuple_ids: string[];
    }
  | {
      status: 'REJECTED';
      source_tuple_ids: string[];
      reasons: HyperedgeSynthesisRejection[];
    };

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function canonicalTuple(tuple: z.output<typeof ontologyTupleSchema>) {
  return {
    ...tuple,
    participants: [...tuple.participants].sort((a, b) => stableJson(a).localeCompare(stableJson(b))),
  };
}

function relationRevision(input: z.output<typeof synthesisInputSchema>): string {
  return input.relation_revision ?? `relation:${sha256({
    ontology_revision: input.ontology_revision,
    tuple: canonicalTuple(input.tuple),
  }).slice(0, 40)}`;
}

function participantKey(participant: RelationshipParticipantV1): string {
  return `${participant.role}\u0000${participant.entity_type}\u0000${participant.entity_id}`;
}

export function synthesizeOntologyHyperedge(
  rawInput: OntologyHyperedgeSynthesisInput,
): HyperedgeSynthesisResultV1 {
  const input = synthesisInputSchema.parse(rawInput);
  const tuple = input.tuple;
  const reasons: HyperedgeSynthesisRejection[] = [];

  if (input.lifecycle === 'SUPERSEDED') reasons.push('SUPERSEDED');
  if (input.evidence_state !== 'ACTIVE_VERIFIED') {
    reasons.push(input.evidence_state === 'DEGRADED' ? 'DEGRADED_EVIDENCE' : 'UNGROUNDED');
  }
  if (tuple.participants.length < 2) reasons.push('INSUFFICIENT_PARTICIPANTS');
  if (input.participant_entity_ids.length !== tuple.participants.length) {
    reasons.push('MISSING_PARTICIPANT_ID');
  }
  if (!input.producer_revision) reasons.push('MISSING_PRODUCER_REVISION');

  const sourceTupleIds = [tuple.tuple_id];
  if (reasons.length > 0) {
    return { status: 'REJECTED', source_tuple_ids: sourceTupleIds, reasons: [...new Set(reasons)] };
  }

  const participants: RelationshipParticipantV1[] = tuple.participants
    .map((participant, index) => ({
      role: participant.role,
      entity_type: participant.ontology_class.toLowerCase().replace(/[^a-z0-9_.-]+/g, '_'),
      entity_id: input.participant_entity_ids[index]!,
      entity_revision: input.source_revision,
      source_ref: input.source_ref,
    }))
    .sort((a, b) => participantKey(a).localeCompare(participantKey(b)));

  const revision = relationRevision(input);
  const relationshipId = `hyperedge:${sha256({
    predicate: tuple.predicate,
    participants: participants.map(participantKey),
    source_ref: input.source_ref,
    source_revision: input.source_revision,
    relation_revision: revision,
  }).slice(0, 40)}`;

  const hyperedge = buildFeatureRelationship({
    relationship_id: relationshipId,
    relationship_type: tuple.predicate,
    participants,
    source_ref: input.source_ref,
    source_revision: input.source_revision,
    relationship_revision: revision,
    producer_revision: input.producer_revision,
    evidence_refs: tuple.evidence_span_refs,
    confidence: tuple.confidence,
    metadata: {
      ontology_revision: input.ontology_revision,
      tuple_id: tuple.tuple_id,
      extraction_method: tuple.extraction_method,
      predicate_lemma: tuple.predicate_lemma,
    },
  });

  return { status: 'ELIGIBLE', hyperedge, source_tuple_ids: sourceTupleIds };
}
