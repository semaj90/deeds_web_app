import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const SCORING_METHODS = ['hybrid', 'vector_only', 'tfidf_only'] as const;
const SECTION_TYPES = [
	'facts', 'issues', 'reasoning', 'holding', 'citations',
	'parties', 'motions', 'bibliography', 'procedural_history',
	'sentencing', 'judgment',
] as const;

const ragSearchSchema = z.object({
	query: z.string().min(1, 'query is required').max(5000),
	top_k: z.number().int().min(1).max(100).optional().default(10),
	min_score: z.number().min(0).max(1).optional().default(0.3),
	use_hybrid: z.boolean().optional().default(false),
	use_rerank: z.boolean().optional().default(false),
	scoring_method: z.enum(SCORING_METHODS).optional().default('hybrid'),
	userId: z.string().max(200).optional(),
	caseId: z.string().uuid().optional(),
	case_id: z.string().uuid().optional(),
	conversationId: z.string().max(200).optional(),
	enableACE: z.boolean().optional().default(false),
	precomputedEmbedding: z.array(z.number()).length(768).optional(),
	sectionTypes: z.array(z.enum(SECTION_TYPES)).max(11).optional(),
});

describe('ragSearchSchema', () => {
	it('accepts minimal valid input', () => {
		const result = ragSearchSchema.safeParse({ query: 'legal precedent' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.query).toBe('legal precedent');
			expect(result.data.top_k).toBe(10);
			expect(result.data.min_score).toBe(0.3);
			expect(result.data.scoring_method).toBe('hybrid');
			expect(result.data.use_hybrid).toBe(false);
			expect(result.data.enableACE).toBe(false);
		}
	});

	it('accepts full input with all optional fields', () => {
		const embedding = Array.from({ length: 768 }, (_, i) => i * 0.001);
		const result = ragSearchSchema.safeParse({
			query: 'contract dispute damages',
			top_k: 20,
			min_score: 0.5,
			use_hybrid: true,
			use_rerank: true,
			scoring_method: 'vector_only',
			userId: 'user-123',
			caseId: '550e8400-e29b-41d4-a716-446655440000',
			conversationId: 'conv-456',
			enableACE: true,
			precomputedEmbedding: embedding,
			sectionTypes: ['facts', 'holding'],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.top_k).toBe(20);
			expect(result.data.scoring_method).toBe('vector_only');
			expect(result.data.precomputedEmbedding?.length).toBe(768);
		}
	});

	it('rejects empty query', () => {
		expect(ragSearchSchema.safeParse({ query: '' }).success).toBe(false);
	});

	it('rejects query exceeding 5000 chars', () => {
		expect(ragSearchSchema.safeParse({ query: 'x'.repeat(5001) }).success).toBe(false);
	});

	it('rejects top_k < 1', () => {
		expect(ragSearchSchema.safeParse({ query: 'test', top_k: 0 }).success).toBe(false);
	});

	it('rejects top_k > 100', () => {
		expect(ragSearchSchema.safeParse({ query: 'test', top_k: 101 }).success).toBe(false);
	});

	it('rejects min_score < 0', () => {
		expect(ragSearchSchema.safeParse({ query: 'test', min_score: -0.1 }).success).toBe(false);
	});

	it('rejects min_score > 1', () => {
		expect(ragSearchSchema.safeParse({ query: 'test', min_score: 1.1 }).success).toBe(false);
	});

	it('accepts min_score boundary values', () => {
		expect(ragSearchSchema.safeParse({ query: 'test', min_score: 0 }).success).toBe(true);
		expect(ragSearchSchema.safeParse({ query: 'test', min_score: 1 }).success).toBe(true);
	});

	it('rejects invalid scoring_method', () => {
		expect(ragSearchSchema.safeParse({ query: 'test', scoring_method: 'invalid' }).success).toBe(false);
	});

	it('accepts all valid scoring methods', () => {
		for (const method of SCORING_METHODS) {
			expect(ragSearchSchema.safeParse({ query: 'test', scoring_method: method }).success).toBe(true);
		}
	});

	it('rejects invalid caseId UUID', () => {
		expect(ragSearchSchema.safeParse({ query: 'test', caseId: 'not-uuid' }).success).toBe(false);
	});

	it('rejects invalid case_id UUID', () => {
		expect(ragSearchSchema.safeParse({ query: 'test', case_id: 'bad' }).success).toBe(false);
	});

	it('rejects precomputedEmbedding with wrong length', () => {
		expect(ragSearchSchema.safeParse({
			query: 'test',
			precomputedEmbedding: [0.1, 0.2, 0.3], // only 3 elements, need 768
		}).success).toBe(false);
	});

	it('accepts precomputedEmbedding with exactly 768 elements', () => {
		const embedding = Array.from({ length: 768 }, () => Math.random());
		const result = ragSearchSchema.safeParse({ query: 'test', precomputedEmbedding: embedding });
		expect(result.success).toBe(true);
	});

	it('rejects userId exceeding 200 chars', () => {
		expect(ragSearchSchema.safeParse({ query: 'test', userId: 'x'.repeat(201) }).success).toBe(false);
	});

	it('rejects conversationId exceeding 200 chars', () => {
		expect(ragSearchSchema.safeParse({ query: 'test', conversationId: 'x'.repeat(201) }).success).toBe(false);
	});

	it('rejects invalid sectionTypes enum', () => {
		expect(ragSearchSchema.safeParse({
			query: 'test',
			sectionTypes: ['facts', 'nonexistent'],
		}).success).toBe(false);
	});

	it('supports both caseId and case_id aliases', () => {
		const uuid = '550e8400-e29b-41d4-a716-446655440000';
		const r1 = ragSearchSchema.safeParse({ query: 'test', caseId: uuid });
		const r2 = ragSearchSchema.safeParse({ query: 'test', case_id: uuid });
		expect(r1.success).toBe(true);
		expect(r2.success).toBe(true);
	});
});
