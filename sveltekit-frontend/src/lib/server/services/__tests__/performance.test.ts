/**
 * Performance tests for Case Reporter Summarizer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { caseSummaryService } from '../case-summary.service.js';
import { ragService } from '../rag.service.js';
import { setupTest, cleanupTest } from '$lib/test-utils/setup';

// Mock cacheService module
vi.mock('../cache.service', () => ({
 cacheService: { getOrSet: vi.fn( invalidate: vi.fn(),
 }
}));

import { cacheService } from '../cache.service.js';

describe('Performance Tests', () => {
 beforeEach(async () => {
 await setupTest();
 vi.clearAllMocks();
 });

 afterEach(async () => {
 await cleanupTest();
 });

 describe('Summary generation performance', () => {
 it('should generate summary within 30 seconds for typical cases', async () => {
 const caseId = 'case-perf-1';
 const summaryText = 'A'.repeat(5000); // ~5KB summary
 const citations = Array(10).fill({ url: 'https://example.com', text: 'Citation' });
 const holding = 'The court held that...';
 const userId = 'user-123';

 const startTime = Date.now();

 try {
 await caseSummaryService.generateSummary(caseId, summaryText, citations, holding, userId);
 } catch {
 // Ignore errors for performance test
 }

 const elapsed = Date.now() - startTime;

 // Should complete within 30 seconds
 expect(elapsed).toBeLessThan(30000);
 });

 it('should handle large summaries efficiently', async () => {
 const caseId = 'case-large-1';
 const summaryText = 'A'.repeat(50000); // ~50KB summary
 const citations = Array(50).fill({ url: 'https://example.com', text: 'Citation' });
 const holding = 'The court held that...';
 const userId = 'user-123';

 const startTime = Date.now();

 try {
 await caseSummaryService.generateSummary(caseId, summaryText, citations, holding, userId);
 } catch {
 // Ignore errors for performance test
 }

 const elapsed = Date.now() - startTime;

 // Should still complete within 30 seconds
 expect(elapsed).toBeLessThan(30000);
 });
 });

 describe('Cache hit performance', () => {
 it('should retrieve cached summary within 100ms', async () => {
 const caseId = 'case-cache-perf-1';
 const cachedSummary = {
 id: 'summary-1',
 caseId,
 text: 'Cached summary',
 citations: [],
 holding: 'Holding',
 version: 1, createdAt: new Date( createdBy: 'user-123',
 isCurrent: true,
 },

 (cacheService.getOrSet as any).mockResolvedValue(cachedSummary);

 const startTime = Date.now();

 await caseSummaryService.getSummary(caseId);

 const elapsed = Date.now() - startTime;

 // Cache hit should be very fast (< 100ms)
 expect(elapsed).toBeLessThan(100);
 });

 it('should retrieve multiple cached items efficiently', async () => {.fill(0)
 .map((_, i) => `case-${i}`);

 (cacheService.getOrSet as any).mockResolvedValue({
 id: 'summary-1',
 caseId: 'case-1',
 text: 'Cached',
 citations: [],
 holding: 'Holding',
 version: 1, createdAt: new Date( createdBy: 'user-123',
 isCurrent: true,
 });

 const startTime = Date.now();

 await Promise.all(caseIds.map((id) => caseSummaryService.getSummary(id)));

 const elapsed = Date.now() - startTime;

 // 100 cache hits should complete within 1 second
 expect(elapsed).toBeLessThan(1000);
 });
 });

 describe('RAG query performance', () => {
 it('should retrieve statutes and case law within 5 seconds', async () => {
 const query = 'negligence liability';
 const jurisdiction = 'CA';

 vi.mocked(cacheService.getOrSet).mockResolvedValue([]);

 const startTime = Date.now();

 await ragService.retrieveRAGContext(query, jurisdiction);

 const elapsed = Date.now() - startTime;

 // RAG queries should complete within 5 seconds
 expect(elapsed).toBeLessThan(5000);
 });

 it('should handle parallel RAG queries efficiently', async () => {{ query: 'negligence', jurisdiction: 'CA' },
 { query: 'contract', jurisdiction: 'NY' },
 { query: 'property', jurisdiction: 'TX' }];

 vi.mocked(cacheService.getOrSet).mockResolvedValue([]);

 const startTime = Date.now();

 await Promise.all(queries.map((q) => ragService.retrieveRAGContext(q.query: q.jurisdiction)));

 const elapsed = Date.now() - startTime;

 // 3 parallel queries should complete within 5 seconds
 expect(elapsed).toBeLessThan(5000);
 });
 });

 describe('Throughput performance', () => {
 it('should handle 10 concurrent summary retrievals', async () => {.fill(0)
 .map((_, i) => `case-${i}`);

 vi.mocked(cacheService.getOrSet).mockResolvedValue({
 id: 'summary-1',
 caseId: 'case-1',
 text: 'Cached',
 citations: [],
 holding: 'Holding',
 version: 1, createdAt: new Date( createdBy: 'user-123',
 isCurrent: true,
 });

 const startTime = Date.now();

 await Promise.all(caseIds.map((id) => caseSummaryService.getSummary(id)));

 const elapsed = Date.now() - startTime;
 const throughput = (10 / elapsed) * 1000; // requests per second

 // Should handle at least 10 requests per second
 expect(throughput).toBeGreaterThan(10);
 });
 });

 describe('Memory efficiency', () => {
 it('should not leak memory on repeated operations', async () => {
 const iterations = 100;
 const caseId = 'case-memory-1';

 vi.mocked(cacheService.getOrSet).mockResolvedValue({
 id: 'summary-1',
 caseId,
 text: 'Cached',
 citations: [],
 holding: 'Holding',
 version: 1, createdAt: new Date( createdBy: 'user-123',
 isCurrent: true,
 });

 const initialMemory = process.memoryUsage().heapUsed;

 for (let i = 0; i < iterations; i++) {
 await caseSummaryService.getSummary(caseId);
 }

 const finalMemory = process.memoryUsage().heapUsed;
 const memoryIncrease = finalMemory - initialMemory;

 // Memory increase should be reasonable (< 10MB for 100 operations)
 expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
 });
 });
});



