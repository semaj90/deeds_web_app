/**
 * Citation Service
 * Manages saving, searching, and retrieving citations
 */

import { db } from '$lib/server/db';
import { savedCitations } from '$lib/server/db/schema';
import { redis } from '$lib/server/redis';
import { auditService } from './audit.service.js';
import { eq, like, and, or, desc, sql } from 'drizzle-orm';

export interface Citation {
	id: string;
	userId: string;
	caseId?: string | null;
	statuteCode: string;
	statuteTitle?: string | null;
	jurisdiction?: string | null;
	severity?: string | null;
	year?: number | null;
	sourceType: 'manual' | 'auto_extracted' | string;
	highlightedText?: string | null;
	notes?: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface SaveCitationRequest {
	statuteCode: string;
	statuteTitle?: string;
	jurisdiction?: string;
	severity?: string;
	year?: number;
	highlightedText?: string;
	notes?: string;
	caseId?: string;
	sourceType?: 'manual' | 'auto_extracted';
}

export interface SearchFilters {
	jurisdiction?: string;
	severity?: string;
	caseId?: string;
	sourceType?: string;
	limit?: number;
	offset?: number;
}

class CitationService {
	private readonly CACHE_TTL = 24 * 60 * 60; // 24 hours
	private readonly CACHE_PREFIX = 'citation:';

	/**
	 * Save a citation
	 */
	async saveCitation(userId: string, data: SaveCitationRequest): Promise<Citation> {
		try {
			const [citation] = await db
				.insert(savedCitations)
				.values({
					userId, // Drizzle maps this to user_id
					caseId: data.caseId,
					statuteCode: data.statuteCode,
					statuteTitle: data.statuteTitle,
					jurisdiction: data.jurisdiction,
					severity: data.severity,
					year: data.year,
					sourceType: data?.sourceType ?? 'manual',
					highlightedText: data.highlightedText,
					notes: data.notes
				})
				.returning();

			// Invalidate cache
			await this.invalidateUserCache(userId);

			// Log audit event
			await auditService.logSummaryOperation(
				userId,
				data?.caseId ?? 'unknown',
				'retrieve',
				{ citation_id: citation.id, source_type: citation.sourceType },
				true
			);

			return citation as Citation;
		} catch (error) {
			console.error('Error saving citation:', error);
			throw error;
		}
	}

	/**
	 * Search citations
	 */
	async searchCitations(
		userId: string,
		query: string,
		filters: SearchFilters = {}
	): Promise<Citation[]> {
		try {
			const limit = filters?.limit ?? 20;
			const offset = filters?.offset ?? 0;
			const queryPattern = `%${query}%`;
			const conditions = [
				eq(savedCitations.userId, userId),
				or(
					like(savedCitations.statuteCode, queryPattern),
					like(savedCitations.statuteTitle, queryPattern)
				)
			];

			if (filters.jurisdiction) conditions.push(eq(savedCitations.jurisdiction, filters.jurisdiction));
			if (filters.severity) conditions.push(eq(savedCitations.severity, filters.severity));
			if (filters.caseId) conditions.push(eq(savedCitations.caseId, filters.caseId));
			if (filters.sourceType) conditions.push(eq(savedCitations.sourceType, filters.sourceType));

			const citations = await db
				.select()
				.from(savedCitations)
				.where(and(...conditions))
				.orderBy(desc(savedCitations.createdAt))
				.limit(limit)
				.offset(offset);

			return citations as Citation[];
		} catch (error) {
			console.error('Error searching citations:', error);
			throw error;
		}
	}

	/**
	 * Get citation detail
	 */
	async getCitationDetail(id: string): Promise<Citation | null> {
		try {
			// Check cache first
			const cacheKey = `${this.CACHE_PREFIX}${id}`;
			const cached = await redis.get(cacheKey);
			if (cached) {
				return JSON.parse(cached);
			}

			// Query database
			const [citation] = await db
				.select()
				.from(savedCitations)
				.where(eq(savedCitations.id, id));

			if (!citation) return null;

			// Cache result
			await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(citation));

			return citation as Citation;
		} catch (error) {
			console.error('Error getting citation detail:', error);
			throw error;
		}
	}

	/**
	 * Get citations by user
	 */
	async getCitationsByUser(userId: string, limit = 20, offset = 0): Promise<Citation[]> {
		try {
			const citations = await db
				.select()
				.from(savedCitations)
				.where(eq(savedCitations.userId, userId))
				.orderBy(desc(savedCitations.createdAt))
				.limit(limit)
				.offset(offset);

			return citations as Citation[];
		} catch (error) {
			console.error('Error getting citations by user:', error);
			throw error;
		}
	}

	/**
	 * Get citations by case
	 */
	async getCitationsByCase(caseId: string): Promise<Citation[]> {
		try {
			const citations = await db
				.select()
				.from(savedCitations)
				.where(eq(savedCitations.caseId, caseId))
				.orderBy(desc(savedCitations.createdAt));

			return citations as Citation[];
		} catch (error) {
			console.error('Error getting citations by case:', error);
			throw error;
		}
	}

	/**
	 * Update citation notes
	 */
	async updateCitationNotes(id: string, notes: string): Promise<Citation> {
		try {
			const [citation] = await db
				.update(savedCitations)
				.set({ notes, updatedAt: new Date() })
				.where(eq(savedCitations.id, id))
				.returning();

			if (!citation) {
				throw new Error('Citation not found');
			}

			// Invalidate cache
			const cacheKey = `${this.CACHE_PREFIX}${id}`;
			await redis.del(cacheKey);

			// Invalidate user cache
			await this.invalidateUserCache(citation.userId);

			return citation as Citation;
		} catch (error) {
			console.error('Error updating citation notes:', error);
			throw error;
		}
	}

	/**
	 * Delete citation
	 */
	async deleteCitation(id: string, userId: string): Promise<void> {
		try {
			await db
				.delete(savedCitations)
				.where(and(eq(savedCitations.id, id), eq(savedCitations.userId, userId)));

			// Invalidate cache
			const cacheKey = `${this.CACHE_PREFIX}${id}`;
			await redis.del(cacheKey);

			// Invalidate user cache
			await this.invalidateUserCache(userId);

			// Log audit event
			await auditService.logSummaryOperation(
				userId,
				'unknown',
				'retrieve',
				{ citation_id: id, action: 'delete' },
				true
			);
		} catch (error) {
			console.error('Error deleting citation:', error);
			throw error;
		}
	}

	/**
	 * Get citation count for user
	 */
	async getCitationCount(userId: string): Promise<number> {
		try {
			const [result] = await db
				.select({ count: sql<number>`count(*)` })
				.from(savedCitations)
				.where(eq(savedCitations.userId, userId));

			return Number(result?.count ?? 0);
		} catch (error) {
			console.error('Error getting citation count:', error);
			return 0;
		}
	}

	/**
	 * Get citation statistics
	 */
	async getCitationStats(userId: string): Promise<{
		total: number;
		byJurisdiction: Record<string, number>;
		bySeverity: Record<string, number>;
		bySourceType: Record<string, number>;
	}> {
		try {
			const total = await this.getCitationCount(userId);

			const byJurisdiction = await db
				.select({
					jurisdiction: savedCitations.jurisdiction,
					count: sql<number>`count(*)`
				})
				.from(savedCitations)
				.where(eq(savedCitations.userId, userId))
				.groupBy(savedCitations.jurisdiction);

			const bySeverity = await db
				.select({
					severity: savedCitations.severity,
					count: sql<number>`count(*)`
				})
				.from(savedCitations)
				.where(eq(savedCitations.userId, userId))
				.groupBy(savedCitations.severity);

			const bySourceType = await db
				.select({
					sourceType: savedCitations.sourceType,
					count: sql<number>`count(*)`
				})
				.from(savedCitations)
				.where(eq(savedCitations.userId, userId))
				.groupBy(savedCitations.sourceType);

			const mapResult = (rows: any[], key: string) => {
				return Object.fromEntries(
					rows.filter((r) => r[key]).map((r) => [r[key], Number(r.count)])
				);
			};

			return {
				total,
				byJurisdiction: mapResult(byJurisdiction, 'jurisdiction'),
				bySeverity: mapResult(bySeverity, 'severity'),
				bySourceType: mapResult(bySourceType, 'sourceType')
			};
		} catch (error) {
			console.error('Error getting citation stats:', error);
			return {
				total: 0,
				byJurisdiction: {},
				bySeverity: {},
				bySourceType: {}
			};
		}
	}

	/**
	 * Invalidate user cache
	 */
	private async invalidateUserCache(userId: string): Promise<void> {
		try {
			const pattern = `${this.CACHE_PREFIX}*`;
			const keys = await redis.keys(pattern);
			if (keys.length > 0) {
				await redis.del(...keys);
			}
		} catch (error) {
			console.error('Error invalidating user cache:', error);
		}
	}
}

// Export singleton instance
export const citationService = new CitationService();
