/**
 * Case Link Service
 * Manages case-statute linking and relationships
 */

import { sql } from '$lib/server/db';
import { redis } from '$lib/server/redis';

// Note: Using dynamic imports or type-only imports for services that might be missing
// to avoid compile-time errors if they don't exist yet.
let graphService: any;
try {
  // @ts-ignore
  import('./graph.service.js').then(m => graphService = m.graphService).catch(() => {});
} catch (e) {}

let auditService: any;
try {
  // @ts-ignore
  import('./audit.service.js').then(m => auditService = m.auditService).catch(() => {});
} catch (e) {}

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
  private readonly CACHE_PREFIX = 'case_links:';

  /**
   * Link statute to case
   */
  async linkStatuteToCase(
    caseId: string,
    userId: string,
    data: LinkCaseStatuteRequest
  ): Promise<CaseStatuteLink> {
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
    await sql`
      INSERT INTO case_statute_links
      (id, case_id, statute_code, linked_by, link_type, notes, created_at, updated_at)
      VALUES
      (${link.id}, ${link.case_id}, ${link.statute_code}, ${link.linked_by}, ${link.link_type}, ${link.notes ?? null}, ${link.created_at}, ${link.updated_at})
    `;

    // Create Neo4j relationship
    if (graphService?.createCaseStatuteRelationship) {
      await graphService.createCaseStatuteRelationship(caseId, data.statute_code, link.link_type).catch(console.warn);
    }

    // Invalidate cache
    await this.invalidateCaseCache(caseId);

    // Log audit event
    if (auditService?.logSummaryOperation) {
      await auditService.logSummaryOperation(
        userId,
        caseId,
        'retrieve',
        { statute_code: data.statute_code, link_type: data.link_type },
        true
      ).catch(console.warn);
    }

    return link;
  }

  /**
   * Get case statutes
   */
  async getCaseStatutes(caseId: string, linkType?: string): Promise<CaseStatuteLink[]> {
    if (linkType) {
      const result = await sql`
        SELECT * FROM case_statute_links
        WHERE case_id = ${caseId} AND link_type = ${linkType}
        ORDER BY created_at DESC
      `;
      return result as unknown as CaseStatuteLink[];
    }
    const result = await sql`
      SELECT * FROM case_statute_links
      WHERE case_id = ${caseId}
      ORDER BY created_at DESC
    `;
    return result as unknown as CaseStatuteLink[];
  }

  /**
   * Unlink statute from case
   */
  async unlinkStatute(caseId: string, statuteCode: string, userId: string): Promise<void> {
    // Delete from database
    await sql`DELETE FROM case_statute_links WHERE case_id = ${caseId} AND statute_code = ${statuteCode}`;

    // Delete Neo4j relationship
    if (graphService?.deleteCaseStatuteRelationship) {
      await graphService.deleteCaseStatuteRelationship(caseId, statuteCode).catch(console.warn);
    }

    // Invalidate cache
    await this.invalidateCaseCache(caseId);

    // Log audit event
    if (auditService?.logSummaryOperation) {
      await auditService.logSummaryOperation(
        userId,
        caseId,
        'retrieve',
        { statute_code: statuteCode, action: 'unlink' },
        true
      ).catch(console.warn);
    }
  }

  /**
   * Update link metadata
   */
  async updateLinkMetadata(
    caseId: string,
    statuteCode: string,
    data: { link_type?: string, notes?: string },
    userId: string
  ): Promise<CaseStatuteLink> {
    const existing = await this.getLinkDetail(caseId, statuteCode);
    if (!existing) throw new Error('Link not found');

    const link_type = data.link_type ?? existing.link_type;
    const notes = data.notes ?? existing.notes;

    const result = await sql<CaseStatuteLink[]>`
      UPDATE case_statute_links
      SET link_type = ${link_type}, notes = ${notes ?? null}, updated_at = CURRENT_TIMESTAMP
      WHERE case_id = ${caseId} AND statute_code = ${statuteCode}
      RETURNING *
    `;

    const updatedLink = result[0];

    // Invalidate cache
    await this.invalidateCaseCache(caseId);

    // Log audit event
    if (auditService?.logSummaryOperation) {
      await auditService.logSummaryOperation(
        userId,
        caseId,
        'retrieve',
        { statute_code: statuteCode, action: 'update' },
        true
      ).catch(console.warn);
    }

    return updatedLink;
  }

  /**
   * Get link detail
   */
  async getLinkDetail(caseId: string, statuteCode: string): Promise<CaseStatuteLink | null> {
    const result = await sql<CaseStatuteLink[]>`
      SELECT * FROM case_statute_links WHERE case_id = ${caseId} AND statute_code = ${statuteCode}
    `;
    return result[0] || null;
  }

  /**
   * Get link count for case
   */
  async getLinkCount(caseId: string): Promise<number> {
    const result = await sql`SELECT COUNT(*) as count FROM case_statute_links WHERE case_id = ${caseId}`;
    return parseInt((result[0] as any).count || '0');
  }

  /**
   * Get link statistics
   */
  async getLinkStats(caseId: string): Promise<{ total: number; byLinkType: Record<string, number> }> {
    const total = await this.getLinkCount(caseId);
    const byLinkTypeResult = await sql`
      SELECT link_type, COUNT(*) as count
      FROM case_statute_links
      WHERE case_id = ${caseId}
      GROUP BY link_type
    `;

    const byLinkType: Record<string, number> = {};
    for (const row of (byLinkTypeResult as any)) {
      byLinkType[row.link_type] = parseInt(row.count);
    }

    return { total, byLinkType };
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




