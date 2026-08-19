import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { OntologyLinkedTupleV1 } from './ontology-linked-tuple-v1.js';

/**
 * ORF-1: deterministic observation -> interpretable feature projection.
 *
 * This layer does not infer semantic identity and does not rank candidates.
 * It turns already-grounded ontology / AST / extraction observations into
 * stable masks, flags, and flattened keyword tags that Postgres/Qdrant/router
 * executors can share without each inventing a feature vocabulary.
 */
export const ORF_ONTOLOGY_CLASSES = [
  'API', 'FUNCTION', 'ALGORITHM', 'DATABASE', 'RETRIEVAL', 'SECURITY', 'WORKFLOW', 'CACHE',
  'GRAPH', 'AST', 'TYPE_SYSTEM', 'TEST', 'ERROR_HANDLING', 'NETWORK', 'STORAGE', 'QUEUE',
  'AUTH', 'UI', 'STATE', 'CONFIG', 'OBSERVABILITY', 'INDEX', 'VECTOR', 'EMBEDDING',
  'CLUSTER', 'RANKING', 'TOOL', 'AGENT', 'MCP', 'MUTATION', 'VALIDATION', 'EVIDENCE',
] as const;

export const ORF_AST_OBSERVATION_KINDS = [
  'FUNCTION_DECL', 'FUNCTION_CALL', 'METHOD_CALL', 'DATABASE_CALL', 'DATABASE_WRITE', 'DATABASE_READ',
  'NETWORK_CALL', 'IMPORT', 'EXPORT', 'CLASS_DECL', 'INTERFACE_DECL', 'TYPE_ALIAS', 'VARIABLE_DECL',
  'PARAMETER', 'RETURN', 'THROW', 'TRY_CATCH', 'AWAIT', 'PROMISE', 'TEST_CASE', 'ASSERTION',
  'OBJECT_LITERAL', 'ARRAY_LITERAL', 'CONDITIONAL', 'LOOP', 'ASSIGNMENT', 'PROPERTY_ACCESS',
  'NEW_EXPRESSION', 'DECORATOR', 'ROUTE_HANDLER', 'TOOL_CALL', 'UNKNOWN',
] as const;

export const ORF_LANGEXTRACT_CLASSES = [
  'feature', 'algorithm', 'api', 'database', 'retrieval', 'security', 'workflow', 'error',
  'configuration', 'metric', 'constraint', 'invariant', 'recommendation', 'example', 'warning', 'definition',
] as const;

const bit = z.union([z.literal(0), z.literal(1)]);
const mask32 = z.array(bit).length(32);

export const ObservationFeatureProjectionV1Schema = z.object({
  schema: z.literal('atlas.observation-feature-projection.v1'),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  treeNodeId: z.string().min(1).nullable(),
  sourceVersionReceiptId: z.string().min(1).nullable(),
  representationId: z.string().min(1).nullable(),
  representationRevision: z.string().min(1).nullable(),

  ontologyClasses: z.array(z.string().min(1)).max(64),
  ontologyMask: mask32,
  astObservationKinds: z.array(z.string().min(1)).max(64),
  astPatternMask: mask32,
  langextractClasses: z.array(z.string().min(1)).max(32),

  hasFunction: z.boolean(),
  hasCall: z.boolean(),
  hasDatabaseAccess: z.boolean(),
  hasNetworkCall: z.boolean(),
  hasTest: z.boolean(),
  hasErrorHandler: z.boolean(),

  flattenedTags: z.array(z.string().min(1)).max(192),
  evidenceRefs: z.array(z.string().min(1)).max(128),
  featureRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  inputDigest: z.string().length(64),
}).strict();

export type ObservationFeatureProjectionV1 = z.infer<typeof ObservationFeatureProjectionV1Schema>;

export interface BuildObservationFeatureProjectionInputV1 {
  packetKey: string;
  sourceRef: string;
  treeNodeId?: string | null;
  sourceVersionReceiptId?: string | null;
  representationId?: string | null;
  representationRevision?: string | null;
  ontologyTuples?: readonly OntologyLinkedTupleV1[];
  ontologyClasses?: readonly string[];
  astObservationKinds?: readonly string[];
  langextractClasses?: readonly string[];
  evidenceRefs?: readonly string[];
  featureRevision: string;
  producerRevision: string;
}

function uniqueSorted(values: readonly (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b));
}

function makeMask(vocabulary: readonly string[], selected: readonly string[]): Array<0 | 1> {
  const selectedSet = new Set(selected.map((value) => value.toUpperCase()));
  return vocabulary.map((value) => selectedSet.has(value.toUpperCase()) ? 1 : 0) as Array<0 | 1>;
}

function digestInput(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function buildObservationFeatureProjectionV1(
  input: BuildObservationFeatureProjectionInputV1,
): ObservationFeatureProjectionV1 {
  const tupleOntology = (input.ontologyTuples ?? []).flatMap((tuple) => [
    ...tuple.ontologyIds,
    ...(tuple.labelKind === 'ontology' ? [tuple.label] : []),
  ]);
  const ontologyClasses = uniqueSorted([...(input.ontologyClasses ?? []), ...tupleOntology]);
  const astObservationKinds = uniqueSorted(input.astObservationKinds ?? []);
  const langextractClasses = uniqueSorted(input.langextractClasses ?? []);
  const tupleEvidence = (input.ontologyTuples ?? []).flatMap((tuple) => tuple.evidenceRefs);
  const evidenceRefs = uniqueSorted([...(input.evidenceRefs ?? []), ...tupleEvidence]);

  const flattenedTags = uniqueSorted([
    ...ontologyClasses.map((value) => `ontology=${value.toLowerCase()}`),
    ...astObservationKinds.map((value) => `ast=${value.toLowerCase()}`),
    ...langextractClasses.map((value) => `extract=${value.toLowerCase()}`),
  ]);

  const astSet = new Set(astObservationKinds.map((value) => value.toUpperCase()));
  const normalizedInput = {
    packetKey: input.packetKey,
    sourceRef: input.sourceRef,
    treeNodeId: input.treeNodeId ?? null,
    sourceVersionReceiptId: input.sourceVersionReceiptId ?? null,
    representationId: input.representationId ?? null,
    representationRevision: input.representationRevision ?? null,
    ontologyClasses,
    astObservationKinds,
    langextractClasses,
    evidenceRefs,
    featureRevision: input.featureRevision,
    producerRevision: input.producerRevision,
  };

  return ObservationFeatureProjectionV1Schema.parse({
    schema: 'atlas.observation-feature-projection.v1',
    ...normalizedInput,
    ontologyMask: makeMask(ORF_ONTOLOGY_CLASSES, ontologyClasses),
    astPatternMask: makeMask(ORF_AST_OBSERVATION_KINDS, astObservationKinds),
    hasFunction: astSet.has('FUNCTION_DECL'),
    hasCall: astSet.has('FUNCTION_CALL') || astSet.has('METHOD_CALL') || astSet.has('TOOL_CALL'),
    hasDatabaseAccess: astSet.has('DATABASE_CALL') || astSet.has('DATABASE_WRITE') || astSet.has('DATABASE_READ'),
    hasNetworkCall: astSet.has('NETWORK_CALL'),
    hasTest: astSet.has('TEST_CASE') || astSet.has('ASSERTION'),
    hasErrorHandler: astSet.has('TRY_CATCH') || astSet.has('THROW'),
    flattenedTags,
    inputDigest: digestInput(normalizedInput),
  });
}
