// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildAssistantMessage, COURTROOM_TIPS } from './loading-hints-v1.js';

describe('loading assistant copy', () => {
	it('summarises the case file when a brief is present', () => {
		const m = buildAssistantMessage({ progress: 9, brief: { charges: 1, parties: 4, events: 12 } });
		expect(m.headline).toContain('1 charge,');
		expect(m.headline).toContain('4 parties');
		expect(m.headline).toContain('12 timeline events');
		expect(m.headline).toContain('(9%)');
	});

	it('does not claim a case file when the brief is empty or missing', () => {
		for (const brief of [null, undefined, { charges: 0, parties: 0, events: 0 }]) {
			expect(buildAssistantMessage({ progress: 40, brief }).headline).toBe('Setting up the courtroom (40%).');
		}
	});

	it('clamps bad progress values and announces completion', () => {
		expect(buildAssistantMessage({ progress: NaN }).headline).toContain('(0%)');
		expect(buildAssistantMessage({ progress: 250 }).headline).toContain('Court is in session');
		expect(buildAssistantMessage({ progress: -5 }).headline).toContain('(0%)');
	});

	it('rotates through every tip, including negative and fractional ticks', () => {
		const seen = new Set(COURTROOM_TIPS.map((_, i) => buildAssistantMessage({ progress: 10, tick: i }).tip));
		expect(seen.size).toBe(COURTROOM_TIPS.length);
		expect(COURTROOM_TIPS).toContain(buildAssistantMessage({ progress: 10, tick: -3 }).tip);
		expect(COURTROOM_TIPS).toContain(buildAssistantMessage({ progress: 10, tick: 2.7 }).tip);
	});
});
