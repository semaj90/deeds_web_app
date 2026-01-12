import { cleanupTest, setupTest } from '$lib/test-utils/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseLinkService } from '../case-link.service.js';

describe('CaseLinkService', () => {
 const mockCaseId = 'case-123';
 const mockUserId = 'user-456';
 const mockStatuteCode = '18 U.S.C. § 1001';

 beforeEach(async () => {
 await setupTest();
 vi.clearAllMocks();
 });

 afterEach(async () => {
 await cleanupTest();
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
 const { graphService } = await import('../graph.service.js');
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
 const { graphService } = await import('../graph.service.js');

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


