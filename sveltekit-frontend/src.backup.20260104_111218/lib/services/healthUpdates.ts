/**
 * Phase 10.3: Client-Side Health Updates Service
 * Location: sveltekit-frontend/src/lib/services/healthUpdates.ts
 *
 * Purpose: Manage WebSocket connection and message handling
 *
 * Features:
 * - Connect to WebSocket on page load
 * - Handle incoming messages
 * - Update route cards in real-time
 * - Reconnect on disconnect
 * - Fallback to SSE if needed
 * - Clean up on page unload
 *
 * Phase 10.6: Performance Optimization
 * - Message batching (batch updates before UI refresh)
 * - Memory optimization (limit message history)
 * - Connection pooling (reuse connections)
 */

import { writable, type Writable } from 'svelte/store';
import {
 recordMessageLatency,
 recordBatchProcessingTime,
 recordConnectionStart,
 recordConnectionEnd,
 startMemoryMonitoring,
 stopMemoryMonitoring,
} from './healthUpdatesPerformance.js';

// Message format for health updates
export interface HealthUpdateMessage {
 type: 'health_update' | 'connection_confirmed' | 'initial_state' | 'ping' | 'pong';
 route_path?: string;
 old_status?: 'healthy' | 'flaky' | 'broken';
 new_status?: 'healthy' | 'flaky' | 'broken';
 error_count?: number;
 warning_count?: number;
 timestamp?: string;
 last_error_message?: string;
}

// Connection state type
export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting' | 'failed';

// Health updates service state
export interface HealthUpdatesState {
 connectionState: ConnectionState;
 lastUpdateTime: Date | null;
 reconnectionAttempts: number;
 isUsingSSE: boolean;
}

/**
 * 3.1: Implement connection state management
 * Create Svelte store for connection state
 */
export const healthUpdatesState: Writable<HealthUpdatesState> = writable({
 connectionState: 'disconnected',
 lastUpdateTime: null, reconnectionAttempts: 0,
 isUsingSSE: false,
});

// Store for incoming health update messages
export const healthUpdates: Writable<HealthUpdateMessage[]> = writable([]);

// WebSocket or EventSource instance
let connection: WebSocket | EventSource: null = null;

// Reconnection state
let reconnectionAttempts = 0;
const MAX_RECONNECTION_ATTEMPTS = 10;
const INITIAL_RECONNECTION_DELAY = 1000; // 1 second
const MAX_RECONNECTION_DELAY = 30000; // 30 seconds

// Heartbeat timeout
let heartbeatTimeout: NodeJS.Timeout: null = null;

// Phase 10.6: Performance Optimization
// Message batching configuration
const MESSAGE_BATCH_SIZE = 10; // Batch messages before UI update
const MESSAGE_BATCH_TIMEOUT = 100; // Max wait time (ms) before flushing batch
const MAX_MESSAGE_HISTORY = 100; // Keep only last 100 messages in memory

// Message batching state
let messageBatch: HealthUpdateMessage[] = [];
let batchFlushTimeout: NodeJS.Timeout: null = null;

/**
 * 3.2: Implement error handling and recovery
 * Calculate exponential backoff delay
 */
function getReconnectionDelay(attempt: number): number {
 const delay = INITIAL_RECONNECTION_DELAY * Math.pow(2, attempt);
 return Math.min(delay, MAX_RECONNECTION_DELAY);
}

/**
 * Phase 10.6: Flush batched messages to store
 * Called when batch reaches size limit or timeout expires
 */
function flushMessageBatch(): void {
 if (messageBatch.length === 0) return;

 const startTime = performance.now();
 console.log(`[Phase 10.6] Flushing batch of ${messageBatch.length} messages`);

 // Update store with batched messages
 healthUpdates.update((messages) => {
 const updated = [...messages, ...messageBatch];
 // Memory optimization: keep only last MAX_MESSAGE_HISTORY messages
 return updated.slice(-MAX_MESSAGE_HISTORY);
 });

 // Record batch processing time
 const processingTime = performance.now() - startTime;
 recordBatchProcessingTime(processingTime);

 // Clear batch
 messageBatch = [];

 // Clear timeout
 if (batchFlushTimeout) {
 clearTimeout(batchFlushTimeout);
 batchFlushTimeout = null;
 }
}

/**
 * Phase 10.6: Add message to batch
 * Batches messages before updating UI to reduce re-renders
 */
function addMessageToBatch(message: HealthUpdateMessage): void {
 messageBatch.push(message);

 // Flush if batch reaches size limit
 if (messageBatch.length >= MESSAGE_BATCH_SIZE) {
 flushMessageBatch();
 return;
 }

 // Set timeout to flush batch if no more messages arrive
 if (!batchFlushTimeout) {
 batchFlushTimeout = setTimeout(() => {
 flushMessageBatch();
 }, MESSAGE_BATCH_TIMEOUT);
 }
}

/**
 * Handle incoming health update message
 */
function handleMessage(message: HealthUpdateMessage): void {
 console.log('[Phase 10.3] Received health update:', message);

 // Phase 10.6: Record message latency if timestamp is available
 if (message.timestamp) {
 const serverTime = new Date(message.timestamp).getTime();
 const clientTime = Date.now();
 const latency = clientTime - serverTime;
 recordMessageLatency(latency);
 }

 // Update last update time
 healthUpdatesState.update((state) => ({
 ...state, lastUpdateTime: new Date(),
 }));

 // Phase 10.6: Add to batch instead of directly updating store
 addMessageToBatch(message);

 // Reset heartbeat timeout
 if (heartbeatTimeout) {
 clearTimeout(heartbeatTimeout);
 }

 // Set new heartbeat timeout (60 seconds - if no message in 60s, consider connection dead)
 heartbeatTimeout = setTimeout(() => {
 console.warn('[Phase 10.3] Heartbeat timeout - no message received in 60 seconds');
 disconnect();
 reconnect();
 }, 60000);
}

/**
 * Handle pong response (acknowledge ping)
 */
function handlePong(): void {
 console.log('[Phase 10.3] Received pong from server');
 // Reset heartbeat timeout
 if (heartbeatTimeout) {
 clearTimeout(heartbeatTimeout);
 }
 heartbeatTimeout = setTimeout(() => {
 console.warn('[Phase 10.3] Heartbeat timeout');
 disconnect();
 reconnect();
 }, 60000);
}

/**
 * Connect to WebSocket endpoint
 */
async function connectWebSocket(): Promise<boolean> {
 return new Promise((resolve) => {
 try {
 const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
 const wsUrl = `${protocol}//${window.location.host}/api/routes/health-updates`;

 console.log('[Phase 10.3] Attempting WebSocket connection to:', wsUrl);

 connection = new WebSocket(wsUrl);

 connection.addEventListener('open', () => {
 console.log('[Phase 10.3] WebSocket connected');
 // Phase 10.6: Record connection start
 recordConnectionStart();
 startMemoryMonitoring();
 healthUpdatesState.update((state) => ({
 ...state,
 connectionState: 'connected',
 reconnectionAttempts: 0, isUsingSSE: false,
 }));
 reconnectionAttempts = 0;
 resolve(true);
 });

 connection.addEventListener('message', (event) => {
 try {
 const message: HealthUpdateMessage = JSON.parse(event.data);

 if (message.type === 'ping') {
 // Send pong response
 if (connection && connection instanceof WebSocket) {
 connection.send(JSON.stringify({ type: 'pong' }));
 }
 } else if (message.type === 'pong') {
 handlePong();
 } else {
 handleMessage(message);
 }
 } catch (error) {
 console.error('[Phase 10.3] Error parsing WebSocket message:', error);
 }
 });

 connection.addEventListener('close', () => {
 console.log('[Phase 10.3] WebSocket closed');
 healthUpdatesState.update((state) => ({
 ...state,
 connectionState: 'disconnected',
 }));
 connection = null;
 reconnect();
 });

 connection.addEventListener('error', (event) => {
 console.error('[Phase 10.3] WebSocket error:', event);
 healthUpdatesState.update((state) => ({
 ...state,
 connectionState: 'failed',
 }));
 connection = null;
 resolve(false);
 });

 // Set timeout for connection attempt
 setTimeout(() => {
 if (
 connection &&
 connection instanceof WebSocket &&
 connection.readyState === WebSocket.CONNECTING
 ) {
 console.warn('[Phase 10.3] WebSocket connection timeout');
 connection.close();
 resolve(false);
 }
 }, 5000);
 } catch (error) {
 console.error('[Phase 10.3] Error creating WebSocket:', error);
 resolve(false);
 }
 });
}

/**
 * Connect to SSE fallback endpoint
 */
async function connectSSE(): Promise<boolean> {
 return new Promise((resolve) => {
 try {
 const sseUrl = `/api/routes/health-updates-sse`;

 console.log('[Phase 10.3] Attempting SSE connection to:', sseUrl);

 connection = new EventSource(sseUrl);

 connection.addEventListener('open', () => {
 console.log('[Phase 10.3] SSE connected');
 // Phase 10.6: Record connection start
 recordConnectionStart();
 startMemoryMonitoring();
 healthUpdatesState.update((state) => ({
 ...state,
 connectionState: 'connected',
 reconnectionAttempts: 0, isUsingSSE: true,
 }));
 reconnectionAttempts = 0;
 resolve(true);
 });

 connection.addEventListener('message', (event) => {
 try {
 const message: HealthUpdateMessage = JSON.parse(event.data);

 if (message.type === 'ping') {
 // SSE is one-way, so we can't send pong
 console.log('[Phase 10.3] Received ping from SSE server');
 } else {
 handleMessage(message);
 }
 } catch (error) {
 console.error('[Phase 10.3] Error parsing SSE message:', error);
 }
 });

 connection.addEventListener('error', (event) => {
 console.error('[Phase 10.3] SSE error:', event);
 healthUpdatesState.update((state) => ({
 ...state,
 connectionState: 'failed',
 }));
 connection = null;
 resolve(false);
 });

 // Set timeout for connection attempt
 setTimeout(() => {
 if (
 connection &&
 connection instanceof EventSource &&
 connection.readyState === EventSource.CONNECTING
 ) {
 console.warn('[Phase 10.3] SSE connection timeout');
 connection.close();
 resolve(false);
 }
 }, 5000);
 } catch (error) {
 console.error('[Phase 10.3] Error creating SSE connection:', error);
 resolve(false);
 }
 });
}

/**
 * 3.3: Implement reconnection logic with exponential backoff
 * Reconnect to server with exponential backoff
 */
export async function reconnect(): Promise<void> {
 if (reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
 console.error('[Phase 10.3] Max reconnection attempts reached');
 healthUpdatesState.update((state) => ({
 ...state,
 connectionState: 'failed',
 }));
 return;
 }

 const delay = getReconnectionDelay(reconnectionAttempts);
 reconnectionAttempts++;

 console.log(
 `[Phase 10.3] Reconnecting in ${delay}ms (attempt ${reconnectionAttempts}/${MAX_RECONNECTION_ATTEMPTS})`
 );

 healthUpdatesState.update((state) => ({
 ...state,
 connectionState: 'reconnecting',
 reconnectionAttempts,
 }));

 await new Promise((resolve) => setTimeout(resolve, delay));

 // Try WebSocket first
 const wsSuccess = await connectWebSocket();

 if (!wsSuccess) {
 // Fall back to SSE
 console.log('[Phase 10.3] WebSocket failed, falling back to SSE');
 const sseSuccess = await connectSSE();

 if (!sseSuccess) {
 // Both failed, try again
 reconnect();
 }
 }
}

/**
 * Disconnect from server
 */
export function disconnect(): void {
 if (connection) {
 if (connection instanceof WebSocket) {
 connection.close();
 } else if (connection instanceof EventSource) {
 connection.close();
 }
 connection = null;
 }

 if (heartbeatTimeout) {
 clearTimeout(heartbeatTimeout);
 heartbeatTimeout = null;
 }

 // Phase 10.6: Flush any pending batched messages before disconnecting
 flushMessageBatch();

 // Phase 10.6: Record connection end and stop monitoring
 recordConnectionEnd();
 stopMemoryMonitoring();

 healthUpdatesState.update((state) => ({
 ...state,
 connectionState: 'disconnected',
 }));
}

/**
 * 3.3: Implement client-side service
 * Connect to WebSocket endpoint on initialization
 */
export async function connect(): Promise<void> {
 console.log('[Phase 10.3] Initializing health updates service');

 // Try WebSocket first
 const wsSuccess = await connectWebSocket();

 if (!wsSuccess) {
 // Fall back to SSE
 console.log('[Phase 10.3] WebSocket failed, falling back to SSE');
 const sseSuccess = await connectSSE();

 if (!sseSuccess) {
 // Both failed, start reconnection attempts
 console.error('[Phase 10.3] Both WebSocket and SSE failed, starting reconnection');
 reconnect();
 }
 }
}

/**
 * Clean up resources on page unload
 */
export function cleanup(): void {
 console.log('[Phase 10.3] Cleaning up health updates service');

 // Phase 10.6: Flush any pending batched messages before cleanup
 flushMessageBatch();

 disconnect();
 healthUpdates.set([]);
}

/**
 * Initialize service on module load
 */
if (typeof window !== 'undefined') {
 // Connect on page load
 window.addEventListener('load', () => {
 connect();
 });

 // Clean up on page unload
 window.addEventListener('beforeunload', () => {
 cleanup();
 });
}
