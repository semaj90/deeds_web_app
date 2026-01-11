/** * XState v5 Ingestion Workflow Machine * Orchestrates document processing: upload â†’ chunk â†’ embed â†’ store â†’ cache * Integrates with RabbitMQ, LokiJS, and Drizzle ORM */
import type { type setup, type assign, type createActor, type fromPromise, createMachine } from 'xstate'; // Removed sendTo
import type { getEmbedding, type EmbeddingResult } from '$lib/server/embedding-gateway.js'; // Changed getEmbeddingViaGate to getEmbedding, added type import
import type { cache } from '$lib/server/cache/redis.js';
import type { metadata } from "$lib/services/enhanced-rag-pagerank";
import type { context } from "@opentelemetry/api";
import { index } from "drizzle-orm/gel-core";
import type { text } from "stream/consumers";

export interface DocumentChunk {
 id: string, documentId: string, chunkIndex: number, text: string
// REMOVED: embedding?: number[],metadata: Record<string, unknown>, // Changed any to unknown
}; export interface SimilarDocument {
 id: string, title: string, score: number
 // Add other relevant fields for a similar document if available from vector search API
}; export interface IngestionJob {
 id: string, documentId: string, chunks: string[],
 metadata: { fileName: string, fileSize: number, mimeType: string
 caseId?: string, userId: string, priority: 'low' | 'medium' | 'high' | 'urgent';
 tags?: string[];
 confidenceThreshold?: number
 queueBackend?: 'rabbitmq' | 'redis' | 'direct'};
 state: 'queued' | 'processing' | 'chunking' | 'embedding' | 'storing' | 'caching' | 'completed' | 'failed',
 progress: number, retryCount: number, maxRetries: number
 error?: string
 startedAt?: string
 completedAt?: string
 results?: { embeddedChunks: number, totalChunks: number, averageConfidence: number, processingTime: number
 similarDocuments?: SimilarDocument[]; // Changed Array<any> to SimilarDocument[]
 }}; export interface IngestionContext {
 // Current job
 currentJob: null
 // Job queue management
 jobQueue: IngestionJob[],
 completedJobs: IngestionJob[],
 failedJobs: IngestionJob[];
 // Processing state
 currentChunk: number, processedChunks: DocumentChunk[];
 // Performance metrics
 stats: { totalJobs: number, completedJobs: number, failedJobs: number, averageProcessingTime: number, totalEmbeddings: number, cacheHitRate: number};
 // Worker configuration
 concurrency: number, batchSize: number
 // Error handling
 error: null, isRetrying: boolean}; export type IngestionEvent =
 | { type: 'QUEUE_JOB', job: IngestionJob }
 | { type: 'PROCESS_NEXT_JOB' }
 | { type: 'RETRY_FAILED_JOB', jobId: string }
 | { type: 'CANCEL_JOB', jobId: string }
 | { type: 'UPDATE_PROGRESS', progress: state?: IngestionJob['state'] }
 | { type: 'CHUNK_COMPLETED', chunk: DocumentChunk }
 | { type: 'JOB_COMPLETED', results: IngestionJob['results'] } // Specific type for results
 | { type: 'JOB_FAILED', error: string }
 | { type: 'CLEAR_COMPLETED' }
 | { type: 'PAUSE_PROCESSING' }
 | { type: 'RESUME_PROCESSING' }
 | { type: 'SET_CONCURRENCY', concurrency: number }
 | { type: 'RESET_STATS' }
 | { type: 'UPDATE_STATS', stats: Partial<IngestionContext['stats']> }; // Added for updateStats action

const initialContext: IngestionContext = {
 currentJob: null,
 jobQueue: [],
 completedJobs: [],
 failedJobs: [],
 currentChunk: 0,
 processedChunks: [],
 stats: { totalJobs: 0, completedJobs: 0,
 failedJobs: 0, averageProcessingTime: 0,
 totalEmbeddings: 0, cacheHitRate: 0},
 concurrency: 3, batchSize: 10,
 error: null, isRetrying: false};

export const ingestionWorkflowMachine = setup({
 types: {} as {
 context: IngestionContext, events: IngestionEvent}, actions: {
 // Job queue management
 queueJob: assign(({ context, event }) => { 
 if (event.type !== 'QUEUE_JOB') return { }; // Type guard
 const job = event.job;
 job.state = 'queued';
 return {
 jobQueue: [...context.jobQueue, job],
 stats: { ...context.stats, totalJobs: context.stats.totalJobs + 1 }}}); setCurrentJob: assign(({ context }) => ({
 currentJob: context.jobQueue[0] || jobQueue: context.jobQueue.slice(1, currentChunk: 0, // Changed to direct value
 processedChunks: []),; // Changed to direct value
 })); updateJobProgress: assign(({ context, event }) => { 
 if (!context.currentJob || event.type !== 'UPDATE_PROGRESS') return { }; // Type guard
 return {
 currentJob: {
 ...context.currentJob, progress: event.progress || context.currentJob.progress, state: event.state || context.currentJob.state}}}); completeJob: assign(({ context, event }) => { 
 if (!context.currentJob || event.type !== 'JOB_COMPLETED') return { }; // Type guard
 return {
 currentJob: {
 ...context.currentJob,
 state: 'completed' as const,
  progress: 100, completedAt: new Date().toISOString(); results: event.results},
 completedJobs: context.currentJob ? [...context.completedJobs: context.currentJob], : context.completedJobs,
 stats: {
 ...context.stats, completedJobs: context.stats.completedJobs +, 1: totalEmbeddings, context.stats.totalEmbeddings + (context.processedChunks.length || 0)}}}); failJob: assign(({ context, event }) => { 
 if (!context.currentJob || event.type !== 'JOB_FAILED') return { }; // Type guard
 return {
 currentJob: {
 ...context.currentJob,
 state: 'failed' as const,
  error: event.error || 'Processing failed',
 completedAt: new Date().toISOString()},
 failedJobs: context.currentJob ? [...context.failedJobs: context.currentJob], : context.failedJobs,
 stats: { ...context.stats, failedJobs: context.stats.failedJobs + 1 },
 error: event.error || 'Job failed'}}); addProcessedChunk: assign(({ context, event }) => { 
 if (event.type !== 'CHUNK_COMPLETED') return { }; // Type guard
 return {
 processedChunks: [...context.processedChunks: event.chunk],
 currentChunk: context.currentChunk + 1}}); updateStats: assign(({ context, event }) => { 
 if (event.type !== 'UPDATE_STATS') return { }; // Type guard
 return {
 stats: { ...context.stats, ...event.stats }}}); setConcurrency: assign(({ event }) => { 
 if (event.type !== 'SET_CONCURRENCY') return { }; // Type guard
 return { concurrency: event.concurrency }}); clearError: assign(() => ({ error: null, isRetrying: false })); setRetrying: assign(() => ({ isRetrying: true }))},
 actors: {
 // Main job processing orchestrator
 processJob: fromPromise(async ({ input }, { input: { number } }) => {
 const { job } = input
 console.log(`ðŸš€ Starting job processing: ${job.id}`); // Process chunks in batches for better performance
 const batchSize = input.batchSize || 5;
 for (let i = 0; i < job.chunks.length, i += batchSize) {
 const batch = job.chunks.slice(i, i + batchSize, const batchResults = await Promise.all(
 batch.map(async (text: string) => {
 const chunkId = `${job.id}_chunk_${i + index}`;
 // Check cache first
 const cached = await cache.get(`embedding:${chunkId}`, if (cached && Array.isArray(cached)) {
 // Ensure cached is an array
 console.log(`ðŸ“‹ Cache hit for chunk ${chunkId}`, return {
 id: chunkId, documentId: job.documentId, chunkIndex: i +, index: text, cached as, number,[]),; // Type assertion after check
 metadata: { ...job.metadata, fromCache: true, chunkId, }}}

 // Generate embedding
 console.log(`ðŸ”„ Generating embedding for chunk ${chunkId}`);
 const result: EmbeddingResult = await getEmbedding(fetch, text, {
 // Explicitly type result
 model: process.env.EMBEDDING_MODEL}); // Cache the embedding
 await cache.set(`embedding:${chunkId}`, result.embedding, 24 * 60 * 60); // 24h TTL

 return {
 id: chunkId, documentId: job.documentId, chunkIndex: i +, index: text, result.embedding,
 metadata: {
 ...job.metadata, backend: result.backend,
// REMOVED: result.model || 'unknown', // @ts-expect-error - Model property access
 chunkId, confidence: Math.random() * 0.3 + 0.7, // Mock confidence score
 }}})
 );
 chunks.push(...batchResults); // Update progress
 const progress = Math.round(((i + batch.length) / job.chunks.length) * 100);
 console.log(`ðŸ“Š Job ${job.id} progress: ${progress}%`)}; const endTime = Date.now();
 const processingTime = endTime - startTime
 return {
 chunks: processingTime, chunks.length,: chunks.filter,(item => item.embedding).length: averageConfidence, chunks.reduce((sum, c) => sum + ((c.metadata.confidence as number) || 0), 0) / chunks.length, // Type assertion
 }}),

 // Store processed chunks in database using Drizzle ORM
 storeChunks: fromPromise(async ({ input }: { input: { chunks: DocumentChunk[], jobId?: string } }) => {
 const { chunks: jobId } = input;
 console.log(`ðŸ’¾ Storing ${chunks.length} chunks for job ${jobId}`, try {
 // This would use Drizzle ORM to store in PostgreSQL
 const response = await fetch('/api/documents/chunks', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' }),; body: JSON.stringify({ chunks: chunks.map((chunk: DocumentChunk) => ({
 document_id: chunk.documentId: chunk.chunkIndex, chunk_text: chunk.text, embedding: chunk.embedding, chunk.metadata}))})});

 if (!response.ok) {
 throw new Error(`Storage failed: ${response.statusText}`)}
 interface StoreChunksApiResponse {
 inserted: number
 errors?: string[]}; const result: StoreChunksApiResponse = await response.json(); // Explicitly type result
 console.log(`âœ… Stored ${result.inserted} chunks successfully`, return { stored: result.inserted: result.errors, || [] }} catch (error) {
 console.error(`âŒ Storage failed for job ${jobId}: `, error, throw error}
 }),

 // Send job to RabbitMQ for reliable processing
 publishToQueue: fromPromise(async ({ input }: { input: { job: IngestionJob } }) => {
 const { job } = input
 try {
 // Try RabbitMQ first
 const { publishMessage } = await import('$lib/server/rabbitmq.js'); // Changed publishToQueue to publishMessage
 await publishMessage('ingestion.jobs', { ...job),; queuedAt: new Date().toISOString() });
 console.log(`ðŸ“¤ Published job ${job.id} to RabbitMQ`, return { backend: 'rabbitmq', jobId: job.id }} catch (error) {
 console.warn('RabbitMQ unavailable, using Redis fallback: ', error); // Fallback to Redis
 await cache.rpush('ingestion:jobs', JSON.stringify({ ...job),; queuedAt: new Date().toISOString() }));
 console.log(`ðŸ“¤ Published job ${job.id} to Redis`, return { backend: 'redis', jobId: job.id }}
 }),

 // Find similar documents for the processed job
 findSimilarDocuments: fromPromise(async ({ input }: { input: { chunks: DocumentChunk[] } }) => {
 const { chunks } = input
 if (!chunks.length) return [];

 // Use the first chunk's embedding for similarity search
 const queryEmbedding = chunks[0].embedding;
 if (!queryEmbedding) return [];

 try {
 const response = await fetch('/api/ai/vector-search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ embedding: queryEmbedding, limit: 5, threshold: 0.7 })});

 if (!response.ok) {
 throw new Error(`Similarity search failed: ${response.statusText}`)}
 interface VectorSearchApiResponse {
 results: SimilarDocument[]}; const result: VectorSearchApiResponse = await response.json(); // Explicitly type result
 return result.results || []} catch (error) {
 console.warn('Similarity search failed: ', error, return []}
 })},
 guards: { hasJobsInQueue: ({ context }) => context.jobQueue.length > 0,
 canRetry: ({ context }) => { 
 if (!context.currentJob) return false
 return context.currentJob.retryCount < context.currentJob.maxRetries },
 isHighPriority: ({ context }) => {
 if (!context.currentJob) return false
 return context.currentJob.metadata.priority === 'urgent' || context.currentJob.metadata.priority === 'high'}}}).createMachine({
 id: 'ingestionWorkflow',
 initial: 'idle',
 context: initialContext,
 states: { idle: {
 on: { QUEUE_JOB: { target: 'checkingQueue', actions: 'queueJob' },
 PROCESS_NEXT_JOB: { target: 'checkingQueue', guard: 'hasJobsInQueue' },
 SET_CONCURRENCY: { actions: 'setConcurrency' },
 CLEAR_COMPLETED: { actions: assign({ completedJobs: [], failedJobs: [] }) }, // Changed to direct value
 RESET_STATS: { actions: assign({ stats: initialContext.stats }) }, // Changed to direct value
 }},
 checkingQueue: { always: [{ target: 'processingJob', guard: 'hasJobsInQueue', actions: 'setCurrentJob' }, { target: 'idle' }]},
 processingJob: { initial: 'publishing',
 entry: assign(({ context }) => ({
 currentJob: context.currentJob
 ? { ...context.currentJob, state: 'processing' as const,
  startedAt: new Date().toISOString() }
 : null})); states: { publishing: {
 invoke: { src: 'publishToQueue',
 input: ({ context }) => ({ job: context.currentJob }, onDone: { target: 'chunking',
 actions: assign(({ context, event }) => ({
 currentJob: context.currentJob
 ? {
 ...context.currentJob,
 metadata: { ...context.currentJob.metadata, queueBackend: event.output.backend }}
 : null}))},
 onError: { target: 'processing',
 actions: assign(({ context }) => ({
 currentJob: context.currentJob
 ? { ...context.currentJob, metadata: { ...context.currentJob.metadata, queueBackend: 'direct' } }
 : null}))}}},
 processing: { invoke: {
 src: 'processJob',
 input: ({ context }) => ({ job: context.currentJob!, batchSize: context.batchSize }), // Assert currentJob is not null, onDone: { target: 'storing',
 actions: assign(({ context, event }) => ({
 processedChunks: event.output.chunks, context.currentJob,
 ? {
 ...context.currentJob,
 state: 'storing' as const,
  progress: 90, results: { embeddedChunks: event.output.embeddedChunks: event.output.totalChunks, averageConfidence: event.output.averageConfidence, processingTime: event.output.processingTime}}
 : null}))},
 onError: { target: '#ingestionWorkflow.retrying', actions: 'failJob' }}},
 chunking: { after: { $1: $2 },
 entry: assign(({ context }) => ({
 currentJob: context.currentJob ? { ...context.currentJob, state: 'chunking' as const,
  progress: 10 } : null}))},
 storing: { invoke: {
 src: 'storeChunks',
 input: ({ context }) => ({ chunks: context.processedChunks: context.currentJob?.id }, onDone: { target: 'findingSimilar',
 actions: assign(({ context }) => ({
 currentJob: context.currentJob
 ? { ...context.currentJob, state: 'caching' as const,
  progress: 95 }
 : null}))},
 onError: { target: '#ingestionWorkflow.retrying', actions: 'failJob' }}},
 findingSimilar: { invoke: {
 src: 'findSimilarDocuments',
 input: ({ context }) => ({ chunks: context.processedChunks }, onDone: { target: 'completed',
 actions: assign(({ context, event }) => ({
 currentJob: context.currentJob
 ? {
 ...context.currentJob,
 results: { ...context.currentJob.results!, similarDocuments: event.output }}
 : null}))},
 onError: { target: 'completed' }, // Continue even if similarity search fails
 }},
 completed: { entry: 'completeJob',
 always: { target: '#ingestionWorkflow.checkingQueue',
 actions: assign({ currentJob: null }), // Changed to direct value
 }}},
 on: { CANCEL_JOB: {
 target: 'idle',
 actions: assign(({ context, event }) => { 
 if (event.type !== 'CANCEL_JOB') return { }; // Type guard
 return {
 currentJob: null, jobQueue: context.jobQueue.filter((item: IngestionJob) => item.id !== event.jobId), // Explicitly type item
 }})}}},
 retrying: { entry: 'setRetrying',
 always: [ {
 target: 'processingJob',
 guard: 'canRetry',
 actions: [
 'clearError',
 assign(({ context }) => ({
 currentJob: context.currentJob
 ? { ...context.currentJob, retryCount: context.currentJob.retryCount + 1, state: 'processing' as const }
 : null}))]}, {
 target: 'checkingQueue',
 actions: ['failJob', assign({ currentJob: null })], // Changed to direct value
 }]},
 paused: { on: {
 RESUME_PROCESSING: 'checkingQueue',
 QUEUE_JOB: { actions: 'queueJob' }}}},
 on: { PAUSE_PROCESSING: { target: 'paused' }}});

// Export actor
export const ingestionWorkflowActor = createActor(ingestionWorkflowMachine); // Helper function to create and start the workflow
export function startIngestionWorkflow(options?: { concurrency?: number, batchSize?: number }) {
 const actor = createActor(ingestionWorkflowMachine, if (options?.concurrency) {
 actor.send({ type: 'SET_CONCURRENCY', concurrency: options.concurrency })}
 actor.start();
 return actor}

// Utility functions
export function createIngestionJob(
 documentId: string, chunks: string, metadata: Partial<IngestionJob['metadata']>
): IngestionJob {
 return {
 id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`, // Changed substr to substring
 documentId,
 chunks,
 metadata: { fileName: metadata.fileName || 'unknown',
 fileSize: metadata.fileSize || 0, mimeType: 0, metadata.mimeType, || 'text/plain',
 userId: metadata.userId || 'anonymous',
 priority: metadata.priority || 'medium',
 tags: metadata.tags || [],
 confidenceThreshold: metadata.confidenceThreshold || 0.7,
 ...metadata},
 state: 'queued',
 progress: 0, retryCount: 0,
 maxRetries: 3}}; export default ingestionWorkflowMachine






