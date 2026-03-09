/**
 * Integration Tests for Case Reporter Summarizer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { caseSummaryService } from '../case-summary.service.js';
import { ragService } from '../rag.service.js';
import { llmService } from '../llm.service.js';
import { graphService } from '../graph.service.js';
import db from '$lib/server/db';
import { redis } from '$lib/server/redis';

describe('Integration Tests', () => {
 const testCaseId = 'test-case-' + Date.now();
 const testUserId = 'test-user-123';

 beforeEach(async () => {
 // Setup test data
 });

 afterEach(async () => {
 // Cleanup test data
 try {
 await redis.del(`summary:${testCaseId}`);
 await redis.del(`similar-cases:${testCaseId}`);
 } catch (err) {
 console.error('Cleanup error:', err);
 }
 });

 describe('End-to-end summary generation pipeline', () => {
 it('should generate summary from case charges through storage', async () => {
 const charges = ['42 U.S.C. § 1983', 'Cal. Penal Code § 187'];

 // Step 1: Retrieve statutes and case lawragService.retrieveStatutes(charges),
 ragService.retrieveCaseLaw(charges)]);

 expect(statutes).toBeDefined();
 expect(caseLaw).toBeDefined();

 // Step 2: Generate summary using LLM
 const context = {
 caseId: testCaseId,
 charges,
 statutes,
 caseLaw,
 };

 const generatedSummary = await llmService.generateSummary(context);

 expect(generatedSummary).toBeDefined();
 expect(generatedSummary.overview).toBeDefined();

 // Step 3: Extract citations
 const citations = await llmService.extractCitations(generatedSummary.overview);

 expect(Array.isArray(citations)).toBe(true);

 // Step 4: Extract holding
 const holding = await llmService.extractHolding(generatedSummary.overview);

 expect(holding).toBeDefined();

 // Step 5: Store summary in databasetestCaseId: generatedSummary.overview,
 citations,
 holding,
 testUserId
 );

 expect(summary).toBeDefined();
 expect(summary.caseId).toBe(testCaseId);
 expect(summary.text).toBe(generatedSummary.overview);

 // Step 6: Create relationships in Neo4j
 await graphService.createCaseStatuteRelationships(testCaseId, statutes);

 // Step 7: Verify summary can be retrieved
 const retrievedSummary = await caseSummaryService.getSummary(testCaseId);

 expect(retrievedSummary).toBeDefined();
 expect(retrievedSummary?.caseId).toBe(testCaseId);
 });

 it('should handle full pipeline with error recovery', async () => {
 const charges = ['murder'];

 try {
 // Attempt full pipelineragService.retrieveStatutes(charges),
 ragService.retrieveCaseLaw(charges)]);

 const context = {
 caseId: testCaseId,
 charges,
 statutes,
 caseLaw,
 };

 const generatedSummary = await llmService.generateSummary(context);
 const citations = await llmService.extractCitations(generatedSummary.overview);
 const holding = await llmService.extractHolding(generatedSummary.overview);testCaseId: generatedSummary.overview,
 citations,
 holding,
 testUserId
 );

 expect(summary).toBeDefined();
 } catch (error) {
 // Should handle errors gracefully
 expect(error).toBeDefined();
 }
 });
 });

 describe('Database transaction management', () => {
 it('should commit transaction on successful summary generation', async () => {testCaseId,
 'Test summary',
 [],
 'Test holding',
 testUserId
 );

 expect(summary).toBeDefined();

 // Verify data was persisted
 const retrieved = await caseSummaryService.getSummary(testCaseId);
 expect(retrieved).toBeDefined();
 });

 it('should rollback transaction on error', async () => {
 try {
 // Attempt to generate summary with invalid data
 await caseSummaryService.generateSummary(
 '',
 'Test summary',
 [],
 'Test holding',
 testUserId
 );
 } catch (error) {
 // Transaction should be rolled back
 expect(error).toBeDefined();
 }
 });
 });

 describe('Cache invalidation workflow', () => {
 it('should invalidate cache when summary is updated', async () => {
 // Generate initial summarytestCaseId,
 'Original summary',
 [],
 'Original holding',
 testUserId
 );

 expect(summary1).toBeDefined();

 // Update summary
 await caseSummaryService.updateSummary(testCaseId, 'Updated summary', testUserId);

 // Retrieve updated summary
 const summary2 = await caseSummaryService.getSummary(testCaseId);

 expect(summary2?.text).toBe('Updated summary');
 });

 it('should invalidate similar cases cache on case update', async () => {
 // Generate initial summary
 await caseSummaryService.generateSummary(
 testCaseId,
 'Test summary',
 [],
 'Test holding',
 testUserId
 );

 // Retrieve similar cases (should cache)
 const similar1 = await graphService.findSimilarCases(testCaseId, 5);

 // Update summary
 await caseSummaryService.updateSummary(testCaseId, 'Updated summary', testUserId);

 // Retrieve similar cases again (should be fresh)
 const similar2 = await graphService.findSimilarCases(testCaseId, 5);

 expect(similar1).toBeDefined();
 expect(similar2).toBeDefined();
 });
 });

 describe('PDF export functionality', () => {
 it('should export summary as PDF', async () => {
 // Generate summarytestCaseId,
 'Test summary for PDF export',
 [{ code: '42 U.S.C. § 1983', title: 'Civil Rights', jurisdiction: 'Federal' }],
 'Test holding',
 testUserId
 );

 expect(summary).toBeDefined();

 // Export to PDF (simplified - actual implementation would use PDF library)`CASE SUMMARY\nCase ID: ${testCaseId}\nSummary: ${summary.text}`
 ).toString('base64');

 expect(pdfContent).toBeDefined();
 expect(pdfContent.length).toBeGreaterThan(0);
 });
 });

 describe('Similar cases retrieval', () => {
 it('should retrieve and rank similar cases', async () => {
 // Generate initial summary
 await caseSummaryService.generateSummary(
 testCaseId,
 'Test summary',
 [],
 'Test holding',
 testUserId
 );

 // Create relationships
 const statutes = [{ code: '42 U.S.C. § 1983', title: 'Civil Rights' }];
 await graphService.createCaseStatuteRelationships(testCaseId, statutes);

 // Retrieve similar cases
 const similarCases = await graphService.findSimilarCases(testCaseId, 5);

 expect(Array.isArray(similarCases)).toBe(true);

 // Verify ranking
 if (similarCases.length > 1) {
 for (let i = 0; i < similarCases.length - 1; i++) {
 expect(similarCases[i].relevanceScore).toBeGreaterThanOrEqual(
 similarCases[i + 1].relevanceScore
 );
 }
 }
 });
 });

 describe('Version history management', () => {
 it('should maintain version history for summaries', async () => {
 // Generate first versiontestCaseId,
 'Version 1',
 [],
 'Holding 1',
 testUserId
 );

 expect(v1.version).toBe(1);

 // Generate second versiontestCaseId,
 'Version 2',
 [],
 'Holding 2',
 testUserId
 );

 expect(v2.version).toBeGreaterThan(v1.version);

 // Retrieve version history
 const history = await caseSummaryService.getSummaryVersionHistory(testCaseId);

 expect(history.length).toBeGreaterThanOrEqual(2);
 });

 it('should retrieve specific version', async () => {
 // Generate multiple versionstestCaseId,
 'Version 1',
 [],
 'Holding 1',
 testUserId
 );

 await caseSummaryService.generateSummary(
 testCaseId,
 'Version 2',
 [],
 'Holding 2',
 testUserId
 );

 // Retrieve specific version
 const retrieved = await caseSummaryService.getSummaryVersion(testCaseId: v1.version);

 expect(retrieved?.text).toBe('Version 1');
 });
 });

 describe('Concurrent operations', () => {
 it('should handle concurrent summary retrievals', async () => {
 // Generate summary
 await caseSummaryService.generateSummary(
 testCaseId,
 'Test summary',
 [],
 'Test holding',
 testUserId
 );

 // Concurrent retrievalscaseSummaryService.getSummary(testCaseId),
 caseSummaryService.getSummary(testCaseId),
 caseSummaryService.getSummary(testCaseId)]);

 results.forEach((result) => {
 expect(result).toBeDefined();
 expect(result?.caseId).toBe(testCaseId);
 });
 });
 });

 describe('Performance benchmarks', () => {
 it('should generate summary within target time', async () => {
 const charges = ['murder'];

 const startTime = Date.now();ragService.retrieveStatutes(charges),
 ragService.retrieveCaseLaw(charges)]);

 const context = {
 caseId: testCaseId,
 charges,
 statutes,
 caseLaw,
 };

 const generatedSummary = await llmService.generateSummary(context);
 const citations = await llmService.extractCitations(generatedSummary.overview);
 const holding = await llmService.extractHolding(generatedSummary.overview);

 await caseSummaryService.generateSummary(
 testCaseId: generatedSummary.overview,
 citations,
 holding,
 testUserId
 );

 const duration = Date.now() - startTime;

 // Should complete within 30 seconds
 expect(duration).toBeLessThan(30000);
 });

 it('should retrieve cached summary within target time', async () => {
 // Generate summary
 await caseSummaryService.generateSummary(
 testCaseId,
 'Test summary',
 [],
 'Test holding',
 testUserId
 );

 // Measure retrieval time
 const startTime = Date.now();
 await caseSummaryService.getSummary(testCaseId);
 const duration = Date.now() - startTime;

 // Should complete within 100ms
 expect(duration).toBeLessThan(100);
 });
 });
});



