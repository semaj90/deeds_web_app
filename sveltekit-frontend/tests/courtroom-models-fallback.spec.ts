// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockDb = {
	select: mockSelect,
};

vi.mock('$lib/server/db/client', () => ({
	db: mockDb,
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	courtroomModels: { __table: 'courtroom_models' },
	courtroomAnimations: { __table: 'courtroom_animations' },
}));

describe('courtroom models fallback', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSelect.mockReturnValue({ from: mockFrom });
		mockFrom.mockImplementation(async (table: { __table?: string }) => {
			if (table.__table === 'courtroom_models') return [];
			if (table.__table === 'courtroom_animations') return [];
			return [];
		});
	});

	it('returns a usable fallback manifest when no courtroom rows are seeded', async () => {
		const mod = await import('../src/routes/api/courtroom/models/+server.js');
		const response = await mod.GET({
			request: new Request('http://localhost/api/courtroom/models', { method: 'GET' }),
			locals: { user: { id: 'test-user' } },
			url: new URL('http://localhost/api/courtroom/models'),
			params: {},
		} as never);

		expect(response.status).toBe(200);
		const body = await response.json();

		expect(body.models).toHaveLength(4);
		expect(body.animations).toHaveLength(5);
		expect(body.models[0]).toMatchObject({
			role: 'prosecutor',
			modelUrl: '/models/courtroom/character_alice.glb',
			skeletonType: 'mixamo',
		});
		expect(body.animations[0]).toMatchObject({
			animType: 'speaking',
			animationUrl: '/models/courtroom/speaking_crossstage.glb',
		});
	});
});
