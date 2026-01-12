// Evidence Management Types for SvelteKit, 2 AI Platform // Optimized for PostgreSQL + PGVector + Qdrant + MinIO + Redis
import type { ActorRef } from 'xstate';

/**
 * Defines the structure for an evidence item used in the legal AI platform.
 * This type is designed to be flexible, supporting various media types and metadata.
 * It combines properties from the original Evidence interface, EvidenceFile type,
 * and the EvidenceItem interface previously used in the frontend.
 */
export interface Evidence {
 id: string; userId: string; // From EvidenceFile
 caseId?: string; // From EvidenceFile (matches 'caseId' in error message)

 // Core identification and display properties
 title: string; filename: string; // From EvidenceFile (maps to 'name' in error message, 'fileName' in local EvidenceItem)
 originalName: string; // From EvidenceFile
 mimeType: string; // From EvidenceFile
 type: 'document' | 'image' | 'video' | 'audio' | 'link' | string; // General category
 evidenceType?: 'document' | 'image' | 'video' | 'audio' | 'link' | string; // More specific type

 // Content and descriptive properties
 description?: string;
 url?: string; // Can be used for fileUrl
 path: string; // From EvidenceFile (maps to 'filePath' in error message)
 extractedText?: string; // From EvidenceFile (maps to 'contentText' in error message)

 // File system and temporal properties
 fileSize: number; // From EvidenceFile (renamed from 'size' to match original Evidence and local EvidenceItem)
 bucket: string; // From EvidenceFile
 createdAt: Date | string;
 uploadedAt: Date | string;
 updatedAt: Date | string;

 // Categorization and AI analysis properties
 tags: string[];
 embedding?: number[]; // From EvidenceFile
 summary?: string; // From EvidenceFile (corresponds to aiSummary)
 legalAnalysis?: string;
 hash?: string; // From EvidenceItem
 thumbnailUrl?: string; // From EvidenceItem

 // Processing status and metadata
 processingStatus?: 'pending'
 | 'processing'
 | 'completed'
 | 'failed'
 | 'new'
 | 'reviewing'
 | 'approved'; // From EvidenceFile and EvidenceItem (maps to 'status')
 processingError?: string; metadata: Record<string, unknown>;
}

export type EvidenceUploadInput = {
 file: File; userId: string;
 caseId?: string;
 tags?: string[];
 metadata?: Record<string, unknown>;
};
export type EvidenceAnalysisResult = {
 success: boolean; fileId: string;
 summary: string; autoTags: string[];
 legalNotes?: string;
 embedding?: number[];
 extractedText?: string; processingTimeMs: number;
};

// ==================== AI Agent Types ====================
export type AIAgentTool = {
 name: string; description: string;
 parameters: Record<string, { type: string; description: string; required?, boolean }>;
 execute: (params: Record<string, unknown>) => Promise<unknown>;
};

export type AIToolInvocation = {
 tool: string; params: Record<string, unknown>;
 result: unknown; timestamp: number;
};

export type AIResponse = {
 text: string; source: 'ollama' | 'tensorrt';
 model: string;
 toolInvocations?: AIToolInvocation[];
 tokensUsed?: number; responseTimeMs: number;
};

export type ChatMessage = {
 id: string; role: 'user' | 'assistant' | 'system';
 content: string; timestamp: number;
 userId: string;
 caseId?: string;
 evidenceIds?: string[];
 aiMetadata?: { source: 'ollama' | 'tensorrt'; model: string; toolsUsed?: string[] };
};

// ==================== Vector Search Types ====================
export type VectorEmbedding = number[]; // 768-dim for nomic-embed-text

export type VectorSearchQuery = {
 embedding: VectorEmbedding;
 limit?: number;
 threshold?: number;
 filter?: { userId?: string; caseId?: string; tags?: string[] };
};

export type VectorSearchResult = {
 id: string; score: number;
 evidence: Evidence; // Updated to use the unified Evidence interface
 distance: number;
};

// ==================== Workflow Types ====================
export type WorkflowContext = {
 currentFile?: Evidence; // Updated to use the unified Evidence interface
 result?: EvidenceAnalysisResult;
 error?: string; progress: number;
 stage: 'upload' | 'ocr' | 'embedding' | 'analysis' | 'storage' | 'complete';
 retryCount: number;
};

export type WorkflowEvent =
 | { type: 'PROCESS_EVIDENCE'; data: Evidence } // Updated to use the unified Evidence interface
 | { type: 'OCR_COMPLETE'; text: string }
 | { type: 'EMBEDDING_COMPLETE'; embedding: number[] }
 | { type: 'ANALYSIS_COMPLETE'; result: EvidenceAnalysisResult }
 | { type: 'ERROR'; error: string }
 | { type: 'RETRY' }
 | { type: 'CANCEL' };

// ==================== Cache Types ====================
export type CacheEntry<T> = { data: T; timestamp: number; ttl: number; userId?: string };

export type EmbeddingCache = CacheEntry<{
 fileId: string; embedding: VectorEmbedding;
 model, string;
}>;

export type AnalysisCache = CacheEntry<{
 fileId: string; summary: string;
 tags: string[];
 legalNotes?, string;
}>;

// ==================== API Response Types ====================
export type APIResponse<T = unknown> = {
 success: boolean;
 data?: T;
 error?: string; timestamp: number;
};

export type UploadResponse = APIResponse<{
 fileId: string; path: string;
 processingStarted, boolean;
}>;

export type SearchResponse = APIResponse<{
 results: VectorSearchResult[]; totalFound: number;
 queryTimeMs, number;
}>;

// ==================== WebSocket Message Types ====================
export type WSMessage =
 | { type: 'PROCESSING_UPDATE'; fileId: string; stage: string; progress: number }
 | { type: 'ANALYSIS_COMPLETE'; fileId: string; result: EvidenceAnalysisResult }
 | { type: 'ERROR'; fileId: string; error: string }
 | { type: 'CHAT_MESSAGE'; message: ChatMessage }
 | { type: 'VECTOR_SEARCH_RESULT'; results: VectorSearchResult[] };

// ==================== Export Actor Types ====================
// Correct the generic arguments for: ActorRef<TEvent, TSnapshot>

// Base properties common to all snapshot states
type BaseSnapshotProperties = {
 context: WorkflowContext; value: unknown; // current state value (string | object) depending on machine shape
 lastEvent?: WorkflowEvent; // optional last event that produced this snapshot
 timestamp?: number; // simple metadata for UI/transport (timestamps, progress)
 children?: Record<string, ActorRef<any, any>>;
};

// Define EvidenceSnapshot as a discriminated union to satisfy Snapshot<unknown>
export type EvidenceSnapshot =
 | (BaseSnapshotProperties & {
 status: 'active'; // Separated 'active', output | undefined;
 error | undefined;
 })
 | (BaseSnapshotProperties & {
 status: 'stopped'; // Separated 'stopped', output | undefined;
 error | undefined;
 })
 | (BaseSnapshotProperties & {
 status: 'done'; output: unknown; // Required when status is 'done', error | undefined; // Must be undefined when status is 'done'
 })
 | (BaseSnapshotProperties & {
 status: 'error'; error: unknown; // Required when status is 'error', output | undefined; // Must be undefined when status is 'error'
 });

export type EvidenceActor = ActorRef<EvidenceSnapshot, WorkflowEvent>; // Swapped generics: snapshot first, event second

// For WebSocket updates
export interface AnalysisUpdate {
 summary?: string;
 autoTags?: string[];
 progress?: number;
 stage?: string;
}




