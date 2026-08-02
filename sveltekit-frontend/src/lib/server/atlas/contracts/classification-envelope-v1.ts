import { z } from 'zod';
import {
  ClassificationLedgerKindSchema,
  ClassificationPartOfSpeechSchema,
  EvidenceStateSchema,
  KnowledgeResolutionSchema,
  RepresentationNameSchema,
  RepresentationRoleSchema,
  VectorLaneStatusSchema,
} from './classification-contracts';

export const ClassificationIdentitySchema = z.object({
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  contentHash: z.string().min(1),
  workspaceRevision: z.string().min(1),
  featureId: z.string().min(1),
  featureLabel: z.string().min(1),
  titleId: z.string().min(1).nullable().optional(),
  // Structural parse-occurrence identifier only; not a workflow, source, or packet identity.
  treeNodeId: z.string().min(1).nullable().optional(),
  qdrantPointId: z.string().min(1).nullable().optional(),
});

export const ClassificationRepresentationSchema = z.object({
  name: RepresentationNameSchema,
  role: RepresentationRoleSchema,
  laneStatus: VectorLaneStatusSchema,
  producerVersion: z.string().min(1).nullable().optional(),
  modelId: z.string().min(1).nullable().optional(),
  dimension: z.number().int().positive().nullable().optional(),
  projectionVersion: z.string().min(1).nullable().optional(),
  normalized: z.boolean().optional(),
});

export const ClassificationSignalsSchema = z.object({
  laneStatus: VectorLaneStatusSchema,
  evidenceState: EvidenceStateSchema,
  knowledgeResolution: KnowledgeResolutionSchema,
  domainClass: z.string().min(1).nullable().optional(),
  secondaryDomains: z.array(z.string().min(1)).max(8).optional(),
  ontologyIds: z.array(z.string().min(1)).default([]),
  conceptIds: z.array(z.string().min(1)).default([]),
  runtimeEvidenceRefs: z.array(z.string().min(1)).default([]),
  testEvidenceRefs: z.array(z.string().min(1)).default([]),
  partOfSpeech: ClassificationPartOfSpeechSchema,
  pageRankScore: z.number().min(0).max(1).nullable().optional(),
  communityId: z.union([z.string(), z.number()]).nullable().optional(),
  kmeansCluster: z.number().int().nonnegative().nullable().optional(),
  somCell: z.string().min(1).nullable().optional(),
  somRow: z.number().int().nonnegative().nullable().optional(),
  somCol: z.number().int().nonnegative().nullable().optional(),
  classifiers: z.object({
    naiveBayesClass: z.string().min(1).nullable().optional(),
    naiveBayesScore: z.number().min(0).max(1).nullable().optional(),
    logisticRegressionScore: z.number().min(0).max(1).nullable().optional(),
    xgboostScore: z.number().min(0).max(1).nullable().optional(),
    computedAt: z.string().datetime().nullable().optional(),
  }).optional(),
});

export const ClassificationValidationSnapshotSchema = z.object({
  layer: ClassificationLedgerKindSchema,
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  contentHash: z.string().min(1),
  workspaceRevision: z.string().min(1),
  validatedBy: z.string().min(1).nullable().optional(),
  phase: z.string().min(1).nullable().optional(),
  canPromotion: z.enum(['CROSS_STORE_PROVEN', 'PARTIAL_PROVEN', 'NOT_PROVEN']).nullable().optional(),
  isValid: z.boolean().nullable().optional(),
  reward: z.number().min(0).max(1).nullable().optional(),
  rewardReason: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  ledgerPath: z.string().min(1).nullable().optional(),
  recordedAt: z.string().datetime().nullable().optional(),
});

export const ClassificationEnvelopeV1Schema = z.object({
  schemaVersion: z.literal('atlas.classification-envelope.v1'),
  identity: ClassificationIdentitySchema,
  signals: ClassificationSignalsSchema,
  representations: z.object({
    semantic_768: ClassificationRepresentationSchema.nullable().optional(),
    semantic768: ClassificationRepresentationSchema.nullable().optional(),
    dense768: ClassificationRepresentationSchema.nullable().optional(),
    dense384: ClassificationRepresentationSchema.nullable().optional(),
    latent64: ClassificationRepresentationSchema.nullable().optional(),
    topology4: ClassificationRepresentationSchema.nullable().optional(),
  }).default({}),
  validation: ClassificationValidationSnapshotSchema,
  provenance: z.object({
    packetSchemaVersion: z.string().min(1),
    featureSchemaVersion: z.string().min(1),
    validationSchemaVersion: z.string().min(1),
    ledgerSchemaVersion: z.string().min(1),
    serializerVersion: z.string().min(1).nullable().optional(),
    createdAt: z.string().datetime(),
  }),
}).strict();

export type ClassificationIdentity = z.infer<typeof ClassificationIdentitySchema>;
export type ClassificationRepresentation = z.infer<typeof ClassificationRepresentationSchema>;
export type ClassificationSignals = z.infer<typeof ClassificationSignalsSchema>;
export type ClassificationValidationSnapshot = z.infer<typeof ClassificationValidationSnapshotSchema>;
export type ClassificationEnvelopeV1 = z.infer<typeof ClassificationEnvelopeV1Schema>;

export const ClassificationLineageViolationCodeSchema = z.enum([
  'PACKET_KEY_MISMATCH',
  'SOURCE_REF_MISMATCH',
  'CONTENT_HASH_MISMATCH',
  'WORKSPACE_REVISION_MISMATCH',
  'FEATURE_ID_MISMATCH',
  'FEATURE_LABEL_MISMATCH',
  // Structural tree-node mismatch, not a canonical identity collision.
  'TREE_NODE_ID_MISMATCH',
  'LANE_STATUS_MISMATCH',
  'EVIDENCE_STATE_MISMATCH',
  'KNOWLEDGE_RESOLUTION_MISMATCH',
]);

export const ClassificationLineageViolationSchema = z.object({
  code: ClassificationLineageViolationCodeSchema,
  layer: z.enum(['packet', 'feature_row', 'validation', 'ledger']),
  path: z.string().min(1),
  expected: z.string().nullable().optional(),
  actual: z.string().nullable().optional(),
});

export type ClassificationLineageViolation = z.infer<typeof ClassificationLineageViolationSchema>;

export function validateClassificationLineage(input: {
  identity: ClassificationIdentity;
  featureRow?: {
    identity: {
      packet_key: string;
      source_ref: string;
      feature_id: string;
      title_id?: string | null;
      // Structural parse-occurrence identifier only.
      tree_node_id?: string | null;
    };
    lane_status?: ClassificationSignals['laneStatus'] | null;
    evidence_state?: ClassificationSignals['evidenceState'] | null;
    knowledge_resolution?: ClassificationSignals['knowledgeResolution'] | null;
  };
  validation?: ClassificationValidationSnapshot;
  ledger?: Partial<{
    packetKey: string;
    sourceRef: string;
    contentHash: string;
    workspaceRevision: string;
    laneStatus: ClassificationSignals['laneStatus'] | null;
    evidenceState: ClassificationSignals['evidenceState'] | null;
    knowledgeResolution: ClassificationSignals['knowledgeResolution'] | null;
  }>;
}): { aligned: boolean; violations: ClassificationLineageViolation[] } {
  const violations: ClassificationLineageViolation[] = [];
  const featureIdentity = input.featureRow?.identity;
  const validation = input.validation;
  const ledger = input.ledger;

  const pushMismatch = (
    code: ClassificationLineageViolation['code'],
    layer: ClassificationLineageViolation['layer'],
    path: string,
    expected: string | null | undefined,
    actual: string | null | undefined
  ) => {
    if (expected === actual) return;
    violations.push({
      code,
      layer,
      path,
      expected: expected ?? null,
      actual: actual ?? null,
    });
  };

  if (featureIdentity) {
    pushMismatch('PACKET_KEY_MISMATCH', 'feature_row', 'identity.packet_key', input.identity.packetKey, featureIdentity.packet_key);
    pushMismatch('SOURCE_REF_MISMATCH', 'feature_row', 'identity.source_ref', input.identity.sourceRef, featureIdentity.source_ref);
    pushMismatch('FEATURE_ID_MISMATCH', 'feature_row', 'identity.feature_id', input.identity.featureId, featureIdentity.feature_id);
    pushMismatch('TREE_NODE_ID_MISMATCH', 'feature_row', 'identity.tree_node_id', input.identity.treeNodeId ?? null, featureIdentity.tree_node_id ?? null);
  }

  if (validation) {
    pushMismatch('PACKET_KEY_MISMATCH', 'validation', 'packetKey', input.identity.packetKey, validation.packetKey);
    pushMismatch('SOURCE_REF_MISMATCH', 'validation', 'sourceRef', input.identity.sourceRef, validation.sourceRef);
    pushMismatch('CONTENT_HASH_MISMATCH', 'validation', 'contentHash', input.identity.contentHash, validation.contentHash);
    pushMismatch('WORKSPACE_REVISION_MISMATCH', 'validation', 'workspaceRevision', input.identity.workspaceRevision, validation.workspaceRevision);
  }

  if (ledger) {
    pushMismatch('PACKET_KEY_MISMATCH', 'ledger', 'packetKey', input.identity.packetKey, ledger.packetKey ?? null);
    pushMismatch('SOURCE_REF_MISMATCH', 'ledger', 'sourceRef', input.identity.sourceRef, ledger.sourceRef ?? null);
    pushMismatch('CONTENT_HASH_MISMATCH', 'ledger', 'contentHash', input.identity.contentHash, ledger.contentHash ?? null);
    pushMismatch('WORKSPACE_REVISION_MISMATCH', 'ledger', 'workspaceRevision', input.identity.workspaceRevision, ledger.workspaceRevision ?? null);
    pushMismatch('LANE_STATUS_MISMATCH', 'ledger', 'laneStatus', input.featureRow?.lane_status ?? null, ledger.laneStatus ?? null);
    pushMismatch('EVIDENCE_STATE_MISMATCH', 'ledger', 'evidenceState', input.featureRow?.evidence_state ?? null, ledger.evidenceState ?? null);
    pushMismatch('KNOWLEDGE_RESOLUTION_MISMATCH', 'ledger', 'knowledgeResolution', input.featureRow?.knowledge_resolution ?? null, ledger.knowledgeResolution ?? null);
  }

  return { aligned: violations.length === 0, violations: ClassificationLineageViolationSchema.array().parse(violations) };
}

export function buildClassificationEnvelopeV1(input: {
  identity: ClassificationIdentity;
  signals: ClassificationSignals;
  validation: ClassificationValidationSnapshot;
  representations?: Partial<ClassificationEnvelopeV1['representations']>;
  provenance?: Partial<ClassificationEnvelopeV1['provenance']>;
}): ClassificationEnvelopeV1 {
  return ClassificationEnvelopeV1Schema.parse({
    schemaVersion: 'atlas.classification-envelope.v1',
    identity: input.identity,
    signals: input.signals,
    representations: input.representations ?? {},
    validation: input.validation,
    provenance: {
      packetSchemaVersion: input.provenance?.packetSchemaVersion ?? 'unknown',
      featureSchemaVersion: input.provenance?.featureSchemaVersion ?? 'unknown',
      validationSchemaVersion: input.provenance?.validationSchemaVersion ?? 'unknown',
      ledgerSchemaVersion: input.provenance?.ledgerSchemaVersion ?? 'unknown',
      serializerVersion: input.provenance?.serializerVersion ?? null,
      createdAt: input.provenance?.createdAt ?? new Date().toISOString(),
    },
  }) as ClassificationEnvelopeV1;
}
