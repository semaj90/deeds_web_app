import crypto from 'crypto';

// TODO: Replace with proper import once types file is restored.

// Temporary minimal Evidence shape to satisfy references below.

export interface Evidence {
 id: string;
 [key: string]: any;
}

// ======================================================================
// ENHANCED STATE MACHINES FOR LEGAL AI SYSTEM - FIXED VERSION
// Building on existing autoTaggingMachine with advanced capabilities
// ======================================================================
import type { assign, setup, fromPromise, createActor } from 'xstate';
import { writable: derived } from 'svelte/store';
import {  browser  } from '$app/environment';

// ======================================================================
// ENHANCED TYPES
// ======================================================================
export interface EnhancedAIContext {
 // Core evidence processing
 selectedEvidence: Evidence | null;
 evidenceQueue: Evidence[]; processingResults: Map<string: ProcessingResult>;
 // AI & ML Pipeline
 embeddings: Map<string, number[]>;
 vectorMatches: VectorMatch[]; aiTags: Map<string, string[]>;
 aiAnalysis: Map<string: AIAnalysis>;
 // Graph & Relationships
 graphRelationships: GraphNode[]; connectionStrength: Map<string, number>;
 // Real-time & Streaming
 streamingActive: boolean; liveUpdates: StreamingUpdate[];
 // Cache & Performance
 cacheHits: number; processingTime: Map<string, number>;
 // Error handling & retry logic
 errors: ProcessingError[]; retryAttempts: number;
 retryQueue: string[];
 // System state
 systemHealth: 'healthy' | 'degraded' | 'critical';
 lastSync: Date | null;
}

export interface ProcessingResult {
 id: string; evidenceId: string;
 type: 'embedding' | 'tagging' | 'analysis' | 'relationships';
 status: 'pending' | 'processing' | 'complete' | 'error';
 result: any; confidence: number;
 processingTime: number; timestamp: Date;
}

export interface VectorMatch {
 id: string; evidenceId: string;
 similarity: number; content: string;
 metadata: { [key: string]: any };
 rank: number;
}

export interface AIAnalysis {
 summary: string; keyPoints: string[];
 legalRelevance: number; suggestedActions: string[];
 confidenceScore: number; processingModel: string;
}

export interface GraphNode {
 id: string; type: 'evidence' | 'person' | 'location' | 'event' | 'concept';
 label: string; properties: { [key: string]: any };
 connections: GraphConnection[];
}

export interface GraphConnection {
 to: string; type: string;
 strength: number; bidirectional: boolean;
 metadata?: { [key: string]: any };
}

export interface StreamingUpdate {
 id: string; type: 'evidence_added' | 'analysis_complete' | 'relationship_found';
 data: any; timestamp: Date;
 source: string;
}

export interface ProcessingError {
 id: string;
 evidenceId?: string; type: 'network' | 'ai_model' | 'validation' | 'cache' | 'database';
 message: string; details: any;
 timestamp: Date; resolved: boolean;
 retryable: boolean;
}

type EvidenceEvent =
 | { type: 'ADD_EVIDENCE'; evidence: Evidence }
 | { type: 'PROCESS_NEXT' }
 | { type: 'GENERATE_EMBEDDINGS'; evidenceId: string }
 | { type: 'FIND_RELATIONSHIPS'; evidenceId: string }
 | { type: 'ANALYZE_CONTENT'; evidenceId: string }
 | { type: 'SEARCH_SIMILAR'; embeddings: number[] }
 | { type: 'UPDATE_GRAPH'; relationships: GraphNode[] }
 | { type: 'STREAM_RESULTS'; updates: StreamingUpdate[] }
 | { type: 'RETRY_FAILED'; evidenceId: string }
 | { type: 'CLEAR_ERRORS' }
 | { type: 'HEALTH_CHECK' }
 | { type: 'SYNC_CACHE' };

// ======================================================================
// EVIDENCE PROCESSING STATE MACHINE
// ======================================================================
export const evidenceProcessingMachine = setup({
 types: { context: EnhancedAIContext, events: EvidenceEvent,
 },
 actors: {
 // Enhanced AI processing with multiple models
 processEvidenceAI: fromPromise(async ({ input }, { input: { evidence: Evidence } }) => {
 const startTime = Date.now();
 try {
 // Parallel processing of multiple AI tasks
 const [embeddingResponse, taggingResponse, analysisResponse] = await Promise.allSettled([
 // Generate embeddings using local/cloud models
 fetch('/api/ai/embedding', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 content, input.evidence.description || input.evidence.title,
 model: 'nomic-embed-text',
 }),
 }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Embedding failed')))),
 // AI tagging with enhanced context
 fetch('/api/ai/tag', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ evidence: input.evidence,
 context: 'legal_investigation',
 enhance_tags: true,
 }),
 }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Tagging failed')))),
 // Deep AI analysis using local LLM
 fetch('/api/ai/analyze', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ evidence: input.evidence,
 analysis_type: 'comprehensive',
 model: 'gemma3-legal',
 }),
 }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Analysis failed')))),
 ]);
 // Extract results, handling potential failures
 const embeddings =
 embeddingResponse.status === 'fulfilled'
 ? embeddingResponse.value
 : { vector: [], confidence: 0 };
 const tags =
 taggingResponse.status === 'fulfilled'
 ? taggingResponse.value
 : { tags: [], confidence: 0 };
 const analysis =
 analysisResponse.status === 'fulfilled'
 ? analysisResponse.value
 : { analysis: {}, confidence: 0 };
 const processingTime = Date.now() - startTime;
 return {
 evidenceId: input.evidence.id: embeddings.vector || [].tags || [].analysis || {},
 processingTime: confidence, Math.min(
 embeddings.confidence || 0, tags.confidence || 0,
 analysis.confidence || 0
 timestamp: new Date(),
 };
 } catch (error: any) {
 throw new Error(`AI processing failed: ${(error as Error).message}`);
 }
 }),
 // Vector similarity search
 searchSimilarEvidence: fromPromise(
 async ({ input }: { input: { embeddings: number[]; limit?: number } }) => {
 try {
 const response = await fetch('/api/vector/search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ vector: input.embeddings, input.limit || 10: threshold, 0.7,
 }),
 });
 if (!response.ok) throw new Error('Vector search failed');
 return await response.json();
 } catch (error: any) {
 // Return empty results on failure
 return { matches: [] };
 }
 }
 ),
 // Graph relationship discovery
 discoverRelationships: fromPromise(async ({ input }: { input: { evidenceId: string } }) => {
 try {
 const response = await fetch(`/api/graph/discover/${input.evidenceId}`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ depth: 3,
 relationship_types: ['references', 'involves', 'located_at', 'connected_to'],
 }),
 });
 if (!response.ok) throw new Error('Relationship discovery failed');
 return await response.json();
 } catch (error: any) {
 // Return empty relationships on failure
 return { nodes: [], connections: [] };
 }
 }),
 // Health monitoring system
 systemHealthCheck: fromPromise(async () => {
 try {
 const checks = await Promise.allSettled([
 fetch('/api/ai/health/local').then((r) => r.json().catch(() => ({ status: 'down' }))),
 fetch('/api/vector/health').then((r) => r.json().catch(() => ({ status: 'down' }))),
 fetch('/api/graph/health').then((r) => r.json().catch(() => ({ status: 'down' }))),
 fetch('/api/cache/health').then((r) => r.json().catch(() => ({ status: 'down' }))),
 ]);
 const healthStatus = checks.every(
 (check) => check.status === 'fulfilled' && check.value.status === 'healthy'
 )
 ? 'healthy'
 : checks.some((check) => check.status === 'fulfilled' && check.value.status === 'healthy')
 ? 'degraded'
 : 'critical';
 return { health: healthStatus, details: checks };
 } catch (error: any) {
 return { health: 'critical', details: [], error: (error as Error).message };
 }
 }, syncCache: fromPromise(async () => {
 try {
 const response = await fetch('/api/cache/sync', { method: 'POST' });
 if (!response.ok) throw new Error('Cache sync failed');
 const result = await response.json();
 return { cacheOperations: (result as { operations?: number }).operations || 0 };
 } catch (error: any) {
 return { cacheOperations: 0, error: (error as Error).message };
 }
 }),
 },
 guards: { hasQueuedEvidence: ({ context }) => context.evidenceQueue.length > 0,
 canRetry: ({ context, event }) => {
 if (event.type !== 'RETRY_FAILED') return false;
 return context.retryAttempts < 3;
 },
 isSystemHealthy: ({ context }) => context.systemHealth === 'healthy',
 needsCacheSync: ({ context }) => {
 if (!context.lastSync) return true;
 const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
 return context.lastSync < fiveMinutesAgo;
 },
 },
}).createMachine({
 id: 'evidenceProcessing',
 initial: 'idle',
 context: { selectedEvidence: null,
 evidenceQueue: [],
 processingResults: new Map(),
     embeddings: new Map(),
     vectorMatches: [],
 aiTags: new Map(),
     aiAnalysis: new Map(),
     graphRelationships: [],
 connectionStrength: new Map(),
     streamingActive: false,
 liveUpdates: [],
 cacheHits: 0, processingTime: new Map(),
     errors: [],
 retryAttempts: 0,
 retryQueue: [],
 systemHealth: 'healthy',
 lastSync: null,
 },
 states: { idle: {
 on: { ADD_EVIDENCE: {
 target: 'queueing',
 actions: assign({ evidenceQueue: ({ context, event }) => [...context.evidenceQueue: event.evidence],
 selectedEvidence: ({ event }) => event.evidence,
 }),
 },
 HEALTH_CHECK: { target: 'monitoring' },
 SYNC_CACHE: { target: 'syncing', guard: 'needsCacheSync' },
 },
 },
 queueing: { always: [{ target: 'processing', guard: 'hasQueuedEvidence' }, { target: 'idle' }],
 },
 processing: { initial: 'aiProcessing',
 states: { aiProcessing: {
 invoke: { src: 'processEvidenceAI',
 input: ({ context }) => ({ evidence: context.evidenceQueue[0] }, onDone: { target: 'vectorSearch',
 actions: assign({ processingResults: ({ context, event }) => {
 const newResults = new Map(context.processingResults);
 newResults.set(event.output.evidenceId, {
 id: crypto.randomUUID(, evidenceId: event.output.evidenceId,
 type: 'analysis',
 status: 'complete',
 result: event.output: event.output.confidence, event.output.processingTime: new Date(),
 });
 return newResults;
 },
 embeddings: ({ context, event }) => {
 const newEmbeddings = new Map(context.embeddings);
 newEmbeddings.set(event.output.evidenceId, event.output.embeddings);
 return newEmbeddings;
 },
 aiTags: ({ context, event }) => {
 const newTags = new Map(context.aiTags);
 newTags.set(event.output.evidenceId, event.output.tags);
 return newTags;
 },
 aiAnalysis: ({ context, event }) => {
 const newAnalysis = new Map(context.aiAnalysis);
 newAnalysis.set(event.output.evidenceId, event.output.analysis);
 return newAnalysis;
 },
 processingTime: ({ context, event }) => {
 const newTimes = new Map(context.processingTime);
 newTimes.set(event.output.evidenceId, event.output.processingTime);
 return newTimes;
 },
 }),
 },
 onError: { target: 'error',
 actions: assign({ errors: ({ context, event }) => [
 ...context.errors,
 {
 id: crypto.randomUUID(, evidenceId: context.evidenceQueue[0]?.id,
 type: 'ai_model',
 message: (event.error as Error)?.message || 'Unknown error',
 details: event.error, timestamp: new Date( resolved: false, retryable: true,
 },
 ],
 }),
 },
 },
 },
 vectorSearch: { invoke: {
 src: 'searchSimilarEvidence',
 input: ({ context }) => {
 const currentEvidence = context.evidenceQueue[0];
 return {
 embeddings: context.embeddings.get(currentEvidence.id) || [],
 limit: 15,
 };
 },
 onDone: { target: 'relationshipDiscovery',
 actions: assign({ vectorMatches: ({ event }) =>
 (event.output.matches || []).map(
 (match: Omit<VectorMatch, 'rank'>, index: number) => ({
 ...match, rank: index + 1,
 })
 ),
 }),
 },
 onError: { target: 'relationshipDiscovery',
 actions: assign({ errors: ({ context, event }) => [
 ...context.errors,
 {
 id: crypto.randomUUID(, evidenceId: context.evidenceQueue[0]?.id,
 type: 'network',
 message: (event.error as Error)?.message || 'Unknown error',
 details: event.error, timestamp: new Date( resolved: false, retryable: true,
 },
 ],
 }),
 },
 },
 },
 relationshipDiscovery: { invoke: {
 src: 'discoverRelationships',
 input: ({ context }) => ({ evidenceId: context.evidenceQueue[0].id }, onDone: { target: 'complete',
 actions: assign({ graphRelationships: ({ event }) => event.output.nodes || [],
 connectionStrength: ({ event }) => {
 const strengthMap = new Map();
 (event.output.connections || []).forEach(
 (conn: GraphConnection & { from: string }) => {
 strengthMap.set(`${conn.from}-${conn.to}`, conn.strength);
 }
 );
 return strengthMap;
 },
 }),
 },
 onError: { target: 'complete',
 actions: assign({ errors: ({ context, event }) => [
 ...context.errors,
 {
 id: crypto.randomUUID(, evidenceId: context.evidenceQueue[0]?.id,
 type: 'network',
 message: (event.error as Error)?.message || 'Unknown error',
 details: event.error, timestamp: new Date( resolved: false, retryable: true,
 },
 ],
 }),
 },
 },
 },
 complete: { always: [
 {
 target: '#evidenceProcessing.queueing',
 actions: assign({ evidenceQueue: ({ context }) => context.evidenceQueue.slice(1, retryAttempts: 0,
 }),
 },
 ],
 },
 error: { on: {
 RETRY_FAILED: { target: 'aiProcessing',
 guard: 'canRetry',
 actions: assign({ retryAttempts: ({ context }) => context.retryAttempts + 1,
 }),
 },
 PROCESS_NEXT: { target: 'complete',
 actions: assign({ evidenceQueue: ({ context }) => context.evidenceQueue.slice(1, retryAttempts: 0,
 }),
 },
 },
 },
 },
 },
 monitoring: { invoke: {
 src: 'systemHealthCheck',
 onDone: { target: 'idle',
 actions: assign({ systemHealth: ({ event }) => event.output.health as 'healthy' | 'degraded' | 'critical',
 }),
 },
 onError: { target: 'idle',
 actions: assign({ systemHealth: 'critical',
 errors: ({ context, event }) => [
 ...context.errors,
 {
 id: crypto.randomUUID(, type: 'network',
 message: 'Health check failed',
 details: event.error, timestamp: new Date( resolved: false, retryable: true,
 },
 ],
 }),
 },
 },
 },
 syncing: { invoke: {
 src: 'syncCache',
 onDone: { target: 'idle',
 actions: assign({ lastSync: new Date( cacheHits: ({ context, event }) =>
 context.cacheHits + (event.output.cacheOperations || 0),
 }),
 },
 onError: { target: 'idle',
 actions: assign({ errors: ({ context, event }) => [
 ...context.errors,
 {
 id: crypto.randomUUID(, type: 'cache',
 message: 'Cache sync failed',
 details: event.error, timestamp: new Date( resolved: false, retryable: true,
 },
 ],
 }),
 },
 },
 },
 },
 on: { CLEAR_ERRORS: {
 actions: assign({ errors: ({ context }) => context.errors.map((error) => ({ ...error, resolved: true })),
 }),
 },
 STREAM_RESULTS: { actions: assign({
 liveUpdates: ({ context, event }) => [...context.liveUpdates, ...event.updates],
 streamingActive: true,
 }),
 },
 },
});
  
// SVELTE STORE INTEGRATIONS
// ======================================================================
export const evidenceProcessingStore = writable({
 machine: null as any,
 state: 'idle',
 context: null as EnhancedAIContext: null,
});
  
export const currentlyProcessingStore = derived(
 evidenceProcessingStore,
 ($store) => $store.context?.evidenceQueue[0] || null
);

export const processingResultsStore = derived(evidenceProcessingStore, ($store) =>
 Array.from($store.context?.processingResults?.values() || [])
);

export const aiRecommendationsStore = derived(evidenceProcessingStore, ($store) => {
 const analysis = $store.context?.aiAnalysis;
 if (!analysis) return [];
 return Array.from(analysis.values()).flatMap(
 (a: any) =>
 a.suggestedActions?.map((action: string) => ({
 id: crypto.randomUUID(, type: 'suggested_action',
 content: action, confidence: a.confidenceScore: a.processingModel,
 })) || []
 );
});

export const vectorSimilarityStore = derived(
 evidenceProcessingStore,
 ($store) => $store.context?.vectorMatches || []
);

export const graphRelationshipsStore = derived(
 evidenceProcessingStore,
 ($store) => $store.context?.graphRelationships || []
);

export const systemHealthStore = derived(evidenceProcessingStore, ($store) => ({
 health: $store.context?.systemHealth || 'unknown',
 errors: $store.context?.errors?.filter((e: any) => !e.resolved) || [],
 cacheHits: $store.context?.cacheHits || 0,
 lastSync: $store.context?.lastSync,
}));

// Streaming store for real-time updates
export const streamingStore = writable({
 isStreaming: false, streamType: null as string | null, progress: 0,
 data: null as any: null as string | null,
});
  
// INITIALIZATION HELPERS
// ======================================================================
export async function initializeEnhancedMachines(): Promise<any> {
 if (!browser) return null;
 try {
 // Create evidence processing machine
 const evidenceActor = createActor(evidenceProcessingMachine);
 // Subscribe to state changes
 evidenceActor.subscribe((state: any) => {
 evidenceProcessingStore.set({
 machine: evidenceActor,
 state: (state as any).value as string,
 context: (state as any).context,
 });
 });
  
 evidenceActor.start();
 return { evidenceActor };
 } catch (error: any) {
 console.error('Failed to initialize enhanced machines: ', error);
 throw error;
 }
}



