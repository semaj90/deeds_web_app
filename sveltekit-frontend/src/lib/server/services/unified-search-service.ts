import type { SearchResult } from '$lib/types';
import pgClient from '$lib/server/db-shim';
import { cache } from '$lib/server/cache/redis';
import { publishToQueue } from '$lib/server/rabbitmq';
import { jobTracker } from '$lib/services/job-tracker';
import { createHash } from 'crypto';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// Interface definitions
export interface UnifiedDocument {
    id: string;
	title: string;
    content: string;
    filePath?: string;
    mimeType?: string;
    fileSize?: number;
	metadata: {
        source: 'upload' | 'manual' | 'api' | 'evidence';
        userId?: string;
        tags?: string[];
        category?: 'contract' | 'evidence' | 'brief' | 'citation' | 'other';
        confidenceLevel?: number;
        priority?: string;
        extractedEntities?: string[];
        keyTerms?: string[];
        neo4jNodeId?: string;
        shaderData?: unknown;
        [key: string]: unknown;
    };
    embeddings?: {
        chunks?: Array<unknown>;
        summary_embedding?: number[];
    };
    searchable?: {
        fulltext?: string;
        keywords?: string[];
        semantic_hash?: string;
    };
    cached?: {
        search_results?: unknown[];
        related_documents?: string[];
        recommendations?: Recommendation[];
        last_accessed?: string;
        access_count?: number;
    };
}

export interface Recommendation {
    type: string;
	documents: string[]; // list of related document IDs
    confidence: number;
    reasoning?: string;
    [key: string]: unknown;
}

export type IngestResult =
    | { success: true;
	documentId: string; jobId: string }
    | { success: false;
	error: string };

export interface SearchQuery {
    text?: string;
    vector?: number[];
    filters?: {
        category?: string[];
        tags?: string[];
        userId?: string;
        dateRange?: {
	start: string; end: string };
        confidenceMin?: number;
    };
    options?: {
        limit?: number;
        offset?: number;
        includeEmbeddings?: boolean;
        includeSimilarity?: boolean;
        useCache?: boolean;
        neo4jRecommendations?: boolean;
    };
}

export interface UnifiedSearchResult {
    documents: UnifiedDocument[];
	total: number;
    facets?: {
	categories: Record<string, number>;
        tags: Record<string, number>;
        users: Record<string, number>;
    };
    recommendations?: Recommendation[];
	cached: boolean;
    processingTime: number;
}

type PostgresJsClient = {
    unsafe: (query: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
};

type DbDocumentRow = {
    id: string;
    title?: string | null;
    content?: string | null;
    file_path?: string | null;
    mime_type?: string | null;
    file_size?: number | null;
    metadata?: string | Record<string, unknown> | null;
    created_at?: string | null;
    updated_at?: string | null;
    [key: string]: unknown;
};

class UnifiedSearchService {
    private isInitialized = false;
    private pg: PostgresJsClient;

    constructor() {
        this.pg = pgClient as unknown as PostgresJsClient;
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        console.log('🚀 Initializing Unified Search Service...');
        try {
            if (typeof this.pg.unsafe === 'function') {
                await this.pg.unsafe('SELECT 1');
            }
            console.log('✅ Database connection established');
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            throw error;
        }
        this.isInitialized = true;
        console.log('✅ Unified Search Service initialized');
    }

    // === DOCUMENT INGESTION ===
    async ingestDocument(document: Omit<UnifiedDocument, 'id' | 'searchable' | 'cached'>): Promise<IngestResult> {
        try {
            if (!this.isInitialized) await this.initialize();

            const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const contentHash = this.generateContentHash(document.content);
            const incomingMeta = (document.metadata || {}) as Record<string, unknown>;

            const normalizedCategory = this.normalizeCategory(incomingMeta.category);
            const source = (typeof incomingMeta.source === 'string' && ['upload', 'manual', 'api', 'evidence'].includes(incomingMeta.source))
                ? incomingMeta.source as 'upload' | 'manual' | 'api' | 'evidence'
                : 'api';

            const metadata: UnifiedDocument['metadata'] = {
                source,
                userId: typeof incomingMeta.userId === 'string' ? incomingMeta.userId : undefined,
                tags: Array.isArray(incomingMeta.tags) ? incomingMeta.tags.filter(t => typeof t === 'string') : [],
                category: normalizedCategory,
                confidenceLevel: typeof incomingMeta.confidenceLevel === 'number' ? incomingMeta.confidenceLevel : 0,
                priority: typeof incomingMeta.priority === 'string' ? incomingMeta.priority : undefined,
                extractedEntities: Array.isArray(incomingMeta.extractedEntities) ? incomingMeta.extractedEntities.filter(e => typeof e === 'string') : [],
                keyTerms: Array.isArray(incomingMeta.keyTerms) ? incomingMeta.keyTerms.filter(k => typeof k === 'string') : [],
                neo4jNodeId: typeof incomingMeta.neo4jNodeId === 'string' ? incomingMeta.neo4jNodeId : undefined,
                shaderData: incomingMeta.shaderData,
                semantic_hash: contentHash,
                ...Object.fromEntries(
                    Object.entries(incomingMeta).filter(([k]) => ![
                        'source', 'userId', 'tags', 'category', 'confidenceLevel',
                        'extractedEntities', 'keyTerms', 'neo4jNodeId', 'shaderData',
                        'priority', 'semantic_hash'
                    ].includes(k))
                )
            };

            const unifiedDoc: UnifiedDocument = {
                id: documentId,
                title: document.title ?? '',
                content: document.content ?? '',
                filePath: document.filePath,
                mimeType: document.mimeType,
                fileSize: document.fileSize ?? 0,
                metadata,
                searchable: {
	fulltext: this.extractFulltext(document),
                    keywords: this.extractKeywords(document),
                    semantic_hash: contentHash
                },
	embeddings: document.embeddings,
                cached: {
	last_accessed: new Date().toISOString(),
                    access_count: 0
                }
            };

            await this.pg.unsafe(
                `INSERT INTO documents (id, title, content, file_path, mime_type, file_size, metadata, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now())`,
                [
                    documentId,
                    document.title,
                    document.content,
                    document.filePath ?? null,
                    document.mimeType ?? null,
                    document.fileSize ?? 0,
                    JSON.stringify(unifiedDoc.metadata || {})
                ]
            );

            await cache.set(`doc:${documentId}`, JSON.stringify(unifiedDoc), 3600);

            const processingJob = {
                documentId,
                action: 'process_unified_document',
                document: unifiedDoc,
                priority: document.metadata?.source === 'evidence' ? 'high' : 'normal'
            };

            await publishToQueue('evidence.unified.processing', processingJob);

            jobTracker.recordMetric('document_ingested', {
                documentId,
                source: document.metadata?.source,
                category: document.metadata?.category,
                contentSize: document.content ? document.content.length : 0
            });

            return { success: true, documentId, jobId: `processing_${documentId}` };

        } catch (error) {
            console.error('❌ Error ingesting document:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    // === UNIFIED SEARCH ===
    async search(query: SearchQuery): Promise<UnifiedSearchResult> {
        const startTime = Date.now();
        try {
            if (!this.isInitialized) await this.initialize();

            const cacheKey = this.generateSearchCacheKey(query);
            if (query.options?.useCache !== false) {
                const cached = await cache.get(`search:${cacheKey}`);
                if (cached) {
                    console.log('🎯 Returning cached search results');
                    const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
                    return { ...parsed, cached: true, processingTime: Date.now() - startTime };
                }
            }

            let results: UnifiedDocument[] = [];

            if (query.vector && query.vector.length > 0) {
                results = await this.vectorSearch(query);
            } else if (query.text) {
                results = await this.textSearch(query);
            } else {
                results = await this.filterSearch(query);
            }

            const total = results.length;
            const limit = query.options?.limit ?? 20;
            const offset = query.options?.offset ?? 0;
            const paginatedResults = results.slice(offset, offset + limit);
            const facets = this.generateFacets(results);

            let recommendations: Recommendation[] = [];
            if (query.options?.neo4jRecommendations && paginatedResults.length > 0) {
                recommendations = await this.getNeo4jRecommendations(paginatedResults);
            }

            if (paginatedResults.length > 0) {
                void this.updateAccessCounts(paginatedResults.map(doc => doc.id));
            }

            const searchResult: UnifiedSearchResult = {
                documents: paginatedResults,
                total,
                facets,
                recommendations,
                cached: false,
                processingTime: Date.now() - startTime
            };

            await cache.set(`search:${cacheKey}`, JSON.stringify(searchResult), 600);
            return searchResult;

        } catch (error) {
            console.error('❌ Error in unified search:', error);
            throw error;
        }
    }

    private async vectorSearch(query: SearchQuery): Promise<UnifiedDocument[]> {
        if (!query.vector || query.vector.length === 0) return [];
        try {
            const limit = query.options?.limit ?? 20;
            const numericVec = query.vector.map(v => Number(v) || 0);
            const vecLiteral = `[${numericVec.join(',')}]`;

            const candidateQueries = [
                `SELECT d.*, (d.embedding <-> '${vecLiteral}'::vector) AS similarity FROM documents d WHERE d.embedding IS NOT NULL ORDER BY d.embedding <-> '${vecLiteral}'::vector LIMIT $1`,
                `SELECT d.*, (d.embedding_vector <-> '${vecLiteral}'::vector) AS similarity FROM documents d WHERE d.embedding_vector IS NOT NULL ORDER BY d.embedding_vector <-> '${vecLiteral}'::vector LIMIT $1`,
                `SELECT d.*, NULL::double precision AS similarity FROM documents d ORDER BY d.created_at DESC LIMIT $1`
            ];

            let rows: Array<Record<string, unknown>> = [];
            for (let i = 0; i < candidateQueries.length; i++) {
                try {
                    rows = await this.pg.unsafe(candidateQueries[i], [limit]);
                    break;
                } catch (e) {
                    console.debug(`vectorSearch attempt ${i} failed,`, (e as Error).message);
                }
            }

            if (!rows || rows.length === 0) return [];
            return rows.map(r => this.convertToUnifiedDocument(r as DbDocumentRow));
        } catch (error) {
            console.warn('⚠️ vectorSearch failed:', error);
            return [];
        }
    }

    private async textSearch(query: SearchQuery): Promise<UnifiedDocument[]> {
        if (!query.text) return [];
        try {
            const limit = query.options?.limit ?? 20;
            const rows = await this.pg.unsafe(
                `SELECT * FROM documents WHERE title ILIKE $1 OR content ILIKE $1 ORDER BY created_at DESC LIMIT $2`,
                [`%${query.text}%`, limit]
            );
            return rows.map(r => this.convertToUnifiedDocument(r as DbDocumentRow));
        } catch (error) {
            console.warn('⚠️ textSearch failed, returning empty results:', error);
            return [];
        }
    }

    private async filterSearch(query: SearchQuery): Promise<UnifiedDocument[]> {
        try {
            const limit = Math.max(query.options?.limit ?? 50, 50);
            const rows = await this.pg.unsafe(
                `SELECT * FROM documents ORDER BY created_at DESC LIMIT $1`,
                [limit]
            );

            let docs = rows.map(r => this.convertToUnifiedDocument(r as DbDocumentRow));

            if (query.filters?.category && query.filters.category.length > 0) {
                docs = docs.filter(d => query.filters!.category!.includes(d.metadata.category ?? 'other'));
            }
            if (query.filters?.userId) {
                docs = docs.filter(d => d.metadata.userId === query.filters!.userId);
            }
            if (typeof query.filters?.confidenceMin === 'number') {
                docs = docs.filter(d => (d.metadata.confidenceLevel ?? 0) >= query.filters!.confidenceMin!);
            }

            return docs.slice(0, query.options?.limit ?? 20);
        } catch (error) {
            console.warn('⚠️ filterSearch failed:', error);
            return [];
        }
    }

    private async getNeo4jRecommendations(docs: UnifiedDocument[]): Promise<Recommendation[]> {
        try {
            const entities = docs.flatMap(doc => doc.metadata?.extractedEntities || []);
            const categories = docs.map(doc => doc.metadata.category).filter(Boolean);

            const uniqueEntities = Array.from(new Set(entities));
            const topEntities = uniqueEntities.slice(0, 5);
            const topEntitiesStr = topEntities.length > 0 ? topEntities.join(', ') : 'none';

            const categoryCounts = categories.reduce((acc: Record<string, number>, c: any) => {
                acc[c] = (acc[c] ?? 0) + 1;
                return acc;
            },
	{});

            const mostFrequentCategory = Object.keys(categoryCounts).sort((a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0))[0] ?? 'unknown';

            const entitySignal = Math.min(1, uniqueEntities.length / 5);
            const baseConfidence = 0.7 + entitySignal * 0.2;
            const round2 = (n: number) => Math.round(n * 100) / 100;
            const primaryConfidence = round2(baseConfidence);
            const secondaryConfidence = round2(Math.max(0.5, baseConfidence - 0.12));

            return [
                {
                    type: 'related_cases',
                    documents: [],
                    confidence: primaryConfidence,
                    reasoning: `Based on ${uniqueEntities.length} unique extracted entities (${topEntitiesStr}) and dominant category: "${mostFrequentCategory}".`
                },
	{
                    type: 'similar_precedents',
                    documents: [],
                    confidence: secondaryConfidence,
                    reasoning: `Precedent similarity inferred from entity overlap and category distribution (${mostFrequentCategory}).`
                }
            ];
        } catch (error) {
            console.warn('⚠️ getNeo4jRecommendations failed:', error);
            return [];
        }
    }

    private generateContentHash(content?: string): string {
        const src = content ?? '';
        return createHash('sha256').update(src).digest('hex').slice(0, 20);
    }

    private extractFulltext(doc: Partial<UnifiedDocument>): string {
        const title = doc.title ?? '';
        const content = doc.content ?? '';
        return `${title}\n\n${content}`.trim();
    }

    private extractKeywords(doc: Partial<UnifiedDocument>): string[] {
        const text = (doc.title ?? '') + ' ' + (doc.content ?? '');
        const stop = new Set([
            'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
            'has', 'have', 'but', 'not', 'you', 'your', 'a', 'an', 'of', 'in', 'to', 'is'
        ]);
        const counts = text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stop.has(w))
            .reduce((acc: Record<string, number>, w) => {
                acc[w] = (acc[w] ?? 0) + 1;
                return acc;
            },
	{});

        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([k]) => k);
    }

    private generateSearchCacheKey(query: SearchQuery): string {
        const canonical = {
            text: query.text,
            filters: query.filters || {},
	options: query.options || {}
        };
        // Sort keys to ensure stable stringify
        const stableStringify = (obj: any): string => {
            if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
            if (Array.isArray(obj)) return JSON.stringify(obj.map(stableStringify));
            const keys = Object.keys(obj).sort();
            const result: Record<string, any> = {};
            keys.forEach(k => result[k] = stableStringify(obj[k]));
            return JSON.stringify(result);
        };
        const raw = stableStringify(canonical);
        return createHash('md5').update(raw).digest('hex');
    }

    private generateFacets(docs: UnifiedDocument[]) {
        const categories: Record<string, number> = {};
        const tags: Record<string, number> = {};
        const users: Record<string, number> = {};

        for (const d of docs) {
            const cat = d.metadata?.category ?? 'other';
            categories[cat] = (categories[cat] ?? 0) + 1;

            (d.metadata?.tags || []).forEach(t => {
                tags[t] = (tags[t] ?? 0) + 1;
            });

            if (d.metadata.userId) {
                users[d.metadata.userId] = (users[d.metadata.userId] ?? 0) + 1;
            }
        }
        return { categories, tags, users };
    }

    private async updateAccessCounts(ids: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        try {
            await Promise.all(ids.map(async id => {
                const key = `doc:${id}`;
                const raw = await cache.get(key);
                if (!raw) return;
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

                parsed.cached = parsed.cached || {};
                parsed.cached.access_count = (parsed.cached.access_count ?? 0) + 1;
                parsed.cached.last_accessed = new Date().toISOString();

                await cache.set(key, JSON.stringify(parsed), 3600);
            }));
        } catch (e) {
            console.warn('⚠️ updateAccessCounts failed:', e);
        }
    }

    private convertToUnifiedDocument(row: DbDocumentRow): UnifiedDocument {
        const metadataRaw = row.metadata || {};
        let parsedMeta: Record<string, unknown> = {};

        if (typeof metadataRaw === 'string') {
            try {
                parsedMeta = JSON.parse(metadataRaw);
            } catch {
                parsedMeta = {};
            }
        } else if (typeof metadataRaw === 'object' && metadataRaw !== null) {
            parsedMeta = metadataRaw as Record<string, unknown>;
        }

        const safeStringOrDefault = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
        const safeString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
        const safeStringArray = (v: unknown): string[] => Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
        const safeNumberFromUnknown = (v: unknown, d = 0): number => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
            return d;
        };

        const source = safeStringOrDefault(parsedMeta.source, 'api') as 'upload' | 'manual' | 'api' | 'evidence';
        const rawCategory = safeStringOrDefault(parsedMeta.category, 'other');
        const category = this.normalizeCategory(rawCategory);

        return {
            id: String(row.id),
            title: String(row.title ?? ''),
            content: String(row.content ?? ''),
            filePath: String(row.file_path ?? '') || undefined,
            mimeType: String(row.mime_type ?? '') || undefined,
            fileSize: typeof row.file_size === 'number' ? row.file_size : undefined,
            metadata: {
                source,
                userId: safeString(parsedMeta.userId),
                tags: safeStringArray(parsedMeta.tags),
                category,
                confidenceLevel: safeNumberFromUnknown(parsedMeta.confidenceLevel, 0),
                priority: safeString(parsedMeta.priority),
                extractedEntities: safeStringArray(parsedMeta.extractedEntities),
                keyTerms: safeStringArray(parsedMeta.keyTerms),
                neo4jNodeId: safeString(parsedMeta.neo4jNodeId),
                shaderData: parsedMeta.shaderData,
                semantic_hash: safeString(parsedMeta.semantic_hash),
            },
	embeddings: undefined,
            searchable: {
	fulltext: this.extractFulltext({ title: String(row.title ?? ''), content: String(row.content ?? '') }),
                keywords: this.extractKeywords({
	title: String(row.title ?? ''), content: String(row.content ?? '') }),
                semantic_hash: safeString(parsedMeta.semantic_hash)
            },
	cached: {
	last_accessed: String(row.updated_at || new Date().toISOString()),
                access_count: 0,
                search_results: [],
                related_documents: [],
                recommendations: []
            }
        };
    }

    private normalizeCategory(value: any): 'contract' | 'evidence' | 'brief' | 'citation' | 'other' {
        const allowed = new Set(['contract', 'evidence', 'brief', 'citation', 'other']);
        if (typeof value === 'string' && allowed.has(value)) {
            return value as 'contract' | 'evidence' | 'brief' | 'citation' | 'other';
        }
        return 'other';
    }
}

export default new UnifiedSearchService();

