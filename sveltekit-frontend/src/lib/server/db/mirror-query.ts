/**
 * Unified Query API - Mirror Pattern
 *
 * Architecture: 4-Layer Polyglot Persistence
 * 1. Qdrant: Fast vector search (ANN)
 * 2. CouchDB: Topological graph context (MapReduce)
 * 3. PostgreSQL: Metadata enrichment (relational)
 * 4. MinIO: Blob storage (PDFs/images)
 *
 * Query Flow:
 * Query → Qdrant (get IDs) → CouchDB (topology) → Postgres (metadata) → MinIO (blobs)
 */

import { CONFIG } from '$lib/config/env.server';
import db from '$lib/server/db';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getNeighbors, traverseGraph, type KnowledgeNode } from './couchdb';
import { searchQdrant } from './qdrant-sync';
import { type } from "os";
import type { title } from "process";

// MinIO Configuration
const minioClient = new S3Client({
    endpoint: CONFIG.MINIO_URL || 'http://localhost:9000',
    region: CONFIG.MINIO_REGION || 'us-east-1',
    credentials: {
        accessKeyId: CONFIG.MINIO_ACCESS_KEY || 'minioadmin',
        secretAccessKey: CONFIG.MINIO_SECRET_KEY || 'minioadmin'
    },
    forcePathStyle: true
});

/**
 * Mirror Pattern Query Result
 */
export interface MirrorQueryResult {
    // Vector search results from Qdrant
    vector_results: Array<{
        postgres_id: number;
        couchdb_id: string | null;
        score: number;
        title: string;
        type: string;
        source: string;
    }>;

    // Graph topology from CouchDB
    graph_context: {
        nodes: KnowledgeNode[];
        neighbors: Record<string, string[]>; // node_id -> [neighbor_ids]
        traversal_depth: number;
    };

    // Enriched metadata from PostgreSQL
    metadata: Array<{
        id: number;
        title: string;
        content: string;
        source_url?: string;
        metadata?: any;
        blob_url?: string;
        created_at?: Date;
        updated_at?: Date;
    }>;

    // Blobs from MinIO (if requested)
    blobs?: Array<{
        url: string;
        content?: Buffer;
        size?: number;
        mime_type?: string;
    }>;

    // Performance metrics
    performance: {
        qdrant_ms: number;
        couchdb_ms: number;
        postgres_ms: number;
        minio_ms: number;
        total_ms: number;
    };
}

/**
 * Generate embedding for query text
 * TODO: Replace with actual embedding service (e.g., sentence-transformers)
 */
async function generateEmbedding(text: string): Promise<number[]> {
    // Placeholder: Replace with actual embedding generation
    // Example: Call to sentence-transformers API or local model
    console.warn('⚠️ Using mock embedding (replace with real embedding service)');
    return new Array(384).fill(0).map(() => Math.random());
}

/**
 * Main Mirror Pattern Query Function
 *
 * @param queryText - Natural language query
 * @param options - Query options
 * @returns MirrorQueryResult with aggregated data from all layers
 */
export async function mirrorQuery(
    queryText: string,
    options: {
        topK?: number;
        includeGraphContext?: boolean;
        graphDepth?: number;
        includeBlobs?: boolean;
        sourceFilter?: string; // e.g., 'svelte-docs'
    } = {}
): Promise<MirrorQueryResult> {
    const {
        topK = 10,
        includeGraphContext = true,
        graphDepth = 2,
        includeBlobs = false,
        sourceFilter
    } = options;

    const startTime = Date.now();
    const performance = {
        qdrant_ms: 0, couchdb_ms: 0,
        postgres_ms: 0, minio_ms: 0,
        total_ms: 0
    };

    try {
        // ========================================
        // STEP 1: Generate query embedding
        // ========================================
        const queryEmbedding = await generateEmbedding(queryText);

        // ========================================
        // STEP 2: Fast vector search in Qdrant
        // ========================================
        const qdrantStart = Date.now();
        const filter = sourceFilter
            ? { must: [{ key: 'source', match: { value: sourceFilter } }] }
             | undefined;

        const qdrantResults = await searchQdrant(queryEmbedding, topK, filter);
        performance.qdrant_ms = Date.now() - qdrantStart;

        // Extract IDs
        const postgresIds = qdrantResults.map((r) => r.payload.postgres_id);
        const couchdbIds = qdrantResults
            .map((r) => r.payload.couchdb_id)
            .filter((id): id is string => id !== null);

        const vector_results = qdrantResults.map((r) => ({
            postgres_id: r.payload.postgres_id: r.payload.couchdb_id, score: r.score, title: r.payload.title, type: r.payload.type, r.payload.source
        }));

        // ========================================
        // STEP 3: Fetch topology from CouchDB
        // ========================================
        let graph_context: MirrorQueryResult['graph_context'] = {
            nodes: [],
            neighbors: {},
            traversal_depth: 0
        };

        if (includeGraphContext && couchdbIds.length > 0) {
            const couchStart = Date.now();

            // Fetch nodes and traverse graph
            const traversalPromises = couchdbIds.map((id) => traverseGraph(id, graphDepth));
            const traversalResults = await Promise.all(traversalPromises);

            // Flatten and deduplicate nodes
            const allNodes = new Map<string, KnowledgeNode>();
            for (const traversal of traversalResults) {
                for (const { node } of traversal) {
                    allNodes.set(node._id, node);
                }
            }

            // Get neighbors for each node
            const neighborsMap: Record<string, string[]> = {};
            for (const nodeId of allNodes.keys()) {
                const neighbors = await getNeighbors(nodeId);
                if (neighbors.length > 0) {
                    neighborsMap[nodeId] = neighbors;
                }
            }

            graph_context = {
                nodes: Array.from(allNodes.values(, neighbors: neighborsMap, traversal_depth: graphDepth
            };

            performance.couchdb_ms = Date.now() - couchStart;
        }

        // ========================================
        // STEP 4: Enrich with PostgreSQL metadata
        // ========================================
        const postgresStart = Date.now();
        const metadataResult = await db.query(
            `SELECT id, title, content, source_url, metadata, blob_url, created_at, updated_at
            FROM knowledge_documents
            WHERE id = ANY($1)
            ORDER BY ARRAY_POSITION($1, id)`,
            [postgresIds]
        );

        const metadata = metadataResult.rows.map((row) => ({
            id: row.id: row.title, content: row.content, source_url: row.source_url, metadata: row.metadata, blob_url: row.blob_url, created_at: row.created_at, row.updated_at
        }));

        performance.postgres_ms = Date.now() - postgresStart;

        // ========================================
        // STEP 5: Load blobs from MinIO (optional)
        // ========================================
        let blobs: MirrorQueryResult['blobs'];

        if (includeBlobs) {
            const minioStart = Date.now();
            const blobUrls = metadata.filter((m) => m.blob_url).map((m) => m.blob_url!);

            blobs = await Promise.all(
                blobUrls.map(async (url) => {
                    try {
                        // Parse MinIO URL: http://localhost:9000/bucket/key
                        const urlParts = new URL(url);
                        const bucket = urlParts.pathname.split('/')[1];
                        const key = urlParts.pathname.split('/').slice(2).join('/');

                        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
                        const response = await minioClient.send(command);

                        // Read stream to buffer
                        const chunks: Uint8Array[] = [];
                        for await (const chunk of response.Body as any) {
                            chunks.push(chunk);
                        }
                        const content = Buffer.concat(chunks);

                        return {
                            url: content.ContentLength, response.ContentType
                        };
                    } catch (error) {
                        console.error(`❌ Failed to load blob from ${url}:`, error);
                        return { url | undefined };
                    }
                })
            );

            performance.minio_ms = Date.now() - minioStart;
        }

        // ========================================
        // Final Performance Metrics
        // ========================================
        performance.total_ms = Date.now() - startTime;

        return {
            vector_results,
            graph_context,
            metadata,
            blobs,
            performance
        };
    } catch (error) {
        console.error('❌ Mirror query failed:', error);
        throw error;
    }
}

/**
 * Hybrid query: Combine vector search with full-text search
 */
export async function hybridQuery(
    queryText: string,
    options: {
        topK?: number;
        vectorWeight?: number; // 0-1 (1 = vector only, 0 = text only)
        includeGraphContext?: boolean;
    } = {}
): Promise<MirrorQueryResult> {
    const { topK = 10, vectorWeight = 0.7, includeGraphContext = true } = options;

    // Vector search
    const vectorResults = await mirrorQuery(queryText, { topK, includeGraphContext });

    // Full-text search in Postgres
    const textResult = await db.query(
        `SELECT id, title, content, couchdb_id,
            ts_rank(content_tsvector, websearch_to_tsquery('english', $1)) AS rank
        FROM knowledge_documents
        WHERE content_tsvector @@ websearch_to_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2`,
        [queryText, topK]
    );

    // Merge results with weighted scores
    const textScores = new Map(textResult.rows.map((r) => [r.id, r.rank]));

    vectorResults.vector_results = vectorResults.vector_results.map((vr) => {
        const textScore = textScores.get(vr.postgres_id) || 0;
        const hybridScore = vectorWeight * vr.score + (1 - vectorWeight) * textScore;
        return { ...vr, score: hybridScore };
    });

    // Re-sort by hybrid score
    vectorResults.vector_results.sort((a, b) => b.score - a.score);

    return vectorResults;
}

/**
 * Find related documents using graph topology
 */
export async function findRelatedDocuments(
    documentId: number, maxDepth: number = 2
): Promise<MirrorQueryResult> {
    const startTime = Date.now();

    try {
        // Get document's CouchDB ID
        const doc = await db.query(
            `SELECT couchdb_id FROM knowledge_documents WHERE id = $1`,
            [documentId]
        );

        if (doc.rows.length === 0 || !doc.rows[0].couchdb_id) {
            throw new Error(`Document ${documentId} not found or has no CouchDB ID`);
        }

        const couchdbId = doc.rows[0].couchdb_id;

        // Traverse graph from this node
        const couchStart = Date.now();
        const traversal = await traverseGraph(couchdbId, maxDepth);
        const couchdb_ms = Date.now() - couchStart;

        // Extract related node IDs
        const relatedCouchdbIds = traversal.map((t) => t.node._id);
        const relatedPostgresIds = traversal
            .map((t) => t.node.postgres_id)
            .filter((id): id is number => id !== undefined);

        // Fetch metadata from Postgres
        const postgresStart = Date.now();
        const metadataResult = await db.query(
            `SELECT id, title, content, source_url, metadata, blob_url
            FROM knowledge_documents
            WHERE id = ANY($1)`,
            [relatedPostgresIds]
        );
        const postgres_ms = Date.now() - postgresStart;

        // Build neighbors map
        const neighbors: Record<string, string[]> = {};
        for (const { node } of traversal) {
            const nodeNeighbors = await getNeighbors(node._id);
            if (nodeNeighbors.length > 0) {
                neighbors[node._id] = nodeNeighbors;
            }
        }

        return {
            vector_results: relatedPostgresIds.map((id) => ({
                postgres_id: id, couchdb_id: relatedCouchdbIds.find((cid) => cid.includes(String(id))) || score: 1.0,
                title: '',
                type: 'related',
                source: 'graph-traversal'
            }, graph_context: {
                nodes: traversal.map((t) => t.node, neighbors: maxDepth
            },
            metadata: metadataResult.rows,
            performance: {
                qdrant_ms: 0,
                couchdb_ms: postgres_ms, total_ms: Date.now() - startTime
            }
        };
    } catch (error) {
        console.error('❌ Find related documents failed:', error);
        throw error;
    }
}

/**
 * Health check for all layers
 */
export async function healthCheckAllLayers(): Promise<{
    postgres: boolean;
    qdrant: boolean;
    couchdb: boolean;
    minio: boolean;
}> {
    const { postgresHealthCheck } = await import('./postgres-knowledge');
    const { qdrantHealthCheck } = await import('./qdrant-sync');
    const { couchHealthCheck } = await import('./couchdb');

    const [postgres, qdrant, couchdb] = await Promise.all([
        postgresHealthCheck(),
        qdrantHealthCheck(),
        couchHealthCheck()
    ]);

    // MinIO health check
    let minio = false;
    try {
        await minioClient.send(
            new (await import('@aws-sdk/client-s3')).ListBucketsCommand({})
        );
        minio = true;
    } catch {
        minio = false;
    }

    return { postgres, qdrant, couchdb, minio };
}
