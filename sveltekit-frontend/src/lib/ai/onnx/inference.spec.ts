import { describe, expect, it } from 'vitest';
import { greedyTokenId, topKTopPSample } from './token-sampling.js';

describe('Gemma 3 ONNX token selection', () => {
	it('uses greedy argmax at temperature zero', () => {
		expect(topKTopPSample([0.2, 2.1, -1], 3, 1, 0)).toBe(1);
	});

	it('breaks greedy ties by the lowest token index', () => {
		expect(topKTopPSample([2, 2, 1], 3, 1, 0)).toBe(0);
	});

	it('accepts negative infinity as a masked token', () => {
		expect(greedyTokenId([-Infinity, 1, -Infinity])).toBe(1);
	});

	it('rejects an all-masked vocabulary', () => {
		expect(() => greedyTokenId([-Infinity, -Infinity])).toThrow('ALL_LOGITS_MASKED');
		expect(() => topKTopPSample([-Infinity, -Infinity], 2, 1, 0.5)).toThrow('ALL_LOGITS_MASKED');
	});

	it('rejects NaN and positive infinity logits', () => {
		expect(() => greedyTokenId([0, Number.NaN])).toThrow('NAN_LOGIT');
		expect(() => greedyTokenId([0, Infinity])).toThrow('POSITIVE_INFINITY_LOGIT');
	});

	it('rejects an empty vocabulary', () => {
		expect(() => greedyTokenId([])).toThrow('EMPTY_LOGITS');
	});
});
