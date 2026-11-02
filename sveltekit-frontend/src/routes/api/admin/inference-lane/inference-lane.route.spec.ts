import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: { TURBOQUANT_URL: 'http://model.test', DEV_BYPASS_AUTH: false },
}));

vi.mock('$lib/server/llm/runtime-contract.js', () => ({ LLM_MODEL_ID: 'configured-test-model' }));

vi.stubGlobal('fetch', mockFetch);

import { GET } from './+server.js';

function invoke(role?: string) {
	return GET({ locals: { user: role ? { role } : null } } as Parameters<typeof GET>[0]);
}

describe('/api/admin/inference-lane', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it('requires an admin and returns the stable status shape', async () => {
		const response = await invoke('user');
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			status: 'unauthorized', vramUsed: null, slotsIdle: null, slotCount: 0, activeSlots: 0,
		});
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('returns observed model and verified idle slot state', async () => {
		mockFetch
			.mockResolvedValueOnce(Response.json([
				{ id: 0, is_processing: false, n_past: 128, n_ctx: 8192 },
				{ id: 1, is_processing: false, n_past: 0, n_ctx: 8192 },
			]))
			.mockResolvedValueOnce(Response.json({ default_generation_settings: { model: 'ornith-1.5-9b' } }));

		const response = await invoke('admin');
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: 'online', model: 'ornith-1.5-9b', slotsIdle: true,
			slotCount: 2, activeSlots: 0, ctxUsed: 128, ctxMax: 8192, vramUsed: null,
		});
		expect(mockFetch).toHaveBeenCalledWith('http://model.test/slots', expect.any(Object));
		expect(mockFetch).toHaveBeenCalledWith('http://model.test/props', expect.any(Object));
	});

	it('reports busy slots without claiming they are idle', async () => {
		mockFetch
			.mockResolvedValueOnce(Response.json([{ id: 0, is_processing: true, n_past: 1, n_ctx: 4096 }]))
			.mockResolvedValueOnce(Response.json({ default_generation_settings: { model: 'ornith-1.5-9b' } }));

		const response = await invoke('admin');
		expect(await response.json()).toMatchObject({ status: 'online', slotsIdle: false, activeSlots: 1 });
	});

	it('returns the same status envelope when upstream status fails', async () => {
		mockFetch.mockRejectedValueOnce(new Error('connection refused'));

		const response = await invoke('admin');
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({
			status: 'offline', model: null, vramUsed: null, slotsIdle: null, slotCount: 0, activeSlots: 0,
		});
		expect(Object.keys(body).sort()).toEqual([
			'activeSlots', 'ctxMax', 'ctxUsed', 'flashAttn', 'model', 'slotCount', 'slotsIdle', 'status', 'strategy', 'vramUsed',
		].sort());
	});
});
