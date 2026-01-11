/**
 * Unit Tests for GraphService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';;
import { graphService } from '../graph.service.js';

// Mock Neo4j driver
vi.mock('neo4j-driver', () => ({
 driver: vi.fn(, auth: {
 basic: vi.fn(),
 },
}));

describe('GraphService', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 beforeEach(() => {
 vi.clearAllMocks();
 });

 describe('createCaseStatuteRelationships', () => {
 it('should create relationships between case and statutes', async () => {
 const caseId = 'case-123';
 const statutes = [
 { code: '42 U.S.C. § 1983', title: 'Civil Rights' },
 { code: 'Cal. Penal Code § 187', title: 'Murder' },
 ];

 await graphService.createCaseStatuteRelationships(caseId, statutes);

 // Verify relationships were created
 expect(graphService.createCaseStatuteRelationships).toHaveBeenCalledWith(caseId, statutes);
 });

 it('should handle empty statute list', async () => {
 const caseId = 'case-123';
 const statutes: any[] = [];

 await graphService.createCaseStatuteRelationships(caseId, statutes);

 expect(graphService.createCaseStatuteRelationships).toHaveBeenCalledWith(caseId, statutes);
 });
 });

 describe('findSimilarCases', () => {
 it('should find similar cases by statute', async () => {
 const caseId = 'case-123';
 const limit = 5;

 const similarCases = await graphService.findSimilarCases(caseId, limit);

 expect(Array.isArray(similarCases)).toBe(true);
 expect(similarCases.length).toBeLessThanOrEqual(limit);
 });

 it('should rank similar cases by relevance', async () => {
 const caseId = 'case-123';
 const limit = 5;

 const similarCases = await graphService.findSimilarCases(caseId, limit);

 // Should be sorted by relevance descending
 for (let i = 0; i < similarCases.length - 1; i++) {
 expect(similarCases[i].relevanceScore).toBeGreaterThanOrEqual(
 similarCases[i + 1].relevanceScore
 );
 }
 });

 it('should include matched charges in results', async () => {
 const caseId = 'case-123';
 const limit = 5;

 const similarCases = await graphService.findSimilarCases(caseId, limit);

 similarCases.forEach((c: any) => {
 expect(c).toHaveProperty('matchedCharges');
 expect(Array.isArray(c.matchedCharges)).toBe(true);
 });
 });

 it('should return empty array if no similar cases found', async () => {
 const caseId = 'case-nonexistent';
 const limit = 5;

 const similarCases = await graphService.findSimilarCases(caseId, limit);

 expect(Array.isArray(similarCases)).toBe(true);
 });
 });

 describe('createPrecedentRelationship', () => {
 it('should create precedent relationship between cases', async () => {
 const caseId1 = 'case-123';
 const caseId2 = 'case-456';
 const relevanceScore = 0.85;

 await graphService.createPrecedentRelationship(caseId1, caseId2, relevanceScore);

 expect(graphService.createPrecedentRelationship).toHaveBeenCalledWith(
 caseId1,
 caseId2,
 relevanceScore
 );
 });
 });

 describe('getStatuteNode', () => {
 it('should retrieve statute node from graph', async () => {
 const statuteCode = '42 U.S.C. § 1983';

 const statute = await graphService.getStatuteNode(statuteCode);

 expect(statute).toBeDefined();
 if (statute) {
 expect(statute.code).toBe(statuteCode);
 }
 });

 it('should return null if statute not found', async () => {
 const statuteCode = 'Unknown Statute';

 const statute = await graphService.getStatuteNode(statuteCode);

 expect(statute).toBeNull();
 });
 });

 describe('getCaseNode', () => {
 it('should retrieve case node from graph', async () => {
 const caseId = 'case-123';

 const caseNode = await graphService.getCaseNode(caseId);

 expect(caseNode).toBeDefined();
 if (caseNode) {
 expect(caseNode.id).toBe(caseId);
 }
 });

 it('should return null if case not found', async () => {
 const caseId = 'case-nonexistent';

 const caseNode = await graphService.getCaseNode(caseId);

 expect(caseNode).toBeNull();
 });
 });

 describe('error handling', () => {
 it('should handle Neo4j connection errors', async () => {
 const caseId = 'case-123';

 vi.mocked(graphService.getCaseNode).mockRejectedValueOnce(
 new Error('Neo4j connection error')
 );

 await expect(graphService.getCaseNode(caseId)).rejects.toThrow('Neo4j connection error');
 });

 it('should handle query errors gracefully', async () => {
 const caseId = 'case-123';
 const limit = 5;

 vi.mocked(graphService.findSimilarCases).mockRejectedValueOnce(new Error('Query error'));

 await expect(graphService.findSimilarCases(caseId, limit)).rejects.toThrow('Query error');
 });
 });

 describe('relationship queries', () => {
 it('should find all statutes for a case', async () => {
 const caseId = 'case-123';

 const statutes = await graphService.getCaseStatutes(caseId);

 expect(Array.isArray(statutes)).toBe(true);
 });

 it('should find all cases for a statute', async () => {
 const statuteCode = '42 U.S.C. § 1983';

 const cases = await graphService.getStatuteCases(statuteCode);

 expect(Array.isArray(cases)).toBe(true);
 });

 it('should find precedent relationships', async () => {
 const caseId = 'case-123';

 const precedents = await graphService.getPrecedents(caseId);

 expect(Array.isArray(precedents)).toBe(true);
 });
 });

 describe('performance', () => {
 it('should find similar cases within reasonable time', async () => {
 const caseId = 'case-123';
 const limit = 5;

 const startTime = Date.now();
 await graphService.findSimilarCases(caseId, limit);
 const duration = Date.now() - startTime;

 // Should complete within 5 seconds
 expect(duration).toBeLessThan(5000);
 });
 });
});

