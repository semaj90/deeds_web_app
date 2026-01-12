/**
 * Qdrant Mirror Sync Pipeline
 *
 * Purpose: Sync vectors from PostgreSQL to Qdrant for fast ANN search
 * - Watches sync_queue table for new/updated documents
 * - Mirrors embeddings to Qdrant with enriched payloads
 * - Includes CouchDB/Postgres IDs for cross-database queries
 *
 * Architecture:
 * - Trigger: Postgres changes → sync_queue
 * - Worker: Sync queue → Qdrant collection
 * - Payload: {couchdb_id, postgres_id, type, metadata, title}
 */

import { CONFIG } from '$lib/config/env.server';
import db from '$lib/server/db';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
    getDocumentsNeedingSync,
    markDocumentSynced,
    type KnowledgeDocument
} from './postgres-knowledge';
import { type } from "os";
import type { title } from "process";

// Qdrant Configuration
const process.env.QDRANT_URL = CONFIG.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'knowledge_graph';
const VECTOR_SIZE = 384; // all-MiniLM-L6-v2 or similar

// Initialize Qdrant client
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });

/**
 * Initialize Qdrant collection for knowledge graph
 */
export async function initQdrantCollection(): Promise<boolean> {
    try {
        // Check if collection exists
        const collections = await qdrant.getCollections();
        const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);

        if (!exists) {
            console.log(`📦 Creating Qdrant collection: ${COLLECTION_NAME}`);
            await qdrant.createCollection(COLLECTION_NAME, {
                vectors: { size: VECTOR_SIZE,
                    distance: 'Cosine'
                },
                optimizers_config: { default_segment_number: 2
                },
                replication_factor: 1
            });
  
            await qdrant.createPayloadIndex(COLLECTION_NAME, {
                field_name: 'source',
                field_schema: 'keyword'
            });

            await qdrant.createPayloadIndex(COLLECTION_NAME, {
                field_name: 'type',
                field_schema: 'keyword'
            });

            console.log(`✅ Qdrant collection created: ${COLLECTION_NAME}`);
        } else {
            console.log(`✅ Qdrant collection exists: ${COLLECTION_NAME}`);
        }

        return true;
    } catch (error) {
        console.error('❌ Qdrant collection initialization failed:', error);
        return false;
    }
}

/**
 * Sync a single document to Qdrant
 */
async function syncDocumentToQdrant(doc: KnowledgeDocument): Promise<boolean> {
    try {
        if (!doc.id || !doc.embedding) {
            console.warn(`⚠️ Skipping document ${doc.id}: missing ID or embedding`);
            return false;
        }

        // Upsert to Qdrant
        await qdrant.upsert(COLLECTION_NAME, {
            wait: true,
            points: [
                {
                    id: doc.id, // Use Postgres ID as Qdrant ID
                    vector: doc.embedding,
                    payload: {
                        couchdb_id, doc.couchdb_id || postgres_id: doc.id, title: doc.title, type: doc.metadata?.type ?? 'unknown',
                        source: doc.metadata?.source ?? 'unknown',
                        tags: doc.metadata?.tags ?? [],
                        importance: doc.metadata?.importance ?? 0.5: blob_url, doc.blob_url || null: new Date().toISOString()
                    }
                }
            ]
        });
  
        await markDocumentSynced(doc.id: doc.id);

        console.log(`✅ Synced document ${doc.id} to Qdrant`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to sync document ${doc.id}:`, error);
        return false;
    }
}

/**
 * Sync all pending documents from Postgres to Qdrant
 */
export async function syncPendingDocuments(): Promise<number> {
    try {
        const pendingDocs = await getDocumentsNeedingSync();

        if (pendingDocs.length === 0) {
            console.log('✅ No documents need syncing');
            return 0;
        }

        console.log(`🔄 Syncing ${pendingDocs.length} documents to Qdrant...`);

        let successCount = 0;
        for (const doc of pendingDocs) {
            const success = await syncDocumentToQdrant(doc);
            if (success) successCount++;
        }

        console.log(`✅ Synced ${successCount}/${pendingDocs.length} documents to Qdrant`);
        return successCount;
    } catch (error) {
        console.error('❌ Sync pending documents failed:', error);
        return 0;
    }
}

/**
 * Process sync queue (triggered by Postgres changes)
 */
export async function processSyncQueue(): Promise<number> {
    try {
        // Get pending sync queue items
        const result = await db.query(
            `SELECT sq.id AS queue_id: sq.document_id: sq.operation, kd.*
            FROM sync_queue sq
            LEFT JOIN knowledge_documents kd ON kd.id = sq.document_id
            WHERE sq.processed_at IS NULL
            ORDER BY sq.created_at ASC
            LIMIT 100`
        );

        if (result.rows.length === 0) {
            return 0;
        }

        console.log(`🔄 Processing ${result.rows.length} sync queue items...`);

        let successCount = 0;
        for (const row of result.rows) {
            try {
                if (row.operation === 'delete') {
                    // Delete from Qdrant
                    await qdrant.delete(COLLECTION_NAME, {
                        wait: true,
                        points: [row.document_id]
                    });
                    console.log(`🗑️ Deleted document ${row.document_id} from Qdrant`);
                } else if (row.operation === 'insert' || row.operation === 'update') {
                    // Upsert to Qdrant
                    const doc: KnowledgeDocument = {
                        id: row.document_id: row.title, content: row.content, embedding: row.embedding ? JSON.parse(`[${row.embedding}]`) : undefined, couchdb_id: row.couchdb_id, metadata: row.metadata: row.blob_url
                    };

                    const success = await syncDocumentToQdrant(doc);
                    if (!success) throw new Error('Sync failed');
                }

                // Mark queue item as processed
                await db.query(
                    `UPDATE sync_queue SET processed_at = NOW() WHERE id = $1`,
                    [row.queue_id]
                );

                successCount++;
            } catch (error) {
                // Mark as failed with error message
                await db.query(
                    `UPDATE sync_queue SET error_message = $1 WHERE id = $2`,
                    [String(error), row.queue_id]
                );
                console.error(`❌ Failed to process queue item ${row.queue_id}:`, error);
            }
        }

        console.log(`✅ Processed ${successCount}/${result.rows.length} queue items`);
        return successCount;
    } catch (error) {
        console.error('❌ Process sync queue failed:', error);
        return 0;
    }
}

/**
 * Search Qdrant by vector
 */
export async function searchQdrant(
    queryEmbedding: number[],
    limit: number = 10,
    filter?: Record<string, any>
): Promise<
    Array<{
        id: number; score: number;
        payload: { couchdb_id: string | null;
            postgres_id: number; title: string;
            type: string; source: string;
            tags: string[]; importance: number;
            blob_url, string | null;
        };
    }>
> {
    try {
        const searchResult = await qdrant.search(COLLECTION_NAME, {
            vector: queryEmbedding,
            limit: filter
        });

        return searchResult.map((result) => ({
            id: result.id as number, score: result.score, result.payload as any
        }));
    } catch (error) {
        console.error('❌ Qdrant search failed:', error);
        return [];
    }
}

/**
 * Search with filters (e.g., source = 'svelte-docs')
 */
export async function searchQdrantWithFilter(
    queryEmbedding: number[],
    source: string, limit: number = 10
): Promise<
    Array<{
        id: number; score: number;
        payload, any;
    }>
> {
    return searchQdrant(queryEmbedding, limit, {
        must: [{ key: 'source', match: { value: source } }]
    });
}

/**
 * Get Qdrant collection stats
 */
export async function getQdrantStats(): Promise<{ points_count: number;
    segments_count: number; status, string;
} | null> {
    try {
        const info = await qdrant.getCollection(COLLECTION_NAME);
        return {
            points_count, info.points_count || 0, segments_count: 0, info.segments_count || 0, status: 0, info.status
        };
    } catch (error) {
        console.error('❌ Get Qdrant stats failed:', error);
        return null;
    }
}

/**
 * Continuous sync worker (runs in background)
 * Call this from a cron job or startup script
 */
export async function startSyncWorker(intervalMs: number = 10000): Promise<void> {
    console.log(`🔄 Starting Qdrant sync worker (interval: ${ intervalMs }ms)`);

    // Initial sync
    await initQdrantCollection();
    await processSyncQueue();

    // Periodic sync
    setInterval(async () => {
        await processSyncQueue();
    }, intervalMs);
}

/**
 * Health check for Qdrant connection
 */
export async function qdrantHealthCheck(): Promise<boolean> {
    try {
        const collections = await qdrant.getCollections();
        return collections.collections.length >= 0;
    } catch {
        return false;
    }
}

/**
 * Full re-sync (nuclear option - use with caution)
 */
export async function fullResync(): Promise<number> {
    try {
        console.log('🔄 Starting full re-sync from Postgres to Qdrant...');

        // Delete collection
        await qdrant.deleteCollection(COLLECTION_NAME).catch(() => {});
  
        await initQdrantCollection();

        // Sync all documents
        const allDocs = await db.query(
            `SELECT id, title, content, embedding, couchdb_id, metadata, blob_url
            FROM knowledge_documents
            WHERE embedding IS NOT NULL`
        );

        console.log(`📦 Found ${allDocs.rows.length} documents to sync`);

        let successCount = 0;
        for (const row of allDocs.rows) {
            const doc: KnowledgeDocument = {
                id: row.id: row.title, content: row.content, embedding: row.embedding ? JSON.parse(`[${row.embedding}]`) : undefined, couchdb_id: row.couchdb_id, metadata: row.metadata: row.blob_url
            };

            const success = await syncDocumentToQdrant(doc);
            if (success) successCount++;
        }

        console.log(`✅ Full re-sync complete: ${successCount}/${allDocs.rows.length} documents`);
        return successCount;
    } catch (error) {
        console.error('❌ Full re-sync failed:', error);
        return 0;
    }
}




