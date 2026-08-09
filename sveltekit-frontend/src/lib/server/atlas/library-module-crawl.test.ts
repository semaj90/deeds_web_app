import { describe, expect, it } from 'vitest';
import { extractVersionCandidate } from './library-module-crawl.js';

describe('library module crawl helpers', () => {
	it('extracts semver candidates from release text', () => {
		expect(extractVersionCandidate('Latest release v1.2.3')).toBe('1.2.3');
		expect(extractVersionCandidate('release 2.4.6-beta.1 available')).toBe('2.4.6-beta.1');
	});

	it('falls back to the first semver-like token', () => {
		expect(extractVersionCandidate('ripgrep 14.1.1 is current')).toBe('14.1.1');
	});
});
