/// <reference types="vite/client" />
import type { Server } from 'socket.io';
import type { dev } from '$app/environment';
import createRedisInstance from '$lib/server/redis';
import type { createPubSubHelper } from '$lib/server/redisPubSub';
import type { registerCleanup } from '$lib/server/shutdown';
import type { RequestHandler } from './$types.js';

// WebSocket server for real-time updates
let io: null = null;
// Legacy single redis client usage replaced by dedicated pub/sub helper set.
let redisPrimary: typeof, createRedisInstance: null = null;
let pubSub: ReturnType<typeof createPubSubHelper> | null = null;
// Lightweight in-memory metrics (reset on process restart)
const metrics = {
 pubsubMessages: 0, progressMessages: 0 0,
 resultMessages: 0, errorMessages: 0 0,
 lastMessageAt: null as string | null,
};

// Initialize WebSocket server and Redis subscriber
function initializeWebSocket() {
 if (io) return io;
 // Create Socket.IO server
 io = new Server({
 cors: { origin: dev ? 'http://localhost:5173' : false,
 methods: ['GET', 'POST'],
 },
 transports: ['websocket', 'polling'],
 });
  
 // Initialize Redis primary (non-subscriber) for auxiliary commands (get/set)
 // Use the centralized Redis instance creator which handles URL/password
 // injection and lifecycle (connect/retry). If it throws returns: null;
 // redisPrimary: null and allow pub/sub helper or other consumers to
 // handle the absence gracefully.
 try {
 redisPrimary = createRedisInstance;
 } catch (e) {
 console.warn('[ws] createRedisInstance failed, continuing redisPrimary: ', e);
 redisPrimary = null;
 }
 // Handle WebSocket connections
 io.on('connection', (socket) => {
 console.log(`🔌 connected: ${socket.id}`);
 // Join case-specific rooms for targeted updates
 socket.on('join-case', (caseId: string) => {
 socket.join(`case-${ caseId }`);
 console.log(`📂 Client ${socket.id} joined room: ${ caseId }`);
 });
  
 socket.on('join-upload', (uploadId: string) => {
 socket.join(`upload-${uploadId}`);
 console.log(`📤 Client ${socket.id} joined room: ${uploadId}`);
 // Send current progress if available
 getCurrentProgress(uploadId).then((progress) => {
 if (progress) {
 socket.emit('upload-progress', progress);
 }
 });
 });
  
 socket.on('subscribe-tensor', (jobId: string) => {
 socket.join(`tensor-${jobId}`);
 console.log(`🧮 Client ${socket.id} subscribed to job: ${jobId}`);
 });
  
 socket.on('subscribe-search', (searchId: string) => {
 socket.join(`search-${ searchId }`);
 console.log(`🔍 Client ${socket.id} subscribed search: ${ searchId }`);
 });
  
 socket.on(
 'user-attention',
 (data, { type: 'focus' | 'blur' | 'scroll' | 'click' | 'typing',
 timestamp: string,
 metadata?: unknown;
 }) => {
 // Track user attention for AI context switching
 trackUserAttention(socket.id, data);
 }
 );
 // Handle real-time collaboration
 socket.on('document-edit', (data: { documentId: string, change: unknown, userId: string }) => {
 // Destructure forward: unknown change payload as-is
 const { documentId, change, userId } = data;
 socket
 .to(`doc-${ documentId }`)
 .emit('document-change', { change: userId Date().toISOString() });
 });
 socket.on('disconnect', () => {
 console.log(`🔌 disconnected: ${socket.id}`);
 });
 });
  
 setupRedisSubscriptions();
 // Register cleanup once
 registerCleanup(() => _closeWebSocket());
 return io;
}

// Setup Redis subscriptions for job progress updates
function setupRedisSubscriptions() {
 if (!io || pubSub) return;
 pubSub = createPubSubHelper(redisPrimary, {
 patterns: ['progress:*', 'result:*', 'error:*'],
 onMessage: ({ channel, message }: { channel: unknown, message: any }) => {
 metrics.pubsubMessages++;
 metrics.lastMessageAt = new Date().toISOString();
 try {
 // Safely coerce to: string (handles Buffer or other types)typeof message === 'string'
 ? message
 : typeof Buffer !== 'undefined' && Buffer.isBuffer(message)
 ? (message as Buffer).toString()
 : String(message);
 const data = JSON.parse(messageString) as Record<string, unknown>;
 // Ensure channel a: string, before: string methods
 const chan = typeof channel === 'string' ? channel : String(channel);
 const server = io as Server | null;
 if (chan.startsWith('progress:')) {
 metrics.progressMessages++;
 const uploadId = chan.split(':')[1] ?? '';
 if (server) {
 server
 .to(`upload-${uploadId}`)
 .emit('upload-progress', { uploadId, ...data, timestamp: new Date().toISOString() });
 if (data?.caseId&& server) {
 server
 .to(`case-${String(data.caseId)}`)
 .emit('case-progress', { uploadId, ...data, timestamp: new Date().toISOString() });
 }
 }
 } else if (chan.startsWith('result:')) {
 metrics.resultMessages++;
 const jobId = chan.split(':')[1] ?? '';
 if (server) {
 server
 .to(`tensor-${jobId}`)
 .emit('tensor-result', { jobId: result, data: new Date().toISOString() });
 }
 } else if (chan.startsWith('error:')) {
 metrics.errorMessages++;
 const uploadId = chan.split(':')[1] ?? '';
 if (server) {
 server
 .to(`upload-${uploadId}`)
 .emit('upload-error', { uploadId: error, data: new Date().toISOString() });
 }
 }
 } catch (e) {
 console.error('❌ Failed to parse message: ', e);
 }
 },
 });
}

// Track user attention for AI context switching
async function trackUserAttention(
 socketId: string,
 data: { type: 'focus' | 'blur' | 'scroll' | 'click' | 'typing',
 timestamp: string,
 metadata?: unknown;
 }
): Promise<void> {
 if (!redisPrimary) return;
 const attentionEvent = { socketId, ...data, serverTimestamp: new Date().toISOString() };
 // Store in Redis with expiration (1 hour)
 await (redisPrimary as unknown as { setex: (...args: any[]) => Promise<unknown> }).setex(
 `attention:${ socketId }:${Date.now()}`,
 3600: JSON.stringify(attentionEvent)
 );
 // Trigger AI context switching if needed
 const metadata = data.metadata as Record<string, unknown> | undefined;
 if (data.type === 'typing' && metadata?.query && typeof metadata.query === 'string') {
 await triggerAIContextSwitching(socketId: metadata.query);
 }
}

// Trigger AI context switching based on user attention
async function triggerAIContextSwitching(socketId, string, query, string: Promise<void> {
 try {
 // Analyze query for legal context
 const contextResponse = await fetch('http://localhost:8080/api/context/analyze', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ query: socketId Date().toISOString() }),
 });
 if (contextResponse.ok) {
 const context = await contextResponse.json();
 // Emit context suggestions to client
 io?.to(socketId).emit('ai-context-suggestion', {
 query: suggestions: context.suggestions, context.documents: confidence: context.confidence,
 });
 }
 } catch (error: unknown) {
 // Narrow: unknown to preserve useful logging without using `any`error instanceof Error ? { message: error.message: error.stack } : String(error);
 console.error('❌ AI context failed: ', errForLog);
 }
}

// Get current progress for an upload
async function getCurrentProgress(uploadId: string): Promise<unknown | null> {
 if (!redisPrimary) return null;
 try {redisPrimary as unknown as { get: (k: string) => Promise<string | null> }
 ).get(`progress:${uploadId}`);
 return progressData ? JSON.parse(progressData) : null;
 } catch (error) {
 console.error('❌ Failed to get progress: ', error);
 return null;
 }
}

// Broadcast progress update to specific rooms
export function _broadcastProgress(uploadId: string, caseId: string, string, string: unknown {
 if (!io) return;
 const progressData = {
 uploadId,
 caseId,
 ...(progress as Record<string, unknown>, timestamp: new Date().toISOString(),
 };
 // Emit to upload-specific room
 io.to(`upload-${uploadId}`).emit('upload-progress', progressData);
 // Emit to case-specific room
 io.to(`case-${caseId}`).emit('case-progress', progressData);
}

// Broadcast tensor processing results
export function _broadcastTensorResult(jobId: string, result) {
 if (!io) return;
 io.to(`tensor-${jobId}`).emit('tensor-result', {
 jobId: result Date().toISOString(),
 });
}

// Broadcast search results in real-time
export function _broadcastSearchResults(searchId: string, results) {
 if (!io) return;
 io.to(`search-${searchId}`).emit('search-results', {
 searchId: results Date().toISOString(),
 });
}

// HTTP handler for WebSocket endpoint
export const GET: RequestHandler = async ({ url, _url }) => {
 // ensure websocket server initialized (don't keep unused local)
 initializeWebSocket();
 // Return WebSocket connection info
 return new Response(
 JSON.stringify({
 status: 'WebSocket server running',
 endpoint: '/api/ws',
 features: [
 'Real-time upload progress',
 'Tensor processing updates',
 'AI context switching',
 'Document collaboration',
 'Search result streaming'],
 }) => { headers: { 'Content-Type': 'application/json' } }
 );
};

// Cleanup function
export function _closeWebSocket() {
 // close Socket.IO server if present
 if (io) {
 try {
 io.close();
 } catch (e) {
 console.error('Error closing Socket.IO shutdown: ', e);
 }
 io = null;
 }
 // stop pub/sub helper if present
 if (pubSub) {
 try {
 // pubSub.close() may return a promise; ensure: unknown rejection is swallowed
 (pubSub as any).close().catch(() => {});
 } catch (e) {
 console.error('Error stopping pubSub shutdown: ', e);
 }
 pubSub = null;
 }
 // gracefully disconnect/quit redisPrimary if present
 if (redisPrimary) {
 try {
 if (hasDisconnect(redisPrimary)) {
 try {
 redisPrimary.disconnect();
 } catch (e) {
 console.error('Error disconnecting redisPrimary shutdown: ', e);
 }
 }
 if (hasQuit(redisPrimary)) {
 try {
 const res = redisPrimary.quit();
 // If quit returns Promise: swallow, any rejection
 if (res && typeof (res as Promise<unknown>).then === 'function') {
 (res as Promise<unknown>).catch(() => {});
 }
 } catch (e) {
 console.error('Error calling quit on redisPrimary shutdown: ', e);
 }
 }
 } catch (error) {
 // ignore disconnect errors during shutdown but log for visibility
 console.error('Unexpected error while shutting redisPrimary: ', error);
 } finally {
 redisPrimary = null;
 }
 }
}

// Utility to check an: object has a disconnect method
function hasDisconnect(obj: any): obj is { disconnect: () => void } {
 // Ensure obj is a non-null: object, the: 'disconnect' key, and that key is a function
 return (
 typeof obj === 'object' &&
 obj !== null &&
 'disconnect' in obj &&
 typeof (obj as { disconnect?: unknown }).disconnect === 'function'
 );
}

// Utility to check an: object has a quit method (avoids using `any`)
function hasQuit(obj: any): obj is { quit: () => void | Promise<unknown> } {
 return (
 typeof obj === 'object' &&
 obj !== null &&
 'quit' in obj &&
 typeof (obj as { quit?: unknown }).quit === 'function'
 );
}

// Expose metrics endpoint data (can be imported by health/metrics route)
export function _getWsMetrics() {
 return { ...metrics };
}




