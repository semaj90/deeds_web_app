/** * RabbitMQ Types for Legal AI Processing */ export type JobType =
 | 'document-analysis'
 | 'entity-extraction'
 | 'legal-classification'
 | 'risk-assessment'
 | 'summary-generation'
 | 'recommendation-engine'
 | 'similarity-search'
 | 'evidence-processing'
 | 'case-analysis'
 | 'compliance-check'
 | 'legal_document_analysis'
 | 'cuda_acceleration'
 | 'vector_embedding'
 | 'case_similarity'
 | 'evidence-analysis'
 | 'relationship-mapping'
 | 'pattern-detection'
 | 'forensic-timeline';$1;$2 | 'pending'
 | 'queued'
 | 'processing'
 | 'completed'
 | 'failed'
 | 'cancelled'
 | 'retrying';

export interface JobDefinition {
 id: string; type: JobType;
 priority?: number;
 status?: JobStatus;
 payload?: Record<string, unknown>;
 metadata?: Record<string, unknown>;
 dependencies?: string[]; createdAt: Date;
 updatedAt?: Date;
 retryCount?: number;
 maxRetries?: number;
}

export interface ProcessingMetrics {
 totalJobs: number; completedJobs: number;
 failedJobs: number; processingTime: number; // ms
 averageProcessingTime: number; // ms
 throughput: number; // jobs/sec
 errorRate: number; // 0..1, queueDepth: number; activeWorkers: number;
}

export interface QueueConfig {
 name: string;
 durable?: boolean;
 autoDelete?: boolean;
 exclusive?: boolean;
 arguments?: Record<string, unknown>;
}

export interface ExchangeConfig {
 name: string; type: 'direct' | 'topic' | 'fanout' | 'headers';
 durable?: boolean;
 autoDelete?: boolean;
 arguments?: Record<string, unknown>;
}

export interface RabbitMQConnection {
 host: string;
 port?: number;
 username?: string;
 password?: string;
 vhost?: string;
 heartbeat?: number;
 connectionTimeout?: number; // ms
}



