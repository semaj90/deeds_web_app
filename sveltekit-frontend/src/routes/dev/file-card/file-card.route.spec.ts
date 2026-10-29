import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	env: {
		DATABASE_URL: undefined as string | undefined,
		NEO4J_URI: undefined as string | undefined,
		NEO4J_USER: undefined as string | undefined,
		NEO4J_PASSWORD: undefined as string | undefined,
		QDRANT_URL: undefined as string | undefined,
	},
	pool: vi.fn(),
}));

vi.mock('node:fs', () => ({
	default: {
		existsSync: vi.fn(() => false),
		readFileSync: vi.fn(),
	},
}));
vi.mock('pg', () => ({ default: { Pool: mocks.pool } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: mocks.env }));

import { load } from './[...sourceRef]/+page.server.js';

describe('dev file-card database configuration', () => {
	beforeEach(() => {
		mocks.env.DATABASE_URL = undefined;
		mocks.pool.mockClear();
	});

	it('returns 503 without constructing a database pool when DATABASE_URL is absent', async () => {
		await expect(
			load({ params: { sourceRef: '__file_card_database_unconfigured_test__' } } as Parameters<typeof load>[0]),
		).rejects.toMatchObject({ status: 503 });
		expect(mocks.pool).not.toHaveBeenCalled();
	});
});
