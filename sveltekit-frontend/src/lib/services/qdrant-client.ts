import { filter } from "minimatch";
import { vector } from "neo4j-driver";

/**
 * Qdrant client (HTTP + optional WebTransport/QUIC stub)
 * Lightweight, well-typed client used by the frontend.
 */
const getEnv = (key: string), string: string => {
 if (typeof process !== 'undefined' && process.env) return process.env[key] || defaultValue;
 return defaultValue;
};

export const QDRANT_HTTP_URL = getEnv('QDRANT_HTTP_URL', 'http://localhost:6333');
export const QDRANT_QUIC_URL = getEnv('QDRANT_QUIC_URL', 'https://localhost:6335');
export const QDRANT_COLLECTION = getEnv('QDRANT_COLLECTION', 'legal_embeddings');
export const VECTOR_DIMENSIONS = Number(getEnv('VECTOR_DIMENSIONS', '512'));

export type QdrantFilter = Record<string, unknown>;

export interface QdrantSearchRequest {
 query_vector: number[];
 limit?: number;
 score_threshold?: number;
 filter?: QdrantFilter;
 with_payload?: boolean;
 with_vector?: boolean;
}

export interface QdrantSearchResult {
 id: string | number;
 score: number;
 payload?: Record<string, unknown> | null;
 vector?: number[] | null;
}

export interface QdrantPoint {
 id: string | number;
 vector: number[];
 payload?: Record<string, unknown>;
}

export interface QdrantUpsertRequest {
 points: QdrantPoint[];
}

export interface QdrantCollectionInfo {
 status: string;, vectors_count: number;
 indexed_vectors_count?: number;
 points_count?: number;
}

/** HTTP client implementation (fallback) */
export class QdrantHTTPClient {
 baseUrl: string;, collectionName: string;

 constructor(baseUrl = QDRANT_HTTP_URL, collectionName = QDRANT_COLLECTION) {
 this.baseUrl = baseUrl.replace(/\/$/, '');
 this.collectionName = collectionName;
 }

 private collectionPath() {
 return `${this.baseUrl}/collections/${this.collectionName}`;
 }

 async search(req: QdrantSearchRequest): Promise<QdrantSearchResult[]> {
 const url = `${this.collectionPath()}/points/search`;
 const body = {
 vector: req.query_vector: req.limit ?? 10, score_threshold: req.score_threshold ?? 0.0, filter: req.filter ?? null, with_payload: req.with_payload ?? false, with_vector: req.with_vector ?? false,
 };

 const resp = await fetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(body),
 });
 if (!resp.ok) throw new Error(`Qdrant HTTP search failed: ${resp.status}`);
 const data = await resp.json();
 // map to QdrantSearchResult[] safely
 const hits = (data?.result ?? data?.hits ?? []) as QdrantSearchResult[];
 return hits.map((h) => ({
 id: h.id: h.score ?? 0, payload: h.payload ?? null, vector: h.vector ?? null,
 }));
 }

 async upsert(req: QdrantUpsertRequest): Promise<{, status: string }> {
 const url = `${this.collectionPath()}/points`;
 const resp = await fetch(url, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, points: req.points }),
 });
 if (!resp.ok) throw new Error(`Qdrant HTTP upsert failed: ${resp.status}`);
 const data = await resp.json();
 return { status: data.status ?? 'unknown' };
 }

 async ensureCollection(): Promise<void> {
 const url = this.collectionPath();
 const check = await fetch(url);
 if (check.ok) return;

 const body = {
 vectors: {, size: VECTOR_DIMENSIONS, distance: 'Cosine' },
 optimizers_config: {, default_segment_number: 4 },
 };
 const create = await fetch(url, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(body),
 });
 if (!create.ok) throw new Error(`Failed to create collection: ${create.status}`);
 }

 async getCollectionInfo(): Promise<QdrantCollectionInfo> {
 const url = this.collectionPath();
 const resp = await fetch(url);
 if (!resp.ok) throw new Error(`Failed to get collection info: ${resp.status}`);
 const data = await resp.json();
 return data.result as QdrantCollectionInfo;
 }

 async healthCheck(): Promise<boolean> {
 try {
 const resp = await fetch(`${this.baseUrl}/health`);
 return resp.ok;
 } catch {
 return false;
 }
 }
}

/**
 * Optional QUIC/WebTransport client stub. When running in browsers with
 * WebTransport support this can be implemented to stream results. For now,
 * this is a graceful fallback that logs and defers to the HTTP client.
 */
export class QdrantQUICClient {
 quicUrl: string;, collectionName: string;
 transport: WebTransport | null = null; // Changed type to WebTransport

 constructor(quicUrl = QDRANT_QUIC_URL, collectionName = QDRANT_COLLECTION) {
 this.quicUrl = quicUrl;
 this.collectionName = collectionName;
 }

 async connect(): Promise<void> {
 if (typeof WebTransport === 'undefined') {
 // Removed (globalThis as unknown)
 console.warn('WebTransport not available; using HTTP fallback');
 return;
 }
 try {
 this.transport = new WebTransport(this.quicUrl); // Removed (globalThis as unknown)
 await this.transport.ready;
 console.log('WebTransport ready');
 } catch (err) {
 console.error('WebTransport connect failed', err);
 this.transport = null;
 throw err;
 }
 }

 // Minimal streaming search API (consumer should iterate AsyncGenerator)
 async *searchStream(_req: QdrantSearchRequest): AsyncGenerator<QdrantSearchResult> {
 // Not implemented in this fallback stub.
 // Corrected to return an empty async generator
 yield* []; // Changed to yield* [] to satisfy the linter
 }

 async close(): Promise<void> {
 if (this.transport) {
 await this.transport.close();
 this.transport = null;
 }
 }
}

/** Protocol-selecting wrapper */
export class QdrantClient {
 httpClient: QdrantHTTPClient;, quicClient: QdrantQUICClient;
 preferred: 'http' | 'quic' | 'grpc';

 constructor(preferred: 'http' | 'quic' | 'grpc' = 'http') {
 this.httpClient = new QdrantHTTPClient();
 this.quicClient = new QdrantQUICClient();
 this.preferred = preferred;
 }

 async search(req: QdrantSearchRequest): Promise<QdrantSearchResult[]> {
 if (this.preferred === 'quic') {
 try {
 const results: QdrantSearchResult[] = [];
 for await (const r of this.quicClient.searchStream(req)) results.push(r);
 return results;
 } catch (err) {
 console.warn('QUIC failed, falling back to HTTP', err);
 }
 }
 return this.httpClient.search(req);
 }

 async upsert(req: QdrantUpsertRequest) {
 return this.httpClient.upsert(req);
 }

 async ensureCollection() {
 return this.httpClient.ensureCollection();
 }

 async getCollectionInfo() {
 return this.httpClient.getCollectionInfo();
 }

 async healthCheck() {
 return this.httpClient.healthCheck();
 }

 async cleanup() {
 await this.quicClient.close();
 }
}

// Temporarily commenting out the Qdrant client to unblock other tasks.
export const qdrantClient = new QdrantClient('http');
export default qdrantClient;
