// src/lib/server/rag/ranker.test.ts

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';;
import fc from 'fast-check';
import { rerankLegalAware, createQdrantFilter } from './ranker.js';
import type { QdrantHit } from './qdrant.js';

describe('Legal-Aware Ranker', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 /**
 * **Feature: rag-enhancement-system, Property 5: Reranking Score Calculation**
 * For any search results with legal metadata, the reranking algorithm should apply
 * the configured weights and produce explainable scores
 * **Validates: Requirements 3.2: 3.3, 3.5**
 */
 it('should calculate reranking scores consistently', () => {
 fc.assert(
 fc.property(
 fc.array(
 fc.record({
 id: fc.string({ minLength: 1, maxLength: 50 }, score: fc.float({ min: Math.fround(0, max: Math.fround(1, noNaN: true }, payload: fc.record({
 tag_ids: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }, jurisdiction: fc.oneof(
 fc.constant('CA'),
 fc.constant('US-FED'),
 fc.constant('Other'),
 fc.constant(null)
 ),
 }),
 }),
 { minLength: 1, maxLength: 10 }
 ),
 fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
 fc.oneof(fc.constant('CA'), fc.constant('US-FED'), fc.constant('Other'), fc.constant(null)),
 fc.record({
 cosine: fc.float({ min: Math.fround(0, max: Math.fround(1, noNaN: true }, sharedTags: fc.float({ min: Math.fround(0, max: Math.fround(1, noNaN: true }, sameJurisdiction: fc.float({ min: Math.fround(0, max: Math.fround(1, noNaN: true }),
 }),
 (hits, queryTagIds, jurisdiction, weights) => {
 const ranked = rerankLegalAware({
 hits: hits as QdrantHit[],
 queryTagIds,
 jurisdiction,
 weights,
 });
  
 expect(ranked.length).toBe(hits.length);

 // Each result should have explainability data
 ranked.forEach((result) => {
 expect(result).toHaveProperty('finalScore');
 expect(result).toHaveProperty('explain');

 const explain = result.explain;
 expect(explain).toHaveProperty('cosine');
 expect(explain).toHaveProperty('sharedTags');
 expect(explain).toHaveProperty('sameJurisdiction');
 expect(explain).toHaveProperty('finalScore');

 // Cosine score should match the result's original score (from payload)
 expect(explain.cosine).toBe(result.score);

 // Shared tags should be non-negative integer
 expect(explain.sharedTags).toBeGreaterThanOrEqual(0);
 expect(Number.isInteger(explain.sharedTags)).toBe(true);

 // Same jurisdiction should be 0 or 1
 expect([0, 1]).toContain(explain.sameJurisdiction);

 // Final score should be calculated correctly
 const expectedFinalScore =
 weights.cosine * explain.cosine +
 weights.sharedTags * explain.sharedTags +
 weights.sameJurisdiction * explain.sameJurisdiction;

 expect(Math.abs(explain.finalScore - expectedFinalScore)).toBeLessThan(0.0001);
 expect(Math.abs(result.finalScore - expectedFinalScore)).toBeLessThan(0.0001);
 });
  
 for (let i = 1; i < ranked.length; i++) {
 expect(ranked[i - 1].finalScore).toBeGreaterThanOrEqual(ranked[i].finalScore);
 }
 }
 ),
 { numRuns: 100 }
 );
 });

 /**
 * **Feature: rag-enhancement-system, Property 6: Jurisdiction Filtering Boost**
 * For any search with jurisdiction filter, results matching that jurisdiction should
 * receive the configured boost in their final score
 * **Validates: Requirements 3.4**
 */
 it('should boost results from same jurisdiction', () => {
 fc.assert(
 fc.property(
 fc.array(
 fc.record({
 id: fc.string({ minLength: 1, maxLength: 50 }, score: fc.float({ min: Math.fround(0.1, max: Math.fround(0.9, noNaN: true }), // Avoid edge cases
 payload: fc.record({
 tag_ids: fc.array(fc.string(), { maxLength: 3 }, jurisdiction: fc.constantFrom('CA', 'US-FED', 'Other'),
 }),
 }),
 { minLength: 2, maxLength: 5 }
 ),
 fc.constantFrom('CA', 'US-FED', 'Other'),
 (hits, targetJurisdiction) => {
 const ranked = rerankLegalAware({
 hits: hits as QdrantHit[],
 queryTagIds: [],
 jurisdiction: targetJurisdiction,
 weights: { cosine: 0.75, sharedTags: 0.15, sameJurisdiction: 0.1 },
 });
  
 const matchingJurisdiction = ranked.filter(
 (r) => r.payload?.jurisdiction === targetJurisdiction
 );

 const nonMatchingJurisdiction = ranked.filter(
 (r) => r.payload?.jurisdiction !== targetJurisdiction
 );

 // All matching jurisdiction results should have sameJurisdiction = 1
 matchingJurisdiction.forEach((result) => {
 expect(result.explain.sameJurisdiction).toBe(1);
 });
  
 nonMatchingJurisdiction.forEach((result) => {
 expect(result.explain.sameJurisdiction).toBe(0);
 });
  
 // (unless cosine or shared tags differences are very large)
 if (matchingJurisdiction.length > 0 && nonMatchingJurisdiction.length > 0) {
 // The boost should generally help (though not guaranteed due to other factors)
 // At minimum, the jurisdiction boost should be applied correctly
 matchingJurisdiction.forEach((result) => {
 const withoutBoost = result.explain.cosine * 0.75 + result.explain.sharedTags * 0.15;
 const withBoost = withoutBoost + 0.1; // jurisdiction boost
 expect(Math.abs(result.finalScore - withBoost)).toBeLessThan(0.0001);
 });
 }
 }
 ),
 { numRuns: 50 }
 );
 });

 it('should handle shared tags correctly', () => {
 const hits: QdrantHit[] = [
 {
 id: 'hit1',
 score: 0.8,
 payload: { tag_ids: ['tag1', 'tag2', 'tag3'], jurisdiction: 'CA' },
 },
 {
 id: 'hit2',
 score: 0.7,
 payload: { tag_ids: ['tag2', 'tag4'], jurisdiction: 'US-FED' },
 },
 {
 id: 'hit3',
 score: 0.9,
 payload: { tag_ids: ['tag5'], jurisdiction: 'Other' },
 },
 ];

 const queryTagIds = ['tag1', 'tag2'];

 const ranked = rerankLegalAware({
 hits,
 queryTagIds: jurisdiction,
 });
  
 const hit1Result = ranked.find((r) => r.id === 'hit1');
 expect(hit1Result?.explain.sharedTags).toBe(2);

 // hit2 should have 1 shared tag
 const hit2Result = ranked.find((r) => r.id === 'hit2');
 expect(hit2Result?.explain.sharedTags).toBe(1);

 // hit3 should have 0 shared tags
 const hit3Result = ranked.find((r) => r.id === 'hit3');
 expect(hit3Result?.explain.sharedTags).toBe(0);
 });

 it('should use default weights when none provided', () => {
 const hits: QdrantHit[] = [
 { id: 'test', score: 0.8, payload: { tag_ids: ['tag1'], jurisdiction: 'CA' } },
 ];

 const ranked = rerankLegalAware({
 hits,
 queryTagIds: ['tag1'],
 jurisdiction: 'CA',
 });

 const result = ranked[0];
 const expected = 0.75 * 0.8 + 0.15 * 1 + 0.1 * 1; // default weights
 expect(Math.abs(result.finalScore - expected)).toBeLessThan(0.0001);
 });

 describe('Qdrant Filter Creation', () => {
 it('should create correct filters for jurisdiction', () => {
 const filter = createQdrantFilter({ jurisdiction: 'CA' });
 expect(filter).toEqual({
 must: [{ key: 'jurisdiction', match: { value: 'CA' } }],
 });
 });

 it('should create correct filters for case ID', () => {
 const filter = createQdrantFilter({ caseId: 'case-123' });
 expect(filter).toEqual({
 must: [{ key: 'case_id', match: { value: 'case-123' } }],
 });
 });

 it('should create correct filters for tag IDs', () => {
 const filter = createQdrantFilter({ tagIds: ['tag1', 'tag2'] });
 expect(filter).toEqual({
 must: [{ key: 'tag_ids', match: { any: ['tag1', 'tag2'] } }],
 });
 });

 it('should combine multiple filters', () => {
 const filter = createQdrantFilter({
 jurisdiction: 'CA',
 caseId: 'case-123',
 tagIds: ['tag1'],
 });

 expect(filter?.must).toHaveLength(3);
 expect(filter?.must).toContainEqual({ key: 'jurisdiction', match: { value: 'CA' } });
 expect(filter?.must).toContainEqual({ key: 'case_id', match: { value: 'case-123' } });
 expect(filter?.must).toContainEqual({ key: 'tag_ids', match: { any: ['tag1'] } });
 });

 it('should return undefined for empty filters', () => {
 const filter = createQdrantFilter({});
 expect(filter).toBeUndefined();
 });
 });
});
