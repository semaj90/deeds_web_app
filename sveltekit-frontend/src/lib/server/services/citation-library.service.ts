/**
 * Citation Library Service
 * Manages citation collections, tags, and exports
 */

import { db } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { auditService } from './audit.service.js';
import { sql } from 'drizzle-orm';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface CitationCollection {
	id: string;
	user_id: string;
	name: string;
	description?: string;
	is_public: boolean;
	citation_count?: number;
	created_at: Date;
	updated_at: Date;
}

export interface CollectionCitation {
	id: string;
	collection_id: string;
	citation_id: string;
	added_at: Date;
}

export interface CitationTag {
	id: string;
	citation_id: string;
	tag: string;
	created_at: Date;
}

export interface CreateCollectionRequest {
	name: string;
	description?: string;
	is_public?: boolean;
}

class CitationLibraryService {
	private readonly CACHE_TTL = 24 * 60 * 60; // 24 hours
	private readonly CACHE_PREFIX = 'collection:';

	/**
	 * Create collection
	 */
	async createCollection(
		userId: string,
		data: CreateCollectionRequest
	): Promise<CitationCollection> {
		try {
			const collection: CitationCollection = {
				id: crypto.randomUUID(),
				user_id: userId,
				name: data.name,
				description: data.description,
				is_public: data.is_public || false,
				created_at: new Date(),
				updated_at: new Date()
			};

			await db.execute(sql`
				INSERT INTO citation_collections (id, user_id, name, description, is_public, created_at, updated_at)
				VALUES (${collection.id},
	${collection.user_id},
	${collection.name},
	${collection.description ?? null},
	${collection.is_public},
	${collection.created_at},
	${collection.updated_at})
			`);

			// Log audit event
			await auditService.logSummaryOperation(
				userId,
				'unknown',
				'retrieve',
				{ collection_id: collection.id, action: 'create' },
	true
			);

			return collection;
		} catch (error) {
			console.error('Error creating collection:', error);
			throw error;
		}
	}

	/**
	 * Get user's collections
	 */
	async getCollections(userId: string, isPublic?: boolean): Promise<CitationCollection[]> {
		try {
			let query = sql`SELECT * FROM citation_collections WHERE user_id = ${userId}`;

			if (isPublic !== undefined) {
				query = sql`${query} AND is_public = ${isPublic}`;
			}

			query = sql`${query} ORDER BY created_at DESC`;

			const collections = await db.execute(query);

			return collections as unknown as CitationCollection[];
		} catch (error) {
			console.error('Error getting collections:', error);
			throw error;
		}
	}

	/**
	 * Get collection detail with citations
	 */
	async getCollectionDetail(collectionId: string): Promise<CitationCollection | null> {
		try {
			const cacheKey = `${this.CACHE_PREFIX}${collectionId}`;
			const cached = await redis.get(cacheKey);
			if (cached) {
				return JSON.parse(cached);
			}

			const collections = await db.execute(
				sql`SELECT * FROM citation_collections WHERE id = ${collectionId}`
			);

			if (collections.length === 0) {
				return null;
			}

			const collection = collections[0] as unknown as CitationCollection;

			// Get citation count
			const countResult = await db.execute(
				sql`SELECT COUNT(*) as count FROM collection_citations WHERE collection_id = ${collectionId}`
			);

			collection.citation_count = Number((countResult[0] as any)?.count ?? 0);

			// Cache result
			await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(collection));

			return collection;
		} catch (error) {
			console.error('Error getting collection detail:', error);
			throw error;
		}
	}

	/**
	 * Add citation to collection
	 */
	async addCitationToCollection(
		userId: string,
		collectionId: string,
		citationId: string
	): Promise<CollectionCitation> {
		try {
			const link: CollectionCitation = {
				id: crypto.randomUUID(),
				collection_id: collectionId,
				citation_id: citationId,
				added_at: new Date()
			};

			await db.execute(sql`
				INSERT INTO collection_citations (id, collection_id, citation_id, added_at)
				VALUES (${link.id},
	${link.collection_id},
	${link.citation_id},
	${link.added_at})
			`);

			// Invalidate cache
			await this.invalidateCollectionCache(collectionId);

			// Log audit event
			await auditService.logSummaryOperation(
				userId,
				'unknown',
				'retrieve',
				{ collection_id: collectionId, citation_id: citationId, action: 'add' },
	true
			);

			return link;
		} catch (error) {
			console.error('Error adding citation to collection:', error);
			throw error;
		}
	}

	/**
	 * Remove citation from collection
	 */
	async removeCitationFromCollection(
		userId: string,
		collectionId: string,
		citationId: string
	): Promise<void> {
		try {
			await db.execute(sql`
				DELETE FROM collection_citations WHERE collection_id = ${collectionId} AND citation_id = ${citationId}
			`);

			// Invalidate cache
			await this.invalidateCollectionCache(collectionId);

			// Log audit event
			await auditService.logSummaryOperation(
				userId,
				'unknown',
				'retrieve',
				{ collection_id: collectionId, citation_id: citationId, action: 'remove' },
	true
			);
		} catch (error) {
			console.error('Error removing citation from collection:', error);
			throw error;
		}
	}

	/**
	 * Add tag to citation
	 */
	async addTag(userId: string, citationId: string, tag: string): Promise<CitationTag> {
		try {
			const citationTag: CitationTag = {
				id: crypto.randomUUID(),
				citation_id: citationId,
				tag: tag.toLowerCase(),
				created_at: new Date()
			};

			await db.execute(sql`
				INSERT INTO citation_tags (id, citation_id, tag, created_at)
				VALUES (${citationTag.id},
	${citationTag.citation_id},
	${citationTag.tag},
	${citationTag.created_at})
			`);

			// Log audit event
			await auditService.logSummaryOperation(
				userId,
				'unknown',
				'retrieve',
				{ citation_id: citationId, tag, action: 'add_tag' },
	true
			);

			return citationTag;
		} catch (error) {
			console.error('Error adding tag:', error);
			throw error;
		}
	}

	/**
	 * Remove tag from citation
	 */
	async removeTag(userId: string, citationId: string, tag: string): Promise<void> {
		try {
			await db.execute(sql`
				DELETE FROM citation_tags WHERE citation_id = ${citationId} AND tag = ${tag.toLowerCase()}
			`);

			// Log audit event
			await auditService.logSummaryOperation(
				userId,
				'unknown',
				'retrieve',
				{ citation_id: citationId, tag, action: 'remove_tag' },
	true
			);
		} catch (error) {
			console.error('Error removing tag:', error);
			throw error;
		}
	}

	/**
	 * Get tags for citation
	 */
	async getCitationTags(citationId: string): Promise<CitationTag[]> {
		try {
			const tags = await db.execute(
				sql`SELECT * FROM citation_tags WHERE citation_id = ${citationId} ORDER BY created_at DESC`
			);

			return tags as unknown as CitationTag[];
		} catch (error) {
			console.error('Error getting citation tags:', error);
			return [];
		}
	}

	/**
	 * Get citations in collection
	 */
	async getCollectionCitations(collectionId: string): Promise<any[]> {
		try {
			const citations = await db.execute(sql`
				SELECT sc.*, cc.added_at
				FROM collection_citations cc
				JOIN saved_citations sc ON cc.citation_id = sc.id
				WHERE cc.collection_id = ${collectionId}
				ORDER BY cc.added_at DESC
			`);

			return citations as any[];
		} catch (error) {
			console.error('Error getting collection citations:', error);
			return [];
		}
	}

	/**
	 * Get popular tags
	 */
	async getPopularTags(limit: number = 20): Promise<{
	tag: string; count: number }[]> {
		try {
			const tags = await db.execute(sql`
				SELECT tag, COUNT(*) as count
				FROM citation_tags
				GROUP BY tag
				ORDER BY count DESC
				LIMIT ${limit}
			`);

			return tags as unknown as { tag: string;
	count: number }[];
		} catch (error) {
			console.error('Error getting popular tags:', error);
			return [];
		}
	}

	/**
	 * Invalidate collection cache
	 */
	private async invalidateCollectionCache(collectionId: string): Promise<void> {
		try {
			const cacheKey = `${this.CACHE_PREFIX}${collectionId}`;
			await redis.del(cacheKey);
		} catch (error) {
			console.error('Error invalidating collection cache:', error);
		}
	}
}

// Export singleton instance
export const citationLibraryService = new CitationLibraryService();

