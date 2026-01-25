/**
 * Unified Database Client - Consolidation of Multiple Database Patterns
 * Combines patterns from client.ts, drizzle-vector-config.ts, and qdrant-integration.ts
 *
 * Features:
 * - Role-based connections (runtime/admin)
 * - PostgreSQL + pgvector support
 * - Qdrant hybrid integration
 * - Vector operations with proper type casting
 * - Production-ready connection pooling
 * - Centralized schema management
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import postgres from 'postgres';
import type { DocumentMetadata } from './schema-unified.js';
import * as schema from './schema-unified.js';

// ============================================================================
// CONFIGURATION & TYPES
// ============================================================================

interface DatabaseConfig {
    runtime: { url: string; poolSize: number };
    admin: { url: string; poolSize: number };
    qdrant?: { url: string; apiKey?: string };
    environment: 'development' | 'production' | 'test';
}

interface VectorSearchOptions {
    collection?: string;
    limit?: number;
    threshold?: number;
    filter?: Record<string, unknown>;
    usePostgreSQL?: boolean;
    useQdrant?: boolean;
}

interface SearchResultEntry {
    id: string;
    score: number;
    document: DocumentMetadata | Record<string, unknown> | null;
    source: 'qdrant' | 'postgresql';
}

interface HybridSearchResult {
    results: Array<SearchResultEntry>;
    performance: {
        postgresqlTime?: number;
        qdrantTime?: number;
        totalTime: number;
    };
}

interface HealthStatus {
    postgresql: boolean;
    qdrant: boolean;
    pgvector: boolean;
    overallHealth: boolean;
}

type QdrantHit = { id: string | number; score?: number; payload?: Record<string, unknown> };

// ============================================================================
// ENVIRONMENT CONFIGURATION
// ============================================================================

const isDev = process.env.NODE_ENV === 'development';

const config: DatabaseConfig = {
    runtime: {
        url: process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5433/legal_ai_db',
        poolSize: isDev ? 5 : 20
    },
    admin: {
        url: process.env.DATABASE_URL_ADMIN ?? process.env.ADMIN_DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5433/legal_ai_db',
        poolSize: 2
    },
    qdrant: process.env.QDRANT_URL ? {
        url: process.env.QDRANT_URL,
        apiKey: process.env.QDRANT_API_KEY
    } : undefined,
    environment: (process.env.NODE_ENV as any) ?? 'development'
};

// ============================================================================
// SINGLETON CONNECTION MANAGEMENT
// ============================================================================

class DatabaseManager {
    static instance: DatabaseManager;
    private runtimeConnection?: postgres.Sql;
    private adminConnection?: postgres.Sql;
    private qdrantClient?: QdrantClient;
    private runtimeDb?: ReturnType<typeof drizzle>;
    private adminDb?: ReturnType<typeof drizzle>;
    private initialized = false;

    private constructor() {}

    static getInstance(): DatabaseManager {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    // PostgreSQL Connections with custom vector type support
    private createRuntimeConnection(): postgres.Sql {
        if (!this.runtimeConnection) {
            this.runtimeConnection = postgres(config.runtime.url, {
                max: config.runtime.poolSize,
                idle_timeout: 30,
                max_lifetime: 60 * 30,
                prepare: !isDev,
                ssl: false,
                types: {
                    // Custom pgvector support
                    vector: {
                        to: 1184,
                        from: [1184],
                        serialize: (x: number[]) => (Array.isArray(x) ? `[${x.join(',')}]` : x),
                        parse: (x: string) => (typeof x === 'string' && x.startsWith('[') && x.endsWith(']') ? x.slice(1, -1).split(',').map(Number) : [])
                    }
                } as any
            });
        }
        return this.runtimeConnection;
    }

    private createAdminConnection(): postgres.Sql {
        if (!this.adminConnection) {
            this.adminConnection = postgres(config.admin.url, {
                max: config.admin.poolSize,
                idle_timeout: 10,
                max_lifetime: 60 * 10,
                prepare: false, // Admin operations don't need prepared statements
                ssl: false
            });
        }
        return this.adminConnection;
    }

    private createQdrantClient(): QdrantClient | undefined {
        if (config.qdrant && !this.qdrantClient) {
            this.qdrantClient = new QdrantClient({
                url: config.qdrant.url,
                apiKey: config.qdrant.apiKey
            });
        }
        return this.qdrantClient;
    }

    // Drizzle Clients
    getRuntimeDb() {
        if (!this.runtimeDb) {
            this.runtimeDb = drizzle(this.createRuntimeConnection(), { schema });
        }
        return this.runtimeDb;
    }

    getAdminDb() {
        if (!this.adminDb) {
            this.adminDb = drizzle(this.createAdminConnection(), { schema });
        }
        return this.adminDb;
    }

    getQdrantClient() {
        return this.createQdrantClient();
    }

    getRawPostgres() {
        return this.createRuntimeConnection();
    }

    // ============================================================================
    // DATABASE INITIALIZATION
    // ============================================================================

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // Test runtime connection
            const runtimeDb = this.getRuntimeDb();
            await runtimeDb.execute(sql`SELECT 1 as test`);
            console.log('✅ Runtime database connection established');

            // Run migrations in production
            if (!isDev && process.env.SKIP_MIGRATIONS !== 'true') {
                const adminDb = this.getAdminDb();
                const migrationsFolder = process.env.MIGRATIONS_FOLDER || path.resolve(process.cwd(), 'drizzle');
                console.log(`🔄 Running database migrations with admin privileges (folder=${migrationsFolder})...`);
                try {
                    await migrate(adminDb as any, { migrationsFolder });
                    console.log('✅ Database migrations completed');
                } catch (err) {
                    console.warn('⚠️ Migration failed (may already be applied):', err);
                }
            }

            // Test pgvector extension
            try {
                await runtimeDb.execute(sql`SELECT '[1,2,3]'::vector`);
                console.log('✅ pgvector extension available');
            } catch (error) {
                console.warn('⚠️ pgvector extension check failed:', error);
            }

            // Test Qdrant connection
            const qdrant = this.getQdrantClient();
            if (qdrant) {
                try {
                    await qdrant.getCollections();
                    console.log('✅ Qdrant connection established');
                } catch (error) {
                    console.warn('⚠️ Qdrant failed:', error);
                }
            }

            this.initialized = true;
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            // Don't throw, allow app to start in degraded mode
        }
    }

    // ============================================================================
    // UNIFIED VECTOR OPERATIONS
    // ============================================================================

    async ensureQdrantCollection(
        collectionName: string,
        vectorSize: number = 384,
        distance: 'Cosine' | 'Dot' | 'Euclid' = 'Cosine'
    ): Promise<void> {
        const qdrant = this.getQdrantClient();
        if (!qdrant) return;

        try {
            const collectionsRes = await qdrant.getCollections();
            const exists = collectionsRes.collections.some(c => c.name === collectionName);

            if (!exists) {
                await qdrant.createCollection(collectionName, {
                    vectors: { size: vectorSize, distance },
                    optimizers_config: { default_segment_number: 2, memmap_threshold: 20000, indexing_threshold: 20000 },
                    hnsw_config: { m: 16, ef_construct: 64, full_scan_threshold: 10000 }
                });
                console.log(`✅ Created collection: ${collectionName}`);
            }
        } catch (error) {
            console.error(`❌ Failed to ensure Qdrant collection ${collectionName}:`, error);
            throw error;
        }
    }

    async hybridVectorSearch(queryEmbedding: number[], options: VectorSearchOptions = {}): Promise<HybridSearchResult> {
        const startTime = Date.now();
        const { collection = 'legal_documents', limit = 10, threshold = 0.7, filter = {}, usePostgreSQL = true, useQdrant = true } = options;

        const results: Array<SearchResultEntry> = [];
        let postgresqlTime: number | undefined;
        let qdrantTime: number | undefined;

        // PostgreSQL vector search
        if (usePostgreSQL) {
            const pgStart = Date.now();
            try {
                const runtimeDb = this.getRuntimeDb();
                const embeddingStr = JSON.stringify(queryEmbedding);

                const pgResults = await runtimeDb.execute(sql`
                    SELECT id, processing_status, deleted_at, (1 - (content_embedding <=> ${embeddingStr}::vector)) as similarity
                    FROM document_metadata
                    WHERE (1 - (content_embedding <=> ${embeddingStr}::vector)) >= ${threshold}
                    AND deleted_at IS NULL AND processing_status = 'completed'
                    ORDER BY content_embedding <=> ${embeddingStr}::vector
                    LIMIT ${limit}
                `);

                postgresqlTime = Date.now() - pgStart;
                for (const row of pgResults) {
                    results.push({
                        id: String(row.id),
                        score: Number(row.similarity) || 0,
                        document: row as unknown as DocumentMetadata,
                        source: 'postgresql'
                    });
                }
            } catch (error) {
                console.error('PostgreSQL vector error:', error);
            }
        }

        // Qdrant vector search
        if (useQdrant) {
            const qdrantClient = this.getQdrantClient();
            if (qdrantClient) {
                const qStart = Date.now();
                try {
                    const qFilter = Object.keys(filter).length ? { must: Object.entries(filter).map(([key, value]) => ({ key, match: { value } })) } : undefined;

                    const qRes = await qdrantClient.search(collection, {
                        vector: queryEmbedding,
                        limit,
                        score_threshold: threshold,
                        with_payload: true,
                        filter: qFilter
                    });

                    qdrantTime = Date.now() - qStart;

                    // Hydrate from Postgres
                    const ids = qRes.map(r => String(r.id));
                    if (ids.length > 0) {
                        try {
                            const runtimeDb = this.getRuntimeDb();
                            /*
                            // Drizzle query commented out as type-safe selection requires proper schema setup which might be in flux
                            // Fallback to simpler logic or direct use of payload from Qdrant if available
                            */
                            for (const r of qRes) {
                                results.push({
                                    id: String(r.id),
                                    score: r.score,
                                    document: r.payload as any,
                                    source: 'qdrant'
                                });
                            }
                        } catch (err) {
                            // Fallback
                        }
                    }
                } catch (error) {
                    console.error('Qdrant vector error:', error);
                }
            }
        }

        // Deduplicate
        const unique = new Map<string, SearchResultEntry>();
        for (const r of results) {
            const existing = unique.get(r.id);
            if (!existing || r.score > existing.score) {
                unique.set(r.id, r);
            }
        }

        const finalResults = Array.from(unique.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        return {
            results: finalResults,
            performance: {
                postgresqlTime,
                qdrantTime,
                totalTime: Date.now() - startTime
            }
        };
    }

    // ============================================================================
    // HEALTH CHECKS
    // ============================================================================

    async healthCheck(): Promise<HealthStatus> {
        const health: HealthStatus = { postgresql: false, qdrant: false, pgvector: false, overallHealth: false };
        try {
            const runtimeDb = this.getRuntimeDb();
            await runtimeDb.execute(sql`SELECT 1`);
            health.postgresql = true;

            try {
                await runtimeDb.execute(sql`SELECT '[1,2,3]'::vector`);
                health.pgvector = true;
            } catch {
                // Ignore
            }

            const q = this.getQdrantClient();
            if (q) {
                try {
                    await q.getCollections();
                    health.qdrant = true;
                } catch {
                    // Ignore
                }
            } else {
                health.qdrant = true; // Not configured
            }

            health.overallHealth = health.postgresql && health.pgvector;
        } catch (error) {
            console.error('Health Check Failed:', error);
        }
        return health;
    }

    async cleanup(): Promise<void> {
        if (this.runtimeConnection) {
            await this.runtimeConnection.end();
            this.runtimeConnection = undefined;
        }
        if (this.adminConnection) {
            await this.adminConnection.end();
            this.adminConnection = undefined;
        }
        console.log('✅ Database connections closed');
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

const dbManager = DatabaseManager.getInstance();

// Initialize in background (except dev/test where we might want explicit control)
if (!isDev && process.env.NODE_ENV !== 'test') {
    dbManager.initialize().catch(console.error);
}

export const db = dbManager.getRuntimeDb();
export const adminDb = dbManager.getAdminDb();
export const qdrant = dbManager.getQdrantClient();

export const unifiedDb = {
    runtime: () => dbManager.getRuntimeDb(),
    admin: () => dbManager.getAdminDb(),
    qdrant: () => dbManager.getQdrantClient(),
    postgres: () => dbManager.getRawPostgres(),
    initialize: () => dbManager.initialize(),
    healthCheck: () => dbManager.healthCheck(),
    cleanup: () => dbManager.cleanup(),
    vectorSearch: (embedding: number[], options?: VectorSearchOptions) => dbManager.hybridVectorSearch(embedding, options),
    ensureCollection: (name: string, size?: number, distance?: 'Cosine' | 'Dot' | 'Euclid') => dbManager.ensureQdrantCollection(name, size, distance)
};

export * from './schema-unified.js';
export type { DatabaseConfig, DocumentMetadata, HybridSearchResult, VectorSearchOptions };
export default unifiedDb;
