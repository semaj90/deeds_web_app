export type AtlasClient =
  | 'CLAUDE_CODE' | 'CODEX' | 'OPENCODE' | 'SYSTEM' | 'UNKNOWN';

export type AtlasProtocol = 'MCP' | 'ACP' | 'A2A' | 'INTERNAL';

export interface EventLineageV1 {
  eventId: string;
  occurredAt: string;
  requestId?: string;
  traceId?: string;
  taskId?: string;
  correlationId?: string;
  causationId?: string;
  client?: AtlasClient;
  protocol?: AtlasProtocol;
  workspaceRevision?: string;
  sourceRevision?: string;
  graphRevision?: string;
  modelRevision?: string;
  toolCatalogRevision?: string;
}

export interface WorkCommandV1<T> {
  envelopeVersion: 'atlas.work-command.v1';
  commandType: string;
  lineage: EventLineageV1;
  payload: T;
}

export interface IntegrationEventV1<T> {
  envelopeVersion: 'atlas.integration-event.v1';
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  lineage: EventLineageV1;
  producerId: string;
  producerRevision: string;
  payload: T;
}

export interface AnalyticsEventV1<T> {
  envelopeVersion: 'atlas.analytics-event.v1';
  eventType: string;
  lineage: EventLineageV1;
  payload: T; // analytics never establishes canonical truth
}

export type AtlasFailureClass =
  | 'TRANSIENT_DEPENDENCY' | 'TIMEOUT' | 'RATE_LIMIT'
  | 'POSTGRES_UNAVAILABLE' | 'QDRANT_UNAVAILABLE'
  | 'VALKEY_UNAVAILABLE' | 'BROKER_UNAVAILABLE'
  | 'GPU_OOM' | 'GPU_RUNTIME'
  | 'SCHEMA_REJECTED' | 'PROVENANCE_MISSING'
  | 'REVISION_MISMATCH' | 'IDENTITY_MISMATCH'
  | 'STALE_ARTIFACT' | 'MODEL_INVALID_JSON'
  | 'MODEL_TOOL_FORMAT' | 'TOOL_PERMISSION'
  | 'TOOL_NOT_FOUND' | 'POLICY_REJECTED' | 'UNKNOWN';

export interface FailureObservationV1 {
  envelopeVersion: 'atlas.failure-observation.v1';
  lineage: EventLineageV1;
  component: string;
  operation: string;
  failureClass: AtlasFailureClass;
  retryable: boolean;
  retryCount: number;
  retryBudget: number;
  errorHash: string;
  evidenceRefs: string[];
}

export type RecommendationAction = 'PREFETCH' | 'PREFILL' | 'BOOST' | 'KEEP_HOT';

export interface RecommendationSignalV1 {
  envelopeVersion: 'atlas.recommendation-signal.v1';
  generatedAt: string;
  scope: {
    sessionId?: string;
    taskId?: string;
    domainId?: string;
  };
  targetType: 'PACKET' | 'DOCUMENT' | 'TOOL' | 'SYMBOL' | 'CENTROID';
  targetId: string;
  score: number;
  action: RecommendationAction;
  featureRevision: string;
  modelRevision: string;
  evidenceRefs: string[];
  expiresAt: string;
}

export interface PolicyDecisionReceiptV1 {
  envelopeVersion: 'atlas.policy-decision-receipt.v1';
  decisionId: string;
  createdAt: string;
  recommendationId?: string;
  action: 'ACCEPTED' | 'REJECTED' | 'APPLIED' | 'ROLLED_BACK' | 'EXPIRED';
  reasonCodes: string[];
  policyRevision: string;
  evidenceRefs: string[];
}

export interface CodeEvidencePersistedPayloadV1 {
  evidenceId: string;
  passKey: string;
  sourceRef: string;
  sourceRevision: string;
  parseNodeId?: string;
  packetKey?: string;
  logicalEvidenceHash: string;
  synthesisReceiptHash: string;
  posConceptPacketHash: string;
  schemaRevision: string;
}
