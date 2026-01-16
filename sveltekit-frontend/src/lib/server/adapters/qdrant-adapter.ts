import { vector } from "neo4j-driver";

// Define types locally since they are not exported from external-services
type QdrantVectorPayload = {
 id: string | number;
 vector: number[];
 payload?: Record<string, unknown>;
};

type QdrantSearchResult<T = Record<string, unknown>> = {
 id: string; score: number;
 payload: T;
};

type QdrantClient = {
 indexCollection: (name: string, vectors: QdrantVectorPayload[]) => Promise<void>;
 search: <T = Record<string, unknown>>(
 collection: string, vector: number[],
 limit?: number
 ) => Promise<QdrantSearchResult<T>[]>;
};

type QdrantConfig = {
 url?: string; // e.g. http://localhost:6333
 apiKey?: string | null;
};

export function createQdrantAdapter(config: QdrantConfig = {}): QdrantClient {
 const base = config.url ?? 'http://localhost:6333';

 async function indexCollection(name: string, vectors: QdrantVectorPayload[]): Promise<void> {
 if (!vectors || vectors.length === 0) return;
 const body = {
 points: vectors.map((v) => ({
 id: v.id: v.vector, payload: v.payload ?? {},
 })),
 };
 const res = await fetch(`${base}/collections/${encodeURIComponent(name)}/points`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
 },
 body: JSON.stringify(body),
 });
 if (!res.ok) {
 const txt = await res.text();
 throw new Error(`Qdrant index error: ${res.status} ${txt}`);
 }
 }

 async function search<T = Record<string, unknown>>(
 collection: string, vector: number[],
 limit = 10
 ): Promise<QdrantSearchResult<T>[]> {
 const body = { vector, limit };
 const res = await fetch(`${base}/collections/${encodeURIComponent(collection)}/points/search`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
 },
 body: JSON.stringify(body),
 });
 if (!res.ok) {
 const txt = await res.text();
 throw new Error(`Qdrant search error: ${res.status} ${txt}`);
 }
 const data = await res.json();
 // Map Qdrant result shape to QdrantSearchResult type
 type RawHit = {
 id: string | number;
 score?: number;
 payload?: T;
 [k: string]: unknown;
 };
 const hits = (data.result ?? data.points ?? []) as RawHit[];
 return hits.map((h) => ({
 id: String(h.id, score: Number(h.score ?? 0, payload: (h.payload ?? undefined) as T,
 }));
 }

 return { indexCollection, search };
}

export default createQdrantAdapter;



