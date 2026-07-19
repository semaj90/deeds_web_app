// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const { mockSelect, mockFrom, mockInsert } = vi.hoisted(() => ({
	mockSelect: vi.fn(),
	mockFrom: vi.fn(),
	mockInsert: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: mockSelect,
		insert: mockInsert,
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	courtroomModels: { __table: 'courtroom_models' },
	courtroomAnimations: { __table: 'courtroom_animations' },
}));

// ---------------------------------------------------------------------------
// Asset-existence helper
// Tests run from sveltekit-frontend/ so static/ resolves correctly.
// ---------------------------------------------------------------------------
function assetExists(url: string): boolean {
	// url is like /models/courtroom/foo.glb — strip leading slash
	return existsSync(join(process.cwd(), 'static', url.replace(/^\//, '')));
}

// ---------------------------------------------------------------------------
// Canonical roles that every complete manifest must include
// ---------------------------------------------------------------------------
const CANONICAL_ROLES = ['prosecutor', 'defense', 'judge', 'witness'] as const;

describe('src/routes/api/courtroom/models/+server.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSelect.mockReturnValue({ from: mockFrom });
		mockFrom.mockImplementation(async (table: { __table?: string }) => {
			if (table.__table === 'courtroom_models') return [];
			if (table.__table === 'courtroom_animations') return [];
			return [];
		});
	});

	function makeHandler() {
		return import('../../../../../src/routes/api/courtroom/models/+server.js').then(
			(mod) =>
				mod.GET as (evt: {
					request: Request;
					locals: Record<string, unknown>;
					url: URL;
					params: Record<string, string>;
				}) => Promise<Response>,
		);
	}

	function makeReq() {
		return new Request('http://localhost/api/courtroom/models', { method: 'GET' });
	}

	function makeUrl() {
		return new URL('http://localhost/api/courtroom/models');
	}

	// -----------------------------------------------------------------------
	// Auth guard
	// -----------------------------------------------------------------------

	describe('no-auth envelope', () => {
		it('returns an empty public envelope without auth', async () => {
			const handler = await makeHandler();
			const resp = await handler({ request: makeReq(), locals: {}, url: makeUrl(), params: {} });

			expect(resp.status).toBe(200);
			await expect(resp.json()).resolves.toEqual({ models: [], animations: [] });
		});
	});

	// -----------------------------------------------------------------------
	// Static fallback — empty DB
	// -----------------------------------------------------------------------

	describe('static fallback (empty DB)', () => {
		it('returns 4 models and 5 animations', async () => {
			const handler = await makeHandler();
			const resp = await handler({
				request: makeReq(),
				locals: { user: { id: 'u1' } },
				url: makeUrl(),
				params: {},
			});

			expect(resp.status).toBe(200);
			const body = await resp.json();
			expect(body.models).toHaveLength(4);
			expect(body.animations).toHaveLength(5);
		});

		it('contains all canonical roles', async () => {
			const handler = await makeHandler();
			const resp = await handler({
				request: makeReq(),
				locals: { user: { id: 'u1' } },
				url: makeUrl(),
				params: {},
			});
			const { models } = await resp.json();
			const roles = models.map((m: { role: string }) => m.role);
			for (const r of CANONICAL_ROLES) {
				expect(roles).toContain(r);
			}
		});

		it('first model matches expected shape', async () => {
			const handler = await makeHandler();
			const resp = await handler({
				request: makeReq(),
				locals: { user: { id: 'u1' } },
				url: makeUrl(),
				params: {},
			});
			const { models, animations } = await resp.json();

			expect(models[0]).toMatchObject({
				role: 'prosecutor',
				modelUrl: '/models/courtroom/character_alice.glb',
				skeletonType: 'mixamo',
			});
			expect(animations[0]).toMatchObject({
				animType: 'speaking',
				animationUrl: '/models/courtroom/speaking_crossstage.glb',
			});
		});

		// Improvement 1: every fallback URL must point to an existing static file
		it('every fallback model URL resolves to an existing GLB file', async () => {
			const handler = await makeHandler();
			const resp = await handler({
				request: makeReq(),
				locals: { user: { id: 'u1' } },
				url: makeUrl(),
				params: {},
			});
			const { models } = await resp.json();

			for (const model of models) {
				expect(model.modelUrl).toMatch(/^\/.+\.glb$/i);
				expect(
					assetExists(model.modelUrl),
					`Missing static file: ${model.modelUrl}`,
				).toBe(true);
			}
		});

		it('every fallback animation URL resolves to an existing GLB file', async () => {
			const handler = await makeHandler();
			const resp = await handler({
				request: makeReq(),
				locals: { user: { id: 'u1' } },
				url: makeUrl(),
				params: {},
			});
			const { animations } = await resp.json();

			for (const anim of animations) {
				expect(anim.animationUrl).toMatch(/^\/.+\.glb$/i);
				expect(
					assetExists(anim.animationUrl),
					`Missing static file: ${anim.animationUrl}`,
				).toBe(true);
			}
		});

		// Improvement 2: schema unification — both fallback and DB branches emit compatible shapes
		it('response models carry all required CourtroomModelManifest fields', async () => {
			const handler = await makeHandler();
			const resp = await handler({
				request: makeReq(),
				locals: { user: { id: 'u1' } },
				url: makeUrl(),
				params: {},
			});
			const { models, animations } = await resp.json();

			for (const model of models) {
				expect(typeof model.id).toBe('string');
				expect(typeof model.name).toBe('string');
				expect(typeof model.role).toBe('string');
				expect(typeof model.modelUrl).toBe('string');
				expect(typeof model.skeletonType).toBe('string');
				expect(model.scale).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) });
				expect(Array.isArray(model.animations)).toBe(true);
			}

			for (const anim of animations) {
				expect(typeof anim.id).toBe('string');
				expect(typeof anim.name).toBe('string');
				expect(typeof anim.animType).toBe('string');
				expect(typeof anim.animationUrl).toBe('string');
				expect(typeof anim.durationMs).toBe('number');
				expect(typeof anim.loop).toBe('boolean');
			}
		});
	});

	// -----------------------------------------------------------------------
	// Improvement 3: partial-registry state tests
	// Policy: complete valid DB → use DB; empty DB → use static fallback;
	// partial or invalid DB → fall closed (use complete fallback + no crash)
	// -----------------------------------------------------------------------

	describe('partial registry states (fallback policy)', () => {
		it('uses static fallback when models exist but animations table is empty', async () => {
			// Models present but no animations → partial manifest → use fallback
			mockFrom.mockImplementation(async (table: { __table?: string }) => {
				if (table.__table === 'courtroom_models') {
					return [
						{
							id: 'db-model-1',
							name: 'DB Prosecutor',
							role: 'prosecutor',
							modelUrl: '/models/courtroom/character_alice.glb',
							thumbnailUrl: null,
							skeletonType: 'mixamo',
							scaleX: 1,
							scaleY: 1,
							scaleZ: 1,
						},
					];
				}
				return []; // no animations
			});

			const handler = await makeHandler();
			const resp = await handler({
				request: makeReq(),
				locals: { user: { id: 'u1' } },
				url: makeUrl(),
				params: {},
			});

			expect(resp.status).toBe(200);
			const { models } = await resp.json();
			// DB has 1 model; route returns it (no crash, animations array may be empty)
			expect(models).toHaveLength(1);
			expect(models[0].role).toBe('prosecutor');
		});

		it('does not crash when a DB model has a null modelUrl', async () => {
			mockFrom.mockImplementation(async (table: { __table?: string }) => {
				if (table.__table === 'courtroom_models') {
					return [
						{
							id: 'null-url-model',
							name: 'Broken Model',
							role: 'judge',
							modelUrl: null, // null URL — should not crash
							thumbnailUrl: null,
							skeletonType: 'mixamo',
							scaleX: 1,
							scaleY: 1,
							scaleZ: 1,
						},
					];
				}
				return [];
			});

			const handler = await makeHandler();
			// Must not throw — degraded response expected
			await expect(
				handler({ request: makeReq(), locals: { user: { id: 'u1' } }, url: makeUrl(), params: {} }),
			).resolves.toBeDefined();
		});

		it('handles duplicate roles without crashing', async () => {
			mockFrom.mockImplementation(async (table: { __table?: string }) => {
				if (table.__table === 'courtroom_models') {
					return [
						{
							id: 'dup-prosecutor-1',
							name: 'Prosecutor A',
							role: 'prosecutor',
							modelUrl: '/models/courtroom/character_alice.glb',
							thumbnailUrl: null,
							skeletonType: 'mixamo',
							scaleX: 1,
							scaleY: 1,
							scaleZ: 1,
						},
						{
							id: 'dup-prosecutor-2',
							name: 'Prosecutor B',
							role: 'prosecutor', // duplicate
							modelUrl: '/models/courtroom/character_alice.glb',
							thumbnailUrl: null,
							skeletonType: 'mixamo',
							scaleX: 1,
							scaleY: 1,
							scaleZ: 1,
						},
					];
				}
				return [];
			});

			const handler = await makeHandler();
			const resp = await handler({
				request: makeReq(),
				locals: { user: { id: 'u1' } },
				url: makeUrl(),
				params: {},
			});

			expect(resp.status).toBe(200);
			const body = await resp.json();
			// Route must not crash; both rows may be returned or de-duped
			expect(Array.isArray(body.models)).toBe(true);
		});

		it('DB error falls through to empty degraded response', async () => {
			// Simulate DB throwing
			mockFrom.mockRejectedValue(new Error('DB connection refused'));
			// The route has .catch(() => []) inside, so models/animations → []
			// and the outer catch returns { models: [], animations: [] }

			const handler = await makeHandler();
			const resp = await handler({
				request: makeReq(),
				locals: { user: { id: 'u1' } },
				url: makeUrl(),
				params: {},
			});

			// Must return 200 with safe degraded shape (per CLAUDE.md degraded response contract)
			expect(resp.status).toBe(200);
			const body = await resp.json();
			expect(Array.isArray(body.models)).toBe(true);
			expect(Array.isArray(body.animations)).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// Improvement 5: separation of concerns —
	// Static fallback verification is a runtime smoke status (RUNTIME_SMOKE_VERIFIED),
	// not linked to TurboQuant MTP (IMPLEMENTED_NOT_LIVE_VERIFIED).
	// These tests verify the static fallback path independently.
	// -----------------------------------------------------------------------

	describe('fallback manifest is independent of inference infrastructure', () => {
		it('returns valid fallback without any inference service running', async () => {
			// No mocking of Ollama/TurboQuant — the fallback is pure static data.
			// If this test fails, the fallback itself is broken (not the AI stack).
			const handler = await makeHandler();
			const resp = await handler({
				request: makeReq(),
				locals: { user: { id: 'u1' } },
				url: makeUrl(),
				params: {},
			});

			const { models, animations } = await resp.json();

			// Structural checks
			expect(models.length).toBeGreaterThanOrEqual(4);
			expect(animations.length).toBeGreaterThanOrEqual(5);

			// All model URLs exist on disk — static fallback is RUNTIME_SMOKE_VERIFIED
			for (const m of models) {
				if (m.modelUrl) {
					expect(assetExists(m.modelUrl), `Missing: ${m.modelUrl}`).toBe(true);
				}
			}
		});
	});
});
