import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyntheticCourtroomProjectV1 } from '$lib/courtroom/courtroom-video-project-v1.js';

const storeMocks = vi.hoisted(() => ({
	getLatestSyntheticCourtroomDraftV1: vi.fn(),
	saveSyntheticCourtroomDraftV1: vi.fn(),
}));

vi.mock('$lib/server/courtroom/courtroom-draft-artifacts-v1.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/courtroom/courtroom-draft-artifacts-v1.js')>();
	return {
		...actual,
		getLatestSyntheticCourtroomDraftV1: storeMocks.getLatestSyntheticCourtroomDraftV1,
		saveSyntheticCourtroomDraftV1: storeMocks.saveSyntheticCourtroomDraftV1,
	};
});

import { GET, POST } from './+server.js';

function event(overrides: Record<string, unknown> = {}) {
	return {
		locals: { user: { id: 'user-17' } },
		setHeaders: vi.fn(),
		request: new Request('http://localhost/api/courtroom/studio/draft', { method: 'POST', body: '{}' }),
		...overrides,
	} as never;
}

describe('courtroom synthetic draft API', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns a stable unauthorized shape before touching the artifact owner', async () => {
		const response = await GET(event({ locals: { user: null } }));
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			schema: 'atlas.courtroom-draft-api.v1',
			status: 'UNAUTHORIZED',
			project: null,
			artifactId: null,
			projectRevision: null,
			error: 'UNAUTHORIZED',
		});
		expect(storeMocks.getLatestSyntheticCourtroomDraftV1).not.toHaveBeenCalled();
	});

	it('returns a stable not-found shape for an authenticated account without a saved draft', async () => {
		storeMocks.getLatestSyntheticCourtroomDraftV1.mockResolvedValue(null);
		const response = await GET(event());
		expect(response.status).toBe(404);
		expect((await response.json()).status).toBe('NOT_FOUND');
		expect(storeMocks.getLatestSyntheticCourtroomDraftV1).toHaveBeenCalledWith('user-17');
	});

	it('rejects real-case scope before attempting artifact persistence', async () => {
		const project = { ...createSyntheticCourtroomProjectV1(), caseId: 'case-real-1' };
		const response = await POST(event({
			request: new Request('http://localhost/api/courtroom/studio/draft', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ project, expectedRevision: null }),
			}),
		}));
		expect(response.status).toBe(400);
		expect(storeMocks.saveSyntheticCourtroomDraftV1).not.toHaveBeenCalled();
	});

	it('binds a save request to the authenticated owner and expected prior revision', async () => {
		const project = createSyntheticCourtroomProjectV1();
		storeMocks.saveSyntheticCourtroomDraftV1.mockResolvedValue({
			project: { ...project, storyboardChecksum: `sha256:${'a'.repeat(64)}` },
			artifact: { artifactId: 'sha256:artifact-hash' },
		});
		const response = await POST(event({
			request: new Request('http://localhost/api/courtroom/studio/draft', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ project, expectedRevision: null }),
			}),
		}));
		expect(response.status).toBe(201);
		expect(storeMocks.saveSyntheticCourtroomDraftV1).toHaveBeenCalledWith({
			ownerId: 'user-17',
			expectedRevision: null,
			project,
		});
		expect((await response.json()).projectRevision).toBe(1);
	});
});
