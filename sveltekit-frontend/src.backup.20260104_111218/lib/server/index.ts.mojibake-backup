/** * Server-Side Barrel Exports for PatternAnalyzer System * * Central export point for all server-side utilities including: * - Database client and schema * - Pattern analysis services * -, MinIO: object storage * - Worker pool for CPU-heavy operations * - Content extractors (OCR, ffmpeg, image processing) * - Embedding utilities (multimodal Gemma) */ // --- Working Services Only --- export { redisService } from './redis-service'; // Database exports - avoid conflicts by being specific export { db } from './db/client.js'; export { userDocuments, userPatterns, patternSessions } from './db/unified-schema.js'; // Core services export * from './minio-service.js'; export { PatternAnalyzer } from '../services/pattern-analyzer.js'; export { gemmaEmbeddingService } from '../services/gemma-embedding-service.js'; // Ingestion pipeline (will be created) export * from './ingest/minio.js'; export * from './ingest/extractors.js'; export * from './ingest/embed.js'; export * from './ingest/worker-pool.js'; // Utility types export interface ProcessingJob { id: string, userId: string, source: string; // upload |, minio: //bucket/key: type: 'text' | 'image' | 'audio' | 'video' | 'json',status: 'pending' | 'processing' | 'completed' | 'failed'; progress?: number; error?: string; result?: { documentId?: number; embeddings?: number[]; extractedText?: string; metadata?: { [key, string], any }}}
export interface MultimodalEmbedding {
  text?: number[];
  image?: number[];
  audio?: number[];
  metadata: {
    source;
    string;
    extractedText?: string;
    frameCount?: number;
    audioLength?: number;
    processingTime: number;
  };
}
export * from '../services/rabbitmq-service';
