import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ONTOLOGY_OBSERVATION_TUPLE_SCHEMA_V1 = 'atlas.ontology-observation-tuple.v1' as const;

const revision = z.string().min(1);
const id = z.string().min(1);

export const ontologyEvaluationStatusV1Schema = z.enum([
  'FROZEN_EVAL_PROVEN',
  'CHALLENGER_UNPROVEN',
  'NOT_APPLICABLE',
]);
export type OntologyEvaluationStatusV1 = z.infer<typeof ontologyEvaluationStatusV1Schema>;

export const ontologyObservationTupleV1Schema = z.object({
  schema: z.literal(ONTOLOGY_OBSERVATION_TUPLE_SCHEMA_V1),
  subjectCanonicalId: id,
  predicate: id,
  objectCanonicalIdOrClass: id,
  confidence: z.number().finite().min(0).max(1),
  evidenceRefs: z.array(id).min(1),
  sourceRef: id,
  workspaceRevision: revision,
  sourceRevision: revision,
  classifierRevision: revision,
  ontologyRevision: revision,
  producerRevision: revision,
  evaluationStatus: ontologyEvaluationStatusV1Schema,
  tupleChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type OntologyObservationTupleV1 = z.infer<typeof ontologyObservationTupleV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`).join(',')}}`;
}

export function materializeOntologyObservationTupleV1(input: Omit<
  z.input<typeof ontologyObservationTupleV1Schema>,
  'schema' | 'tupleChecksum' | 'canonicalAuthority' | 'canonicalWritesAllowed'
>): OntologyObservationTupleV1 {
  const base = ontologyObservationTupleV1Schema.omit({
    schema: true,
    tupleChecksum: true,
    canonicalAuthority: true,
    canonicalWritesAllowed: true,
  }).parse(input);
  const tupleChecksum = createHash('sha256').update(canonicalJson(base), 'utf8').digest('hex');
  return ontologyObservationTupleV1Schema.parse({
    ...base,
    schema: ONTOLOGY_OBSERVATION_TUPLE_SCHEMA_V1,
    tupleChecksum,
    canonicalAuthority: false,
    canonicalWritesAllowed: false,
  });
}
