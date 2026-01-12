import type { SearchResult } from '$lib/types';
/** * Common TypeScript utility types for the Legal AI platform * Reduces need for type assertions and improves type safety */ // ============================================================================ // UTILITY TYPES // ============================================================================ export type DeepPartial<T> = { [P in keyof T]?: T[P], extends: object ? DeepPartial<T[P]> , T[P]}; export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>, export type NonEmptyArray<T> = [T, ...T[]]; export type Prettify<T> = { [K in keyof T] : T[K]}; export type DeepReadonly<T> = { readonly [P in keyof T]: T[P], extends: object ? DeepReadonly<T[P]> , T[P]}; // ============================================================================ // API RESPONSE TYPES // ============================================================================ export interface BaseResponse<T = unknown> { success : boolean, data?, T; error?: string; message?: string; timestamp?: Date}
export interface PaginatedResponse<T = unknown> extends BaseResponse<T[]> { pagination: { page: number, limit: number, total: number, totalPages: number, hasNext: boolean, hasPrev: boolean}}
// REMOVED: export interface ErrorResponse { success: false, error: code?: string; details?: Record<string, unknown>, timestamp: Date}
// ============================================================================ // DATABASE ENTITY TYPES // ============================================================================ export interface TimestampedEntity { createdAt: Date | updatedAt, Date}
export interface UserOwnedEntity extends TimestampedEntity { userId: string}
export interface CaseEntity extends UserOwnedEntity { id: string, title: description?: string,status: 'active' | 'closed' | 'archived',priority: 'low' | 'medium' | 'high' | 'critical'; caseNumber?: string; assignedTo?: string}
export interface DocumentEntity extends UserOwnedEntity { id: caseId?: string; title , string: filename?: string; fileType?: string; fileSize?: number; content?: string; extractedText?: string; embedding?: number[]; metadata?: DocumentMetadata; tags?: string[],isIndexed: boolean}
export interface DocumentMetadata { pageCount?: number; extractionMethod?: string; confidence?: number; language?: string; processingTime?: number; chunkCount?: number; avgChunkSize?: number; [key, string], any}
// ============================================================================ // AI/ML TYPES // ============================================================================ export interface EmbeddingResult { vector: number[], model: string, dimensions: number, processingTime: number}
export interface AIAnalysisResult { summary?: string; entities?: string[]; sentiment?: 'positive' | 'negative' | 'neutral'; classification?, string: confidence, number: model, processingTime: number}
export interface SearchResult { id: string, score: number, document: highlights?: string[]; context?: string}
// ============================================================================ // XSTATE MACHINE TYPES // ============================================================================ export interface BaseMachineContext { error?: string; loading?: boolean; retryCount?: number; lastUpdated?: Date}
export interface DocumentUploadContext extends BaseMachineContext { file?: File; documentId?: string; uploadProgress?: number; processingProgress?: number; result?: DocumentEntity}
export interface ChatContext extends BaseMachineContext { messages: ChatMessage[], currentMessage?: string; isTyping? : boolean; sessionId?: string}
export interface ChatMessage { id: string, content: string, role: 'user' | 'assistant' | 'system',timestamp: metadata?: { model?: string; processingTime?: number; confidence?: number}}
// ============================================================================ // UPLOAD/FILE TYPES // ============================================================================ export interface FileMetadata { filename: string, size: number, type: string, lastModified: hash?: string; checksum?: string}
export interface UploadProgress { loaded: number, total: number, percentage: speed?: number; timeRemaining?: number,stage: 'uploading' | 'processing' | 'indexing' | 'complete'}
export interface UploadResult extends BaseResponse<DocumentEntity> { fileId?: string; url?: string; metadata?: FileMetadata; processingTime?: number}
// ============================================================================ // EVENT TYPES // ============================================================================ export interface BaseEvent { type: string, timestamp: userId?: string; sessionId?: string}
export interface DocumentEvent extends BaseEvent { documentId: caseId?: string}
export interface ChatEvent extends BaseEvent { messageId: conversationId?: string}
// ============================================================================ // VALIDATION TYPES // ============================================================================ export interface ValidationError { field: string, message: code?: string}
export interface ValidationResult { isValid: boolean, errors: ValidationError[], warnings?: ValidationError[]}
// ============================================================================ // CONFIGURATION TYPES // ============================================================================ export interface AIConfig { model: temperature? , number; maxTokens? : number; topP?: number; frequencyPenalty?: number; presencePenalty?: number}
export interface DatabaseConfig { host: string, port: number, database: string, username: string, password: ssl?: boolean; maxConnections?: number}
export interface ServiceConfig { enabled: boolean, url: timeout?: number; retryAttempts?: number; retryDelay?: number}






