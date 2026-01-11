/**
 * Unit Tests for LLM Prompt Persistence Service
 * Task 11.1: Write unit tests for prompt persistence
 * Feature: agentic-error-analysis-diffs, Property 3: Prompt Persistence Round-Trip
 * Validates: Requirements 3.1: 3.3, 3.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';;
import { LLMPromptService } from './llm-prompt-service.js';
import type { ServiceConfig, LLMResponse } from './types.js';

describe('LLMPromptService - Unit Tests (Task 11.1)', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let service: LLMPromptService;
 let config: ServiceConfig;

 beforeEach(() => {
 config = {
 ollamaUrl: 'http://localhost:11434',
 qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/error_analysis',
 maxRetries: 3, retryDelayMs: 100, contextLines: 5,
 };
 service = new LLMPromptService(config);
 });

 /**
 * Property 3: Prompt Persistence Round-Trip
 * For any prompt stored, it should be retrievable with same content
 */
 describe('Property 3: Prompt Persistence Round-Trip', () => {
 it('should store and retrieve a prompt', async () => {
 const errorId = 'error-1';
 const prompt = 'Analyze this error';
 const response: LLMResponse = {
 text: 'Root cause: type mismatch',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 };

 const stored = await service.storePrompt(errorId, prompt, response);
 const retrieved = await service.retrievePrompt(stored.id);

 expect(retrieved).not.toBeNull();
 expect(retrieved!.prompt).toBe(prompt);
 expect(retrieved!.response).toBe(response.text);
 expect(retrieved!.errorId).toBe(errorId);
 });

 it('should store multiple prompts for same error', async () => {
 const errorId = 'error-1';

 const prompt1 = await service.storePrompt(errorId, 'First prompt', {
 text: 'First response',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 const prompt2 = await service.storePrompt(errorId, 'Second prompt', {
 text: 'Second response',
 tokens: 60,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 const prompts = await service.retrievePromptsByError(errorId);

 expect(prompts.length).toBe(2);
 expect(prompts.map((p) => p.id)).toContain(prompt1.id);
 expect(prompts.map((p) => p.id)).toContain(prompt2.id);
 });

 it('should preserve prompt metadata', async () => {
 const errorId = 'error-1';
 const prompt = 'Test prompt';
 const response: LLMResponse = {
 text: 'Test response',
 tokens: 75,
 model: 'gemma3-legal',
 timestamp: new Date(),
 };

 const stored = await service.storePrompt(errorId, prompt, response);
 const retrieved = await service.retrievePrompt(stored.id);

 expect(retrieved!.tokens).toBe(75);
 expect(retrieved!.model).toBe('gemma3-legal');
 expect(retrieved!.createdAt).toEqual(stored.createdAt);
 });

 it('should return null for non-existent prompt', async () => {
 const retrieved = await service.retrievePrompt('non-existent');
 expect(retrieved).toBeNull();
 });

 it('should return empty array for error with no prompts', async () => {
 const prompts = await service.retrievePromptsByError('error-no-prompts');
 expect(prompts).toEqual([]);
 });
 });

 /**
 * Property: Prompt Update
 * For any stored prompt, updates should be reflected
 */
 describe('Property: Prompt Update', () => {
 it('should update prompt confidence', async () => {
 const stored = await service.storePrompt('error-1', 'Test prompt', {
 text: 'Test response',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 const updated = await service.updatePrompt(stored.id, { confidence: 0.95 });

 expect(updated.confidence).toBe(0.95);

 const retrieved = await service.retrievePrompt(stored.id);
 expect(retrieved!.confidence).toBe(0.95);
 });

 it('should update prompt response', async () => {
 const stored = await service.storePrompt('error-1', 'Test prompt', {
 text: 'Original response',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 const updated = await service.updatePrompt(stored.id, {
 response: 'Updated response',
 });

 expect(updated.response).toBe('Updated response');

 const retrieved = await service.retrievePrompt(stored.id);
 expect(retrieved!.response).toBe('Updated response');
 });

 it('should not allow ID changes during update', async () => {
 const stored = await service.storePrompt('error-1', 'Test prompt', {
 text: 'Test response',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 const updated = await service.updatePrompt(stored.id, {
 id: 'new-id' as any,
 });

 expect(updated.id).toBe(stored.id);
 });

 it('should not allow error ID changes during update', async () => {
 const stored = await service.storePrompt('error-1', 'Test prompt', {
 text: 'Test response',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 const updated = await service.updatePrompt(stored.id, {
 errorId: 'error-2' as any,
 });

 expect(updated.errorId).toBe('error-1');
 });

 it('should throw error when updating non-existent prompt', async () => {
 await expect(service.updatePrompt('non-existent', { confidence: 0.9 })).rejects.toThrow(
 'not found'
 );
 });

 it('should update timestamp on modification', async () => {
 const stored = await service.storePrompt('error-1', 'Test prompt', {
 text: 'Test response',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 const originalUpdatedAt = stored.updatedAt;

 // Wait a bit to ensure timestamp difference
 await new Promise((resolve) => setTimeout(resolve, 10));

 const updated = await service.updatePrompt(stored.id, { confidence: 0.9 });

 expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
 });
 });

 /**
 * Property: Prompt Deletion
 * For any stored prompt, deletion should remove it
 */
 describe('Property: Prompt Deletion', () => {
 it('should delete a prompt', async () => {
 const stored = await service.storePrompt('error-1', 'Test prompt', {
 text: 'Test response',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 await service.deletePrompt(stored.id);

 const retrieved = await service.retrievePrompt(stored.id);
 expect(retrieved).toBeNull();
 });

 it('should remove from error index on deletion', async () => {
 const stored = await service.storePrompt('error-1', 'Test prompt', {
 text: 'Test response',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 await service.deletePrompt(stored.id);

 const prompts = await service.retrievePromptsByError('error-1');
 expect(prompts).toEqual([]);
 });

 it('should throw error when deleting non-existent prompt', async () => {
 await expect(service.deletePrompt('non-existent')).rejects.toThrow('not found');
 });

 it('should handle multiple deletions', async () => {
 const prompt1 = await service.storePrompt('error-1', 'Prompt 1', {
 text: 'Response 1',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 const prompt2 = await service.storePrompt('error-1', 'Prompt 2', {
 text: 'Response 2',
 tokens: 60,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 await service.deletePrompt(prompt1.id);
 const remaining = await service.retrievePromptsByError('error-1');

 expect(remaining.length).toBe(1);
 expect(remaining[0].id).toBe(prompt2.id);

 await service.deletePrompt(prompt2.id);
 const final = await service.retrievePromptsByError('error-1');

 expect(final).toEqual([]);
 });
 });

 /**
 * Property: Prompt History
 * For any stored prompts, history should be retrievable with pagination
 */
 describe('Property: Prompt History', () => {
 it('should retrieve prompt history', async () => {
 for (let i = 0; i < 5; i++) {
 await service.storePrompt(`error-${i}`, `Prompt ${i}`, {
 text: `Response ${i}`,
 tokens: 50 + i,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });
 }

 const history = await service.retrievePromptHistory(10, 0);

 expect(history.length).toBe(5);
 });

 it('should apply limit to history', async () => {
 for (let i = 0; i < 10; i++) {
 await service.storePrompt(`error-${i}`, `Prompt ${i}`, {
 text: `Response ${i}`,
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });
 }

 const history = await service.retrievePromptHistory(5, 0);

 expect(history.length).toBe(5);
 });

 it('should apply offset to history', async () => {
 for (let i = 0; i < 10; i++) {
 await service.storePrompt(`error-${i}`, `Prompt ${i}`, {
 text: `Response ${i}`,
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });
 }

 const page1 = await service.retrievePromptHistory(5, 0);
 const page2 = await service.retrievePromptHistory(5, 5);

 expect(page1.length).toBe(5);
 expect(page2.length).toBe(5);

 // Ensure no overlap
 const page1Ids = page1.map((p) => p.id);
 const page2Ids = page2.map((p) => p.id);
 const overlap = page1Ids.filter((id) => page2Ids.includes(id));

 expect(overlap).toEqual([]);
 });

 it('should sort history by creation date descending', async () => {
 const prompts = [];

 for (let i = 0; i < 3; i++) {
 const p = await service.storePrompt(`error-${i}`, `Prompt ${i}`, {
 text: `Response ${i}`,
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });
 prompts.push(p);

 // Small delay to ensure different timestamps
 await new Promise((resolve) => setTimeout(resolve, 5));
 }

 const history = await service.retrievePromptHistory(10, 0);

 // Should be in reverse order (newest first)
 expect(history[0].id).toBe(prompts[2].id);
 expect(history[1].id).toBe(prompts[1].id);
 expect(history[2].id).toBe(prompts[0].id);
 });

 it('should reject invalid limit', async () => {
 await expect(service.retrievePromptHistory(0, 0)).rejects.toThrow('Invalid input');
 });

 it('should reject negative offset', async () => {
 await expect(service.retrievePromptHistory(10, -1)).rejects.toThrow('Invalid input');
 });
 });

 /**
 * Property: Prompt Statistics
 * For any stored prompts, statistics should be accurate
 */
 describe('Property: Prompt Statistics', () => {
 it('should calculate correct statistics', async () => {
 await service.storePrompt('error-1', 'Prompt 1', {
 text: 'Response 1',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 await service.storePrompt('error-2', 'Prompt 2', {
 text: 'Response 2',
 tokens: 60,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 await service.storePrompt('error-3', 'Prompt 3', {
 text: 'Response 3',
 tokens: 70,
 model: 'other-model',
 timestamp: new Date(),
 });

 const stats = await service.getPromptStats();

 expect(stats.total).toBe(3);
 expect(stats.byModel['gemma3-legal']).toBe(2);
 expect(stats.byModel['other-model']).toBe(1);
 });

 it('should return empty stats for no prompts', async () => {
 const stats = await service.getPromptStats();

 expect(stats.total).toBe(0);
 expect(Object.keys(stats.byModel).length).toBe(0);
 });

 it('should update stats after deletion', async () => {
 const prompt = await service.storePrompt('error-1', 'Prompt 1', {
 text: 'Response 1',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 });

 let stats = await service.getPromptStats();
 expect(stats.total).toBe(1);

 await service.deletePrompt(prompt.id);

 stats = await service.getPromptStats();
 expect(stats.total).toBe(0);
 });
 });

 /**
 * Property: Error Handling
 * For any invalid input, service should throw appropriate error
 */
 describe('Property: Error Handling', () => {
 it('should reject empty error ID in storePrompt', async () => {
 await expect(
 service.storePrompt('', 'prompt', {
 text: 'response',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 })
 ).rejects.toThrow('Invalid input');
 });

 it('should reject empty prompt in storePrompt', async () => {
 await expect(
 service.storePrompt('error-1', '', {
 text: 'response',
 tokens: 50,
 model: 'gemma3-legal',
 timestamp: new Date(),
 })
 ).rejects.toThrow('Invalid input');
 });

 it('should reject invalid response in storePrompt', async () => {
 await expect(service.storePrompt('error-1', 'prompt', null as any)).rejects.toThrow();
 });

 it('should reject empty prompt ID in retrievePrompt', async () => {
 await expect(service.retrievePrompt('')).rejects.toThrow('Invalid input');
 });

 it('should reject empty error ID in retrievePromptsByError', async () => {
 await expect(service.retrievePromptsByError('')).rejects.toThrow('Invalid input');
 });

 it('should reject empty prompt ID in updatePrompt', async () => {
 await expect(service.updatePrompt('', { confidence: 0.9 })).rejects.toThrow('Invalid input');
 });

 it('should reject empty prompt ID in deletePrompt', async () => {
 await expect(service.deletePrompt('')).rejects.toThrow('Invalid input');
 });
 });
});
