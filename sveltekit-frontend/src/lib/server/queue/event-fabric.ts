import { z } from 'zod';
import {
  codeEvidencePersistedEventSchema,
  type CodeEvidencePersistedEventV1,
} from './integration-events.js';
import { artifactStorageSchema } from './artifact-work-item-v1.js';

export {
  codeEvidencePersistedEventSchema,
} from './integration-events.js';
export type {
  CodeEvidencePersistedEventV1,
  CodeEvidencePersistedPayloadV1,
} from './integration-events.js';

export const atlasFailureClassSchema = z.enum([
  'TRANSIENT_DEPENDENCY',
  'TIMEOUT',
  'RATE_LIMIT',
  'POSTGRES_UNAVAILABLE',
  'QDRANT_UNAVAILABLE',
  'VALKEY_UNAVAILABLE',
  'BROKER_UNAVAILABLE',
  'GPU_OOM',
  'GPU_RUNTIME',
  'SCHEMA_REJECTED',
  'PROVENANCE_MISSING',
  'REVISION_MISMATCH',
  'IDENTITY_MISMATCH',
  'STALE_ARTIFACT',
  'MODEL_INVALID_JSON',
  'MODEL_TOOL_FORMAT',
  'TOOL_PERMISSION',
  'TOOL_NOT_FOUND',
  'POLICY_REJECTED',
  'UNKNOWN',
]);

export type AtlasFailureClass = z.infer<typeof atlasFailureClassSchema>;

export const eventFabricTypeSchema = z.enum([
  'code.evidence.persisted',
  'failure.observed',
  'analytics.observed',
  'recommendation.signal',
  'policy.decision.receipt',
  'checkpoint.commit',
  'artifact.materialized',
  'artifact.failed',
]);

export type EventFabricType = z.infer<typeof eventFabricTypeSchema>;

export const eventFabricEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: eventFabricTypeSchema,
  occurredAt: z.string().datetime(),
  traceId: z.string().optional(),
  requestId: z.string().optional(),
  taskId: z.string().optional(),
  sourceRef: z.string().optional(),
  sourceRevision: z.string().optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  schemaRevision: z.string().optional(),
});

export type EventFabricEnvelope = z.infer<typeof eventFabricEnvelopeSchema>;

export const failureObservationPayloadSchema = z.object({
  component: z.string().min(1),
  operation: z.string().min(1),
  failureClass: atlasFailureClassSchema,
  retryable: z.boolean(),
  retryCount: z.number().int().min(0),
  retryBudget: z.number().int().min(0),
  errorHash: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)),
  graphRevision: z.string().min(1).optional(),
  modelRevision: z.string().min(1).optional(),
  toolCatalogRevision: z.string().min(1).optional(),
  sourceRevision: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type FailureObservationPayloadV1 = z.infer<typeof failureObservationPayloadSchema>;

export const failureObservationEventSchema = eventFabricEnvelopeSchema.extend({
  eventType: z.literal('failure.observed'),
  payload: failureObservationPayloadSchema,
});

export type FailureObservationEventV1 = z.infer<typeof failureObservationEventSchema>;

export const analyticsObservationPayloadSchema = z.object({
  actorClass: z.enum(['user', 'agent', 'system']),
  actorId: z.string().min(1).optional(),
  component: z.string().min(1),
  signalClass: z.string().min(1),
  targetType: z.enum(['packet', 'document', 'tool', 'symbol', 'centroid', 'task']),
  targetId: z.string().min(1),
  score: z.number().optional(),
  utility: z.number().optional(),
  modelRevision: z.string().min(1).optional(),
  graphRevision: z.string().min(1).optional(),
  sourceRevision: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AnalyticsObservationPayloadV1 = z.infer<typeof analyticsObservationPayloadSchema>;

export const analyticsObservationEventSchema = eventFabricEnvelopeSchema.extend({
  eventType: z.literal('analytics.observed'),
  payload: analyticsObservationPayloadSchema,
});

export type AnalyticsObservationEventV1 = z.infer<typeof analyticsObservationEventSchema>;

export const recommendationSignalPayloadSchema = z.object({
  candidateId: z.string().min(1),
  targetType: z.enum(['packet', 'document', 'tool', 'symbol', 'centroid', 'task']),
  targetId: z.string().min(1),
  action: z.enum(['PREFETCH', 'PREFILL', 'BOOST', 'KEEP_HOT', 'DEMOTE']),
  score: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  utility: z.number().optional(),
  expiresAt: z.string().datetime().optional(),
  sourceEvidenceRefs: z.array(z.string().min(1)).default([]),
  featureRevision: z.string().min(1).optional(),
  graphRevision: z.string().min(1).optional(),
  modelRevision: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RecommendationSignalPayloadV1 = z.infer<typeof recommendationSignalPayloadSchema>;

export const recommendationSignalEventSchema = eventFabricEnvelopeSchema.extend({
  eventType: z.literal('recommendation.signal'),
  payload: recommendationSignalPayloadSchema,
});

export type RecommendationSignalEventV1 = z.infer<typeof recommendationSignalEventSchema>;

export const policyDecisionReceiptPayloadSchema = z.object({
  decisionId: z.string().min(1),
  recommendationEventId: z.string().uuid().optional(),
  decision: z.enum(['accepted', 'rejected', 'applied']),
  decidedBy: z.string().min(1),
  decisionReason: z.string().min(1).optional(),
  policyRevision: z.string().min(1),
  resultingStateHash: z.string().min(1).optional(),
  sourceEvidenceRefs: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PolicyDecisionReceiptPayloadV1 = z.infer<typeof policyDecisionReceiptPayloadSchema>;

export const policyDecisionReceiptEventSchema = eventFabricEnvelopeSchema.extend({
  eventType: z.literal('policy.decision.receipt'),
  payload: policyDecisionReceiptPayloadSchema,
});

export type PolicyDecisionReceiptEventV1 = z.infer<typeof policyDecisionReceiptEventSchema>;

export const checkpointCommitPayloadSchema = z.object({
  checkpointId: z.string().min(1),
  stream: z.string().min(1),
  startOffset: z.string().min(1),
  endOffset: z.string().min(1),
  eventCount: z.number().int().min(0),
  firstOccurredAt: z.string().datetime(),
  lastOccurredAt: z.string().datetime(),
  merkleRoot: z.string().min(1),
  schemaRevision: z.string().min(1),
  modelRevisionSetHash: z.string().min(1).optional(),
  sourceRevisionSetHash: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CheckpointCommitPayloadV1 = z.infer<typeof checkpointCommitPayloadSchema>;

export const checkpointCommitEventSchema = eventFabricEnvelopeSchema.extend({
  eventType: z.literal('checkpoint.commit'),
  payload: checkpointCommitPayloadSchema,
});

export type CheckpointCommitEventV1 = z.infer<typeof checkpointCommitEventSchema>;

export const artifactMaterializedPayloadSchema = z.object({
  actionKey: z.string().min(16),
  artifactId: z.string().min(1),
  artifactHash: z.string().min(16),
  checksum: z.string().min(16),
  revisionSetHash: z.string().min(16),
  storage: artifactStorageSchema,
  locatorPath: z.string().min(1).optional(),
  byteLength: z.number().int().nonnegative().optional(),
  producer: z.string().min(1),
  producerRevision: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ArtifactMaterializedPayloadV1 = z.infer<typeof artifactMaterializedPayloadSchema>;

export const artifactMaterializedEventSchema = eventFabricEnvelopeSchema.extend({
  eventType: z.literal('artifact.materialized'),
  payload: artifactMaterializedPayloadSchema,
});

export type ArtifactMaterializedEventV1 = z.infer<typeof artifactMaterializedEventSchema>;

export const artifactFailedPayloadSchema = z.object({
  actionKey: z.string().min(16),
  operation: z.string().min(1),
  failureClass: atlasFailureClassSchema,
  retryable: z.boolean(),
  retryCount: z.number().int().min(0),
  retryBudget: z.number().int().min(0).default(0),
  errorHash: z.string().min(1),
  inputArtifactRefs: z.array(z.string().min(1)).default([]),
  revisionSetHash: z.string().min(16).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ArtifactFailedPayloadV1 = z.infer<typeof artifactFailedPayloadSchema>;

export const artifactFailedEventSchema = eventFabricEnvelopeSchema.extend({
  eventType: z.literal('artifact.failed'),
  payload: artifactFailedPayloadSchema,
});

export type ArtifactFailedEventV1 = z.infer<typeof artifactFailedEventSchema>;

export const eventFabricEventSchema = z.discriminatedUnion('eventType', [
  codeEvidencePersistedEventSchema,
  failureObservationEventSchema,
  analyticsObservationEventSchema,
  recommendationSignalEventSchema,
  policyDecisionReceiptEventSchema,
  checkpointCommitEventSchema,
  artifactMaterializedEventSchema,
  artifactFailedEventSchema,
]);

export type EventFabricEventV1 = z.infer<typeof eventFabricEventSchema>;

export type EventFabricHandler<TEvent extends EventFabricEventV1 = EventFabricEventV1> = (
  event: TEvent
) => Promise<void>;

export type EventFabricHandlerRegistry = {
  [K in EventFabricType]: EventFabricHandler<Extract<EventFabricEventV1, { eventType: K }>>;
};

export function createDefaultEventFabricHandlers(): EventFabricHandlerRegistry {
  return {
    'code.evidence.persisted': async () => {},
    'failure.observed': async () => {},
    'analytics.observed': async () => {},
    'recommendation.signal': async () => {},
    'policy.decision.receipt': async () => {},
    'checkpoint.commit': async () => {},
    'artifact.materialized': async () => {},
    'artifact.failed': async () => {},
  };
}

export function parseEventFabricMessage(raw: unknown): EventFabricEventV1 {
  return eventFabricEventSchema.parse(raw);
}
