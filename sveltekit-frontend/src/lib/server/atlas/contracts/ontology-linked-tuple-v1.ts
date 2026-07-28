import { z } from 'zod';

export const OntologyLinkedTupleEvidenceStateSchema = z.enum([
  'ACTIVE_VERIFIED',
  'ACTIVE_DEGRADED',
  'GATED',
  'REFERENCE_ONLY',
  'SUPERSEDED',
  'FAILED',
]);

export const OntologyLinkedTupleLabelKindSchema = z.enum([
  'pos',
  'tag',
  'ontology',
]);

export const OntologyLinkedTupleLabelSourceSchema = z.enum([
  'pos_tagger',
  'semantic_tagger',
  'regex',
  'ner',
  'llm',
  'manual',
]);

export const OntologyLinkedTupleProvenanceSchema = z.object({
  sourceTables: z.array(z.string().min(1)).max(12),
  labelerVersion: z.string().min(1).nullable(),
  taggerVersion: z.string().min(1).nullable(),
  ontologyVersion: z.string().min(1).nullable(),
  nlpVersion: z.string().min(1).nullable(),
});

export const OntologyLinkedTupleV1Schema = z.object({
  tupleId: z.string().min(1),
  schemaVersion: z.literal('ontology-linked-tuple.v1'),
  packetKey: z.string().min(1).optional(),
  sourceRef: z.string().min(1),
  treeNodeId: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  titleId: z.string().min(1).optional(),
  surfaceText: z.string().min(1),
  tokenIndex: z.number().int().nonnegative().optional().nullable(),
  partOfSpeech: z.string().min(1).optional().nullable(),
  label: z.string().min(1),
  labelKind: OntologyLinkedTupleLabelKindSchema,
  labelSource: OntologyLinkedTupleLabelSourceSchema,
  ontologyIds: z.array(z.string().min(1)).max(32),
  conceptIds: z.array(z.string().min(1)).max(32),
  confidence: z.number().min(0).max(1),
  evidenceState: OntologyLinkedTupleEvidenceStateSchema,
  provenance: OntologyLinkedTupleProvenanceSchema,
});

export type OntologyLinkedTupleV1 = z.infer<typeof OntologyLinkedTupleV1Schema>;
