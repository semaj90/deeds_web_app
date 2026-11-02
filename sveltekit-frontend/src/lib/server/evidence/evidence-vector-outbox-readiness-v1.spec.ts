import { describe, expect, it, vi } from 'vitest';
import { isEvidenceVectorOutboxAvailableV1 } from './evidence-vector-outbox-readiness-v1.js';

describe('evidence vector outbox readiness', () => {
	it('allows processing only when the canonical outbox relation exists', async () => {
		const execute = vi.fn().mockResolvedValue({ rows: [{ available: true }] });
		expect(await isEvidenceVectorOutboxAvailableV1({ execute })).toBe(true);
		expect(execute).toHaveBeenCalledOnce();
	});

	it('fails closed when the outbox relation is absent or the probe fails', async () => {
		const absent = vi.fn().mockResolvedValue({ rows: [{ available: false }] });
		const unavailable = vi.fn().mockRejectedValue(new Error('database unavailable'));
		expect(await isEvidenceVectorOutboxAvailableV1({ execute: absent })).toBe(false);
		expect(await isEvidenceVectorOutboxAvailableV1({ execute: unavailable })).toBe(false);
	});
});
