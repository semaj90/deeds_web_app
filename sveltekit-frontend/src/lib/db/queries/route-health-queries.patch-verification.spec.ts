import { describe, expect, it, vi } from 'vitest';

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock('../pool.js', () => ({ getDb }));

describe('updatePatchVerificationStatus', () => {
	it('rejects passed before opening a database connection', async () => {
		const { updatePatchVerificationStatus } = await import('./route-health-queries.js');

		await expect(
			updatePatchVerificationStatus('patch-id', 'passed' as 'pending' | 'failed')
		).rejects.toThrow('VERIFICATION_RECEIPT_REQUIRED');
		expect(getDb).not.toHaveBeenCalled();
	});
});
