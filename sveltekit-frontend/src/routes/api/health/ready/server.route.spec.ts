import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	dbExecute: vi.fn(),
	redisPing: vi.fn(),
	ollamaFetch: vi.fn(),
	profile: null as unknown,
	env: {
		OLLAMA_BASE_URL: 'http://ollama.test',
		QDRANT_URL: 'http://qdrant.test',
		TURBOVEC_SIDECAR_JSONRPC_URL: undefined as string | undefined,
		TURBOVEC_SIDECAR: undefined as string | undefined,
	},
}));

vi.mock('$lib/server/db/client', () => ({ db: { execute: mocks.dbExecute } }));
vi.mock('drizzle-orm', () => ({ sql: (...parts: unknown[]) => parts }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => ({ ping: mocks.redisPing }) }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: mocks.env }));
vi.mock('$lib/server/ollama.js', () => ({ ollamaFetch: mocks.ollamaFetch }));
vi.mock('$lib/server/runtime-profile.js', () => ({
	getParentAtlasRuntimeProfileManifest: () => mocks.profile,
}));
vi.mock('$lib/server/neo4j-driver.js', () => ({ getNeo4jDriver: vi.fn() }));

import { GET } from './+server';

function makeProfile(engramState: 'disabled' | 'optional' | 'required') {
	const requirement = (state: 'disabled' | 'optional' | 'required') => ({
		state,
		rationale: `${state} test requirement`,
	});
	return {
		profile: 'ci_fixture',
		source: 'test_env',
		manifestVersion: 1,
		services: {
			postgres: requirement('required'),
			redis: requirement('disabled'),
			qdrant: requirement('disabled'),
			neo4j: requirement('disabled'),
			ollama: requirement('disabled'),
			engram_embed: requirement(engramState),
		},
		features: {},
		notes: [],
	};
}

async function getReady(fetchImpl = vi.fn()) {
	return GET({
		locals: { user: { id: 'test-user' } },
		fetch: fetchImpl,
	} as never);
}

describe('GET /api/health/ready', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.dbExecute.mockResolvedValue({ rows: [{ ok: 1 }] });
		mocks.redisPing.mockResolvedValue('PONG');
		mocks.ollamaFetch.mockResolvedValue({ ok: true });
		mocks.env.TURBOVEC_SIDECAR_JSONRPC_URL = undefined;
		mocks.env.TURBOVEC_SIDECAR = undefined;
	});

	it('does not turn a missing optional sidecar URL into a 500', async () => {
		mocks.profile = makeProfile('optional');
		const fetchImpl = vi.fn();
		const response = await getReady(fetchImpl);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.ready).toBe(true);
		expect(body.services.engram_embed).toMatchObject({ required: false, ok: false });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('reports missing required sidecar configuration as not ready', async () => {
		mocks.profile = makeProfile('required');
		const response = await getReady();
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.ready).toBe(false);
		expect(body.services.engram_embed).toMatchObject({ required: true, ok: false });
	});

	it('uses SvelteKit fetch and converts a failed sidecar probe to not ready', async () => {
		mocks.profile = makeProfile('required');
		mocks.env.TURBOVEC_SIDECAR_JSONRPC_URL = 'http://sidecar.test/rpc';
		const fetchImpl = vi.fn().mockRejectedValue(new Error('connection refused'));
		const response = await getReady(fetchImpl);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.ready).toBe(false);
		expect(fetchImpl).toHaveBeenCalledWith(
			new URL('/health', 'http://sidecar.test/rpc'),
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});
});
