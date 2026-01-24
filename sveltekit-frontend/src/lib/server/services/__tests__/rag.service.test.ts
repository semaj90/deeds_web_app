/**
 * Unit Tests for RAGService
 */

import db from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { cleanupTest, setupTest } from '$lib/test-utils/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ragService } from '../rag.service.js';

// Create proper mock chains
const createDbSelectMock = (data: any) => ({
	from: vi.fn(() => ({
		where: vi.fn().mockResolvedValue(data)
	}))
});

describe('RAGService', () => {
	beforeEach(async () => {
		await setupTest();
		vi.clearAllMocks();
	});

	afterEach(async () => {
		await cleanupTest();
	});

	describe('retrieveStatutes', () => {
		it('should retrieve statutes for given charges', async () => {
			const charges = ['42 U.S.C. § 1983', 'Cal. Penal Code § 187'];{
					code: '42 U.S.C. § 1983',
					title: 'Civil Rights',
					text: 'Every person who...',
					relevance: 0.95,
				},
				{
					code: 'Cal. Penal Code § 187',
					title: 'Murder',
					text: 'Murder is the unlawful killing...',
					relevance: 0.92,
				}];

			vi.mocked(db.select).mockReturnValue(createDbSelectMock(statutes));

			const result = await ragService.retrieveStatutes(charges);

			expect(result).toEqual(statutes);
			expect(result.length).toBe(2);
		});

		it('should return empty array if no statutes found', async () => {
			const charges = ['Unknown Statute'];

			vi.mocked(db.select).mockReturnValue(createDbSelectMock([]));

			const result = await ragService.retrieveStatutes(charges);

			expect(result).toEqual([]);
		});

		it('should cache statute results', async () => {
			const charges = ['42 U.S.C. § 1983'];{
					code: '42 U.S.C. § 1983',
					title: 'Civil Rights',
					text: 'Every person who...',
					relevance: 0.95,
				}];

			vi.mocked(db.select).mockReturnValue(createDbSelectMock(statutes));

			await ragService.retrieveStatutes(charges);

 // Verify cache was called
 expect(redis.setex).toHaveBeenCalled();
 });
 });

 describe('retrieveCaseLaw', () => {
 it('should retrieve case law for given charges', async () => {
 const charges = ['murder', 'assault'];{
 caseNumber: '123 F.3d 456',
 title: 'State v. Defendant',
 holding: 'The court held that...',
 relevance: 0.88, year: 2020
 }];

 vi.mocked(db.select).mockReturnValueOnce({
 from: vi.fn().mockReturnValueOnce({ where: vi.fn().mockResolvedValueOnce(caseLaw),
 }),
 });

 const result = await ragService.retrieveCaseLaw(charges);

 expect(result).toEqual(caseLaw);
 expect(result.length).toBe(1);
 });

 it('should rank case law by relevance', async () => {
 const charges = ['murder'];{ caseNumber: 'Case 1', relevance: 0.85 },
 { caseNumber: 'Case 2', relevance: 0.95 },
 { caseNumber: 'Case 3', relevance: 0.75 }];

 vi.mocked(db.select).mockReturnValueOnce({
 from: vi.fn().mockReturnValueOnce({ where: vi.fn().mockResolvedValueOnce(caseLaw),
 }),
 });

 const result = await ragService.retrieveCaseLaw(charges);

 // Should be sorted by relevance descending
 expect(result[0].relevance).toBeGreaterThanOrEqual(result[1].relevance);
 });
 });

 describe('rankByRelevance', () => {
 it('should rank results by relevance score', () => {{ id: '1', relevance: 0.75 },
 { id: '2', relevance: 0.95 },
 { id: '3', relevance: 0.85 }] as const;

 const ranked = ragService.rankByRelevance(results);

 expect(ranked[0].relevance).toBe(0.95);
 expect(ranked[1].relevance).toBe(0.85);
 expect(ranked[2].relevance).toBe(0.75);
 });

 it('should handle empty results', () => {
 const results: any[] = [];

 const ranked = ragService.rankByRelevance(results);

 expect(ranked).toEqual([]);
 });
 });

 describe('error handling', () => {
 it('should handle database errors gracefully', async () => {
 const charges = ['42 U.S.C. § 1983'];

 vi.mocked(db.select).mockReturnValueOnce({
 from: vi.fn().mockReturnValueOnce({ where: vi.fn().mockRejectedValueOnce(new Error('Database error')),
 }),
 });

 await expect(ragService.retrieveStatutes(charges)).rejects.toThrow('Database error');
 });

 it('should handle cache errors and fall back to database', async () => {
 const charges = ['42 U.S.C. § 1983'];{
 code: '42 U.S.C. § 1983',
 title: 'Civil Rights',
 text: 'Every person who...',
 relevance: 0.95,
 }];

 vi.mocked(redis.get).mockRejectedValueOnce(new Error('Cache error'));
 vi.mocked(db.select).mockReturnValueOnce({
 from: vi.fn().mockReturnValueOnce({ where: vi.fn().mockResolvedValueOnce(statutes),
 }),
 });

 const result = await ragService.retrieveStatutes(charges);

 expect(result).toEqual(statutes);
 });
 });

 describe('parallel retrieval', () => {
 it('should retrieve statutes and case law in parallel', async () => {
 const charges = ['murder'];
 const statutes = [{ code: 'Statute 1', relevance: 0.9 }];
 const caseLaw = [{ caseNumber: 'Case 1', relevance: 0.85 }];

 vi.mocked(db.select)
 .mockReturnValueOnce({
 from: vi.fn().mockReturnValueOnce({ where: vi.fn().mockResolvedValueOnce(statutes),
 }),
 })
 .mockReturnValueOnce({
 from: vi.fn().mockReturnValueOnce({ where: vi.fn().mockResolvedValueOnce(caseLaw),
 }),
 });ragService.retrieveStatutes(charges),
 ragService.retrieveCaseLaw(charges)]);

 expect(retrievedStatutes).toEqual(statutes);
 expect(retrievedCaseLaw).toEqual(caseLaw);
 });
 });
});




