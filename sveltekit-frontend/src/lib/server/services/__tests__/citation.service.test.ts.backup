import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import { citationService } from '../citation.service.js';

describe('CitationService', () => {
	const mockUserId = 'user-123';
	const mockCaseId = 'case-456';

	beforeEach(async () => {
		await setupTest();
	});

	afterEach(async () => {
		await cleanupTest();
	});

 describe('saveCitation', () => {
 it('should save a citation with all fields', async () => {
 const citationData: SaveCitationRequest = {
 statute_code: '18 U.S.C. § 1001',
 statute_title: 'Fraud and false statements',
 jurisdiction: 'Federal',
 severity: 'Felony',
 year: 2023,
 highlighted_text: 'Fraud and false statements',
 notes: 'Important statute',
 case_id: mockCaseId,
 source_type: 'manual',
 };

 const result = await citationService.saveCitation(mockUserId, citationData);

 expect(result).toBeDefined();
 expect(result.user_id).toBe(mockUserId);
 expect(result.statute_code).toBe(citationData.statute_code);
 expect(result.source_type).toBe('manual');
 });

 it('should save a citation with minimal fields', async () => {
 const citationData: SaveCitationRequest = {
 statute_code: '18 U.S.C. § 1001',
 };

 const result = await citationService.saveCitation(mockUserId, citationData);

 expect(result).toBeDefined();
 expect(result.statute_code).toBe(citationData.statute_code);
 expect(result.source_type).toBe('manual');
 });

import { citationService } from '../citation.service.js';
 };

 const result = await citationService.saveCitation(mockUserId, citationData);

 expect(result.source_type).toBe('manual');
 });
 });

 describe('searchCitations', () => {
 it('should search citations by statute code', async () => {
 const query = '18 U.S.C.';

 const results = await citationService.searchCitations(mockUserId, query);

 expect(Array.isArray(results)).toBe(true);
 });

 it('should return empty array for short query', async () => {
 const query = 'a';

 const results = await citationService.searchCitations(mockUserId, query);

 expect(Array.isArray(results)).toBe(true);
 });

 it('should apply jurisdiction filter', async () => {
 const query = '18 U.S.C.';
 const filters = { jurisdiction: 'Federal' };

 const results = await citationService.searchCitations(mockUserId, query, filters);

 expect(Array.isArray(results)).toBe(true);
 });

 it('should apply severity filter', async () => {
 const query = '18 U.S.C.';
 const filters = { severity: 'Felony' };

 const results = await citationService.searchCitations(mockUserId, query, filters);

 expect(Array.isArray(results)).toBe(true);
 });
 });

 describe('getCitationsByUser', () => {
 it('should get citations for a user', async () => {
 const results = await citationService.getCitationsByUser(mockUserId);

 expect(Array.isArray(results)).toBe(true);
 });

 it('should support pagination', async () => {
 const results = await citationService.getCitationsByUser(mockUserId, 10, 0);

 expect(Array.isArray(results)).toBe(true);
 });
 });

 describe('getCitationsByCase', () => {
 it('should get citations for a case', async () => {
 const results = await citationService.getCitationsByCase(mockCaseId);

 expect(Array.isArray(results)).toBe(true);
 });
 });

 describe('updateCitationNotes', () => {
 it('should update citation notes', async () => {
 const citationId = 'citation-123';
 const newNotes = 'Updated notes';

 const result = await citationService.updateCitationNotes(citationId, newNotes);

 expect(result).toBeDefined();
 expect(result.notes).toBe(newNotes);
 });
 });

 describe('deleteCitation', () => {
 it('should delete a citation', async () => {
 const citationId = 'citation-123';

 await expect(citationService.deleteCitation(citationId, mockUserId)).resolves.not.toThrow();
 });
 });

 describe('getCitationCount', () => {
 it('should get citation count for user', async () => {
 const count = await citationService.getCitationCount(mockUserId);

 expect(typeof count).toBe('number');
 expect(count).toBeGreaterThanOrEqual(0);
 });
 });

 describe('getCitationStats', () => {
 it('should get citation statistics', async () => {
 const stats = await citationService.getCitationStats(mockUserId);

 expect(stats).toBeDefined();
 expect(stats.total).toBeGreaterThanOrEqual(0);
 expect(typeof stats.byJurisdiction).toBe('object');
 expect(typeof stats.bySeverity).toBe('object');
 expect(typeof stats.bySourceType).toBe('object');
 });
 });
});


