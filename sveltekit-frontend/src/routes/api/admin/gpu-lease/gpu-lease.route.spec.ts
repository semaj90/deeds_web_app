import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSlotStatus, getState, switchTarget } = vi.hoisted(() => ({
	getSlotStatus: vi.fn(),
	getState: vi.fn(),
	switchTarget: vi.fn(),
}));

vi.mock('$lib/server/inference/gpu-arbiter-v1.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/inference/gpu-arbiter-v1.js')>();
	return {
		...actual,
		getInferenceSlotStatusV1: getSlotStatus,
		getGpuArbiterState: getState,
		switchGpuLeaseTarget: switchTarget,
	};
});

import { GET, POST } from './+server.js';

function makeEvent(role?: string, body?: unknown) {
	return {
		request: new Request('http://localhost/api/admin/gpu-lease', {
			method: body === undefined ? 'GET' : 'POST',
			headers: body === undefined ? undefined : { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
		locals: { user: role ? { role } : null },
	} as Parameters<typeof GET>[0];
}

describe('/api/admin/gpu-lease', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getSlotStatus.mockResolvedValue({ idle: true, slotCount: 1, activeSlots: 0, reason: 'verified_idle' });
		getState.mockResolvedValue({ activeTarget: 'ornith-8090-vlm' });
		switchTarget.mockResolvedValue({ activeTarget: 'browser-webgpu-exclusive' });
	});

	it('requires an admin for lease state', async () => {
		const response = await GET(makeEvent('user'));
		expect(response.status).toBe(403);
		expect(getState).not.toHaveBeenCalled();
	});

	it('requires an admin before any target switch', async () => {
		const response = await POST(makeEvent('user', { target: 'browser-webgpu-exclusive' }));
		expect(response.status).toBe(403);
		expect(switchTarget).not.toHaveBeenCalled();
	});

	it('rejects target changes if slot activity is not proven idle', async () => {
		getSlotStatus.mockResolvedValue({ idle: false, slotCount: 1, activeSlots: 1, reason: 'active_slots' });

		const response = await POST(makeEvent('admin', { target: 'browser-webgpu-exclusive' }));
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ code: 'GPU_LEASE_REQUIRES_IDLE_SLOTS' });
		expect(switchTarget).not.toHaveBeenCalled();
	});

	it('allows an admin switch only after idle slots are verified', async () => {
		const response = await POST(makeEvent('admin', { target: 'browser-webgpu-exclusive' }));
		expect(response.status).toBe(200);
		expect(switchTarget).toHaveBeenCalledWith('browser-webgpu-exclusive');
	});
});
