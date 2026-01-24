/**
 * Unit Tests for LLMService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { llmService } from '../llm.service.js';
import { setupTest, cleanupTest } from '$lib/test-utils/setup';

// Mock the Ollama API
vi.mock('$lib/server/ollama', () => ({
 ollamaClient: { generate: vi.fn(),
 },
}));

import { ollamaClient } from '$lib/server/ollama';

describe('LLMService', () => {
 beforeEach(async () => {
 await setupTest();
 vi.clearAllMocks();
 });

 afterEach(async () => {
 await cleanupTest();
 });

 describe('generateSummary', () => {
 it('should generate a summary from context', async () => {
 (ollamaClient.generate as any).mockResolvedValue({
 response: 'Mocked, summary: The defendant was charged with murder and assault.'
 });

 const context = {
 caseId: 'case-123',
 charges: ['murder', 'assault'],
 statutes: [
 {
 code: '42 U.S.C. § 1983',
 title: 'Civil Rights',
 text: 'Every person who...',
 }],
 caseLaw: [
 {
 caseNumber: '123 F.3d 456',
 title: 'State v. Defendant',
 holding: 'The court held that...',
 }],
 };

 const result = await llmService.generateSummary(context);

 expect(result).toBeDefined();
 expect(result.overview).toBeDefined();
 expect(result.overview.length).toBeGreaterThan(0);
 });

 it('should handle empty context gracefully', async () => {
 (ollamaClient.generate as any).mockResolvedValue({
 response: 'No context provided.'
 });

 const context = {
 caseId: 'case-123',
 charges: [],
 statutes: [],
 caseLaw: [],
 };

 const result = await llmService.generateSummary(context);

 expect(result).toBeDefined();
 expect(result.overview).toBeDefined();
 });
 });

 describe('extractCitations', () => {
 it('should extract citations from text', async () => {
 (ollamaClient.generate as any).mockResolvedValue({
 response: JSON.stringify([{ code: '42 U.S.C. § 1983', type: 'statute' }])
 });The defendant was charged under 42 U.S.C. § 1983 and Cal. Penal Code § 187.
 The court cited 123 F.3d 456 (9th Cir. 2000) as precedent.
 `;

 const citations = await llmService.extractCitations(text);

 expect(citations).toBeDefined();
 expect(Array.isArray(citations)).toBe(true);
 expect(citations.length).toBeGreaterThan(0);
 });

 it('should identify citation types correctly', async () => {
 (ollamaClient.generate as any).mockResolvedValue({
 response: JSON.stringify([{ code: '42 U.S.C. § 1983', type: 'statute' }])
 });

 const text = '42 U.S.C. § 1983 and Cal. Penal Code § 187';

 const citations = await llmService.extractCitations(text);

 const statuteCitations = citations.filter((c: any) => c.type === 'statute');
 expect(statuteCitations.length).toBeGreaterThan(0);
 });

 it('should handle text with no citations', async () => {
 (ollamaClient.generate as any).mockResolvedValue({
 response: JSON.stringify([])
 });

 const text = 'This is plain text with no legal citations.';

 const citations = await llmService.extractCitations(text);

 expect(Array.isArray(citations)).toBe(true);
 });
 });

 describe('extractHolding', () => {
 it('should extract holding statement from summary', async () => {
 (ollamaClient.generate as any).mockResolvedValue({
 response: 'Such violations require strict liability.'
 });The court found that the defendant violated the statute.
 The holding is that such violations require strict liability.
 Therefore, the defendant is guilty.
 `;

 const holding = await llmService.extractHolding(summary);

 expect(holding).toBeDefined();
 expect(holding.length).toBeGreaterThan(0);
 });

 it('should identify key legal principles', async () => {
 (ollamaClient.generate as any).mockResolvedValue({
 response: 'Strict liability applies.'
 });

 const summary = 'The court established that strict liability applies.';

 const holding = await llmService.extractHolding(summary);

 expect(holding).toBeDefined();
 expect(holding.toLowerCase()).toContain('strict liability');
 });
 });

 describe('error handling', () => {
 it('should handle LLM API errors gracefully', async () => {
 const context = {
 caseId: 'case-123',
 charges: ['murder'],
 statutes: [],
 caseLaw: [],
 };

 // Mock API error
 vi.mocked(llmService.generateSummary).mockRejectedValueOnce(new Error('LLM API error'));

 await expect(llmService.generateSummary(context)).rejects.toThrow('LLM API error');
 });

 it('should handle timeout errors', async () => {
 const context = {
 caseId: 'case-123',
 charges: ['murder'],
 statutes: [],
 caseLaw: [],
 };

 vi.mocked(llmService.generateSummary).mockRejectedValueOnce(new Error('Request timeout'));

 await expect(llmService.generateSummary(context)).rejects.toThrow('Request timeout');
 });
 });

 describe('performance', () => {
 it('should generate summary within reasonable time', async () => {
 const context = {
 caseId: 'case-123',
 charges: ['murder'],
 statutes: [{ code: 'Statute 1', title: 'Title', text: 'Text' }],
 caseLaw: [{ caseNumber: 'Case 1', title: 'Title', holding: 'Holding' }],
 };

 const startTime = Date.now();
 await llmService.generateSummary(context);
 const duration = Date.now() - startTime;

 // Should complete within 30 seconds
 expect(duration).toBeLessThan(30000);
 });
 });

 describe('citation extraction accuracy', () => {
 it('should extract statute citations with jurisdiction', async () => {
 const text = '42 U.S.C. § 1983 (Federal) and Cal. Penal Code § 187 (California)';

 const citations = await llmService.extractCitations(text);

 const federalCitations = citations.filter((c: any) => c.jurisdiction === 'Federal');
 const stateCitations = citations.filter((c: any) => c.jurisdiction === 'California');

 expect(federalCitations.length).toBeGreaterThan(0);
 expect(stateCitations.length).toBeGreaterThan(0);
 });

 it('should extract case law citations with year', async () => {
 const text = '123 F.3d 456 (9th Cir. 2000)';

 const citations = await llmService.extractCitations(text);

 const caseLawCitations = citations.filter((c: any) => c.type === 'case_law');
 expect(caseLawCitations.length).toBeGreaterThan(0);
 });
 });
});




