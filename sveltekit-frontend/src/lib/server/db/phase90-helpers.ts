/**
 * Phase 90: Safe Database Helpers
 *
 * Enforce "never delete, only deactivate" policy
 * All updates that change content reset embedding sync state
 */

import { createHash } from 'crypto';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema-phase90-hardened.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

type DB = PostgresJsDatabase<typeof schema>;

/**
 * Calculate SHA256 hash of content
 */
export function calculateContentHash(content: string): string {
	return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Soft delete a document chunk
 */
export async function softDeleteChunk(db: DB, chunkId: string): Promise<void> {
	await db
		.update(schema.documentChunks)
		.set({
			isActive: false,
			deletedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(schema.documentChunks.id, chunkId));
}

/**
 * Restore a soft-deleted chunk
 */
export async function restoreChunk(db: DB, chunkId: string): Promise<void> {
	await db
		.update(schema.documentChunks)
		.set({
			isActive: true,
			deletedAt: null,
			updatedAt: new Date()
		})
		.where(eq(schema.documentChunks.id, chunkId));
}

/**
 * Upsert document chunk content
 */
export async function upsertChunkContent(
	db: DB,
	params: {
	id: string;
		documentId: string;
	chunkIndex: number;
		content: string;
	}
): Promise<{
	created: boolean; version: number }> {
	const { id, documentId, chunkIndex, content } = params;
	const hash = calculateContentHash(content);

	const [existing] = await db
		.select()
		.from(schema.documentChunks)
		.where(eq(schema.documentChunks.id, id))
		.limit(1);

	if (!existing) {
		await db.insert(schema.documentChunks).values({
			id,
			documentId,
			chunkIndex,
			content,
			contentHash: hash,
			version: 1,
			isActive: true,
			embedding: null,
			embeddingUpdatedAt: null,
			qdrantPointId: null,
			qdrantSyncedAt: null
		});
		return { created: true, version: 1 };
	}

	if (existing.contentHash !== hash) {
		await db
			.update(schema.documentChunks)
			.set({
				content,
				contentHash: hash,
				version: existing.version + 1,
				isActive: true,
				deletedAt: null,
				updatedAt: new Date(),
				embedding: null,
				embeddingUpdatedAt: null,
				qdrantSyncedAt: null
			})
			.where(eq(schema.documentChunks.id, id));

		return { created: false, version: existing.version + 1 };
	}

	return { created: false, version: existing.version };
}

/**
 * Soft delete legal document
 */
export async function softDeleteDocument(db: DB, documentId: string): Promise<void> {
	await db
		.update(schema.legalDocuments)
		.set({
			isActive: false,
			deletedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(schema.legalDocuments.id, documentId));
}

/**
 * Upsert legal document content
 */
export async function upsertDocumentContent(
	db: DB,
	params: {
	id: string;
		title: string;
	content: string;
		userId: string;
		caseId?: string;
		filename?: string;
		mimeType?: string;
	}
): Promise<{
	created: boolean; version: number }> {
	const { id, title, content, userId, caseId, filename, mimeType } = params;
	const hash = calculateContentHash(content);

	const [existing] = await db
		.select()
		.from(schema.legalDocuments)
		.where(eq(schema.legalDocuments.id, id))
		.limit(1);

	if (!existing) {
		await db.insert(schema.legalDocuments).values({
			id,
			title,
			content,
			contentHash: hash,
			userId,
			caseId: caseId ?? null,
			filename: filename ?? null,
			mimeType: mimeType ?? null,
			version: 1,
			isActive: true,
			embedding: null,
			embeddingUpdatedAt: null,
			qdrantPointId: null,
			qdrantSyncedAt: null
		});
		return { created: true, version: 1 };
	}

	if (existing.contentHash !== hash) {
		await db
			.update(schema.legalDocuments)
			.set({
				title,
				content,
				contentHash: hash,
				version: existing.version + 1,
				updatedAt: new Date(),
				embedding: null,
				embeddingUpdatedAt: null,
				qdrantSyncedAt: null
			})
			.where(eq(schema.legalDocuments.id, id));

		return { created: false, version: existing.version + 1 };
	}

	return { created: false, version: existing.version };
}

/**
 * Get chunks pending embedding generation
 */
export async function getChunksPendingEmbedding(
	db: DB,
	limit = 100
): Promise<typeof schema.documentChunks.$inferSelect[]> {
	return db
		.select()
		.from(schema.documentChunks)
		.where(and(eq(schema.documentChunks.isActive, true), isNull(schema.documentChunks.embedding)))
		.limit(limit);
}

/**
 * Get chunks pending Qdrant sync
 */
export async function getChunksPendingQdrantSync(
	db: DB,
	limit = 100
): Promise<typeof schema.documentChunks.$inferSelect[]> {
	return db
		.select()
		.from(schema.documentChunks)
		.where(
			and(
				eq(schema.documentChunks.isActive, true),
				isNotNull(schema.documentChunks.embedding),
				isNull(schema.documentChunks.qdrantSyncedAt)
			)
		)
		.limit(limit);
}

/**
 * Mark chunk embedding as generated
 */
export async function markChunkEmbeddingGenerated(
	db: DB,
	chunkId: string,
	embedding: number[],
	model: string = 'embeddinggemma:latest'
): Promise<void> {
	await db
		.update(schema.documentChunks)
		.set({
			embedding: embedding as any,
			embeddingModel: model,
			embeddingUpdatedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(schema.documentChunks.id, chunkId));
}

/**
 * Mark chunk as synced to Qdrant
 */
export async function markChunkQdrantSynced(
	db: DB,
	chunkId: string,
	qdrantPointId: string,
	qdrantCollection = 'legal_documents'
): Promise<void> {
	await db
		.update(schema.documentChunks)
		.set({
			qdrantPointId,
			qdrantCollection,
			qdrantSyncedAt: new Date(),
			qdrantSyncError: null,
			updatedAt: new Date()
		})
		.where(eq(schema.documentChunks.id, chunkId));
}

/**
 * Mark chunk Qdrant sync error
 */
export async function markChunkQdrantError(
	db: DB,
	chunkId: string,
	error: string
): Promise<void> {
	await db
		.update(schema.documentChunks)
		.set({
			qdrantSyncError: error.substring(0, 500),
			updatedAt: new Date()
		})
		.where(eq(schema.documentChunks.id, chunkId));
}

/**
 * Soft delete evidence
 */
export async function softDeleteEvidence(db: DB, evidenceId: string): Promise<void> {
	await db
		.update(schema.evidence)
		.set({
			isActive: false,
			deletedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(schema.evidence.id, evidenceId));
}

/**
 * Soft delete case
 */
export async function softDeleteCase(
	db: DB,
	caseId: string,
	cascadeEvidence = false
): Promise<{
	caseDeleted: boolean; evidenceDeleted: number }> {
	await db
		.update(schema.cases)
		.set({
			isActive: false,
			deletedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(schema.cases.id, caseId));

	let evidenceCount = 0;
	if (cascadeEvidence) {
		const result = await db
			.update(schema.evidence)
			.set({
				isActive: false,
				deletedAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(schema.evidence.caseId, caseId))
			.returning({ id: schema.evidence.id });

		evidenceCount = result.length;
	}

	return {
		caseDeleted: true,
		evidenceDeleted: evidenceCount
	};
}

/**
 * Get active cases
 */
export async function getActiveCases(
	db: DB,
	userId: string
): Promise<typeof schema.cases.$inferSelect[]> {
	return db
		.select()
		.from(schema.cases)
		.where(
			and(
				eq(schema.cases.userId, userId),
				eq(schema.cases.isActive, true),
				isNull(schema.cases.deletedAt)
			)
		);
}

/**
 * Get active evidence for a case
 */
export async function getActiveEvidence(
	db: DB,
	caseId: string
): Promise<typeof schema.evidence.$inferSelect[]> {
	return db
		.select()
		.from(schema.evidence)
		.where(
			and(
				eq(schema.evidence.caseId, caseId),
				eq(schema.evidence.isActive, true),
				isNull(schema.evidence.deletedAt)
			)
		);
}

