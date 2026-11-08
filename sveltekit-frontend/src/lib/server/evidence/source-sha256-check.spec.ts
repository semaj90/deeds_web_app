import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkSourceSha256 } from './source-sha256-check.js';

const bytes = Buffer.from('scratch evidence bytes');
const real = 'sha256:' + createHash('sha256').update(bytes).digest('hex');

describe('checkSourceSha256', () => {
	it('accepts a matching hash', () => {
		expect(checkSourceSha256(bytes, real)).toEqual({ ok: true, computed: real });
	});

	it('rejects a checksum mismatch before any extraction', () => {
		const wrong = 'sha256:' + '0'.repeat(64);
		const r = checkSourceSha256(bytes, wrong);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe('EVIDENCE_SOURCE_SHA256_MISMATCH');
	});

	it('requires an expected hash', () => {
		const r = checkSourceSha256(bytes, null);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe('EVIDENCE_SOURCE_SHA256_REQUIRED');
	});

	it('rejects a malformed expected hash', () => {
		const r = checkSourceSha256(bytes, 'md5:abc');
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe('EVIDENCE_SOURCE_SHA256_REQUIRED');
	});
});
