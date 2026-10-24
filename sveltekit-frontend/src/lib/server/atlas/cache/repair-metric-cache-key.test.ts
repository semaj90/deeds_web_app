import { describe, expect, it } from 'vitest';
import {
	buildRepairMetricCacheKeyV1,
	canReuseRepairMetricResultV1,
} from './repair-metric-cache-key.js';

describe('RepairMetricCacheKeyV1', () => {
	const sampleInput = {
		evalExampleRevision: 'sha256:example1111111111111111111111111111111111111111111111111111111111',
		programRevision: 'sha256:program2222222222222222222222222222222222222222222222222222222222',
		modelRevision: 'ornith-1.5-9b',
		receiptHash: 'sha256:receipt3333333333333333333333333333333333333333333333333333333333',
	};

	it('generates a stable deterministic atlas:repair-metric:v1 key', () => {
		const key1 = buildRepairMetricCacheKeyV1(sampleInput);
		const key2 = buildRepairMetricCacheKeyV1({ ...sampleInput });
		expect(key1).toBe(key2);
		expect(key1).toMatch(/^atlas:repair-metric:v1:[a-f0-9]{64}$/);
	});

	it('changes key when any revision changes', () => {
		const keyBase = buildRepairMetricCacheKeyV1(sampleInput);
		const keyDiff = buildRepairMetricCacheKeyV1({
			...sampleInput,
			modelRevision: 'ornith-2.0-preview',
		});
		expect(keyBase).not.toBe(keyDiff);
	});

	it('validates reuse correctly', () => {
		const key = buildRepairMetricCacheKeyV1(sampleInput);
		const validCached = {
			cacheKey: key,
			score: 0.92,
			feedback: 'All hard repair gates passed.',
			evalExampleRevision: sampleInput.evalExampleRevision,
			programRevision: sampleInput.programRevision,
			modelRevision: sampleInput.modelRevision,
			receiptHash: sampleInput.receiptHash,
		};
		expect(canReuseRepairMetricResultV1(sampleInput, validCached)).toBe(true);
		expect(canReuseRepairMetricResultV1(sampleInput, { ...validCached, score: NaN })).toBe(false);
		expect(canReuseRepairMetricResultV1(sampleInput, { ...validCached, cacheKey: 'atlas:corrupted' })).toBe(false);
	});

	it('fails closed on empty inputs', () => {
		expect(() => buildRepairMetricCacheKeyV1({ ...sampleInput, evalExampleRevision: '' })).toThrow();
		expect(() => buildRepairMetricCacheKeyV1({ ...sampleInput, programRevision: '   ' })).toThrow();
	});
});
