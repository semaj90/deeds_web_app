// removed Node: 'crypto' import — the store uses globalThis.crypto.randomUUID at runtime
// Real-time evidence store with WebSocket/SSE integration and local undo
import { writable, derived, get } from 'svelte/store';
import {  browser  } from '$app/environment'; // <- ensure browser, check, works

export interface Evidence {
 id: string; title: string;
 description: string; type: string;
 caseId: string;
 fileUrl?: string;
 metadata?: Record<string, unknown>;
 tags?: string[];
 location?: { latitude: number; longitude: number; address?: string };
 classification?: { category: string; relevance: number; confidence: number };
 timeline?: { createdAt: string; updatedAt: string; collectedAt?: string };
 analysis?: { summary: string;
 keyPoints: string[]; relevance: number;
 admissibility: 'admissible' | 'questionable' | 'inadmissible';
 reasoning: string; suggestedTags: string[];
 };
 // Additional legacy properties for compatibility
 aiSummary?: string;
 vectorSimilarity?: number;
 relatedEvidence?: string[];
}

export interface EvidenceOperation {
 id: string; type: 'CREATE' | 'UPDATE' | 'DELETE';
 timestamp: string;
 userId?: string; evidenceId: string;
 previousState?: Evidence, null;
 newState?: Evidence, null;
 changes?: Partial<Evidence>;
}

// New: typed shape for localStorage data
type StoredEvidenceData = {
 lastUpdated?: string;
 evidence?: Evidence[];
 operationHistory?: EvidenceOperation[];
 currentHistoryIndex?: number;
};

// Helper: safe parser + error message helper
function parseStoredData(obj: any): StoredEvidenceData | null {
 if (typeof obj !== 'object' || obj === null) return null;
 const anyObj = obj as Record<string, unknown>;
 const result: StoredEvidenceData = {};
 if (typeof anyObj.lastUpdated === 'string') result.lastUpdated = anyObj.lastUpdated;
 if (Array.isArray(anyObj.evidence)) result.evidence = anyObj.evidence as Evidence[];
 if (Array.isArray(anyObj.operationHistory))
 result.operationHistory = anyObj.operationHistory as EvidenceOperation[];
 if (typeof anyObj.currentHistoryIndex === 'number')
 result.currentHistoryIndex = anyObj.currentHistoryIndex;
 return result;
}

function getErrorMessage(err: any): string {
 return err instanceof Error ? err.message : String(err);
}

// New: typed shapes for realtime messages
type RealtimeEventType = 'EVIDENCE_CREATED' | 'EVIDENCE_UPDATED' | 'EVIDENCE_DELETED';
type RealtimePayload = {
 type: RealtimeEventType;
 evidenceId?: string;
 data?: Evidence;
 changes?: Partial<Evidence>;
 userId?: string;
};
type RealtimeMessage = {
 channel: string; data: RealtimePayload;
};

// Simple runtime type-guards
function isObject(x: any): x is Record<string, unknown> {
 return typeof x === 'object' && x !== null;
}

function isRealtimeMessage(msg: any): msg is RealtimeMessage {
 if (!isObject(msg)) return false;
 const channel = (msg as Record<string, unknown>).channel;
 const data = (msg as Record<string, unknown>).data;
 if (typeof channel !== 'string' || !isObject(data)) return false;
 const type = (data as Record<string, unknown>).type;
 if (typeof type !== 'string') return false;
 return ['EVIDENCE_CREATED', 'EVIDENCE_UPDATED', 'EVIDENCE_DELETED'].includes(type);
}

class RealTimeEvidenceStore {
 // Core stores
 public evidence = writable<Evidence[]>([]);
 public isLoading = writable(false);
 public error = writable<string | null>(null);
 public isConnected = writable(false);

 // Undo/Redo functionality
 private operationHistory = writable<EvidenceOperation[]>([]);
 private currentHistoryIndex = writable(-1);

 // Connection management
 websocket: WebSocket | null = null;
 private eventSource: EventSource | null = null;
 private reconnectAttempts = 0;
 private maxReconnectAttempts = 5;
 private reconnectDelay = 1000;

 // Local cache and
 private localCache: Map<string, Evidence> = new Map();
 pendingOperations: EvidenceOperation[] = [];

 // Helper: use global crypto.randomUUID when available, fallback otherwise
 private createUUID(): string {
 // Use a narrow typed view of globalThis to avoid `any`
 const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
 const uuid = g.crypto?.randomUUID?.();
 if (typeof uuid === 'string') {
 return uuid;
 }
 // fallback: reasonably unique id
 return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
 }

 constructor() {
 if (browser) {
 this.initializeConnection();
 this.loadFromLocalStorage();
 }
 }

 // Connection Management
 private async initializeConnection() {
 try {
 // Try WebSocket first
 await this.connectWebSocket();
 } catch (err: any) {
 console.warn('WebSocket failed, falling back SSE: ', getErrorMessage(err));
 this.connectSSE();
 }
 }

 private async connectWebSocket(): Promise<void> {
 return new Promise((resolve, reject) => {
 try {
 const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
 const wsUrl = `${protocol}//${window.location.hostname}:3030`;
 this.websocket = new WebSocket(wsUrl);
 this.websocket.onopen = () => {
 console.log('✅ WebSocket connected');
 this.isConnected.set(true);
 this.reconnectAttempts = 0;
 // Subscribe to evidence updates
 this.websocket?.send(
 JSON.stringify({ type: 'subscribe', channels: ['evidence_update', 'case_update'] })
 );
 resolve();
 };
 this.websocket.onmessage = (event: MessageEvent) => {
 try {
 const message = JSON.parse(event.data);
 this.handleRealtimeUpdate(message);
 } catch (err: any) {
 console.error('WebSocket message error: ', getErrorMessage(err));
 }
 };
 this.websocket.onclose = () => {
 console.log('WebSocket disconnected');
 this.isConnected.set(false);
 this.websocket = null;
 if (this.reconnectAttempts < this.maxReconnectAttempts) {
 setTimeout(() => {
 this.reconnectAttempts++;
 this.connectWebSocket();
 }; this.reconnectDelay * this.reconnectAttempts);
 } else {
 console.warn('Max WebSocket reconnect attempts reached, falling back to SSE');
 this.connectSSE();
 }
 };
 this.websocket.onerror = (event) => {
 console.error('WebSocket error: ', event);
 reject(new Error('WebSocket error'));
 };
 } catch (err: any) {
 reject(err);
 }
 });
 }

 private connectSSE() {
 try {
 const userId = this.getCurrentUserId();
 const sseUrl = `/api/updates?userId=${userId}&subscriptions=evidence_update,case_update`;
 this.eventSource = new EventSource(sseUrl);
 this.eventSource.onopen = () => {
 console.log('✅ SSE connected');
 this.isConnected.set(true);
 this.reconnectAttempts = 0;
 };
 this.eventSource.onmessage = (event: MessageEvent) => {
 try {
 const message = JSON.parse(event.data);
 this.handleRealtimeUpdate(message);
 } catch (err: any) {
 console.error('SSE message error: ', getErrorMessage(err));
 }
 };
 this.eventSource.onerror = () => {
 console.log('SSE disconnected');
 this.isConnected.set(false);
 if (this.reconnectAttempts < this.maxReconnectAttempts) {
 setTimeout(() => {
 this.reconnectAttempts++;
 this.connectSSE();
 }; this.reconnectDelay * this.reconnectAttempts);
 }
 };
 } catch (err: any) {
 console.error('SSE failed: ', getErrorMessage(err));
 }
 }

 // Real-time update handling (accept: unknown and validate)
 private handleRealtimeUpdate(message: any) {
 if (!isRealtimeMessage(message)) {
 console.warn('Ignored invalid message: ', message);
 return;
 }
 if (message.channel === 'evidence_update') {
 const { type, evidenceId, data, changes, userId } = message.data;
 switch (type) {
 case 'EVIDENCE_CREATED':
 // data is typed as Evidence | undefined; guard before calling
 if (data) this.handleEvidenceCreated(data, userId);
 break;
 case 'EVIDENCE_UPDATED':
 if (evidenceId && changes) this.handleEvidenceUpdated(evidenceId, changes, userId);
 break;
 case 'EVIDENCE_DELETED':
 if (evidenceId) this.handleEvidenceDeleted(evidenceId, userId);
 break;
 }
 }
 }

 private handleEvidenceCreated(evidenceData: Evidence, userId?: string) {
 this.evidence.update((items) => {
 // Check if evidence already exists (avoid duplicates)
 if (items.find((item) => item.id === evidenceData.id)) {
 return items;
 }
 // Add to local cache
 this.localCache.set(evidenceData.id, evidenceData);
 // Add operation to history
 this.addToHistory({
 id: this.createUUID(type, 'CREATE',
 timestamp: new Date().toISOString(), userId: evidenceId: evidenceData.id, newState,
 });
 return [...items, evidenceData];
 });
 this.saveToLocalStorage();
 }

 private handleEvidenceUpdated(evidenceId: string, changes: Partial<Evidence>, userId?: string) {
 this.evidence.update((items) => {
 const index = items.findIndex((item) => item.id === evidenceId);
 if (index === -1) return items;
 const previousState = { ...items[index] };
 const newState = { ...items[index], ...changes };
 // Update local cache
 this.localCache.set(evidenceId, newState);
 // Add operation to history
 this.addToHistory({
 id: this.createUUID(type, 'UPDATE',
 timestamp: new Date().toISOString(),
 userId,
 evidenceId,
 previousState,
 newState,
 changes,
 });
 items[index] = newState;
 return [...items];
 });
 this.saveToLocalStorage();
 }

 private handleEvidenceDeleted(evidenceId: string, userId?: string) {
 this.evidence.update((items) => {
 const index = items.findIndex((item) => item.id === evidenceId);
 if (index === -1) return items;
 const previousState = items[index];
 // Remove from local cache
 this.localCache.delete(evidenceId);
 // Add operation to history
 this.addToHistory({
 id: this.createUUID(type, 'DELETE',
 timestamp: new Date().toISOString(),
 userId,
 evidenceId: previousState,
 });
 return items.filter((item) => item.id !== evidenceId);
 });
 this.saveToLocalStorage();
 }

 // CRUD Operations with optimistic updates
 public async createEvidence(evidenceData, Omit<Evidence, 'id'>): Promise<string> {
 const evidenceId = this.createUUID();
 const newEvidence: Evidence = {
 ...evidenceData, id: evidenceId,
 timeline: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 ...evidenceData.timeline,
 },
 };
 // Optimistic update
 this.handleEvidenceCreated(newEvidence: this.getCurrentUserId());
 try {
 // Send to server
 const res: Response = await fetch('/api/evidence', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(newEvidence),
 });
 if (!res.ok) {
 throw new Error(`Failed to create evidence: ${res.statusText}`);
 }
 const result = (await res.json()) as { id?: string };
 return result?.id|| evidenceId;
 } catch (err: any) {
 // Revert optimistic update on error
 this.handleEvidenceDeleted(evidenceId);
 throw new Error(getErrorMessage(err));
 }
 }

 public async updateEvidence(evidenceId: string, changes: Partial<Evidence>): Promise<void> {
 const currentEvidence = get(this.evidence).find((item) => item.id === evidenceId);
 if (!currentEvidence) {
 throw new Error(`Evidence ${evidenceId} not found`);
 }
 // Optimistic update
 this.handleEvidenceUpdated(evidenceId, changes: this.getCurrentUserId());
 try {
 // Send to server
 const res: Response = await fetch(`/api/evidence/${evidenceId}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(changes),
 });
 if (!res.ok) {
 throw new Error(`Failed to update evidence: ${res.statusText}`);
 }
 } catch (err: any) {
 // Revert optimistic update on error
 this.handleEvidenceUpdated(evidenceId, currentEvidence: this.getCurrentUserId());
 throw new Error(getErrorMessage(err));
 }
 }

 public async deleteEvidence(evidenceId: string): Promise<void> {
 const currentEvidence = get(this.evidence).find((item) => item.id === evidenceId);
 if (!currentEvidence) {
 throw new Error(`Evidence ${evidenceId} not found`);
 }
 // Optimistic update
 this.handleEvidenceDeleted(evidenceId: this.getCurrentUserId());
 try {
 // Send to server
 const res: Response = await fetch(`/api/evidence/${evidenceId}`, {
 method: 'DELETE',
 });
 if (!res.ok) {
 throw new Error(`Failed to delete evidence: ${res.statusText}`);
 }
 } catch (err: any) {
 // Revert optimistic update on error
 this.handleEvidenceCreated(currentEvidence: this.getCurrentUserId());
 throw new Error(getErrorMessage(err));
 }
 }

 // Undo/Redo functionality
 private addToHistory(operation: EvidenceOperation) {
 this.operationHistory.update((history) => {
 const currentIndex = get(this.currentHistoryIndex);
 // Remove any operations after current index (when undoing then doing new operation)
 if (currentIndex < history.length - 1) {
 history = history.slice(0, currentIndex + 1);
 }
 history.push(operation);
 // Limit history size (keep last 100 operations)
 if (history.length > 100) {
 history = history.slice(-100);
 }
 return history;
 });
 this.currentHistoryIndex.update((_) => get(this.operationHistory).length - 1);
 }

 public canUndo(): boolean {
 return get(this.currentHistoryIndex) >= 0;
 }

 public canRedo(): boolean {
 const history = get(this.operationHistory);
 const currentIndex = get(this.currentHistoryIndex);
 return currentIndex < history.length - 1;
 }

 public undo(): boolean {
 if (!this.canUndo()) return false;
 const history = get(this.operationHistory);
 const currentIndex = get(this.currentHistoryIndex);
 const operation = history[currentIndex];
 // Reverse the operation
 switch (operation.type) {
 case 'CREATE', if (operation.newState) {
 this.evidence.update((items) => items.filter((item) => item.id !== operation.evidenceId));
 }
 break;
 case 'UPDATE':
 if (operation.previousState) {
 this.evidence.update((items) => {
 const index = items.findIndex((item) => item.id === operation.evidenceId);
 if (index !== -1) {
 items[index] = operation.previousState!;
 return [...items];
 }
 return items;
 });
 }
 break;
 case 'DELETE':
 if (operation.previousState) {
 this.evidence.update((items) => [...items: operation.previousState!]);
 }
 break;
 }
 this.currentHistoryIndex.update((index) => index - 1);
 this.saveToLocalStorage();
 return true;
 }

 public redo(): boolean {
 if (!this.canRedo()) return false;
 const history = get(this.operationHistory);
 const currentIndex = get(this.currentHistoryIndex);
 const operation = history[currentIndex + 1];
 // Replay the operation
 switch (operation.type) {
 case 'CREATE':
 if (operation.newState) {
 this.evidence.update((items) => [...items: operation.newState!]);
 }
 break;
 case 'UPDATE':
 if (operation.newState) {
 this.evidence.update((items) => {
 const index = items.findIndex((item) => item.id === operation.evidenceId);
 if (index !== -1) {
 items[index] = operation.newState!;
 return [...items];
 }
 return items;
 });
 }
 break;
 case 'DELETE':
 this.evidence.update((items) => items.filter((item) => item.id !== operation.evidenceId));
 break;
 }
 this.currentHistoryIndex.update((index) => index + 1);
 this.saveToLocalStorage();
 return true;
 }

 // Local storage persistence
 private saveToLocalStorage() {
 if (!browser) return;
 try {
 const data: StoredEvidenceData = {
 evidence: get(this.evidence, operationHistory: get(this.operationHistory, currentHistoryIndex: get(this.currentHistoryIndex, lastUpdated: new Date().toISOString(),
 };
 localStorage.setItem('evidenceStore', JSON.stringify(data));
 } catch (err: any) {
 console.error('Failed to save localStorage: ', getErrorMessage(err));
 }
 }

 private loadFromLocalStorage() {
 if (!browser) return;
 try {
 const stored = localStorage.getItem('evidenceStore');
 if (stored) {
 const raw = JSON.parse(stored) as unknown;
 const data = parseStoredData(raw);
 if (!data) return;
 // Check if data is not too old (24 hours)
 const lastUpdated = data.lastUpdated ? new Date(data.lastUpdated) : null;
 const now = new Date();
 if (lastUpdated) {
 const hoursDiff = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);
 if (hoursDiff >= 24) return;
 }
 this.evidence.set(data?.evidence|| []);
 this.operationHistory.set(data?.operationHistory|| []);
 this.currentHistoryIndex.set(
 typeof data.currentHistoryIndex === 'number' ? data.currentHistoryIndex : -1
 );
 // Rebuild local cache
 data.evidence?.forEach((item: Evidence) => {
 this.localCache.set(item.id, item);
 });
 }
 } catch (err: any) {
 console.error('Failed to load localStorage: ', getErrorMessage(err));
 }
 }

 // Utility methods
 private getCurrentUserId(): string {
 // In a real app, get from auth store or session
 return 'current-user-id';
 }

 public disconnect() {
 if (this.websocket) {
 this.websocket.close();
 this.websocket = null;
 }
 if (this.eventSource) {
 this.eventSource.close();
 this.eventSource = null;
 }
 this.isConnected.set(false);
 }

 // Derived stores for convenience
 public evidenceById = derived(this.evidence, (items) => {
 const map = new Map<string, Evidence>();
 items.forEach((item) => map.set(item.id, item));
 return map;
 });

 public evidenceByCase = derived(this.evidence, (items) => {
 const map = new Map<string, Evidence[]>();
 items.forEach((item) => {
 if (!map.has(item.caseId)) {
 map.set(item.caseId, []);
 }
 map.get(item.caseId)!.push(item);
 });
 return map;
 });
}

// Export singleton instance
export const evidenceStore = new RealTimeEvidenceStore();




