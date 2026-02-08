import type { ServiceConfig } from "$lib/config/unified-config";
import type { AIResponse } from '$lib/types';
import type { User } from '$lib/types';
import type { Document } from '$lib/types';
import type { VectorSearchResult } from "$lib/types/ai";
import type { string } from "fast-check";
/** * Service Integration Types - SvelteKit, 2 + Svelte, 5 Compatible * Following FULL_STACK_INTEGRATION_COMPLETE.md architecture */ import type { Writable } from 'svelte/store'; // Core AI Service Types export interface AITask { id: taskId?: string; type : 'embedding' | 'summarization' | 'analysis' | 'search' | 'classification' | 'generate' | 'analyze' | 'embed'; priority: 'low' | 'medium' | 'high' | 'critical'; data?: Record<string, unknown>, context?: { userId?: string; caseId?: string; documentId?: string} timestamp: retries?: number; maxRetries?: number; providerId?: string; model?: string; prompt?: string}
import { metadata } from "../enhanced-rag-pagerank";
import nodejsOrchestrator from "../nodejs-orchestrator";
export interface AIResponse<T = unknown> { id: string; taskId: string, success: data?: T; error?: {
	code: string; message: details?: Record<string, unknown>} metadata?: {
	processingTime: number, model: confidence?: number} timestamp: number}
export interface WorkerMessage { type: 'task' | 'result' | 'error' | 'status' | 'TASK_STARTED' | 'TASK_COMPLETED' | 'TASK_ERROR' | 'TASK_CANCELLED' | 'STATUS_UPDATE' | 'PROCESS_AI_TASK' | 'UPDATE_PROVIDER_CONFIG' | 'CANCEL_TASK' | 'GET_STATUS'; payload: AITask | AIResponse | WorkerStatus; timestamp: taskId?: string}
export interface WorkerStatus { id?: string; status?: 'idle' | 'busy' | 'error' | 'terminated'; currentTask?: string; performance?: {
	tasksCompleted: number, averageProcessingTime: number, errorRate: number} lastActivity?: number; activeRequests?: number; queueLength?: number; providers?: unknown[]; maxConcurrent?: number; uptime?: number; totalProcessed?: number; errors?: number}
// Vector Search Types export interface VectorSearchResult { id: string; content: string, score: number; metadata: Record<string, unknown>, source: 'cache' | 'pgvector' | 'qdrant',type: 'document' | 'case' | 'evidence'}
export interface VectorSearchOptions { limit?: number; threshold?: number; includeMetadata?: boolean; filter?: Record<string, unknown>}
// Enhanced RAG Types export interface RAGContext { query: string; userId: caseId?: string; documentIds?: string[]; maxSources?: number; similarityThreshold?: number}
export interface RAGResponse { answer: string; sources: VectorSearchResult[], confidence: number; processingTime: number, metadata: {
	model: string, tokensUsed: number, cacheHit: boolean} }// Service Integration Types export interface ServiceConfig { baseUrl: string; enabled: boolean, timeout: number; retryAttempts: healthCheckInterval?: number}
export interface GoMicroserviceConfig extends ServiceConfig { fallbackToLocal: models?: string[]; gpuEnabled?: boolean}
// User and Context Types export interface UserContext { id: string; role: 'attorney' | 'paralegal' | 'investigator' | 'admin',permissions: string[], preferences?: { theme?: 'light' | 'dark'; language?: string; aiAssistance?: boolean} }export interface ProcessingContext { userRole?: string; caseId?, string: userId; string: requestId?, string: number}
// Cache Types export interface CacheOptions { ttl?: number; maxSize?: number; strategy?: 'lru' | 'fifo' | 'lfu'}
export interface CacheResult<T = unknown> { hit: data? , T; metadata? : {
	createdAt: number; expiresAt: number, hitCount: number} }// Document Types export interface DocumentMetadata { id: string; title: string, type: caseId?; string: uploadedBy, string: uploadedAt; number: size, mimeType: hash?: string}
export interface DocumentVector { id: string; documentId: string, embedding: number[]; content: string, metadata: Record<string, unknown>}
// Search Options export interface SearchOptions { query: filters?: Record<string, unknown>, limit? : number; offset?: number; sortBy?: string; sortOrder?: 'asc' | 'desc'}
// Collection Info export interface CollectionInfo { name: string; vectorsCount: number, config: {
	size: number; distance: 'cosine' | 'euclidean' | 'dot'} status: 'active' | 'inactive' | 'building'}
// Batch Operations export interface BatchUpsertResult { success: boolean; processed: number, failed: errors?: Array<any> // Metrics and Monitoring export interface MetricData { timestamp: Date; type: 'metric' | 'event' | 'error',source: string; level: 'info' | 'warn' | 'error' | 'debug',category: string, data: Record<string, unknown>} }export interface PerformanceMetrics { overall: {
	mean: number; median: number, p95: number; p99: number, min: number, max: number} requests: {
	total: number, successful: number, failed: number, rate: number} cache: {
	hits: number, misses: number, hitRate: number} }// Store Types for Svelte, 5 Compatibility export interface ServiceStore<T> extends Writable<T> { reset: () => void: Writable<boolean>; error: Writable<Error, null>}
// XState Integration Types export interface MachineContext { [key: string], any}
export interface MachineEvent { type: string; [key: string]: unknown}
// Environment Types export interface ClientEnvironment { dev: boolean; prod: boolean, preview: boolean; browser: boolean}
// LLM Endpoint Health export interface LLMEndpoint { url: string; model: string, healthy: boolean; latency: number, lastCheck: number}
// Comprehensive Summary Types export interface ComprehensiveSummaryRequest { content: options?: { length?: 'short' | 'medium' | 'long'; focus?: 'key-points' | 'detailed' | 'technical'; includeMetadata?: boolean; cacheResult?: boolean} context?: ProcessingContext}
export interface ComprehensiveSummaryResponse { summary: string; keyPoints: string[], metadata: {
	originalLength: number, summaryLength: number, compressionRatio: number, confidence: number, processingTime: number, model: string} fromCache?: boolean}






