import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const POI_STATUS = ['surveillance', 'wanted', 'active', 'cleared'] as const;
const THREAT_LEVEL = ['low', 'medium', 'high', 'critical'] as const;

const createPOISchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(500),
	description: z.string().max(5000).optional(),
	status: z.enum(POI_STATUS).default('surveillance'),
	threatLevel: z.enum(THREAT_LEVEL).default('low'),
	aliases: z.array(z.string()).optional(),
	relationship: z.string().max(500).optional(),
	crimes: z.array(z.string()).optional(),
	caseIds: z.array(z.string()).optional(),
});

const poiListSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	search: z.string().max(500).optional().default(''),
	status: z.enum(POI_STATUS).or(z.literal('')).default(''),
	threatLevel: z.enum(THREAT_LEVEL).or(z.literal('')).default(''),
});

describe('createPOISchema', () => {
	it('accepts valid input with all fields', () => {
		const result = createPOISchema.safeParse({
			name: 'John Doe',
			description: 'Known associate',
			status: 'wanted',
			threatLevel: 'high',
			aliases: ['JD', 'Johnny'],
			relationship: 'business partner',
			crimes: ['fraud', 'embezzlement'],
			caseIds: ['case-1', 'case-2'],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('John Doe');
			expect(result.data.aliases).toEqual(['JD', 'Johnny']);
		}
	});

	it('accepts minimal input with defaults', () => {
		const result = createPOISchema.safeParse({ name: 'Jane Doe' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.status).toBe('surveillance');
			expect(result.data.threatLevel).toBe('low');
		}
	});

	it('trims whitespace from name', () => {
		const result = createPOISchema.safeParse({ name: '  John Doe  ' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('John Doe');
		}
	});

	it('rejects empty name', () => {
		expect(createPOISchema.safeParse({ name: '' }).success).toBe(false);
	});

	it('rejects whitespace-only name', () => {
		expect(createPOISchema.safeParse({ name: '   ' }).success).toBe(false);
	});

	it('rejects name exceeding 500 chars', () => {
		expect(createPOISchema.safeParse({ name: 'x'.repeat(501) }).success).toBe(false);
	});

	it('rejects description exceeding 5000 chars', () => {
		expect(createPOISchema.safeParse({
			name: 'Test',
			description: 'x'.repeat(5001),
		}).success).toBe(false);
	});

	it('rejects invalid status', () => {
		expect(createPOISchema.safeParse({
			name: 'Test',
			status: 'unknown',
		}).success).toBe(false);
	});

	it('rejects invalid threatLevel', () => {
		expect(createPOISchema.safeParse({
			name: 'Test',
			threatLevel: 'extreme',
		}).success).toBe(false);
	});

	it('accepts all valid status values', () => {
		for (const status of POI_STATUS) {
			expect(createPOISchema.safeParse({ name: 'Test', status }).success).toBe(true);
		}
	});

	it('accepts all valid threat levels', () => {
		for (const threatLevel of THREAT_LEVEL) {
			expect(createPOISchema.safeParse({ name: 'Test', threatLevel }).success).toBe(true);
		}
	});

	it('rejects relationship exceeding 500 chars', () => {
		expect(createPOISchema.safeParse({
			name: 'Test',
			relationship: 'x'.repeat(501),
		}).success).toBe(false);
	});
});

describe('poiListSchema', () => {
	it('applies defaults for empty input', () => {
		const result = poiListSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.page).toBe(1);
			expect(result.data.limit).toBe(20);
			expect(result.data.search).toBe('');
			expect(result.data.status).toBe('');
			expect(result.data.threatLevel).toBe('');
		}
	});

	it('coerces string page/limit', () => {
		const result = poiListSchema.safeParse({ page: '3', limit: '50' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.page).toBe(3);
			expect(result.data.limit).toBe(50);
		}
	});

	it('rejects page < 1', () => {
		expect(poiListSchema.safeParse({ page: 0 }).success).toBe(false);
	});

	it('rejects limit > 100', () => {
		expect(poiListSchema.safeParse({ limit: 101 }).success).toBe(false);
	});

	it('rejects limit < 1', () => {
		expect(poiListSchema.safeParse({ limit: 0 }).success).toBe(false);
	});

	it('accepts empty string status (no filter)', () => {
		const result = poiListSchema.safeParse({ status: '' });
		expect(result.success).toBe(true);
	});

	it('accepts valid status filter', () => {
		const result = poiListSchema.safeParse({ status: 'wanted' });
		expect(result.success).toBe(true);
	});

	it('rejects invalid status string', () => {
		expect(poiListSchema.safeParse({ status: 'invalid' }).success).toBe(false);
	});

	it('rejects search exceeding 500 chars', () => {
		expect(poiListSchema.safeParse({ search: 'x'.repeat(501) }).success).toBe(false);
	});

	it('accepts all status values as filter', () => {
		for (const status of POI_STATUS) {
			expect(poiListSchema.safeParse({ status }).success).toBe(true);
		}
	});
});
