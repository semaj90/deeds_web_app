import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInferenceSlotStatusV1 } from './gpu-arbiter-v1.js';

describe('GPU lease idle-slot guard', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('confirms idle only when every reported slot is explicitly idle', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([
			{ id: 0, is_processing: false },
			{ id: 1, is_processing: false },
		])));

		await expect(getInferenceSlotStatusV1()).resolves.toEqual({
			idle: true, slotCount: 2, activeSlots: 0, reason: 'verified_idle',
		});
	});

	it('blocks target changes while any slot is processing', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([
			{ id: 0, is_processing: false },
			{ id: 1, is_processing: true },
		])));

		await expect(getInferenceSlotStatusV1()).resolves.toEqual({
			idle: false, slotCount: 2, activeSlots: 1, reason: 'active_slots',
		});
	});

	it.each([[], [{ id: 0 }], { unexpected: [] }])('fails closed for unknown slot payloads', async (payload) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));

		const status = await getInferenceSlotStatusV1();
		expect(status.idle).toBe(false);
		expect(status.reason).toBe('unknown_slots');
	});

	it('fails closed when the inference service cannot be reached', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

		await expect(getInferenceSlotStatusV1()).resolves.toEqual({
			idle: false, slotCount: 0, activeSlots: 0, reason: 'service_unavailable',
		});
	});
});
