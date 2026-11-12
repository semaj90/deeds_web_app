import { describe, expect, it, vi } from 'vitest';
import { registerPdfOcrFollowupAfterQueueV1 } from './evidence-upload-followup-v1.js';

describe('post-enqueue PDF OCR follow-up', () => {
	it('does not run when the evidence upload does not require PDF OCR', async () => {
		const register = vi.fn();
		expect(await registerPdfOcrFollowupAfterQueueV1(false, register)).toBe('SKIPPED');
		expect(register).not.toHaveBeenCalled();
	});

	it('records successful follow-up registration', async () => {
		const register = vi.fn().mockResolvedValue(undefined);
		expect(await registerPdfOcrFollowupAfterQueueV1(true, register)).toBe('REGISTERED');
		expect(register).toHaveBeenCalledOnce();
	});

	it('contains follow-up failures so an already queued primary job stays accepted', async () => {
		const register = vi.fn().mockRejectedValue(new Error('secondary workflow unavailable'));
		await expect(registerPdfOcrFollowupAfterQueueV1(true, register)).resolves.toBe('FAILED');
		expect(register).toHaveBeenCalledOnce();
	});
});
