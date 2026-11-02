import { describe, expect, it } from 'vitest';
import { hasGlyphTopology } from './glyph-topology-visibility.js';

describe('glyph topology visibility', () => {
	it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY, -1, 0, '2'])('hides invalid or empty counts: %s', (totalGlyphs) => {
		expect(hasGlyphTopology(totalGlyphs)).toBe(false);
	});

	it('shows topology when at least one glyph exists', () => {
		expect(hasGlyphTopology(1)).toBe(true);
		expect(hasGlyphTopology(42)).toBe(true);
	});
});
