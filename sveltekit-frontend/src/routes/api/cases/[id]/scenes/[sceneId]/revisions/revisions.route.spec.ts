import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getAuthorizedCase: vi.fn(),
	appendSceneDocumentRevisionV1: vi.fn(),
	readSceneDocumentRevisionV1: vi.fn(),
	env: { SCENE_PERSISTENCE_ENABLED: false }
}));

vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: mocks.env }));
vi.mock('$lib/server/scene-document-revisions-v1.js', () => ({
	appendSceneDocumentRevisionV1: mocks.appendSceneDocumentRevisionV1,
	readSceneDocumentRevisionV1: mocks.readSceneDocumentRevisionV1,
	sceneRevisionCommandV1Schema: { safeParse: (input: unknown) => ({ success: true, data: input }) }
}));

import { GET, POST } from './+server.js';

const event = (overrides: Record<string, unknown> = {}) => ({
	locals: { user: { id: '7' } },
	params: { id: '11111111-1111-4111-8111-111111111111', sceneId: '22222222-2222-4222-8222-222222222222' },
	url: new URL('http://localhost/api'),
	request: new Request('http://localhost/api', { method: 'POST', body: JSON.stringify({}) }),
	...overrides
}) as never;

describe('case scene revision route authorization', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.env.SCENE_PERSISTENCE_ENABLED = false;
		mocks.getAuthorizedCase.mockResolvedValue({ id: 'case' });
	});

	it('does not read a revision before case authorization', async () => {
		mocks.getAuthorizedCase.mockResolvedValue(null);
		const response = await GET(event());
		expect(response.status).toBe(404);
		expect(mocks.readSceneDocumentRevisionV1).not.toHaveBeenCalled();
	});

	it('does not append a revision before case authorization', async () => {
		mocks.getAuthorizedCase.mockResolvedValue(null);
		const response = await POST(event());
		expect(response.status).toBe(404);
		expect(mocks.appendSceneDocumentRevisionV1).not.toHaveBeenCalled();
	});

	it('keeps revision reads and writes disabled after authorization until schema admission', async () => {
		expect((await GET(event())).status).toBe(503);
		expect((await POST(event())).status).toBe(503);
		expect(mocks.readSceneDocumentRevisionV1).not.toHaveBeenCalled();
		expect(mocks.appendSceneDocumentRevisionV1).not.toHaveBeenCalled();
	});

	it('returns the stable JSON failure shape when case authorization fails', async () => {
		mocks.getAuthorizedCase.mockRejectedValue(new Error('private database details'));
		const response = await GET(event());
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ success: false, data: null, message: 'Case authorization failed' });
	});

	it('returns the stable JSON failure shape when readback integrity fails', async () => {
		mocks.env.SCENE_PERSISTENCE_ENABLED = true;
		mocks.readSceneDocumentRevisionV1.mockRejectedValue(new Error('SCENE_REVISION_READBACK_INTEGRITY_MISMATCH'));
		const response = await GET(event());
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ success: false, data: null, message: 'Scene revision load failed' });
	});
});
