import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const generateReportSchema = z.object({
	caseId: z.string().min(1, 'Case ID is required').max(500),
	type: z.string().max(100).optional().default('charging_memo'),
});

describe('generateReportSchema', () => {
	it('accepts valid input with type', () => {
		const result = generateReportSchema.safeParse({
			caseId: '550e8400-e29b-41d4-a716-446655440000',
			type: 'intake_summary',
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.caseId).toBe('550e8400-e29b-41d4-a716-446655440000');
			expect(result.data.type).toBe('intake_summary');
		}
	});

	it('applies default type when omitted', () => {
		const result = generateReportSchema.safeParse({ caseId: 'case-123' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe('charging_memo');
		}
	});

	it('rejects empty caseId', () => {
		expect(generateReportSchema.safeParse({ caseId: '' }).success).toBe(false);
	});

	it('rejects missing caseId', () => {
		expect(generateReportSchema.safeParse({}).success).toBe(false);
	});

	it('rejects caseId exceeding 500 chars', () => {
		expect(generateReportSchema.safeParse({ caseId: 'x'.repeat(501) }).success).toBe(false);
	});

	it('rejects type exceeding 100 chars', () => {
		expect(generateReportSchema.safeParse({
			caseId: 'case-1',
			type: 'x'.repeat(101),
		}).success).toBe(false);
	});

	it('accepts known report types', () => {
		const types = ['charging_memo', 'intake_summary', 'discovery_list', 'hearing_prep', 'custom'];
		for (const type of types) {
			const result = generateReportSchema.safeParse({ caseId: 'case-1', type });
			expect(result.success).toBe(true);
		}
	});

	it('accepts any string as type (not enum-restricted)', () => {
		const result = generateReportSchema.safeParse({
			caseId: 'case-1',
			type: 'custom_special_report',
		});
		expect(result.success).toBe(true);
	});

	it('accepts non-UUID caseId (string, not uuid-validated)', () => {
		const result = generateReportSchema.safeParse({ caseId: 'my-case-slug' });
		expect(result.success).toBe(true);
	});
});
