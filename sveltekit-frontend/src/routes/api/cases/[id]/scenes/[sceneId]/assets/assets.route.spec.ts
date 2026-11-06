import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getAuthorizedCase: vi.fn(),
	storeSceneGlbV1: vi.fn(),
	readSceneGlbV1: vi.fn()
}));

vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SCENE_PERSISTENCE_ENABLED: false } }));
vi.mock('$lib/server/scene-assets-v1.js', () => ({
	storeSceneGlbV1: mocks.storeSceneGlbV1,
	readSceneGlbV1: mocks.readSceneGlbV1
}));

import { GET, POST } from './+server.js';

const event = (method: 'GET' | 'POST', overrides: Record<string, unknown> = {}) => ({
	locals: { user: { id: '7' } },
	params: { id: '11111111-1111-4111-8111-111111111111', sceneId: '22222222-2222-4222-8222-222222222222' },
	url: new URL('http://localhost/api?assetId=33333333-3333-4333-8333-333333333333'),
	request: new Request('http://localhost/api', { method, headers: { 'content-type': 'model/gltf-binary' }, body: method === 'POST' ? new Uint8Array([1]) : undefined }),
	...overrides
}) as never;

describe('case scene asset route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getAuthorizedCase.mockResolvedValue({ id: 'case' });
	});

	it('authorizes before checking the disabled-by-default storage gate', async () => {
		mocks.getAuthorizedCase.mockResolvedValue(null);
		const response = await POST(event('POST'));
		expect(response.status).toBe(404);
		expect(mocks.storeSceneGlbV1).not.toHaveBeenCalled();
	});

	it('keeps storage and exact-object reads disabled until explicit admission', async () => {
		expect((await POST(event('POST'))).status).toBe(503);
		expect((await GET(event('GET'))).status).toBe(503);
		expect(mocks.storeSceneGlbV1).not.toHaveBeenCalled();
		expect(mocks.readSceneGlbV1).not.toHaveBeenCalled();
	});
});
