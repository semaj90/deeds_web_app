/**
 * HyperRAG Projection Contract
 * Typed interface for outbox entries dispatched to the projection worker.
 * The worker owns all mirror writes: Qdrant, TurboVec, BitFrost.
 */

export interface HyperRagProjectionRequest {
  /** Canonical packet identity */
  packetKey: string;
  sourceRef: string;
  directoryPath: string;
  featureId: string;

  /** Embedding payload — only 384-dim canonical vectors */
  embeddingValues: number[];
  embeddingModel: string;
  embeddingDim: 384;

  /** Qdrant target collection */
  qdrantCollection: string;

  /** Payload fields forwarded to Qdrant */
  qdrantPayload: {
    packet_key: string;
    source_ref: string;
    directory_path: string;
    feature_id: string;
    feature_label: string;
    summary: string;
    domain?: string | null;
  };

  /** Used by TurboVec for routing */
  clusterId?: string | null;

  /** Monotonic enqueue timestamp (ms since epoch) */
  enqueuedAt: number;

  /** Originating pipeline for observability */
  pipelineSource: 'hyperrag-pipeline' | 'ae-train-pipeline' | 'backfill';
}

export type ProjectionStatus =
  | 'pending'
  | 'processing'
  | 'qdrant_ok'
  | 'turbovec_ok'
  | 'bitfrost_ok'
  | 'complete'
  | 'error';

export interface ProjectionOutboxRow extends HyperRagProjectionRequest {
  outboxId: string;
  status: ProjectionStatus;
  errorMessage?: string;
  processedAt?: number;
  retryCount: number;
}
