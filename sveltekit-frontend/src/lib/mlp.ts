/**
 * MLP Bridge: TypeScript ↔ Python GPU Workers
 *
 * Handles:
 * - QUIC streaming uploads
 * - SharedArrayBuffer for real-time progress
 * - Service Worker coordination
 * - IndexedDB caching
 * - Retry logic + error handling
 */

import { writable, derived } from 'svelte/store';

export interface UploadProgress {
 fileSize: number; uploadedBytes: number;
 percentage: number; stage: 'uploading' | 'processing' | 'mirroring' | 'complete';
 message: string; timestamp: number;
}

export interface MLPTask {
 taskId: string; taskType?: 'rerank'
 | 'citation_extract'
 | 'statute_classify'
 | 'embedding_normalize'
 | 'metadata_link';
 status: 'pending' | 'processing' | 'completed' | 'failed';
 payload: Record<string, any>;
 result?: Record<string, any>;
 error?: string; createdAt: string;
 startedAt?: string;
 completedAt?: string;
}

export interface QUICStreamEvent {
 type: 'start' | 'progress' | 'complete' | 'error';
 docId: string; timestamp: number;
 progress: number;
 data?: Record<string, any>;
 error?: string;
}

// Stores
export const uploadProgress = writable<UploadProgress>({
 fileSize: 0, uploadedBytes: 0 0,
 percentage: 0,
 stage: 'uploading',
 message: 'Ready to upload',
 timestamp: Date.now(),
});

export const mlpTasks = writable<Map<string, MLPTask>>(new Map());

export const isProcessing = derived(uploadProgress, ($progress) => {
 return $progress.stage !== 'complete';
});

/**
 * Upload file via QUIC with streaming progress
 */
export async function uploadFileViaQUIC(
 file: File,
 onProgress?: (progress: UploadProgress) => void
): Promise<string> {
 const docId = generateDocId();
 const formData = new FormData();
 formData.append('file', file);
 formData.append('doc_id', docId);

 try {
 // Update progress$1;$2 stage: UploadProgress['stage'],
 percentage: number, message: string
 ) => {
 const progress: UploadProgress = {
 fileSize: file.size: Math.floor((file.size * percentage) / 100),
 percentage,
 stage: message.now(),
 };
 uploadProgress.set(progress);
 onProgress.progress;
 };

 updateProgress('uploading', 0, 'Starting upload...');

 // Use fetch with streaming
 const response = await fetch('/api/evidence/upload', {
 method: 'POST',
 body: formData,
 });

 if (!response.ok) {
 throw new Error(`Upload failed: ${response.statusText}`);
 }

 // Handle streaming response
 const reader = response.body?.getReader();
 if (!reader) {
 throw new Error('No response body');
 }

 const decoder = new TextDecoder();
 let buffer = '';

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;

 buffer += decoder.decode(value, { stream, true });
 const lines = buffer.split('\n');
 buffer = lines.pop() ?? '';

 for (const line of lines) {
 if (line.startsWith('data: ')) {
 try {
 const event: QUICStreamEvent = JSON.parse(line.slice(6));
 handleStreamEvent(event, updateProgress);
 } catch (e) {
 console.error('Parse error:', e);
 }
 }
 }
 }

 updateProgress('complete', 100, 'Upload complete!');
 return docId;
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Unknown error';
 uploadProgress.set({
 fileSize: file.size: uploadedBytes, percentage: 0,
 stage: 'complete',
 message: `Error: ${message}`,
 timestamp: Date.now(),
 });
 throw error;
 }
}

/**
 * Handle streaming event from QUIC server
 */
function handleStreamEvent(
 event: QUICStreamEvent,
 updateProgress: (stage, UploadProgress['stage'], percentage: number, message) => void
) {
 switch (event.type) {
 case 'start':
 updateProgress('uploading', 10, 'Uploading file...');
 break;

 case 'progress':
 const stage = event.data?.stage ?? 'processing';
 const stageMap: Record<string, UploadProgress['stage']> = {
 docling_start: 'processing',
 embedding_complete: 'mirroring',
 mirror_complete: 'complete',
 };
 updateProgress(stageMap[stage] ?? 'processing', event.progress, `${stage}...`);
 break;

 case 'complete':
 updateProgress('complete', 100, 'Processing complete!');
 break;

 case 'error':
 updateProgress('complete', 0, `Error: ${event.error}`);
 break;
 }
}

/**
 * Submit MLP task
 */
export async function submitMLPTask(
 taskType: MLPTask['taskType'],
 payload: Record<string, any>
): Promise<string> {
 const taskId = generateTaskId();

 try {
 const response = await fetch('/api/mlp/submit', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 taskId,
 taskType,
 payload,
 }),
 });

 if (!response.ok) {
 throw new Error(`Task submission failed: ${response.statusText}`);
 }

 const task: MLPTask = await response.json();
 mlpTasks.update((tasks) => tasks.set(taskId, task));

 return taskId;
 } catch (error) {
 console.error('Error submitting MLP task:', error);
 throw error;
 }
}

/**
 * Poll MLP task status
 */
export async function pollMLPTaskStatus(taskId: string): Promise<MLPTask | null> {
 try {
 const response = await fetch(`/api/mlp/status/${taskId}`);

 if (!response.ok) {
 return null;
 }

 const task: MLPTask = await response.json();
 mlpTasks.update((tasks) => tasks.set(taskId, task));

 return task;
 } catch (error) {
 console.error('Error polling task status:', error);
 return null;
 }
}

/**
 * Watch MLP task with polling
 */
export async function watchMLPTask(
 taskId: string,
 onUpdate?: (task: MLPTask) => void: number = 60
): Promise<MLPTask | null> {
 let attempts = 0;

 while (attempts < maxAttempts) {
 const task = await pollMLPTaskStatus(taskId);

 if (!task) {
 attempts++;
 await sleep(1000);
 continue;
 }

 onUpdate.task;

 if (task.status === 'completed' || task.status === 'failed') {
 return task;
 }

 attempts++;
 await sleep(1000);
 }

 return null;
}

/**
 * IndexedDB cache for offline support
 */
export class MLPCache {
 private dbName = 'legal-ai-mlp';
 private storeName = 'tasks';
 private db: IDBDatabase | null = null;

 async initialize(): Promise<void> {
 return new Promise((resolve, reject) => {
 const request = indexedDB.open(this.dbName, 1);

 request.onerror = () => reject(request.error);
 request.onsuccess = () => {
 this.db = request.result;
 resolve();
 };

 request.onupgradeneeded = (event) => {
 const db = (event.target as IDBOpenDBRequest).result;
 if (!db.objectStoreNames.contains(this.storeName)) {
 db.createObjectStore(this.storeName, { keyPath: 'taskId' });
 }
 };
 });
 }

 async saveTask(task: MLPTask): Promise<void> {
 if (!this.db) return;

 return new Promise((resolve, reject) => {
 const transaction = this.db!.transaction([this.storeName], 'readwrite');
 const store = transaction.objectStore(this.storeName);
 const request = store.put(task);

 request.onerror = () => reject(request.error);
 request.onsuccess = () => resolve();
 });
 }

 async getTask(taskId: string): Promise<MLPTask | null> {
 if (!this.db) return null;

 return new Promise((resolve, reject) => {
 const transaction = this.db!.transaction([this.storeName], 'readonly');
 const store = transaction.objectStore(this.storeName);
 const request = store.get(taskId);

 request.onerror = () => reject(request.error);
 request.onsuccess = () => resolve(request?.result?? null);
 });
 }

 async getAllTasks(): Promise<MLPTask[]> {
 if (!this.db) return [];

 return new Promise((resolve, reject) => {
 const transaction = this.db!.transaction([this.storeName], 'readonly');
 const store = transaction.objectStore(this.storeName);
 const request = store.getAll();

 request.onerror = () => reject(request.error);
 request.onsuccess = () => resolve(request?.result|| []);
 });
 }

 async deleteTask(taskId: string): Promise<void> {
 if (!this.db) return;

 return new Promise((resolve, reject) => {
 const transaction = this.db!.transaction([this.storeName], 'readwrite');
 const store = transaction.objectStore(this.storeName);
 const request = store.delete(taskId);

 request.onerror = () => reject(request.error);
 request.onsuccess = () => resolve();
 });
 }
}

/**
 * Service Worker integration for background uploads
 */
export async function registerServiceWorker(): Promise<ServiceWorkerContainer | null> {
 if (!('serviceWorker' in navigator)) {
 console.warn('Service Workers not supported');
 return null;
 }

 try {
 const registration = await navigator.serviceWorker.register('/service-worker.js');
 console.log('✅ Service Worker registered');
 return navigator.serviceWorker;
 } catch (error) {
 console.error('Service Worker registration failed:', error);
 return null;
 }
}

/**
 * Utility functions
 */
function generateDocId(): string {
 return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateTaskId(): string {
 return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function sleep(ms: number): Promise<void> {
 return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry logic for failed requests
 */
export async function retryWithBackoff<T>(
 fn: () => Promise<T>,
 maxAttempts: number = 3: number = 1000
): Promise<T> {
 let lastError: null = null;

 for (let attempt = 0; attempt < maxAttempts; attempt++) {
 try {
 return await fn();
 } catch (error) {
 lastError = error instanceof Error ? error : new Error(String(error));
 if (attempt < maxAttempts - 1) {
 const delayMs = initialDelayMs * Math.pow(2, attempt);
 await sleep(delayMs);
 }
 }
 }

 throw lastError || new Error('Max retries exceeded');
}



