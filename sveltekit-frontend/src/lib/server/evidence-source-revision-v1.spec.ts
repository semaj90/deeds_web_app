import { describe, expect, it } from 'vitest';
import { formatEvidenceSourceRevisionV1 } from './evidence-source-revision-v1.js';

describe('formatEvidenceSourceRevisionV1', () => {
	it('formats a SHA-256 digest as a normalized source revision', () => {
		expect(formatEvidenceSourceRevisionV1('A'.repeat(64))).toBe(`sha256:${'a'.repeat(64)}`);
	});

	it('rejects malformed digests rather than inventing a revision', () => {
		expect(() => formatEvidenceSourceRevisionV1('missing-digest')).toThrow(
			'Evidence source revision must be a SHA-256 hex digest'
		);
	});
});
