/**
 * Case Link Service
 * Manages case-statute linking and relationships
 */

import db from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { graphService } from './graph.service.js';
import { auditService } from './audit.service.js';

export interface CaseStatuteLink {
  id: string; case_id: string; statute_code: string; linked_by: string; link_type: string;
  notes?: string; created_at: Date; updated_at: Date;
}

export interface LinkCaseStatuteRequest {
  statute_code: string; link_type: string;
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
      await db.raw(
        `INSERT INTO case_statute_links (id, case_id, statute_code, linked_by, link_type, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          link.id,
          link.case_id,
          link.statute_code,
          link.linked_by,
          link.link_type,
          link.notes || null,
          link.created_at,
          link.updated_at
        ]
      );

      // Create Neo4j relationship
      await graphService.createCaseStatuteRelationship(caseId, data.statute_code, link.link_type);

      // Invalidate cache
      await this.invalidateCaseCache(caseId);

      // Log audit event
      await auditService.logSummaryOperation(
        userId,
        caseId,
        'retrieve',
        { statute_code: data.statute_code, link_type: data.link_type },
        true
      );

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
      let query = `SELECT * FROM case_statute_links WHERE case_id = $1`;
      const params: unknown[] = [caseId];

      if (linkType) {
        query += ` AND link_type = $2`;
        params.push(linkType);
      }

      query += ` ORDER BY created_at DESC`;

      const links = await db.raw(query, params);

      return links as CaseStatuteLink[];
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
      await db.raw(`DELETE FROM case_statute_links WHERE case_id = $1 AND statute_code = $2`, [
        caseId,
        statuteCode
      ]);

      // Delete Neo4j relationship
      await graphService.deleteCaseStatuteRelationship(caseId, statuteCode);

      // Invalidate cache
      await this.invalidateCaseCache(caseId);

      // Log audit event
      await auditService.logSummaryOperation(
        userId,
        caseId,
        'retrieve',
        { statute_code: statuteCode, action: 'unlink' },
        true
      );
    } catch (error) {
      console.error('Error unlinking statute from case:', error);
      throw error;
    }
  }

  /**
   * Update link metadata
   */
  async updateLinkMetadata(
    caseId: string,
    statuteCode: string,
    data: { link_type?: string; notes?: string },
    userId: string
  ): Promise<CaseStatuteLink> {
    try {
      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (data.link_type !== undefined) {
        updates.push(`link_type = $${paramIndex}`);
        params.push(data.link_type);
        paramIndex++;
      }

      if (data.notes !== undefined) {
        updates.push(`notes = $${paramIndex}`);
        params.push(data.notes);
        paramIndex++;
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(caseId, statuteCode);

      const result = await db.raw(
        `UPDATE case_statute_links
         SET ${updates.join(', ')}
         WHERE case_id = $${paramIndex} AND statute_code = $${paramIndex + 1}
         RETURNING *`,
        params
      );

      if (result.length === 0) {
        throw new Error('Link not found');
      }

      const link = result[0] as CaseStatuteLink;

      // Invalidate cache
      await this.invalidateCaseCache(caseId);

      // Log audit event
      await auditService.logSummaryOperation(
        userId,
        caseId,
        'retrieve',
        { statute_code: statuteCode, action: 'update' },
        true
      );

      return link;
    } catch (error) {
      console.error('Error updating link metadata:', error);
      throw error;
    }
  }

  /**
   * Get link detail
   */
  async getLinkDetail(caseId: string, statuteCode: string): Promise<CaseStatuteLink | null> {
    try {
      const links = await db.raw(
        `SELECT * FROM case_statute_links WHERE case_id = $1 AND statute_code = $2`,
        [caseId, statuteCode]
      );

      if (links.length === 0) {
        return null;
      }

      return links[0] as CaseStatuteLink;
    } catch (error) {
      console.error('Error getting link detail:', error);
      throw error;
    }
  }

  /**
   * Get link count for case
   */
  async getLinkCount(caseId: string): Promise<number> {
    try {
      const result = await db.raw(
        `SELECT COUNT(*) as count FROM case_statute_links WHERE case_id = $1`,
        [caseId]
      );

      return result[0]?.count || 0;
    } catch (error) {
      console.error('Error getting link count:', error);
      return 0;
    }
  }

  /**
   * Get link statistics
   */
  async getLinkStats(caseId: string): Promise<{ total: number; byLinkType: Record<string, number>;
  }> {
    try {
      const total = await this.getLinkCount(caseId);
      const byLinkType = await db.raw(
        `SELECT link_type, COUNT(*) as count
         FROM case_statute_links
         WHERE case_id = $1
         GROUP BY link_type`,
        [caseId]
      );

      return {
        total,
        byLinkType: Object.fromEntries(
          byLinkType.map((row: { link_type: string; count: number }) => [row.link_type, row.count])
        )
      };
    } catch (error) {
      console.error('Error getting link stats:', error);
      return {
        total: 0,
        byLinkType: {}
      };
    }
  }

  /**
   * Invalidate case cache
   */
  private async invalidateCaseCache(caseId: string): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${caseId}`;
      await redis.del(cacheKey);
    } catch (error) {
      console.error('Error invalidating case cache:', error);
    }
  }
}

// Export singleton instance
export const caseLinkService = new CaseLinkService();


