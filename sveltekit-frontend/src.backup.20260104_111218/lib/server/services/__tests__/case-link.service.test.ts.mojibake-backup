import { describe, it, expect, beforeEach, vi } from 'vitest';
import { caseLinkService, type LinkCaseStatuteRequest } from '../case-link.service';

// Mock dependencies
vi.mock('$lib/server/db', () => ({
  db: {
    raw: vi.fn(),
  },
}));

vi.mock('$lib/server/redis', () => ({
  redis: {
    del: vi.fn(),
  },
}));

vi.mock('../graph.service', () => ({
  graphService: {
    createCaseStatuteRelationship: vi.fn(),
    deleteCaseStatuteRelationship: vi.fn(),
  },
}));

vi.mock('../audit.service', () => ({
  auditService: {
    logSummaryOperation: vi.fn(),
  },
}));

describe('CaseLinkService', () => {
  const mockCaseId = 'case-123';
  const mockUserId = 'user-456';
  const mockStatuteCode = '18 U.S.C. § 1001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('linkStatuteToCase', () => {
    it('should link statute to case', async () => {
      const linkData: LinkCaseStatuteRequest = {
        statute_code: mockStatuteCode,
        link_type: 'CHARGED_UNDER',
        notes: 'Test link',
      };

      const result = await caseLinkService.linkStatuteToCase(mockCaseId, mockUserId, linkData);

      expect(result).toBeDefined();
      expect(result.case_id).toBe(mockCaseId);
      expect(result.statute_code).toBe(mockStatuteCode);
      expect(result.link_type).toBe('CHARGED_UNDER');
    });

    it('should create Neo4j relationship', async () => {
      const { graphService } = await import('../graph.service');
      const linkData: LinkCaseStatuteRequest = {
        statute_code: mockStatuteCode,
        link_type: 'CHARGED_UNDER',
      };

      await caseLinkService.linkStatuteToCase(mockCaseId, mockUserId, linkData);

      expect(graphService.createCaseStatuteRelationship).toHaveBeenCalled();
    });
  });

  describe('getCaseStatutes', () => {
    it('should get case statutes', async () => {
      const results = await caseLinkService.getCaseStatutes(mockCaseId);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter by link type', async () => {
      const results = await caseLinkService.getCaseStatutes(mockCaseId, 'CHARGED_UNDER');

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('unlinkStatute', () => {
    it('should unlink statute from case', async () => {
      await expect(
        caseLinkService.unlinkStatute(mockCaseId, mockStatuteCode, mockUserId)
      ).resolves.not.toThrow();
    });

    it('should delete Neo4j relationship', async () => {
      const { graphService } = await import('../graph.service');

      await caseLinkService.unlinkStatute(mockCaseId, mockStatuteCode, mockUserId);

      expect(graphService.deleteCaseStatuteRelationship).toHaveBeenCalled();
    });
  });

  describe('updateLinkMetadata', () => {
    it('should update link metadata', async () => {
      const result = await caseLinkService.updateLinkMetadata(
        mockCaseId,
        mockStatuteCode,
        { link_type: 'CITED_IN', notes: 'Updated notes' },
        mockUserId
      );

      expect(result).toBeDefined();
    });
  });

  describe('getLinkDetail', () => {
    it('should get link detail', async () => {
      const result = await caseLinkService.getLinkDetail(mockCaseId, mockStatuteCode);

      expect(result === null || typeof result === 'object').toBe(true);
    });
  });

  describe('getLinkCount', () => {
    it('should get link count', async () => {
      const count = await caseLinkService.getLinkCount(mockCaseId);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getLinkStats', () => {
    it('should get link statistics', async () => {
      const stats = await caseLinkService.getLinkStats(mockCaseId);

      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThanOrEqual(0);
      expect(typeof stats.byLinkType).toBe('object');
    });
  });
});
