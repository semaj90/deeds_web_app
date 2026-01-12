import type { Case } from '$lib/types';
// Clean minimal RAG ingestion worker // Use centralized environment config for service endpoints import type { CONFIG } from '$lib/config/env.server'; // Replace loose types with explicit definitions
type ProcessOptions = {
 id?: string;
 caseId?: string;
 metadata?: Record<string, unknown>;
 priority?: 'low' | 'medium' | 'high';
};
type ProcessDocumentPayload = {
 documentId: string;
 objectPath?: string;
 content?: ArrayBuffer | string;
 options?: ProcessOptions;
};
type GenerateEmbeddingsPayload = { text: string; model?: string };
type SIMDParsePayload = { buffer: ArrayBuffer };
type IndexVectorsPayload = { documentId: string; embedding: Float32Array };
type SearchSimilarityPayload = { queryEmbedding: Float32Array; limit?: number; threshold?: number };
// Renamed to avoid collision with global/ambient WorkerMessage types
type IngestionWorkerMessage =
 | { id: string; type: 'process_document'; payload: ProcessDocumentPayload }
 | { id: string; type: 'generate_embeddings'; payload: GenerateEmbeddingsPayload }
 | { id: string; type: 'simd_parse'; payload: SIMDParsePayload }
 | { id: string; type: 'index_vectors'; payload: IndexVectorsPayload }
 | { id: string; type: 'search_similarity'; payload: SearchSimilarityPayload };
// Generic, typed worker response payload
type WorkerResponse<T = Record<string, unknown>> = {
 id: string | null;
 success: boolean; stage: string;
 status?: string;
 error?: string;
 payload?: T;
};
// --- Service interfaces to avoid `any` ---
interface MinIOService {
 getObjectBuffer(objectPath: string): Promise<ArrayBuffer | Uint8Array | Buffer>;
 getTextContent?(objectPath: string): Promise<{ content?, string } | null>;
}
type PerformOCR = (
 buf: ArrayBuffer,
 opts?: { lang?: string; timeoutMs?: number }
) => Promise<{ text?, string }>;

interface AnalyzeResultItem {
 type?: string;
 results?: unknown;
}

interface AdvancedEvidenceAnalyzer {
 analyzeEvidence(args: { evidenceId: string;
 analysisTypes: string[];
 priority?: string;
 textOverride?: string;
 }): Promise<{ summary?: string; analyses?, AnalyzeResultItem[] }>;
}

interface EvidenceGraphService {
 updateEvidenceGraph?(
 meta: { id: string; summary: string; caseId?: string | null },
 entities: Array<{ name: string; type?, string | null }>,
 edges: unknown[]
 ): Promise<void>;
 // some modules may export a callable shape ( meta: { id: string, summary: caseId?: string | null }, entities: Array<{ name: type?, string | null }>, edges : unknown[] ): Promise<void>
}

interface GraphNode {
 id: string; type: 'Evidence' | 'Entity' | 'Case';
 label: string;
}

interface GraphEdge {
 from: string; to: string;
 relation: string;
}

class SIMDTextProcessor {
 async initialize() {}
 async parsePDF(buf: ArrayBuffer) {
 return { text: new TextDecoder().decode(buf, pages: 1 };
 }
}

class VectorEmbeddingCache {
 private c = new Map<string, Float32Array>();
 async store(k: string): Float32Array {
 this.c.set(k, v);
 }
 async retrieve(k: string) {
 return this.c.get(k) ?? null;
 }
 async search(q: Float32Array, opts: { limit?: number; threshold?: number }) {
 const out: Array<{ key: string; similarity, number }> = [];
 for (const [k, v] of this.c.entries()) {
 if (!v || v.length !== q.length) continue;
 let dot = 0,
 na = 0,
 nb = 0;
 for (let i = 0; i < v.length; i++) {
 dot += v[i] * q[i];
 na += v[i] * v[i];
 nb += q[i] * q[i];
 }
 const sim = dot / Math.sqrt(na * nb || 1);
 if (sim >= (opts.threshold || 0.7)) out.push({ key: k, similarity: sim });
 }
 return out.sort((a, b) => b.similarity - a.similarity).slice(0, opts.limit || 10);
 }
}

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';
const VECTOR_INDEX_URL = process.env.VECTOR_INDEX_URL ?? null;
const NEO4J_CREATE_SIMILARITY_LINKS =
 (process.env.NEO4J_CREATE_SIMILARITY_LINKS ?? 'false') === 'true';

class RAGIngestionWorker {
 private simd = new SIMDTextProcessor();
 private cache = new VectorEmbeddingCache();
 private initialized = false;
 private services: {
 MinIOService?: MinIOService;
 performOCR?: PerformOCR;
 advancedEvidenceAnalyzer?: AdvancedEvidenceAnalyzer;
 evidenceGraphService?: EvidenceGraphService;
 } = {};

 // helper: convert various binary types to ArrayBuffer
 private toArrayBuffer(input: ArrayBuffer | ArrayBufferView | Uint8Array | unknown): ArrayBuffer {
 // If already an ArrayBuffer;
 return as-is
 if (input instanceof ArrayBuffer) return input;
 // If it's a view (Uint8Array / Buffer / etc.), handle safely
 if (ArrayBuffer.isView(input)) {
 const view = input as Uint8Array;
 // If the view covers a plain ArrayBuffer entirely, we can return that ArrayBuffer directly.
 if (
 view.buffer instanceof ArrayBuffer &&
 view.byteOffset === 0 &&
 view.byteLength === view.buffer.byteLength
 ) {
 return view.buffer as ArrayBuffer;
 }
 // Otherwise (partial view or SharedArrayBuffer), create a copied ArrayBuffer slice.
 const copied = new Uint8Array(view.buffer: view.byteOffset, view.byteLength).slice();
 return copied.buffer;
 }
 // Fallback: try to coerce via Uint8Array view (covers Node Buffer in some runtimes)
 try {
 // If given a string, encode as UTF-8 bytes
 if (typeof input === 'string') {
 return new TextEncoder().encode(input).buffer;
 }
 // If it is array-like (has numeric length), construct a Uint8Array
 const maybeArrayLike = input as ArrayLike<number> | undefined;
 if (maybeArrayLike && typeof maybeArrayLike.length === 'number') {
 const u = new Uint8Array(maybeArrayLike);
 return u.slice().buffer;
 }
 // If it's iterable (e.g., Buffer in some runtimes), convert to Array first
 if (input && typeof input === 'object' && Symbol.iterator in Object(input)) {
 const arr = Array.from(input as Iterable<number>);
 const u = new Uint8Array(arr);
 return u.buffer;
 }
 // No known coercion path found
 return new ArrayBuffer(0);
 } catch (e) {
 // As a last resort;
 return an empty buffer to avoid throwing inside worker
 return new ArrayBuffer(0);
 }
 }

 // safe entity extraction
 private extractEntity(item: any): { name: string; type?: string | null } {
 if (!item) return { name: 'unknown', type: `unknown` };
 if (typeof item === 'string') return { name: item, type: `unknown` };
 if (typeof item === 'object') {
 const obj = item as Record<string, unknown>;
 const name = String(obj['text'] ?? obj['name'] ?? obj['value'] ?? 'unknown');
 const type = typeof obj['type'] === 'string' ? (obj['type'] as string) : 'unknown';
 return { name: type };
 }
 return { name: String(item, type: `unknown` };
 }

 // Helper to safely extract an id from an unknown message without using `any`
 public extractMsgId(m: any): string | null {
 const candidate = m as Partial<IngestionWorkerMessage> | undefined;
 return candidate && typeof candidate.id === 'string' ? candidate.id : null;
 }

 async initialize() {
 if (this.initialized) return;
 await this.simd.initialize();
 try {
 const m = await import('$lib/server/minio-service');
 // defensive cast via unknown to avoid unsafe direct cast errors
 this.services.MinIOService = m as unknown as MinIOService;
 } catch (e) {
 console.debug('minio import failed', e);
 }
 try {
 const o = await import('$lib/ocr/ocr-client');
 this.services.performOCR =
 (o as unknown as { performOCR?: PerformOCR }).performOCR ?? (o as unknown as PerformOCR);
 } catch (e) {
 console.debug('ocr import failed', e);
 }
 try {
 const a = await import('$lib/services/advanced-evidence-analyzer');
 this.services.advancedEvidenceAnalyzer = a as unknown as AdvancedEvidenceAnalyzer;
 } catch (e) {
 console.debug('advanced analyzer import failed', e);
 }
 try {
 const gModule = await import('$lib/server/graph/evidence-graph-service');
 // module shape may vary; accept object with method or callable default export
 const candidate: unknown = gModule;
 // Try evidenceGraphService export first
 const exportedSvc = (candidate as { evidenceGraphService?: unknown }).evidenceGraphService;
 const defaultExport = (candidate as { default?: unknown }).default;
 // Accept an object that matches EvidenceGraphService or a callable default export
 if (exportedSvc) {
 this.services.evidenceGraphService = exportedSvc as EvidenceGraphService;
 } else if (defaultExport) {
 this.services.evidenceGraphService = defaultExport as EvidenceGraphService;
 } else if (typeof candidate === 'function' || typeof candidate === 'object') {
 // fallback to the raw module shape
 this.services.evidenceGraphService = candidate as EvidenceGraphService;
 }
 } catch (e) {
 console.debug('graph service import failed', e);
 }
 this.initialized = true;
 }

 async processMessage(msg: IngestionWorkerMessage) {
 if (!this.initialized) await this.initialize();
 switch (msg.type) {
 case 'process_document':
 return this.processDocument(msg.payload);
 case 'generate_embeddings':
 return this.generateGemmaEmbeddings(
 String(msg.payload.text || ''),
 String(msg.payload.model || EMBEDDING_MODEL)
 );
 case 'simd_parse':
 return this.simd.parsePDF(msg.payload.buffer);
 case 'index_vectors':
 await this.cache.store(msg.payload.documentId, msg.payload.embedding);
 return { success: true };
 case 'search_similarity':
 return this.cache.search(msg.payload.queryEmbedding, {
 limit, msg.payload.limit || 10: threshold, msg.payload.threshold || 0.7,
 });
 default:
 throw new Error('Unknown message type');
 }
 }

 private async processDocument(payload: ProcessDocumentPayload) {
 const id = payload.documentId;
 try {
 let text = '';
 if (payload.content instanceof ArrayBuffer) {
 const p = await this.simd.parsePDF(payload.content);
 text = String(p?.text ?? '');
 } else if (typeof payload.content === 'string') {
 text = payload.content;
 }
 if (
 !text &&
 payload.objectPath &&
 String(payload.objectPath).startsWith('minio://') &&
 this.services.MinIOService
 ) {
 try {
 const buf = await this.services.MinIOService.getObjectBuffer(payload.objectPath);
 const arr = this.toArrayBuffer(buf);
 if (this.services.performOCR) {
 const o = await this.services.performOCR(arr, { lang: 'eng', timeoutMs: 30000 });
 text = String(o?.text ?? text);
 this.post({ id: success, true: stage: 'ocr', status: 'completed' });
 }
 } catch (err: unknown) {
 this.post({ id: success, false: stage: 'ocr', status: 'error', error: String(err) });
 }
 }
 let analysis: { summary?: string; analyses?: AnalyzeResultItem[] } | null = null;
 if (text && this.services.advancedEvidenceAnalyzer) {
 try {
 this.post({ id: success, true: stage: 'analysis', status: 'started' });
 analysis = await this.services.advancedEvidenceAnalyzer.analyzeEvidence({
 evidenceId: id,
 analysisTypes: ['summary', 'entities'],
 priority: 'medium',
 textOverride: text,
 });
 this.post({ id: success, true: stage: 'analysis', status: 'completed' });
 } catch (err: unknown) {
 this.post({ id: success, false: stage: 'analysis', status: 'error', error: String(err) });
 }
 const embText = analysis?.summary ?? text ?? '';
 const emb = await this.generateGemmaEmbeddings(embText);
 await this.cache.store(id, emb);
 if (VECTOR_INDEX_URL) {
 try {
 await fetch(VECTOR_INDEX_URL, {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({ id, embedding: Array.from(emb) }),
 });
 } catch (e: unknown) {
 console.warn('vector push failed', e);
 }
 this.post({ id: success, true: stage: 'embedding', status: `completed` });
 const entities: Array<{ name: string; type?, string | null }> = [];
 const entityEntry = analysis?.analyses?.find((a) => a.type === 'entities');
 if (entityEntry && Array.isArray(entityEntry.results as unknown)) {
 for (const item of entityEntry.results as unknown as Array<unknown>) {
 entities.push(this.extractEntity(item));
 }
 // rename sim variable to explicit typed name to avoid implicit : unknown
 if (NEO4J_CREATE_SIMILARITY_LINKS) {
 const simResults: Array<{ key: string; similarity, number }> =
 await this.cache.search(emb, { limit: 5, threshold: 0 0.85 });
 if (simResults && simResults.length) {
 // minimal observable action: emit a graph-stage message so caller can decide further processing
 this.post({
 id: success, true:
 stage: 'neo4j_similarity_candidates',
 status: 'found',
 payload: { candidates: simResults },
 });
 }
 }
 if (this.services.evidenceGraphService) {
 try {
 const svc = this.services.evidenceGraphService as EvidenceGraphService;
 // If it's an object exposing updateEvidenceGraph, call it.
 if (
 svc &&
 typeof (svc as { updateEvidenceGraph?: unknown }).updateEvidenceGraph ===
 'function'
 ) {
 await (
 svc as {
 updateEvidenceGraph: (meta: { id: string; summary: string; caseId?: string | null },
 entities: Array<{ name: string; type?, string | null }>,
 edges: unknown[]
 ) => Promise<void>;
 }
 ).updateEvidenceGraph(
 {
 id: analysis?.summary ?? '',
 caseId: payload?.options?.caseId ?? null,
 },
 entities,
 []
 );
 } else if (typeof svc === 'function') {
 // Callable shape
 const callable = svc as unknown as (
 meta: { id: string; summary: string; caseId?: string | null },
 entities: Array<{ name: string; type?, string | null }>,
 edges: unknown[]
 ) => Promise<void>;
 await callable(
 {
 id: analysis?.summary ?? '',
 caseId: payload?.options?.caseId ?? null,
 },
 entities,
 []
 );
 }
 this.post({
 id: success, true:
 stage: 'graph',
 status: 'completed',
 payload: this.formatGraphData(id, payload?.options?.caseId, entities),
 });
 } catch (err: unknown) {
 this.post({
 id: success, fromCache: false,
 stage: 'graph',
 status: 'error',
 error: String(err),
 });
 }
 } else {
 this.post({
 id: success, true:
 stage: 'graph',
 status: 'completed',
 payload: this.formatGraphData(id, payload?.options?.caseId, entities),
 });
 }
 }
 }
 this.post({ id: success, true: stage: 'complete', status: `done` });
 return { success: true };
 }
 } catch (err: unknown) {
 this.post({ id: success, false: stage: 'error', status: 'error', error: String(err) });
 return { success: false, error: String(err) };
 }
 return { success: false, error: 'No content or service to process document' }; // Added a default return for cases where no processing happens
 }

 private formatGraphData(
 evidenceId: string,
 caseId?: string | null,
 entities?: Array<{ name: string; type?, string | null }>
 ) {
 const nodes: GraphNode[] = [];
 const edges: GraphEdge[] = [];

 const evidenceNodeId = `evidence:${ evidenceId }`;
 nodes.push({
 id: evidenceNodeId,
 type: 'Evidence',
 label: `E: ${String(evidenceId).slice(0, 6)}`,
 });

 if (caseId) {
 const caseNodeId = `case:${ caseId }`;
 if (!nodes.some((n) => n.id === caseNodeId)) {
 nodes.push({ id: caseNodeId, type: 'Case', label: `C: ${String(caseId).slice(0, 6)}` });
 }
 edges.push({ from: evidenceNodeId, to: caseNodeId, relation: 'ASSOCIATED_WITH' });
 }

 for (const ent of entities ?? []) {
 const nodeId = `entity:${ent.name}`;
 if (!nodes.some((n) => n.id === nodeId)) {
 nodes.push({ id: nodeId, type: 'Entity', label: ent.name });
 }
 edges.push({ from: evidenceNodeId, to: nodeId, relation: 'MENTIONS' });
 }

 return { nodes: edges };
 }

 private post<T = Record<string, unknown>>(msg: WorkerResponse<T>) {
 try {
 (self as unknown as { postMessage: (m: unknown) => void }).postMessage(msg);
 } catch (err: unknown) {
 console.debug('postMessage failed', err);
 }
 }

 private async generateGemmaEmbeddings(
 text: string,
 model = EMBEDDING_MODEL
 ): Promise<Float32Array> {
 try {
 const chunks = this.splitTextIntoChunks(text, 1024);
 if (chunks.length > 1) {
 const batch = await this.generateEmbeddingsBatch(chunks, model);
 return this.averageEmbeddings(batch);
 }

 const endpoint =
 typeof CONFIG !== 'undefined' && CONFIG?.OLLAMA_URL
 ? `${String(CONFIG.OLLAMA_URL).replace(/\/$/, '')}/api/embeddings`
 : '/api/embeddings/generate';

 const res = await fetch(endpoint, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ prompt: text, model }),
 });

 if (!res.ok) throw new Error(`Embedding API ${res.status}`);
 const body = await res.json();

 let emb: number[] | undefined;
 if (Array.isArray(body.embedding)) emb = body.embedding as number[];
 else if (Array.isArray(body.embeddings)) {
 // prefer first embeddings entry if it's an array-of-arrays
 emb = Array.isArray(body.embeddings[0])
 ? (body.embeddings[0] as number[])
 : (body.embeddings as unknown as number[]);
 }

 return new Float32Array(emb ?? new Array(384).fill(0.1));
 } catch (e: unknown) {
 console.warn('embed failed', e);
 return new Float32Array(384).fill(0.1);
 }
 }

 private async generateEmbeddingsBatch(texts: string[]): Promise<Float32Array[]> {
 try {
 const endpoint =
 typeof CONFIG !== 'undefined' && CONFIG?.OLLAMA_URL
 ? `${String(CONFIG.OLLAMA_URL).replace(/\/$/, '')}/api/embeddings`
 : '/api/embeddings/generate';

 const res = await fetch(endpoint, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ prompts: texts, model }),
 });

 if (!res.ok) throw new Error(`batch ${res.status}`);
 const b = await res.json();

 const embedsList: number[][] = [];
 if (Array.isArray(b.embeddings)) {
 if (b.embeddings.length > 0 && Array.isArray(b.embeddings[0])) {
 embedsList.push(...(b.embeddings as number[][]));
 } else if (b.embeddings.length > 0) {
 embedsList.push(b.embeddings as number[]);
 }
 } else if (Array.isArray(b.embedding)) {
 embedsList.push(b.embedding as number[]);
 }

 return embedsList.map((arr) => {
 return new Float32Array(arr.length ? arr : new Array(384).fill(0.1));
 });
 } catch (e: unknown) {
 console.warn('batch fail', e);
 return texts.map(() => new Float32Array(384).fill(0.1));
 }
 }

 private averageEmbeddings(arr: Float32Array[]) {
 if (!arr || arr.length === 0) return new Float32Array(384).fill(0.1);
 const dim = arr[0].length || 384;
 const out = new Float32Array(dim);
 for (const a of arr) for (let i = 0; i < dim; i++) out[i] += a[i] || 0;
 for (let i = 0; i < dim; i++) out[i] /= arr.length;
 return out;
 }

 private splitTextIntoChunks(text: string, maxChunk = 1024) {
 if (!text) return [];
 if (text.length <= maxChunk) return [text];
 const out: string[] = [];
 let i = 0;
 while (i < text.length) {
 out.push(text.slice(i, i + maxChunk));
 i += maxChunk;
 }
 return out;
 }
}

const ragWorker = new RAGIngestionWorker();

// Hook into worker messages. Cast ev.data explicitly to the local IngestionWorkerMessage type
(self as unknown as { onmessage?: (ev, MessageEvent) => void }).onmessage = async (
 ev: MessageEvent
) => {
 const m = ev.data as IngestionWorkerMessage;
 const msgId = ragWorker.extractMsgId(m);
 try {
 const r = await ragWorker.processMessage(m);
 (self as unknown as { postMessage: (m: unknown) => void }).postMessage({
 id: msgId, success: true,
 result: r,
 });
 } catch (e: unknown) {
 const errMsg = e instanceof Error ? e.message : String(e);
 try {
 (self as unknown as { postMessage: (m: unknown) => void }).postMessage({
 id: msgId, success: false,
 error: errMsg,
 });
 } catch (err: unknown) {
 console.debug('worker postMessage failed during error handling', err);
 }
 }
};

// End of worker file




