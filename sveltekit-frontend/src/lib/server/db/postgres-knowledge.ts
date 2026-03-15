/**
 * PostgreSQL + pgvector Integration
 *
 * Purpose: Source of Truth for Knowledge Graph
 * - Write-first layer (all data lands here first)
 * - pgvector for embeddings alongside relational data
 * - Auto-syncs to Qdrant via trigger-based queue
 *
 * Integration:
 * - Write: Insert/Update here → Auto-queues sync to Qdrant
 * - Read: Qdrant (fast search) → Fetch metadata from Postgres
 */

import { db } from '$lib/server/db/index-clean.js'; // Assuming this is where db export is
import { sql } from 'drizzle-orm';

export interface KnowledgeDocument {
	id?: number;
	title: string;
	content: string;
	source_url?: string;
	embedding?: number[]; // 384-dimensional vector
	couchdb_id?: string;
	qdrant_id?: number;
	metadata?: {
	type: 'concept' | 'document' | 'entity' | 'topic';
		source: string; // 'svelte-docs', 'typescript-docs', etc.
		tags?: string[];
		importance?: number; // 0-1 score
		language?: string;
	};
	blob_url?: string;
	blob_metadata?: {
	size: number;
		mime_type: string;
	uploaded_at: string;
	};
	created_at?: Date;
	updated_at?: Date;
	last_synced_to_qdrant?: Date;
}

/**
 * Insert knowledge document (auto-queues sync to Qdrant)
 */
export async function insertKnowledgeDocument(
	doc: Omit<KnowledgeDocument, 'id' | 'created_at' | 'updated_at'>
): Promise<number | null> {
	try {
        // Drizzle ORM raw query for vector support if schema not fully typed with vector
        const result = await db.execute(sql`
            INSERT INTO knowledge_documents (
                title, content, source_url, embedding, couchdb_id, qdrant_id, metadata, blob_url, blob_metadata
            ) VALUES (
                ${doc.title},
	${doc.content},
	${doc.source_url},
	${doc.embedding ? JSON.stringify(doc.embedding) : null /* Or ::vector syntax if raw client */},
	${doc.couchdb_id},
	${doc.qdrant_id},
	${doc.metadata},
	${doc.blob_url},
	${doc.blob_metadata}
            )
            RETURNING id
        `);

        // Drizzle .execute result handling depends on driver.
        // Postgres.js usually behaves like array or row list.
        const insertedId = (result as any)[0]?.id;
		console.log(`✅ Inserted knowledge document (ID: ${insertedId})`);
		return insertedId;
	} catch (error) {
		console.error('❌ Insert knowledge document failed:', error);
		return null;
	}
}

/**
 * Update knowledge document (auto-queues sync to Qdrant if embedding/metadata changed)
 */
export async function updateKnowledgeDocument(
	id: number,
	updates: Partial<KnowledgeDocument>
): Promise<boolean> {
	try {
        // Build query dynamically - simplified via Drizzle or raw SQL construction
        // For robustness using simple raw query construction loop or similar logic as before but cleaner
        // Note: Drizzle update would be cleaner if schema imported.

        // Falling back to a simpler pattern if schema not imported or known.
        // If we use `knowledge_documents` table via generic execute: const, setParts: any[] = [];
        const params: any[] = [];

        if (updates.title !== undefined) { setParts.push(sql`title = ${updates.title}`); }
        if (updates.content !== undefined) { setParts.push(sql`content = ${updates.content}`); }
        if (updates.embedding !== undefined) {
            // Postgres vector typical insert format
            setParts.push(sql`embedding = ${JSON.stringify(updates.embedding)}`);
        }
        if (updates.metadata !== undefined) { setParts.push(sql`metadata = ${updates.metadata}`); }
        if (updates.couchdb_id !== undefined) { setParts.push(sql`couchdb_id = ${updates.couchdb_id}`); }
        if (updates.qdrant_id !== undefined) { setParts.push(sql`qdrant_id = ${updates.qdrant_id}`); }
        if (updates.blob_url !== undefined) { setParts.push(sql`blob_url = ${updates.blob_url}`); }
        if (updates.blob_metadata !== undefined) { setParts.push(sql`blob_metadata = ${updates.blob_metadata}`); }

        if (setParts.length === 0) return false;

        await db.execute(sql`
            UPDATE knowledge_documents
            SET ${sql.join(setParts, sql`, `)}
            WHERE id = ${id}
        `);

		console.log(`✅ Updated knowledge document (ID: ${id})`);
		return true;
	} catch (error) {
		console.error('❌ Update knowledge document failed:', error);
		return false;
	}
}

/**
 * Search by vector similarity (hybrid with full-text)
 */
export async function searchByEmbedding(
	queryEmbedding: number[],
	limit: number = 10,
	similarityThreshold: number = 0.5
): Promise<Array<KnowledgeDocument & { similarity: number }>> {
	try {
        const result = await db.execute(sql`
            SELECT
                id, title, content, couchdb_id, metadata, blob_url,
                1 - (embedding <=> ${JSON.stringify(queryEmbedding)}) AS similarity
            FROM knowledge_documents
            WHERE embedding IS NOT NULL
              AND 1 - (embedding <=> ${JSON.stringify(queryEmbedding)}) > ${similarityThreshold}
            ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}
            LIMIT ${limit}
        `);

		return (result as any[]).map((row) => ({
			id: row.id,
			title: row.title,
			content: row.content,
			couchdb_id: row.couchdb_id,
			metadata: row.metadata,
			blob_url: row.blob_url,
			similarity: parseFloat(row.similarity)
		}));
	} catch (error) {
		console.error('❌ Search by embedding failed:', error);
		return [];
	}
}

/**
 * Search by full-text (PostgreSQL tsvector)
 */
export async function searchByText(
	queryText: string,
	limit: number = 10
): Promise<Array<KnowledgeDocument & { rank: number }>> {
	try {
        const result = await db.execute(sql`
            SELECT
                id, title, content, couchdb_id, metadata, blob_url,
                ts_rank(content_tsvector, websearch_to_tsquery('english', ${queryText})) AS rank
            FROM knowledge_documents
            WHERE content_tsvector @@ websearch_to_tsquery('english', ${queryText})
            ORDER BY rank DESC
            LIMIT ${limit}
        `);

		return (result as any[]).map((row) => ({
			id: row.id,
			title: row.title,
			content: row.content,
			couchdb_id: row.couchdb_id,
			metadata: row.metadata,
			blob_url: row.blob_url,
			rank: parseFloat(row.rank)
		}));
	} catch (error) {
		console.error('❌ Search by text failed:', error);
		return [];
	}
}

/**
 * Get documents needing sync to Qdrant
 */
export async function getDocumentsNeedingSync(): Promise<KnowledgeDocument[]> {
	try {
        const result = await db.execute(sql`
            SELECT id, title, embedding, couchdb_id, metadata
            FROM knowledge_documents
            WHERE last_synced_to_qdrant IS NULL
               OR updated_at > last_synced_to_qdrant
            ORDER BY updated_at DESC
        `);

		return (result as any[]).map((row) => ({
			id: row.id,
			title: row.title,
			content: '', // Not needed for sync
			// Embedding parsing from postgres vector string if needed
            // pg-vector often returns string "[1,2,3]"
			embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
			couchdb_id: row.couchdb_id,
			metadata: row.metadata
		}));
	} catch (error) {
		console.error('❌ Get documents needing sync failed:', error);
		return [];
	}
}

/**
 * Mark document as synced to Qdrant
 */
export async function markDocumentSynced(id: number, qdrantId: number): Promise<boolean> {
	try {
        await db.execute(sql`
            UPDATE knowledge_documents
            SET qdrant_id = ${qdrantId},
	last_synced_to_qdrant = NOW()
            WHERE id = ${id}
        `);

		console.log(`✅ Marked document ${id} as synced (Qdrant ID: ${qdrantId})`);
		return true;
	} catch (error) {
		console.error('❌ Mark document synced failed:', error);
		return false;
	}
}

/**
 * Bulk insert knowledge documents (for initial Svelte docs sync)
 */
export async function bulkInsertKnowledgeDocuments(
	docs: Array<Omit<KnowledgeDocument, 'id' | 'created_at' | 'updated_at'>>
): Promise<number[]> {
	const insertedIds: number[] = [];

	try {
		for (const doc of docs) {
			const id = await insertKnowledgeDocument(doc);
			if (id) insertedIds.push(id);
		}

		console.log(`✅ Bulk inserted ${insertedIds.length}/${docs.length} documents`);
		return insertedIds;
	} catch (error) {
		console.error('❌ Bulk insert failed:', error);
		return insertedIds;
	}
}

/**
 * Create relationship between two documents
 */
export async function createRelationship(
	fromId: number,
	toId: number,
	relationshipType: string,
	weight: number = 0.5,
	bidirectional: boolean = false
): Promise<boolean> {
	try {
        await db.execute(sql`
            INSERT INTO knowledge_relationships (from_id, to_id, relationship_type, weight, bidirectional)
            VALUES (${fromId},
	${toId},
	${relationshipType},
	${weight},
	${bidirectional})
            ON CONFLICT (from_id, to_id, relationship_type) DO UPDATE
            SET weight = ${weight},
	bidirectional = ${bidirectional}
        `);

		console.log(`✅ Created relationship: ${fromId} --[${relationshipType}]--> ${toId}`);
		return true;
	} catch (error) {
		console.error('❌ Create relationship failed:', error);
		return false;
	}
}

/**
 * Get related documents
 */
export async function getRelatedDocuments(
	documentId: number,
	relationshipType?: string
): Promise<KnowledgeDocument[]> {
	try {
		const query = relationshipType
			? sql`
               SELECT kd.*
               FROM knowledge_documents kd
               JOIN knowledge_relationships kr ON kr.to_id = kd.id
               WHERE kr.from_id = ${documentId} AND kr.relationship_type = ${relationshipType}
               ORDER BY kr.weight DESC`
			: sql`
               SELECT kd.*
               FROM knowledge_documents kd
               JOIN knowledge_relationships kr ON kr.to_id = kd.id
               WHERE kr.from_id = ${documentId}
               ORDER BY kr.weight DESC`;

		const result = await db.execute(query);
		return result as any[] as KnowledgeDocument[];
	} catch (error) {
		console.error('❌ Get related documents failed:', error);
		return [];
	}
}

/**
 * Health check for PostgreSQL + pgvector
 */
export async function postgresHealthCheck(): Promise<boolean> {
	try {
        const result = await db.execute(sql`SELECT 1 AS health`);
		return (result as any)[0]?.health === 1;
	} catch {
		return false;
	}
}

