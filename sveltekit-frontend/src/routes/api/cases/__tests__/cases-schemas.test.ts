import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Replicate schemas from +server.ts for isolated testing
const CASE_STATUS = ['open', 'in_progress', 'pending_review', 'closed', 'archived'] as const;
const CASE_PRIORITY = ['low', 'medium', 'high', 'urgent'] as const;

const caseCreateSchema = z.object({
	title: z.string().min(1, 'Title is required').max(500),
	description: z.string().min(1, 'Description is required').max(10000),
	status: z.enum(CASE_STATUS).optional(),
	priority: z.enum(CASE_PRIORITY).optional(),
});

const caseBulkSchema = z.object({
	ids: z.array(z.string().uuid()).min(1, 'Select at least one case'),
	status: z.enum(CASE_STATUS).optional(),
	priority: z.enum(CASE_PRIORITY).optional(),
});

const caseListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(10),
	offset: z.coerce.number().int().min(0).default(0),
	status: z.enum([...CASE_STATUS, 'active']).nullish(),
	priority: z.enum(CASE_PRIORITY).nullish(),
	search: z.string().max(500).nullish(),
});

describe('caseCreateSchema', () => {
	it('accepts valid input', () => {
		const result = caseCreateSchema.safeParse({
			title: 'Test Case',
			description: 'A test case description',
			status: 'open',
			priority: 'medium',
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.title).toBe('Test Case');
			expect(result.data.status).toBe('open');
		}
	});

	it('accepts minimal input (no status/priority)', () => {
		const result = caseCreateSchema.safeParse({
			title: 'Minimal Case',
			description: 'Just title and description',
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.status).toBeUndefined();
			expect(result.data.priority).toBeUndefined();
		}
	});

	it('rejects empty title', () => {
		const result = caseCreateSchema.safeParse({
			title: '',
			description: 'Has description',
		});
		expect(result.success).toBe(false);
	});

	it('rejects missing title', () => {
		const result = caseCreateSchema.safeParse({
			description: 'No title',
		});
		expect(result.success).toBe(false);
	});

	it('rejects missing description', () => {
		const result = caseCreateSchema.safeParse({
			title: 'Has title',
		});
		expect(result.success).toBe(false);
	});

	it('rejects invalid status', () => {
		const result = caseCreateSchema.safeParse({
			title: 'Test',
			description: 'Test',
			status: 'invalid_status',
		});
		expect(result.success).toBe(false);
	});

	it('rejects invalid priority', () => {
		const result = caseCreateSchema.safeParse({
			title: 'Test',
			description: 'Test',
			priority: 'critical', // not in enum
		});
		expect(result.success).toBe(false);
	});

	it('rejects title exceeding 500 chars', () => {
		const result = caseCreateSchema.safeParse({
			title: 'x'.repeat(501),
			description: 'Test',
		});
		expect(result.success).toBe(false);
	});

	it('rejects description exceeding 10000 chars', () => {
		const result = caseCreateSchema.safeParse({
			title: 'Test',
			description: 'x'.repeat(10001),
		});
		expect(result.success).toBe(false);
	});

	it('accepts all valid status values', () => {
		for (const status of CASE_STATUS) {
			const result = caseCreateSchema.safeParse({
				title: 'Test',
				description: 'Test',
				status,
			});
			expect(result.success).toBe(true);
		}
	});

	it('accepts all valid priority values', () => {
		for (const priority of CASE_PRIORITY) {
			const result = caseCreateSchema.safeParse({
				title: 'Test',
				description: 'Test',
				priority,
			});
			expect(result.success).toBe(true);
		}
	});
});

describe('caseBulkSchema', () => {
	it('accepts valid bulk update', () => {
		const result = caseBulkSchema.safeParse({
			ids: ['550e8400-e29b-41d4-a716-446655440000'],
			status: 'closed',
		});
		expect(result.success).toBe(true);
	});

	it('rejects empty ids array', () => {
		const result = caseBulkSchema.safeParse({
			ids: [],
			status: 'closed',
		});
		expect(result.success).toBe(false);
	});

	it('rejects non-uuid ids', () => {
		const result = caseBulkSchema.safeParse({
			ids: ['not-a-uuid'],
			status: 'closed',
		});
		expect(result.success).toBe(false);
	});

	it('accepts multiple valid uuids', () => {
		const result = caseBulkSchema.safeParse({
			ids: [
				'550e8400-e29b-41d4-a716-446655440000',
				'6ba7b810-9dad-11d1-80b4-00c04fd430c8',
			],
			priority: 'high',
		});
		expect(result.success).toBe(true);
	});
});

describe('caseListQuerySchema', () => {
	it('applies defaults for empty input', () => {
		const result = caseListQuerySchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.limit).toBe(10);
			expect(result.data.offset).toBe(0);
		}
	});

	it('coerces string numbers', () => {
		const result = caseListQuerySchema.safeParse({
			limit: '25',
			offset: '10',
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.limit).toBe(25);
			expect(result.data.offset).toBe(10);
		}
	});

	it('accepts "active" as a status filter', () => {
		const result = caseListQuerySchema.safeParse({ status: 'active' });
		expect(result.success).toBe(true);
	});

	it('rejects limit > 100', () => {
		const result = caseListQuerySchema.safeParse({ limit: 101 });
		expect(result.success).toBe(false);
	});

	it('rejects limit < 1', () => {
		const result = caseListQuerySchema.safeParse({ limit: 0 });
		expect(result.success).toBe(false);
	});

	it('rejects negative offset', () => {
		const result = caseListQuerySchema.safeParse({ offset: -1 });
		expect(result.success).toBe(false);
	});

	it('rejects search exceeding 500 chars', () => {
		const result = caseListQuerySchema.safeParse({
			search: 'x'.repeat(501),
		});
		expect(result.success).toBe(false);
	});

	it('accepts null/undefined for optional fields', () => {
		const result = caseListQuerySchema.safeParse({
			status: null,
			priority: undefined,
			search: null,
		});
		expect(result.success).toBe(true);
	});
});
