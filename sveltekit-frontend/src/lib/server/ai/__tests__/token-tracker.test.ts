import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing token-tracker
vi.mock('$lib/server/db/client', () => ({
	db: {
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				then: vi.fn((resolve: () => void) => { resolve(); return { catch: vi.fn() }; }),
			})),
		})),
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					groupBy: vi.fn(() => ({
						orderBy: vi.fn(() => Promise.resolve([])),
					})),
					limit: vi.fn(() => Promise.resolve([{
						totalPromptTokens: 0,
						totalCompletionTokens: 0,
						totalTokens: 0,
						requestCount: 0,
						avgDurationMs: 0,
					}])),
				})),
			})),
		})),
	},
}));

vi.mock('$lib/server/db/schema-postgres', () => ({
	aiUsageLog: {
		id: 'id',
		userId: 'user_id',
		endpoint: 'endpoint',
		model: 'model',
		promptTokens: 'prompt_tokens',
		completionTokens: 'completion_tokens',
		totalTokens: 'total_tokens',
		durationMs: 'duration_ms',
		cached: 'cached',
		metadata: 'metadata',
		createdAt: 'created_at',
	},
}));

import { extractOllamaTokens, trackTokenUsage, type TokenUsageParams } from '../token-tracker';

describe('extractOllamaTokens', () => {
	it('extracts prompt and completion tokens from Ollama response', () => {
		const result = extractOllamaTokens({
			prompt_eval_count: 150,
			eval_count: 287,
			model: 'gemma3-legal:latest',
		});
		expect(result).toEqual({
			promptTokens: 150,
			completionTokens: 287,
		});
	});

	it('returns 0 for missing token fields', () => {
		const result = extractOllamaTokens({
			model: 'gemma3-legal:latest',
			response: 'hello',
		});
		expect(result).toEqual({
			promptTokens: 0,
			completionTokens: 0,
		});
	});

	it('returns 0 for non-numeric token fields', () => {
		const result = extractOllamaTokens({
			prompt_eval_count: 'not-a-number',
			eval_count: null,
		});
		expect(result).toEqual({
			promptTokens: 0,
			completionTokens: 0,
		});
	});

	it('handles zero token counts', () => {
		const result = extractOllamaTokens({
			prompt_eval_count: 0,
			eval_count: 0,
		});
		expect(result).toEqual({
			promptTokens: 0,
			completionTokens: 0,
		});
	});

	it('handles empty object', () => {
		const result = extractOllamaTokens({});
		expect(result).toEqual({
			promptTokens: 0,
			completionTokens: 0,
		});
	});

	it('handles large token counts', () => {
		const result = extractOllamaTokens({
			prompt_eval_count: 128000,
			eval_count: 4096,
		});
		expect(result).toEqual({
			promptTokens: 128000,
			completionTokens: 4096,
		});
	});
});

describe('trackTokenUsage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('does not throw on valid input', () => {
		expect(() => {
			trackTokenUsage({
				endpoint: '/api/chat',
				model: 'gemma3-legal:latest',
				promptTokens: 100,
				completionTokens: 200,
			});
		}).not.toThrow();
	});

	it('handles missing optional fields', () => {
		expect(() => {
			trackTokenUsage({
				endpoint: '/api/rag/answer',
				model: 'gemma3-legal:latest',
			});
		}).not.toThrow();
	});

	it('handles all fields populated', () => {
		expect(() => {
			trackTokenUsage({
				userId: '123e4567-e89b-12d3-a456-426614174000',
				endpoint: '/api/synthesis/generate',
				model: 'gemma3-legal:latest',
				promptTokens: 500,
				completionTokens: 1000,
				durationMs: 2500,
				cached: true,
				metadata: { source: 'test' },
			});
		}).not.toThrow();
	});
});

describe('TokenUsageParams type checks', () => {
	it('requires endpoint and model', () => {
		const params: TokenUsageParams = {
			endpoint: '/api/chat',
			model: 'gemma3-legal:latest',
		};
		expect(params.endpoint).toBe('/api/chat');
		expect(params.model).toBe('gemma3-legal:latest');
		expect(params.promptTokens).toBeUndefined();
		expect(params.completionTokens).toBeUndefined();
	});
});
