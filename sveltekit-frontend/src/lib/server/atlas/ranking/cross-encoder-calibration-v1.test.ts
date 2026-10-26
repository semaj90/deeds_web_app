import { describe, expect, it } from 'vitest';
import {
	calibrateCrossEncoderLogitV1,
	sigmoidCalibrate,
	type CrossEncoderCalibrationConfigV1,
} from './cross-encoder-calibration-v1.js';

describe('cross-encoder-calibration-v1', () => {
	const sampleConfig: CrossEncoderCalibrationConfigV1 = {
		schema: 'atlas.cross-encoder-calibration.v1',
		calibrationRevision: 'calib-platt-v1',
		modelRevision: 'bge-reranker-v2-m3',
		tokenizerRevision: 'bge-tokenizer-v2',
		maxLength: 512,
		temperature: 1.5,
		centerBias: 0.5,
	};

	it('calibrates raw logits into unit probability range [0, 1] monotonically', () => {
		const low = sigmoidCalibrate(-10.0);
		const mid = sigmoidCalibrate(0.0);
		const high = sigmoidCalibrate(10.0);

		expect(low).toBeGreaterThanOrEqual(0.0);
		expect(low).toBeLessThan(mid);
		expect(mid).toBeCloseTo(0.5, 3);
		expect(mid).toBeLessThan(high);
		expect(high).toBeLessThanOrEqual(1.0);
	});

	it('produces verified calibration record with telemetry and model lineage', () => {
		const result = calibrateCrossEncoderLogitV1({
			rawLogit: 3.2,
			config: sampleConfig,
			latencyMs: 14.5,
			peakVramMb: 512.0,
		});

		expect(result.rawLogit).toBe(3.2);
		expect(result.calibratedScore).toBeGreaterThan(0.5);
		expect(result.calibratedScore).toBeLessThanOrEqual(1.0);
		expect(result.calibrationRevision).toBe('calib-platt-v1');
		expect(result.modelRevision).toBe('bge-reranker-v2-m3');
		expect(result.tokenizerRevision).toBe('bge-tokenizer-v2');
		expect(result.maxLength).toBe(512);
		expect(result.latencyMs).toBe(14.5);
		expect(result.peakVramMb).toBe(512.0);
	});

	it('fails closed on non-finite raw logits', () => {
		expect(() =>
			calibrateCrossEncoderLogitV1({
				rawLogit: Number.NaN,
				config: sampleConfig,
			}),
		).toThrow(/RAW_LOGIT_NOT_FINITE/);

		expect(() =>
			calibrateCrossEncoderLogitV1({
				rawLogit: Number.POSITIVE_INFINITY,
				config: sampleConfig,
			}),
		).toThrow(/RAW_LOGIT_NOT_FINITE/);
	});
});
