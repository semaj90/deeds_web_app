import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getAuthorizedCase: vi.fn(), readSceneSogPackageFileV1: vi.fn(), env: { SCENE_PERSISTENCE_ENABLED: false }
}));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: mocks.env }));
vi.mock('$lib/server/scene-assets-v1.js', () => ({ readSceneSogPackageFileV1: mocks.readSceneSogPackageFileV1 }));

import { GET } from './+server.js';

function event() {
	return {
		locals: { user: { id: '7' } },
		params: {
			id: '11111111-1111-4111-8111-111111111111',
			sceneId: '22222222-2222-4222-8222-222222222222',
			assetId: '33333333-3333-4333-8333-333333333333',
			filePath: '0_0/meta.json'
		}
	} as never;
}

describe('case Streamed SOG member route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.env.SCENE_PERSISTENCE_ENABLED = false;
		mocks.getAuthorizedCase.mockResolvedValue({ id: 'case' });
	});

	it('denies a case before querying the package registry or object store', async () => {
		mocks.getAuthorizedCase.mockResolvedValue(null);
		const response = await GET(event());
		expect(response.status).toBe(404);
		expect(mocks.readSceneSogPackageFileV1).not.toHaveBeenCalled();
	});

	it('keeps chunk delivery disabled pending schema and bucket admission', async () => {
		const response = await GET(event());
		expect(response.status).toBe(503);
		expect(mocks.readSceneSogPackageFileV1).not.toHaveBeenCalled();
	});

	it('returns only the authorized package member through the scoped server adapter', async () => {
		mocks.env.SCENE_PERSISTENCE_ENABLED = true;
		const bytes = new Uint8Array([123, 125]);
		mocks.readSceneSogPackageFileV1.mockResolvedValue({ bytes, contentType: 'application/json', sha256: 'a'.repeat(64) });
		const response = await GET(event());
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('{}');
		expect(response.headers.get('etag')).toBe(`"sha256-${'a'.repeat(64)}"`);
		expect(mocks.readSceneSogPackageFileV1).toHaveBeenCalledWith({
			caseId: '11111111-1111-4111-8111-111111111111', sceneId: '22222222-2222-4222-8222-222222222222',
			assetId: '33333333-3333-4333-8333-333333333333', path: '0_0/meta.json'
		});
	});
});
