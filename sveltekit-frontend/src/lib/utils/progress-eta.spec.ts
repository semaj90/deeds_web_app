import { describe, expect, it } from 'vitest';
import { estimateEtaSeconds, formatEta } from './progress-eta.js';

describe('progress ETA', () => {
	const start = '2026-11-16T10:00:00.000Z';
	const at = (sec: number) => Date.parse(start) + sec * 1000;

	it('extrapolates remaining time from elapsed time and percent', () => {
		// 25% after 60 s -> 180 s remaining
		expect(estimateEtaSeconds(start, 25, at(60))).toBe(180);
	});

	it('returns null without an honest estimate', () => {
		expect(estimateEtaSeconds(start, 0, at(60))).toBeNull();
		expect(estimateEtaSeconds(start, 100, at(60))).toBeNull();
		expect(estimateEtaSeconds(null, 25, at(60))).toBeNull();
		expect(estimateEtaSeconds(start, 25, at(-5))).toBeNull();
	});

	it('formats m:ss and h:mm:ss', () => {
		expect(formatEta(180)).toBe('3:00');
		expect(formatEta(3725)).toBe('1:02:05');
	});
});
