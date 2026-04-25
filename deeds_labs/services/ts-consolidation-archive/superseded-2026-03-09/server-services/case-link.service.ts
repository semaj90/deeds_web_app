/**
 * Case Link Service
 * Manages case-statute linking and relationships
 */

import db from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { redis } from '$lib/server/redis';
import { graphService } from './graph.service.js';
import { auditService } from './audit.service.js';
import crypto from 'crypto';

export interface CaseStatuteLink {
	id: string;
	case_id: string;
	statute_code: string;
	linked_by: string;
	link_type: string;
	notes?: string;
	created_at: Date;
	updated_at: Date;
}

export interface LinkCaseStatuteRequest {
	statute_code: string;
	link_type: string;
	notes?: string;
}

class CaseLinkService {
	private readonly CACHE_TTL = 24 * 60 * 60; // 24 hours
	private readonly CACHE_PREFIX = 'case_links:';

	/**
	 * Link statute to case
	 */
	async linkStatuteToCase(
		caseId: string,
		userId: string,
		data: LinkCaseStatuteRequest
	): Promise<CaseStatuteLink> {
		try {
			const link: CaseStatuteLink = {
				id: crypto.randomUUID(),
				case_id: caseId,
				statute_code: data.statute_code,
				linked_by: userId,
				link_type: data.link_type,
				notes: data.notes,
				created_at: new Date(),
				updated_at: new Date()
			};

			// Save to database
			await db.execute(sql`
				INSERT INTO case_statute_links (
					id, case_id, statute_code, linked_by, link_type, notes, created_at, updated_at
				)
				VALUES (
					${link.id},
	${link.case_id},
	${link.statute_code},
	${link.linked_by},
	${link.link_type},
	${link.notes ?? null},
	${link.created_at.toISOString()},
	${link.updated_at.toISOString()}
				)
			`);

			// Create Neo4j relationship
			try {
				await graphService.createCaseStatuteRelationship(caseId, data.statute_code, link.link_type);
			} catch (err) {
				console.error('Failed to create graph relationship:', err);
				// Continue even if graph fails: DB is primary
			}

			// Invalidate cache
			await this.invalidateCaseCache(caseId);

			// Log audit event
			try {
				await auditService.logSummaryOperation(
					userId,
					caseId,
					'create_link', // changed from 'retrieve' to more accurate 'create_link' or generic 'update'
					{ statute_code: data.statute_code, link_type: data.link_type },
	true
				);
			} catch (e) {
				// Audit log failure shouldn't fail the operation
				console.error('Audit log failed', e);
			}

			return link;
		} catch (error) {
			console.error('Error linking statute to case:', error);
			throw error;
		}
	}

	/**
	 * Get case statutes
	 */
	async getCaseStatutes(caseId: string, linkType?: string): Promise<CaseStatuteLink[]> {
		try {
			// Check cache first
			const cacheKey = `${this.CACHE_PREFIX}${caseId}:${linkType || 'all'}`;
			const cached = await redis.get(cacheKey);
			if (cached) {
				// redis returns string usually, check if redis client auto-parses?
				// Assuming ioredis or similar returning string
				if (typeof cached === 'string') {
					return JSON.parse(cached);
				}
				return cached as unknown as CaseStatuteLink[];
			}

			let query = sql`SELECT * FROM case_statute_links WHERE case_id = ${caseId}`;

			if (linkType) {
				query = sql`SELECT * FROM case_statute_links WHERE case_id = ${caseId} AND link_type = ${linkType}`;
			}

			// Append sort manually or via sql composition (Drizzle sql tag doesn't support easy appending like strings)
			// Better to write full query or use query builder if schema was imported.
			// Since we are using raw SQL for everything here:

			const result = await db.execute(sql`${query} ORDER BY created_at DESC`);

			const links = result.map(row => ({
				id: row.id,
				case_id: row.case_id,
				statute_code: row.statute_code,
				linked_by: row.linked_by,
				link_type: row.link_type,
				notes: row.notes,
				created_at: new Date(row.created_at as string),
				updated_at: new Date(row.updated_at as string)
			})) as CaseStatuteLink[];

			// Cache result
			await redis.set(cacheKey, JSON.stringify(links), 'EX', this.CACHE_TTL);

			return links;
		} catch (error) {
			console.error('Error getting case statutes:', error);
			throw error;
		}
	}

	/**
	 * Unlink statute from case
	 */
	async unlinkStatute(caseId: string, statuteCode: string, userId: string): Promise<void> {
		try {
			// Delete from database
			await db.execute(sql`
				DELETE FROM case_statute_links
				WHERE case_id = ${caseId} AND statute_code = ${statuteCode}
			`);

			// Delete Neo4j relationship
			try {
				await graphService.deleteCaseStatuteRelationship(caseId, statuteCode);
			} catch (err) {
				console.error('Graph unlink failed:', err);
			}

			// Invalidate cache
			await this.invalidateCaseCache(caseId);

			// Log audit event
			try {
				await auditService.logSummaryOperation(
					userId,
					caseId,
					'delete_link',
					{ statute_code: statuteCode, action: 'unlink' },
	true
				);
			} catch (e) {
				console.error('Audit log failed', e);
			}
		} catch (error) {
			console.error('Error unlinking statute:', error);
			throw error;
		}
	}

	private async invalidateCaseCache(caseId: string): Promise<void> {
		try {
			// Scan/Delete pattern for cache clearing
			const keys = await redis.keys(`${this.CACHE_PREFIX}${caseId}:*`);
			if (keys.length > 0) {
				await redis.del(...keys);
			}
		} catch (error) {
			console.error('Cache invalidation failed:', error);
		}
	}
}

export const caseLinkService = new CaseLinkService();

