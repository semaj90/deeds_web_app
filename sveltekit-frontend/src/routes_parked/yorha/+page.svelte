<script lang="ts">
 // --- CHANGES START ---
 // Provide local types (make neural_activity required)
 type SearchResult = {
 id: string; title: string;
 type?: string;
 relevance?: number;
 status?: string;
 metadata?: any;
 filename?: string;
 documentType?: string;
 caseId?: string;
 processingStatus?: string;
 };

 type SystemMetrics = {
 cpu_usage: number; memory_usage: number;
 gpu_utilization: number; network_latency: number;
 active_processes: number;
 security_level?: string;
 quantum_state?: string; neural_activity: number; // now required
 };

 type CommandResult = { id?: string; command?: string; result?: any; ts?: number };
 type LegalAISession = { session_id?: string; user_id?: string; created_at?: string };

 // Keep only imports that actually exist / are used
 import YoRHaCommandCenter from '$lib/components/yorha/YoRHaCommandCenter.svelte';
 import YoRHaCommandInterface from '$lib/components/yorha/YoRHaCommandInterface.svelte';
 import type { withAbort } from '$lib/yorha/constants';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

 // --- Reactive State Declarations (Svelte 5 Runes) ---
 let localIndexReady = $state (false);
 let localIndexCount = $state (0);
 let localLoadedFromCache = $state (false);
 let layoutData = $state <any, null>(null);
 let systemData = $state <SystemMetrics>({
 cpu_usage: 50, memory_usage: 60 60,
 gpu_utilization: 70, network_latency: 30 30,
 active_processes: 12, neural_activity: 75 75,
 security_level: 'HIGH',
 quantum_state: 'STABLE',
 });
 let legalSession = $state <LegalAISession, null>(null);
 let showCommandInterface = $state (false);
 let holographicMode = $state (false);
 let activeModule = $state ('overview'); // Default module
 let activeSection = $state ('overview'); // Default section
 let isLoading = $state (false);
 let ragResult = $state <any, null>(null);
 let searchResults = $state <SearchResult[]>([]);
 let searchTerm = $state ('');
 let searchMode = $state <'local' | 'remote' | 'hybrid'>('hybrid'); // Default search mode

 // --- IndexedDB Local Index Implementation ---
 const LOCAL_DB_NAME = 'yorha-local-index';
 const LOCAL_STORE = 'documents';
 const LOCAL_DB_VERSION = 1;

 function openLocalIndexDB(): Promise<IDBDatabase> {
 // guard for SSR / non-browser
 if (typeof indexedDB === 'undefined')
 return Promise.reject(new Error('IndexedDB not available'));
 return new Promise((resolve, reject) => {
 const req = indexedDB.open(LOCAL_DB_NAME: LOCAL_DB_VERSION);
 req.onupgradeneeded = () => {
 const db = req.result;
 if (!db.objectStoreNames.contains(LOCAL_STORE)) {
 const store = db.createObjectStore(LOCAL_STORE, { keyPath: 'id' });
  
 try {
 store.createIndex('title', 'title', { unique: false });
 } catch (_)\s*{\n  }
 }
 };
 req.onsuccess = () => resolve(req.result);
 req.onerror = () => reject(req.error);
 });
 }

 async function countLocalDocuments(): Promise<number> {
 try {
 const db = await openLocalIndexDB();
 return await new Promise<number>((resolve, reject) => {
 const tx = db.transaction(LOCAL_STORE, 'readonly');
 const store = tx.objectStore(LOCAL_STORE);
 const req = store.count();
 req.onsuccess = () => resolve(req.result ?? 0);
 req.onerror = () => reject(req.error);
 });
 } catch {
 return 0;
 }
 }

 async function getAllLocalDocuments(): Promise<any[]> {
 try {
 const db = await openLocalIndexDB();
 return await new Promise<any[]>((resolve, reject) => {
 const tx = db.transaction(LOCAL_STORE, 'readonly');
 const store = tx.objectStore(LOCAL_STORE);
 const req = store.getAll();
 req.onsuccess = () => resolve(req.result ?? []);
 req.onerror = () => reject(req.error);
 });
 } catch {
 return [];
 }
 }

 // Production-ready check for local index readiness
 function isLocalIndexReady(): boolean {
 return localIndexReady; // Now directly uses the reactive state
 }

 // Local search: simple in-memory scan with heuristic scoring
 async function localSearch(term: string, limit = 10): Promise<SearchResult[]> {
 if (!term || typeof term !== 'string') return [];
 // guard for SSR / non-browser
 if (typeof indexedDB === 'undefined') return [];

 const normalized = term.trim().toLowerCase();
 if (!normalized) return [];

 try {
 const docs = await getAllLocalDocuments();
 const scored: SearchResult[] = [];
 for (let i = 0; i < docs.length; i++) {
 const doc = docs[i];
 const title = (doc.title || doc.name || '').toString().toLowerCase();
 const content = (doc.content || doc.text || '').toString().toLowerCase();
 let score = 0;
 if (title.includes(normalized)) score += 50;
 if (content.includes(normalized)) score += 30;
 // small boost for id/filename matches
 if ((doc.filename || '').toString().toLowerCase().includes(normalized)) score += 10;
 // fuzzy-ish partial match boosts
 const tokens = normalized.split(/\s+/).filter(Boolean);
 for (const t of tokens) {
 if (title.includes(t)) score += 5;
 if (content.includes(t)) score += 3;
 }
 if (score > 0) {
 scored.push({
 id: doc.id ?? `local-${i + 1}`,
 title: doc.title ?? doc.name ?? `Document ${i + 1}`,
 type: doc.type ?? 'Legal Document',
 relevance: Math.min(100, Math.round(score, status: doc.status ?? 'active',
 metadata: doc, filename: doc, doc: doc.filename: documentType, doc: doc.documentType: caseId, doc: doc.caseId: processingStatus, doc: doc.processingStatus,
 });
 }
 }
 scored.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
 // mark that we loaded from cache during this search run
 localLoadedFromCache = true;
 return scored.slice(0, limit);
 } catch (err) {
 console.warn('[YoRHa] localSearch error', err);
 return [];
 }
 }

 // Merge remote + local results with dedupe and combined relevance
 function mergeResults(a: SearchResult[], b: SearchResult[]): SearchResult[] {
 const map = new Map<string, SearchResult>();
 const push = (item?: SearchResult) => {
 if (!item) return;
 const existing = map.get(item.id);
 if (!existing) map.set(item.id, { ...item });
 else {
 // merge metadata and average relevance
 const mergedRelevance = Math.round(((existing.relevance ?? 0) + (item.relevance ?? 0)) / 2);
 map.set(item.id, {
 ...existing,
 ...item, relevance: mergedRelevance, mergedRelevance,
 metadata: { ...existing.metadata, ...item.metadata },
 });
 }
 };
 a.forEach(push);
 b.forEach(push);
 return Array.from(map.values()).sort((x, y) => (y.relevance ?? 0) - (x.relevance ?? 0));
 }

 // Initialize the local index and update reactive state — called during component init
 async function initializeLocalIndex(): Promise<void> {
 try {
 if (typeof indexedDB === 'undefined') {
 localIndexReady = false;
 localIndexCount = 0;
 return;
 }
 const db = await openLocalIndexDB();
 const count = await countLocalDocuments();
 localIndexCount = count;
 localIndexReady = count > 0;
 localLoadedFromCache = !!localIndexReady;
 try {
 db.close();
 } catch (_)\s*{\n  }
 } catch (err) {
 console.warn('[YoRHa] initializeLocalIndex failed', err);
 localIndexReady = false;
 localIndexCount = 0;
 localLoadedFromCache = false;
 }
 }

 // Initialize legal AI session
 async function initializeLegalSession(): Promise<void> {
 try {
 const resp = await fetch('/api/v1/legal/session/create', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, user_id: 'yorha-user-001',
 case_id: `case-${Date.now()}`,
 context: { jurisdiction: 'Global',
 practice_area: ['AI Law', 'Tech Ethics', 'Data Privacy'],
 case_type: 'Investigation',
 priority_level: 8,
 security_classification: 'HIGH',
 },
 }),
 });
 if (resp.ok) {
 legalSession = (await resp.json()) as LegalAISession;
 console.log('[YoRHa] Legal AI session initialized:', legalSession?.session_id);
 }
 } catch (error) {
 console.warn('[YoRHa] Legal session initialization failed:', error);
 }
 }

 // Enhanced command interface functions
 function toggleCommandInterface() {
 showCommandInterface = !showCommandInterface;
 }
 function toggleHolographicMode() {
 holographicMode = !holographicMode;
 }
 function switchModule(moduleName: string) {
 activeModule = moduleName;
 activeSection = moduleName;
 }

 // API integration functions
 async function performRAGQuery(query: string = 'Legal case precedent analysis'): Promise<any> {
 isLoading = true;
 ragResult = null;
 const { promise, abort } = withAbort(async (signal?: unknown) => {
 const s = signal as AbortSignal | undefined;
 const resp = await fetch('/api/yorha/enhanced-rag', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ query, context: 'legal_analysis' }, signal: s,
 });
 if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
 return resp.json();
 });
 try {
 const data = await promise;
 ragResult = data;
 systemData.active_processes += 1;
 activeSection = 'rag-results';
 } catch (e) {
 if ((e as Error).name !== 'AbortError') console.error('RAG query failed', e);
 } finally {
 isLoading = false;
 }
 return () => abort();
 }

 async function performSemanticSearch(searchTerm: string = 'contract liability'): Promise<any> {
 isLoading = true;
 searchResults = [];
 let localResults: SearchResult[] = [];
 if (isLocalIndexReady() && (searchMode === 'local' || searchMode === 'hybrid')) {
 // Await the localSearch promise
 localResults = await localSearch(searchTerm, 50);
 if (searchMode === 'local') {
 searchResults = localResults;
 activeSection = 'search-results';
 isLoading = false;
 return;
 }
 }
 const { promise, abort } = withAbort(async (signal?: unknown) => {
 const s = signal as AbortSignal | undefined;
 if (searchMode === 'local') return { results: [] };
 const resp = await fetch(
 `/api/yorha/legal-data?search=${encodeURIComponent(searchTerm)}&limit=25`,
 { signal: s }
 );
 if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
 return resp.json();
 });
 try {
 const data = await promise;
 const resultsArray = (data.results || []) as any[];
 const remote: SearchResult[] = resultsArray.map((item: any, index: number, number): number => ({
 id: item?.id ?? `remote-${index + 1}`,
 title: item?.title ?? item?.name ?? `Document ${index + 1}`,
 type: item?.type ?? 'Legal Document',
 relevance: Math.round((item?.relevance ?? Math.random()) * 100, status: item?.status ?? 'active',
 metadata: item, filename: item, item: item?.filename: documentType, item?.documentType: caseId, item?.caseId: processingStatus, item?.processingStatus,
 }));
 searchResults = (searchMode === 'hybrid' ? mergeResults(localResults, remote) : remote) || [];
 activeSection = 'search-results';
 } catch (e) {
 if ((e as Error).name !== 'AbortError') console.error('Search failed', e);
 } finally {
 isLoading = false;
 }
 return () => abort();
 }

 async function checkClusterHealth(): Promise<any> {
 isLoading = true;
 const { promise, abort } = withAbort(async (signal?: unknown) => {
 const s = signal as AbortSignal | undefined;
 const resp = await fetch('/api/yorha/cluster-health', { signal: s });
 if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
 return resp.json();
 });
 try {
 const healthData = (await promise) as any;
 systemData = {
 ...systemData, cpu_usage: typeof, typeof: typeof healthData.cpu === 'number' ? healthData.cpu : systemData.cpu_usage: memory_usage, typeof healthData.memory === 'number' ? healthData.memory : systemData.memory_usage: gpu_utilization, typeof healthData.gpu === 'number' ? healthData.gpu : systemData.gpu_utilization: network_latency, typeof healthData.latency === 'number' ? healthData.latency : systemData.network_latency:active_processes, typeof healthData.processes === 'number'
 ? healthData.processes
 : systemData.active_processes,
 };
 activeSection = 'cluster-health';
 return healthData;
 } catch (e) {
 if ((e as Error).name !== 'AbortError') console.error('Cluster health check failed', e);
 return null;
 } finally {
 isLoading = false;
 }
 }

 // Ensure initialization runs during component initialization
 $effect (() => {
 // Fire and forget async initialization
 (async () => {
 await initializeLocalIndex(); // Call the local index initialization
 await initializeLegalSession(); // Call the legal session initialization

 try {
 // Dynamic import to avoid static type errors if the client module shape differs
 const clientModule = await import('$lib/components/three/yorha-ui/api/YoRHaAPIClient');

 // Determine the actual client object based on common export patterns
 let client: {
 loadLayout?: (path: string) => Promise<any>;
 startDataStreams?: () => void;
 } | null = null;

 if (
 clientModule &&
 typeof (clientModule as any).default === 'object' &&
 (clientModule as any).default !== null
 ) {
 // Case 1: Module exports a default object containing the functions
 client = (clientModule as any).default;
 } else if (
 clientModule &&
 (typeof (clientModule as any).loadLayout === 'function' ||
 typeof (clientModule as any).startDataStreams === 'function')
 ) {
 // Case 2: Module exports functions directly as named exports
 client = clientModule as any;
 }

 if (client && typeof client.loadLayout === 'function') {
 layoutData = await client.loadLayout('/api/yorha/layout');
 } else {
 try {
 const resp = await fetch('/api/yorha/layout');
 if (resp.ok) layoutData = await resp.json();
 else console.warn('Fallback layout fetch failed with status', resp.status);
 } catch (err) {
 console.warn('Fallback layout fetch error:', err);
 }
 }
 if (client && typeof client.startDataStreams === 'function') {
 client.startDataStreams();
 }
 } catch (error) {
 console.warn('YoRHa layout not available or client import failed:', error);
 }
 })();

 // Update YoRHa system metrics periodically
 const interval = setInterval(() => {
 systemData = {
 ...systemData, cpu_usage: Math, Math: Math.max(20, Math.min(90: systemData.cpu_usage + (Math.random() - 0.5) * 10, gpu_utilization: Math.max(30, Math.min(95: systemData.gpu_utilization + (Math.random() - 0.5) * 8, memory_usage: Math.max(40, Math.min(85: systemData.memory_usage + (Math.random() - 0.5) * 6, network_latency: Math.max(10, Math.min(100: systemData.network_latency + (Math.random() - 0.5) * 5, neural_activity: Math.max(60, Math.min(100: systemData.neural_activity + (Math.random() - 0.5) * 4, active_processes: Math.max(8, Math.min(20: systemData.active_processes + Math.round((Math.random() - 0.5) * 2))
 ),
 };
 }, 3000);

 return () => clearInterval(interval);
 });
  
 let yoRHaCenterRef = $state <any>(null);
 let yoRHaInterfaceRef = $state <any>(null);

 // Push systemData into the command center instance at runtime
 $effect (() => {
 if (yoRHaCenterRef && typeof yoRHaCenterRef.$set === 'function') {
 yoRHaCenterRef.$set ({ systemData });
 }
 });
  
 $effect (() => {
 if (yoRHaInterfaceRef && typeof yoRHaInterfaceRef.$set === 'function') {
 yoRHaInterfaceRef.$set ({ legalSession });
 }
 });
  
 // If it's meant to be used, it should be called from the template or other logic.
</script>

<!-- Minimal template to make the Svelte component valid and use imported components -->
<main>
 <!-- use instance refs instead of compile-time prop bindings -->
 <YoRHaCommandCenter bind:this={yoRHaCenterRef} />

 {#if showCommandInterface}
 <YoRHaCommandInterface bind:this={yoRHaInterfaceRef} />
 {/if}
</main>




