import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getAuthorizedCase: vi.fn(),
	storeSceneSogPackageV1: vi.fn(),
	readBoundedSceneAssetRequestV1: vi.fn(),
	sha256Bytes: vi.fn()
}));

vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SCENE_PERSISTENCE_ENABLED: false } }));
vi.mock('$lib/server/scene-assets-v1.js', () => ({
	SCENE_SOG_PACKAGE_MAX_BYTES: 64 * 1024 * 1024,
	SCENE_SOG_PACKAGE_MAX_FILES: 4096,
	storeSceneSogPackageV1: mocks.storeSceneSogPackageV1,
	readBoundedSceneAssetRequestV1: mocks.readBoundedSceneAssetRequestV1,
	sha256Bytes: mocks.sha256Bytes
}));

import { POST } from './+server.js';

function event(overrides: Record<string, unknown> = {}) {
	return {
		locals: { user: { id: '7' } },
		params: { id: '11111111-1111-4111-8111-111111111111', sceneId: '22222222-2222-4222-8222-222222222222' },
		request: new Request('http://localhost/api', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=unused', 'content-length': '1' }, body: new Uint8Array([1]) }),
		...overrides
	} as never;
}

describe('case Streamed SOG package upload route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getAuthorizedCase.mockResolvedValue({ id: 'case' });
	});

	it('authorizes the case before checking the disabled storage gate', async () => {
		mocks.getAuthorizedCase.mockResolvedValue(null);
		const response = await POST(event());
		expect(response.status).toBe(404);
		expect(mocks.readBoundedSceneAssetRequestV1).not.toHaveBeenCalled();
		expect(mocks.storeSceneSogPackageV1).not.toHaveBeenCalled();
	});

	it('returns a stable JSON failure when case authorization throws', async () => {
		mocks.getAuthorizedCase.mockRejectedValue(new Error('database unavailable'));
		const response = await POST(event());
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ success: false, data: null, message: 'Case authorization failed' });
		expect(mocks.readBoundedSceneAssetRequestV1).not.toHaveBeenCalled();
		expect(mocks.storeSceneSogPackageV1).not.toHaveBeenCalled();
	});

	it('keeps SOG package parsing and storage disabled until schema and bucket admission', async () => {
		const response = await POST(event());
		expect(response.status).toBe(503);
		expect(mocks.readBoundedSceneAssetRequestV1).not.toHaveBeenCalled();
		expect(mocks.storeSceneSogPackageV1).not.toHaveBeenCalled();
	});
});
