import { describe, expect, it } from 'vitest';
import { resolveEvidenceUploaderId } from './evidence-upload-identity.js';

describe('resolveEvidenceUploaderId', () => {
	it('does not invent an owner when authentication has no user id', () => {
		expect(resolveEvidenceUploaderId(null)).toBeNull();
		expect(resolveEvidenceUploaderId(undefined)).toBeNull();
		expect(resolveEvidenceUploaderId('  ')).toBeNull();
	});

	it('preserves the authenticated user id for ownership attribution', () => {
		expect(resolveEvidenceUploaderId('42')).toBe('42');
	});
});
