import { z } from 'zod';

/**
 * TYPED-COORDINATES-V1
 * 
 * Enforces four distinct ontology namespaces:
 * - DOMAIN: broad routing/category (e.g. domain:7)
 * - CONCEPT: semantic class/idea (e.g. concept:42)
 * - ENTITY: concrete instance/object (e.g. entity:193)
 * - RELATION: predicate/edge type (e.g. relation:11)
 * 
 * Plus grounded ontology linked tuples with source span evidence.
 */

export const OntologyNamespaceSchema = z.enum(['domain', 'concept', 'entity', 'relation']);
export type OntologyNamespace = z.infer<typeof OntologyNamespaceSchema>;

export const TypedCoordinateSchema = z
  .object({
    namespace: OntologyNamespaceSchema,
    ordinal: z.number().int().min(0),
    formatted: z.string().regex(/^(domain|concept|entity|relation):\d+$/),
  })
  .strict();

export type TypedCoordinate = z.infer<typeof TypedCoordinateSchema>;

export const GroundedOntologyTupleSchema = z
  .object({
    sourceEntity: z.string().min(1),
    relation: z.string().min(1),
    targetConcept: z.string().min(1),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    byteSpan: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
    canonicalAuthority: z.literal(false),
  })
  .strict();

export type GroundedOntologyTuple = z.infer<typeof GroundedOntologyTupleSchema>;

export function formatTypedCoordinate(namespace: OntologyNamespace, ordinal: number): string {
  if (ordinal < 0 || !Number.isInteger(ordinal)) {
    throw new Error(`Ordinal must be a non-negative integer, got ${ordinal}`);
  }
  return `${namespace}:${ordinal}`;
}

export function parseTypedCoordinate(coordinateStr: string): TypedCoordinate {
  const match = coordinateStr.trim().match(/^(domain|concept|entity|relation):(\d+)$/);
  if (!match) {
    throw new Error(`Invalid typed coordinate format: "${coordinateStr}". Expected <namespace>:<ordinal>`);
  }
  const namespace = match[1] as OntologyNamespace;
  const ordinal = parseInt(match[2], 10);
  return {
    namespace,
    ordinal,
    formatted: `${namespace}:${ordinal}`,
  };
}

export function validateOntologyTuple(tuple: unknown): boolean {
  return GroundedOntologyTupleSchema.safeParse(tuple).success;
}
