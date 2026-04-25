/**
 * RabbitMQ Queue Message Contracts
 * Central type definitions for all queue messages
 *
 * Usage:
 *   import { AudioProcessJob, QUEUE_NAMES } from '$lib/contracts/queues';
 *   await rabbitmq.publish(QUEUE_NAMES.AUDIO_PROCESS, job);
 */

// ============================================================================
// Queue Message Payloads
// ============================================================================

export interface AudioProcessJob {
  evidenceId: string;
  filePath: string;
  fileName: string;
  caseId: string | null;
  userId: string;
  timestamp: number;
}

export interface AudioProcessResult {
  evidenceId: string;
  status: 'complete' | 'error';
  transcript?: {
    transcriptId: string;
    text: string;
    language: string;
    duration: number;
    segmentCount: number;
  };
  segments?: {
    indexed: number;
    embedded: number;
    qdrantUpserted: number;
  };
  analysis?: {
    summary: string;
    entityCount: number;
    tags: string[];
  };
  error?: string;
}

export interface DocumentEmbedJob {
  documentId: string;
  filePath: string;
  fileName: string;
  sessionId: string;
  caseId: string | null;
  userId: string;
  timestamp: number;
}

export interface VectorIndexJob {
  entityId: string;
  entityType: 'evidence' | 'document' | 'case' | 'statute' | 'citation';
  text: string;
  embedding?: number[]; // Optional - may be computed in worker
  metadata: Record<string, unknown>;
  caseId?: string;
  userId?: string;
}

export interface EvidenceProcessJob {
  evidenceId: string;
  text: string;
  caseId: string;
  fileName: string;
  metadata: {
    fileSize: number;
    mimeType: string;
    hash: string;
  };
}

export interface SynthesisJob {
  requestId: string;
  query: string;
  context: string[];
  caseId?: string;
  userId: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatContextJob {
  sessionId: string;
  messageId: string;
  userId: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
}

export interface AnalyticsTrackJob {
  userId: string;
  event: string;
  properties: Record<string, unknown>;
  timestamp: number;
  sessionId?: string;
}

export interface CacheInvalidateJob {
  pattern: string;
  scope: 'redis' | 'memory' | 'both';
  reason?: string;
  timestamp: number;
}

// ============================================================================
// Queue Names (Centralized Constants)
// ============================================================================

export const QUEUE_NAMES = {
  AUDIO_PROCESS: 'audio.process',
  DOCUMENT_EMBED: 'chat.document.embed',
  VECTOR_INDEX: 'vector.index',
  EVIDENCE_PROCESS: 'evidence.process',
  SYNTHESIS: 'synthesis.generate',
  CHAT_CONTEXT: 'chat.context',
  ANALYTICS_TRACK: 'analytics.track',
  CACHE_INVALIDATE: 'cache.invalidate',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

// ============================================================================
// Type Guards
// ============================================================================

export function isAudioProcessJob(job: unknown): job is AudioProcessJob {
  return (
    typeof job === 'object' &&
    job !== null &&
    'evidenceId' in job &&
    'filePath' in job &&
    'fileName' in job
  );
}

export function isDocumentEmbedJob(job: unknown): job is DocumentEmbedJob {
  return (
    typeof job === 'object' &&
    job !== null &&
    'documentId' in job &&
    'filePath' in job &&
    'sessionId' in job
  );
}

export function isVectorIndexJob(job: unknown): job is VectorIndexJob {
  return (
    typeof job === 'object' &&
    job !== null &&
    'entityId' in job &&
    'entityType' in job &&
    'text' in job
  );
}

// ============================================================================
// Queue Configuration
// ============================================================================

export interface QueueConfig {
  name: QueueName;
  durable: boolean;
  autoDelete: boolean;
  deadLetterExchange?: string;
  messageTtl?: number; // milliseconds
  maxPriority?: number;
}

export const QUEUE_CONFIGS: Record<QueueName, QueueConfig> = {
  [QUEUE_NAMES.AUDIO_PROCESS]: {
    name: QUEUE_NAMES.AUDIO_PROCESS,
    durable: true,
    autoDelete: false,
    deadLetterExchange: 'dlx.audio',
    messageTtl: 300_000, // 5 minutes
  },
  [QUEUE_NAMES.DOCUMENT_EMBED]: {
    name: QUEUE_NAMES.DOCUMENT_EMBED,
    durable: true,
    autoDelete: false,
    deadLetterExchange: 'dlx.document',
    messageTtl: 600_000, // 10 minutes
  },
  [QUEUE_NAMES.VECTOR_INDEX]: {
    name: QUEUE_NAMES.VECTOR_INDEX,
    durable: true,
    autoDelete: false,
    messageTtl: 120_000, // 2 minutes
  },
  [QUEUE_NAMES.EVIDENCE_PROCESS]: {
    name: QUEUE_NAMES.EVIDENCE_PROCESS,
    durable: true,
    autoDelete: false,
    deadLetterExchange: 'dlx.evidence',
    messageTtl: 300_000, // 5 minutes
  },
  [QUEUE_NAMES.SYNTHESIS]: {
    name: QUEUE_NAMES.SYNTHESIS,
    durable: true,
    autoDelete: false,
    messageTtl: 300_000, // 5 minutes (LLM timeout)
  },
  [QUEUE_NAMES.CHAT_CONTEXT]: {
    name: QUEUE_NAMES.CHAT_CONTEXT,
    durable: true,
    autoDelete: false,
    messageTtl: 60_000, // 1 minute
  },
  [QUEUE_NAMES.ANALYTICS_TRACK]: {
    name: QUEUE_NAMES.ANALYTICS_TRACK,
    durable: true,
    autoDelete: false,
    messageTtl: 30_000, // 30 seconds
  },
  [QUEUE_NAMES.CACHE_INVALIDATE]: {
    name: QUEUE_NAMES.CACHE_INVALIDATE,
    durable: false, // ephemeral - ok to lose on restart
    autoDelete: false,
    messageTtl: 10_000, // 10 seconds
  },
};
