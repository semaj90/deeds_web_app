// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareStreamIds, isStreamId, parseResumeCursor } from './sse-cursor';

describe('sse-cursor', () => {
	it('accepts only well-formed stream IDs', () => {
		for (const ok of ['0-0', '1730000000000-0', '1730000000000-42']) expect(isStreamId(ok)).toBe(true);
		for (const bad of ['', '-', '1730000000000', '1730-', '-1', '1-2-3', '(1-2', '1-2 ', '1; DEL x', 'abc-def', '1234567890123456-0', null, undefined, 5]) {
			expect(isStreamId(bad)).toBe(false);
		}
	});

	it('orders stream IDs numerically, not lexically', () => {
		expect(compareStreamIds('9-0', '10-0')).toBeLessThan(0);
		expect(compareStreamIds('10-0', '9-0')).toBeGreaterThan(0);
		expect(compareStreamIds('5-2', '5-10')).toBeLessThan(0);
		expect(compareStreamIds('5-3', '5-3')).toBe(0);
	});

	it('reads the cursor from Last-Event-ID first, then the query fallback, and ignores junk', () => {
		const url = (q = '') => new URL(`http://x/api/sse/c${q}`);
		expect(parseResumeCursor(new Headers({ 'Last-Event-ID': '5-1' }), url('?lastEventId=9-9'))).toBe('5-1');
		expect(parseResumeCursor(new Headers(), url('?lastEventId=9-9'))).toBe('9-9');
		expect(parseResumeCursor(new Headers(), url())).toBeNull();
		expect(parseResumeCursor(new Headers({ 'Last-Event-ID': 'nope' }), url())).toBeNull();
	});
});
