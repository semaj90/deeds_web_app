import { z } from 'zod';

export const VectorLaneStatusSchema = z.enum([
  'ACTIVE',
  'REFERENCE_ONLY',
  'MIGRATION_SOURCE',
  'SUPERSEDED',
]);

export const EvidenceStateSchema = z.enum([
  'ACTIVE_VERIFIED',
  'ACTIVE_DEGRADED',
  'GATED',
  'REFERENCE_ONLY',
  'SUPERSEDED',
  'FAILED',
]);

export const KnowledgeResolutionSchema = z.enum([
  'RESOLVED',
  'UNCLASSIFIED',
  'AMBIGUOUS',
  'ONTOLOGY_GAP',
  'CONFLICTING_EVIDENCE',
]);

export const RepresentationNameSchema = z.enum([
  'dense_768',
  'dense_384',
  'latent_64',
  'topology_4',
]);

export const RepresentationRoleSchema = z.enum([
  'SEMANTIC_AUTHORITY',
  'ONLINE_RETRIEVAL',
  'RECALL_REFERENCE',
  'ROUTING',
  'VISUALIZATION',
  'LEXICAL',
]);

export const ClassificationLedgerKindSchema = z.enum([
  'validation',
  'outcome',
  'retrieval',
]);

export type VectorLaneStatus = z.infer<typeof VectorLaneStatusSchema>;
export type EvidenceState = z.infer<typeof EvidenceStateSchema>;
export type KnowledgeResolution = z.infer<typeof KnowledgeResolutionSchema>;
export type RepresentationName = z.infer<typeof RepresentationNameSchema>;
export type RepresentationRole = z.infer<typeof RepresentationRoleSchema>;
export type ClassificationLedgerKind = z.infer<typeof ClassificationLedgerKindSchema>;
