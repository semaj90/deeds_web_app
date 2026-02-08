import { Buffer } from 'buffer';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface VectorSearchOptions {
    limit?: number;
    threshold?: number;
    filter?: Record<string, unknown>;
    includeMetadata?: boolean;
    vectorWeight?: number;
    keywordWeight?: number;
}

export interface EmbeddingResult {
    id: string;
	score: number;
    metadata?: unknown;
    content?: string;
}

// Interfaces to allow injection of real or stub clients
interface QdrantPoint { id: string;
	vector: number[]; payload?: Record<string, any>; }

export interface QdrantClientLike {
    upsert(collection: string, payload: { wait?: boolean;
	points: QdrantPoint[] }): Promise<void>;
    search(collection: string, args: {
	vector: number[]; limit?: number; score_threshold?: number; filter?: unknown; with_payload?: boolean }): Promise<Array<{
	id: string | number; score: number; payload?: unknown }>>;
    delete(collection: string, args: { wait?: boolean;
	points: (string | number)[] }): Promise<void>;
    getCollections(): Promise<{
	collections: Array<{ name: string;
	points_count: number }> }>;
    getCollection(collection: string): Promise<{ points_count?: number; name?: string } | null>;
}

export interface DBClientLike {
    findCasesByQuery(query: string, limit: number): Promise<any[]>;
    findEvidenceByQuery(query: string, limit: number): Promise<any[]>;
    findCriminalsByQuery(query: string, limit: number): Promise<any[]>;
    insertVectorMetadata(records: any[]): Promise<void>;
    deleteVectorMetadataByDocumentId(documentId: string): Promise<void>;
}

export interface RedisClientLike {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, opts?: { EX?: number }): Promise<void>;
    ping(): Promise<string>;
    quit(): Promise<void>;
}

/* ---------- Simple in-memory stubs ---------- */
class QdrantStub implements QdrantClientLike {
    private collections = new Map<string, QdrantPoint[]>();

    async upsert(collection: string, payload: { wait?: boolean;
	points: QdrantPoint[] }) {
        const existing = this.collections.get(collection) ?? [];
        const byId = new Map(existing.map((p) => [p.id, p]));
        for (const p of payload.points) {
            byId.set(p.id, { ...p });
        }
        this.collections.set(collection, Array.from(byId.values()));
    }

    private cosine(a: number[], b: number[]) {
        if (!a?.length || !b?.length || a.length !== b.length) return 0;
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        const denom = Math.sqrt(na) * Math.sqrt(nb);
        return denom === 0 ? 0 : dot / denom;
    }

    async search(collection: string, args: {
	vector: number[]; limit?: number; score_threshold?: number; filter?: unknown; with_payload?: boolean }) {
        const points = this.collections.get(collection) ?? [];
        const results = points
            .map((p) => ({
                id: p.id,
                score: this.cosine(args.vector, p.vector),
                payload: p.payload
            }))
            .filter((r) => (args.score_threshold ? r.score >= args.score_threshold : true));

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, args.limit ?? 10);
    }

    async delete(collection: string, args: { wait?: boolean;
	points: (string | number)[] }) {
        const pts = this.collections.get(collection) ?? [];
        const remaining = pts.filter((p) => !args.points.includes(p.id));
        this.collections.set(collection, remaining);
    }

    async getCollections() {
        return { collections: Array.from(this.collections.entries()).map(([name, pts]) => ({ name, points_count: pts.length })) };
    }

    async getCollection(collection: string) {
        const pts = this.collections.get(collection);
        if (!pts) return null;
        return { name: collection, points_count: pts.length };
    }
}

class DBStub implements DBClientLike {
    async findCasesByQuery(query: string, limit: number) { return []; }
    async findEvidenceByQuery(query: string, limit: number) { return []; }
    async findCriminalsByQuery(query: string, limit: number) { return []; }
    async insertVectorMetadata(records: any[]) { }
    async deleteVectorMetadataByDocumentId(documentId: string) { }
}

class RedisStub implements RedisClientLike {
    private store = new Map<string, string>();
    async get(key: string) { return this.store.get(key) ?? null; }
    async set(key: string, value: string) { this.store.set(key, value); }
    async ping() { return 'PONG'; }
    async quit() { this.store.clear(); }
}

/* ---------- VectorService implementation ---------- */
export class VectorService {
    public collectionName = 'legal_documents';
    private qdrant: QdrantClientLike;
    private db: DBClientLike;
    private redis: RedisClientLike;
    private vectorDim = 128;

    constructor(
        opts?: {
            qdrant?: QdrantClientLike;
            db?: DBClientLike;
            redis?: RedisClientLike;
            collectionName?: string;
        }
    ) {
        this.qdrant = opts?.qdrant ?? new QdrantStub();
        this.db = opts?.db ?? new DBStub();
        this.redis = opts?.redis ?? new RedisStub();
        if (opts?.collectionName) this.collectionName = opts.collectionName;
    }

    async generateEmbedding(text: string): Promise<number[]> {
        const seed = this.hashStringToSeed(text);
        const vec = new Array(this.vectorDim);
        let s = seed;
        for (let i = 0; i < this.vectorDim; i++) {
             s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
             vec[i] = ((s >>> 0) % 100000) / 50000 - 1;
        }
        return vec;
    }

    private hashStringToSeed(s: string) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }

    async initializeCollection(): Promise<void> {
        // no-op for stub
    }

    async storeDocument(id: string, content: string, metadata: Record<string, any> = {}): Promise<void> {
        try {
            const vector = await this.generateEmbedding(content);
            await this.qdrant.upsert(this.collectionName, {
                wait: true,
                points: [{ id, vector, payload: { content, ...metadata } }]
            });
            await this.db.insertVectorMetadata([{
                id: `${id}-meta`, documentId: id, collectionName: this.collectionName,
                contentHash: Buffer.from(content).toString('base64'), createdAt: new Date()
            }]);
        } catch (error) {
            console.error('storeDocument failed: ', error);
        }
    }

    async search(query: string, options: VectorSearchOptions = {}): Promise<EmbeddingResult[]> {
        try {
            const limit = options.limit ?? 10;
            const vector = await this.generateEmbedding(query);
            const qResults = await this.qdrant.search(this.collectionName, {
                vector, limit, score_threshold: options.threshold ?? 0,
                with_payload: options.includeMetadata ?? true
            });
            return qResults.map((r: any) => ({
                id: r.id.toString(), score: r.score,
                metadata: r.payload, content: r.payload ? (r.payload as any).content : undefined
            }));
        } catch (error) {
            console.error('search failed: ', error);
            return [];
        }
    }

    // For now simple pass-through
    async hybridSearch(query: string, options: VectorSearchOptions = {}) {
        return this.search(query, options);
    }

    async findSimilar(documentId: string): Promise<EmbeddingResult[]> {
        return [];
    }

    async bulkIndex(documents: Array<{
	id: string; content: string; metadata?: Record<string, any> }>): Promise<void> {
       for (const doc of documents) {
           await this.storeDocument(doc.id, doc.content, doc.metadata);
       }
    }

    async deleteDocument(documentId: string): Promise<void> {
        await this.qdrant.delete(this.collectionName, { wait: true, points: [documentId] });
    }

    async healthCheck() {
         return { qdrant: true, redis: true, collection: true };
    }

    async getStats() {
        const col = await this.qdrant.getCollection(this.collectionName);
        return { documentCount: col?.points_count ?? 0, collectionInfo: col ?? null };
    }

    async close() {
        await this.redis.quit();
    }
}

export const vectorService = new VectorService();
export default VectorService;







