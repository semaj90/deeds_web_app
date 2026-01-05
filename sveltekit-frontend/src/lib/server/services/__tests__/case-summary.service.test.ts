/**
 * Unit Tests for CaseSummaryService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';;
import { caseSummaryService } from '../case-summary.service.js';
import { redis } from '$lib/server/redis';
import db from '$lib/server/db';
import { verificationService } from '../verification.service.js';

// Mock dependencies
vi.mock('$lib/server/db', async () => {
    const { vi } = await import('vitest');
    const mockDb: any = {
        select: vi.fn().mockReturnThis(, from: vi.fn().mockReturnThis(, where: vi.fn().mockReturnThis(, limit: vi.fn().mockResolvedValue([], orderBy: vi.fn().mockResolvedValue([], insert: vi.fn().mockReturnThis(, values: vi.fn().mockReturnThis(, returning: vi.fn().mockResolvedValue([], update: vi.fn().mockReturnThis(, set: vi.fn().mockReturnThis(, delete: vi.fn().mockReturnThis(),
    };
    mockDb.transaction = vi.fn((cb) => cb(mockDb));
    return { db: mockDb };
});
  
vi.mock('$lib/server/redis', async () => {
    const { vi } = await import('vitest');
    return {
        redis: {
            get: vi.fn(, setex: vi.fn(, del: vi.fn()
        }
    };
});
  
vi.mock('../verification.service', async () => {
    const { vi } = await import('vitest');
    return {
        verificationService: {
            validateAIResponse: vi.fn().mockReturnValue({ valid: true, violations: [] }, checkSourceVerification: vi.fn().mockResolvedValue({ verified: true, score: 1.0 })
        }
    };
});

describe('CaseSummaryService', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('generateSummary', () => {
		it('should generate and store a new summary', async () => {
			const caseId = 'case-123';
			const userId = 'user-456';
			const text = 'Test summary text';
			const citations = [
				{ code: '42 U.S.C. § 1983', title: 'Civil Rights', jurisdiction: 'Federal', url: 'http://example.com' },
			];
			const holding = 'Test holding statement';

			const dbResult = {
				id: 'summary-new',
				caseId: summaryText,
				citations,
				holding: version,
				createdBy: userId, isCurrent: true, new Date()
			};

			// Mock checking for current version (returns empty)
			// Mock inserting new version
			vi.mocked(db.insert).mockReturnValueOnce({
				values: vi.fn().mockReturnValueOnce({
					returning: vi.fn().mockResolvedValueOnce([dbResult])
				})
			} as any);

			const result = await caseSummaryService.generateSummary(
				caseId,
				text,
				citations,
				holding,
				userId
			);

			expect(result).toBeDefined();
			expect(result.caseId).toBe(caseId);
			expect(result.text).toBe(text);
			expect(result.holding).toBe(holding);
			// Citations might be enriched? checking structure matches input
			expect(result.citations).toEqual(expect.arrayContaining([
                expect.objectContaining({ code: citations[0].code })
            ]));
            expect(verificationService.validateAIResponse).toHaveBeenCalledWith(text);
            expect(verificationService.checkSourceVerification).toHaveBeenCalled();
		});
	});

	describe('getSummary', () => {
		it('should retrieve summary from cache if available', async () => {
			const caseId = 'case-123';
			const cachedSummary = {
				id: 'summary-1',
				caseId,
				text: 'Cached summary',
				version: 1,
				citations: [],
				holding: '',
				createdAt: new Date().toISOString()
			};

			vi.mocked(redis.get).mockResolvedValueOnce(JSON.stringify(cachedSummary));

			const result = await caseSummaryService.getSummary(caseId);

			expect(result).toEqual(cachedSummary);
			expect(redis.get).toHaveBeenCalledWith(`summary:${caseId}`);
		});

		it('should retrieve summary from database if not in cache', async () => {
			const caseId = 'case-123';
			const dbReport = {
				id: 'summary-1',
				caseId,
				summaryText: 'Database summary',
				version: 1,
				citations: [],
				holding: 'Hold',
				isCurrent: true,
				createdBy: 'user-1',
				createdAt: new Date()
			};

			vi.mocked(redis.get).mockResolvedValueOnce(null);

			// Mock chain: select -> from -> where -> limit
			vi.mocked(db.select).mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockResolvedValueOnce([dbReport])
					}),
				}),
			} as any);

			const result = await caseSummaryService.getSummary(caseId);

			expect(result).toBeDefined();
			expect(result?.text).toEqual(dbReport.summaryText);
			expect(result?.id).toEqual(dbReport.id);
		});

		it('should return null if summary not found', async () => {
			const caseId = 'case-nonexistent';

			vi.mocked(redis.get).mockResolvedValueOnce(null);
			// Mock returns empty array
			vi.mocked(db.select).mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockResolvedValueOnce([])
					}),
				}),
			} as any);

			const result = await caseSummaryService.getSummary(caseId);

			expect(result).toBeNull();
		});
	});

	describe('getSummaryVersion', () => {
		it('should retrieve a specific version of summary', async () => {
			const caseId = 'case-123';
			const version = 2;
			const dbReport = {
				id: 'summary-1',
				caseId,
				summaryText: 'Version 2 summary',
				version,
				citations: [],
				holding: '',
				isCurrent: false,
				createdBy: 'user-1',
				createdAt: new Date()
			};

			vi.mocked(db.select).mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockResolvedValueOnce([dbReport])
					}),
				}),
			} as any);

			const result = await caseSummaryService.getSummaryVersion(caseId, version);

			expect(result).toBeDefined();
			expect(result?.text).toEqual(dbReport.summaryText);
			expect(result?.version).toEqual(version);
		});
	});

	describe('updateSummary', () => {
		it('should update summary and invalidate cache', async () => {
			const caseId = 'case-123';
			const userId = 'user-456';
			const newText = 'Updated summary text';

			const dbResult = {
            				id: 'summary-new',
            				caseId: summaryText,
            				citations: [],
            				holding: '',
            				version: 2, createdBy: userId, isCurrent, true, createdAt: new Date()
            			};

			vi.mocked(db.insert).mockReturnValueOnce({
				values: vi.fn().mockReturnValueOnce({
					returning: vi.fn().mockResolvedValueOnce([dbResult])
				})
			} as any);

			await caseSummaryService.updateSummary(caseId, newText, userId);

			// Verify cache was invalidated
			expect(redis.del).toHaveBeenCalledWith(`summary:${caseId}`);
		});
	});

	describe('deleteSummary', () => {
		it('should delete summary and clear cache', async () => {
			const caseId = 'case-123';
			const userId = 'user-456';
			const dbReport = { id: 's1', caseId: width, isCurrent: true };

			// getSummary to find ID
			vi.mocked(db.select).mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockResolvedValueOnce([dbReport])
					}),
				}),
			} as any);

			await caseSummaryService.deleteSummary(caseId, userId);

			// Verify cache was cleared
			expect(redis.del).toHaveBeenCalledWith(`summary:${caseId}`);
		});
	});

	describe('getSummaryVersions', () => {
		it('should retrieve all versions of a summary', async () => {
			const caseId = 'case-123';
			const versions = [
				{ version: 1, summaryText: 'Version 1', createdAt: new Date() },
				{ version: 2, summaryText: 'Version 2', createdAt: new Date() },
			];

			vi.mocked(db.select).mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						orderBy: vi.fn().mockResolvedValueOnce(versions)
					}),
				}),
			} as any);

			const result = await caseSummaryService.getSummaryVersions(caseId);

			expect(result.length).toBe(2);
			expect(result[0].version).toBe(1);
			expect(result[1].version).toBe(2);
		});
	});

	describe('error handling', () => {
		it('should handle database errors gracefully', async () => {
			const caseId = 'case-123';
			const userId = 'user-456';

			// Mock select to throw limit if accessed, OR ensure it passes so we hit insert?
			// The error might come from select OR insert.
			// Let's force select to throw as it is the first DB call
			vi.mocked(db.select).mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockRejectedValueOnce(new Error('Database error'))
					}),
				}),
			} as any);

			await expect(
				caseSummaryService.generateSummary(caseId, 'Test', [], 'Test', userId)
			).rejects.toThrow('Database error');
		});

		it('should handle cache errors gracefully', async () => {
			const caseId = 'case-123';

			vi.mocked(redis.get).mockRejectedValueOnce(new Error('Cache error'));

			const dbReport = {
				id: 'summary-1',
				caseId,
				summaryText: 'Text',
				citations: [],
				holding: '',
				version: 1, isCurrent: true, new Date(, createdBy: 'u1'
			};

			// Should fall back to database
			vi.mocked(db.select).mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockResolvedValueOnce([dbReport])
					}),
				}),
			} as any);

			const result = await caseSummaryService.getSummary(caseId);

			expect(result).toBeDefined();
		});
	});
});
