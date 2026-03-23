import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const SECTION_TYPES = [
	'facts', 'issues', 'reasoning', 'holding', 'citations',
	'parties', 'motions', 'bibliography', 'procedural_history',
	'sentencing', 'judgment',
] as const;

const evidenceSearchSchema = z.object({
	query: z.string().min(1, 'query is required').max(5000),
	caseId: z.string().uuid().optional(),
	limit: z.number().int().min(1).max(100).optional().default(10),
	expandSections: z.boolean().optional().default(true),
	jurisdiction: z.string().max(200).optional(),
	useLegalPageRank: z.boolean().optional().default(false),
	sectionTypes: z.array(z.enum(SECTION_TYPES)).max(11).optional(),
});

describe('evidenceSearchSchema', () => {
	it('accepts valid minimal input', () => {
		const result = evidenceSearchSchema.safeParse({ query: 'search term' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.query).toBe('search term');
			expect(result.data.limit).toBe(10);
			expect(result.data.expandSections).toBe(true);
			expect(result.data.useLegalPageRank).toBe(false);
		}
	});

	it('accepts all fields populated', () => {
		const result = evidenceSearchSchema.safeParse({
			query: 'contract breach evidence',
			caseId: '550e8400-e29b-41d4-a716-446655440000',
			limit: 25,
			expandSections: false,
			jurisdiction: 'US-CA',
			useLegalPageRank: true,
			sectionTypes: ['facts', 'reasoning', 'holding'],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.sectionTypes).toEqual(['facts', 'reasoning', 'holding']);
			expect(result.data.jurisdiction).toBe('US-CA');
		}
	});

	it('rejects empty query', () => {
		const result = evidenceSearchSchema.safeParse({ query: '' });
		expect(result.success).toBe(false);
	});

	it('rejects query exceeding 5000 chars', () => {
		const result = evidenceSearchSchema.safeParse({ query: 'x'.repeat(5001) });
		expect(result.success).toBe(false);
	});

	it('rejects invalid caseId UUID', () => {
		const result = evidenceSearchSchema.safeParse({ query: 'test', caseId: 'not-a-uuid' });
		expect(result.success).toBe(false);
	});

	it('rejects limit < 1', () => {
		const result = evidenceSearchSchema.safeParse({ query: 'test', limit: 0 });
		expect(result.success).toBe(false);
	});

	it('rejects limit > 100', () => {
		const result = evidenceSearchSchema.safeParse({ query: 'test', limit: 101 });
		expect(result.success).toBe(false);
	});

	it('rejects invalid sectionTypes enum', () => {
		const result = evidenceSearchSchema.safeParse({
			query: 'test',
			sectionTypes: ['facts', 'invalid_section'],
		});
		expect(result.success).toBe(false);
	});

	it('accepts all 11 valid section types', () => {
		const result = evidenceSearchSchema.safeParse({
			query: 'test',
			sectionTypes: [...SECTION_TYPES],
		});
		expect(result.success).toBe(true);
	});

	it('rejects jurisdiction exceeding 200 chars', () => {
		const result = evidenceSearchSchema.safeParse({
			query: 'test',
			jurisdiction: 'x'.repeat(201),
		});
		expect(result.success).toBe(false);
	});

	it('accepts empty sectionTypes array', () => {
		const result = evidenceSearchSchema.safeParse({
			query: 'test',
			sectionTypes: [],
		});
		expect(result.success).toBe(true);
	});
});
