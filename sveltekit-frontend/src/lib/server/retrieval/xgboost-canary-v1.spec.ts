import { describe, expect, it } from 'vitest';
import {
	assignXgboostCanaryV1,
	buildXgboostCanaryPlanV1,
	verifyXgboostCanaryPlanV1,
} from './xgboost-canary-v1.js';

describe('XgboostCanaryV1', () => {
	it('assigns the same request to the same bucket across replays', () => {
		const plan = buildXgboostCanaryPlanV1({
			modelRevision: 'sha256:model-v1',
			datasetRevision: 'sha256:dataset-v1',
			stage: 'TEN_PERCENT',
		});
		const first = assignXgboostCanaryV1(plan, 'request:replay-1');
		const second = assignXgboostCanaryV1(plan, 'request:replay-1');
		expect(first).toEqual(second);
		expect(first.bucket).toBeGreaterThanOrEqual(0);
		expect(first.bucket).toBeLessThan(10_000);
		expect(first.rollbackMode).toBe('shadow');
	});

	it('supports only the disabled, 1%, 5%, and 10% stages', () => {
		for (const [stage, basisPoints] of [
			['DISABLED', 0],
			['ONE_PERCENT', 100],
			['FIVE_PERCENT', 500],
			['TEN_PERCENT', 1000],
		] as const) {
			const plan = buildXgboostCanaryPlanV1({
				modelRevision: 'sha256:model-v1',
				datasetRevision: 'sha256:dataset-v1',
				stage,
			});
			expect(plan.basisPoints).toBe(basisPoints);
			expect(verifyXgboostCanaryPlanV1(plan)).toEqual(plan);
		}
		const disabled = buildXgboostCanaryPlanV1({
			modelRevision: 'sha256:model-v1',
			datasetRevision: 'sha256:dataset-v1',
			stage: 'DISABLED',
		});
		expect(assignXgboostCanaryV1(disabled, 'request:disabled').isCanary).toBe(false);
	});

	it('rejects tampering, invalid stage mappings, and missing request IDs', () => {
		const plan = buildXgboostCanaryPlanV1({
			modelRevision: 'sha256:model-v1',
			datasetRevision: 'sha256:dataset-v1',
			stage: 'ONE_PERCENT',
		});
		expect(() => verifyXgboostCanaryPlanV1({ ...plan, basisPoints: 500 })).toThrow();
		expect(() => verifyXgboostCanaryPlanV1({ ...plan, modelRevision: 'sha256:other' })).toThrow(/CHECKSUM/);
		expect(() => assignXgboostCanaryV1(plan, '   ')).toThrow(/REQUEST_ID/);
	});
});
