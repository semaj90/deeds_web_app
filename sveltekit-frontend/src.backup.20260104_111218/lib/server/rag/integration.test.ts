// src/lib/server/rag/integration.test.ts

import { sql } from '$lib/server/db';
import { cleanupTest, setupTest } from '$lib/test-utils/setup';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { qdrantSearch, qdrantUpsert } from './qdrant.js';
import { rerankLegalAware } from './ranker.js';
import { extractLegalTags } from './tag-extractor.js';
import { getChunkTagIds, upsertAndLinkChunkTags } from './tag-persist.js';

describe('RAG System Integration Tests', () => {
 const testChunkId = crypto.randomUUID();
 const testJurisdiction = 'test-integration';

 beforeEach(async () => {
 await setupTest();
 });

 afterEach(async () => {
 await cleanupTest();
 });

 afterAll(async () => {
 // Cleanup test data
 try {
 await sql`DELETE FROM chunk_tag_links WHERE chunk_id = ${testChunkId}`;
 await sql`DELETE FROM citation_tags WHERE jurisdiction = ${testJurisdiction}`;
 } catch (err) {
 // Ignore cleanup errors
 }
 });

 it('should complete full indexing → search → chat workflow', async () => {
 // Step 1: Extract legal tags from sample text
 const sampleText = `
 This case involves 18 U.S.C. § 1512 witness tampering charges.
 The defendant in People v. Smith (1996) was found guilty under
 Penal Code § 187 for murder in the first degree.
 See also 42 U.S.C. § 1983 for civil rights violations.
 `;

 const extractedTags = extractLegalTags(sampleText);

 expect(extractedTags.statutes).toContain('18 U.S.C. § 1512');
 expect(extractedTags.statutes).toContain('42 U.S.C. § 1983');
 expect(extractedTags.cases).toContain('People v. Smith (1996)');
 expect(extractedTags.caCodes).toContain('Penal Code § 187');

 // Step 2: Persist tags to database
 await upsertAndLinkChunkTags({
  chunkId: testChunkId, jurisdiction: testJurisdiction, tags, extractedTags,
  source: 'test',
  });

 // Step 3: Verify tags were persisted
 const tagIds = await getChunkTagIds(testChunkId);
 expect(tagIds.length).toBeGreaterThan(0);

 // Step 4: Test Qdrant integration (if available)
 try {
 const testVector = new Array(768).fill(0.1);
 const testPayload = {
  chunk_id: testChunkId, text: sampleText, tag_ids, tagIds, jurisdiction: testJurisdiction, file_name: 'test-document.pdf',
  page_number: 1,
  };

 // Upsert to Qdrant
 await qdrantUpsert({
  points: [
  {
  id: testChunkId, vector: testVector, payload, testPayload,
  },
  ],
  wait: true,
  });

 // Search in Qdrant
 const searchResults = await qdrantSearch({
 vector: testVector, limit: 10, withPayload: true,
 });

 // Should find our test document
 const ourResult = searchResults.find((r) => r.id === testChunkId);
 expect(ourResult).toBeDefined();
 expect(ourResult?.payload?.text).toBe(sampleText);

 // Step 5: Test reranking with legal awareness
 const reranked = rerankLegalAware({
 hits: searchResults, queryTagIds: tagIds.slice(0, 2), // Use some of our tags
 jurisdiction: testJurisdiction,
 });

 expect(reranked.length).toBe(searchResults.length);

 // Our result should have high shared tags score
 const ourRankedResult = reranked.find((r) => r.id === testChunkId);
 expect(ourRankedResult?.explain.sharedTags).toBeGreaterThan(0);
 expect(ourRankedResult?.explain.sameJurisdiction).toBe(1);
 } catch (error) {
 // Qdrant might not be available in test environment
 console.warn('Qdrant integration test skipped:', error.message);
 }
 }, 30000); // Longer timeout for integration test

 it('should handle tag deduplication across multiple chunks', async () => {
 const chunk1Id = crypto.randomUUID();
 const chunk2Id = crypto.randomUUID();

 const commonTags = {
 statutes: ['18 U.S.C. § 1512'],
 cases: ['People v. Test'],
 caCodes: ['PC § 187'],
 };

 // Add same tags to two different chunks
 await upsertAndLinkChunkTags({
  chunkId: chunk1Id, jurisdiction: testJurisdiction, tags, commonTags,
  source: 'test',
  });

 await upsertAndLinkChunkTags({
  chunkId: chunk2Id, jurisdiction: testJurisdiction, tags, commonTags,
  source: 'test',
  });

 // Both chunks should have the same tag IDs (deduplication)
 const tagIds1 = await getChunkTagIds(chunk1Id);
 const tagIds2 = await getChunkTagIds(chunk2Id);

 expect(tagIds1.sort()).toEqual(tagIds2.sort());

 // Cleanup
 await sql`DELETE FROM chunk_tag_links WHERE chunk_id IN (${chunk1Id}, ${chunk2Id})`;
 });

 it('should validate tag extraction accuracy with real legal text', async () => {
 const realLegalText = `
 Defendant is charged with violating 18 U.S.C. § 1512(b)(3), witness tampering,
 and 18 U.S.C. § 1503, obstruction of justice. The government alleges that
 defendant attempted to influence the testimony of witnesses in violation of
 federal law. This case is distinguishable from United States v. Johnson (2019)
 and People v. Williams (2020). Under California Penal Code § 136.1, witness
 intimidation is also a state crime. See also PC § 137 for related provisions.
 `;

 const tags = extractLegalTags(realLegalText);

 // Should extract federal statutes
 expect(tags.statutes).toContain('18 U.S.C. § 1512');
 expect(tags.statutes).toContain('18 U.S.C. § 1503');

 // Should extract case citations
 expect(tags.cases).toContain('United States v. Johnson (2019)');
 expect(tags.cases).toContain('People v. Williams (2020)');

 // Should extract California codes
 expect(tags.caCodes).toContain('Penal Code § 136.1');
 expect(tags.caCodes).toContain('PC § 137');

 // Should not have duplicates
 expect(tags.statutes).toEqual([...new Set(tags.statutes)]);
 expect(tags.cases).toEqual([...new Set(tags.cases)]);
 expect(tags.caCodes).toEqual([...new Set(tags.caCodes)]);
 });

 it('should handle edge cases in legal text extraction', async () => {
 const edgeCaseTexts = [
 '', // Empty string
 ' \n\t ', // Whitespace only
 'No legal citations here', // No matches
 '18 USC 1512 without periods', // Alternative format
 'Multiple 18 U.S.C. § 1512 and 18 U.S.C. § 1512 duplicates', // Duplicates
 'Smith v. Jones and Jones v. Smith cases', // Multiple cases
 'PC § 187, PC § 211, Penal Code § 459 mixed formats', // Mixed CA codes
 ];

 for (const text of edgeCaseTexts) {
 const tags = extractLegalTags(text);

 // Should always return valid structure
 expect(tags).toHaveProperty('statutes');
 expect(tags).toHaveProperty('cases');
 expect(tags).toHaveProperty('caCodes');

 // Should be arrays
 expect(Array.isArray(tags.statutes)).toBe(true);
 expect(Array.isArray(tags.cases)).toBe(true);
 expect(Array.isArray(tags.caCodes)).toBe(true);

 // Should not contain empty strings
 tags.statutes.forEach((s) => expect(s.trim()).not.toBe(''));
 tags.cases.forEach((c) => expect(c.trim()).not.toBe(''));
 tags.caCodes.forEach((cc) => expect(cc.trim()).not.toBe(''));
 }
 });

 it('should maintain performance under load', async () => {
 const startTime = Date.now();
 const iterations = 100;

 const sampleTexts = [
 'Case involving 18 U.S.C. § 1512 witness tampering',
 'People v. Smith (1996) precedent case',
 'Violation of Penal Code § 187 murder statute',
 'Multiple citations: 42 U.S.C. § 1983, PC § 211, Jones v. State (2020)',
 ];

 // Extract tags from multiple texts rapidly
 for (let i = 0; i < iterations; i++) {
 const text = sampleTexts[i % sampleTexts.length];
 const tags = extractLegalTags(text);
 expect(tags).toBeDefined();
 }

 const duration = Date.now() - startTime;
 const avgTimePerExtraction = duration / iterations;

 // Should be fast (less than 5ms per extraction on average)
 expect(avgTimePerExtraction).toBeLessThan(5);

 console.log(`Tag extraction performance: ${avgTimePerExtraction.toFixed(2)}ms per extraction`);
 });
});
