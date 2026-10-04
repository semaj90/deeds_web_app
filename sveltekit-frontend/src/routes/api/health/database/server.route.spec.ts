import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	dbExecute: vi.fn(),
	getPoolStatus: vi.fn(() => ({ poolHealthy: true })),
	resetPoolHealth: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
	db: { execute: mocks.dbExecute },
	getPoolStatus: mocks.getPoolStatus,
	resetPoolHealth: mocks.resetPoolHealth,
}));

vi.mock('drizzle-orm', () => ({ sql: (...parts: unknown[]) => parts }));

import { GET } from './+server';

const expectedKeys = ['engine', 'pool', 'reason', 'retryable', 'service', 'sqlstate', 'status', 'timestamp'];

async function getHealth(user: { id: string } | null = { id: 'test-user' }) {
	return GET({ locals: { user } } as never);
}

describe('GET /api/health/database', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getPoolStatus.mockReturnValue({ poolHealthy: true });
	});

	it('returns stable keys after a successful read-only probe', async () => {
		mocks.dbExecute.mockResolvedValue({ rows: [{ ok: 1 }] });
		const response = await getHealth();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ status: 'healthy', reason: 'OK', sqlstate: null, retryable: false });
		expect(Object.keys(body).sort()).toEqual(expectedKeys);
		expect(mocks.resetPoolHealth).not.toHaveBeenCalled();
	});

	it('surfaces PostgreSQL startup as STARTING with stable keys', async () => {
		mocks.dbExecute.mockRejectedValue(Object.assign(new Error('the database system is starting up'), { code: '57P03' }));
		const response = await getHealth();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ status: 'starting', reason: 'STARTING_UP', sqlstate: '57P03', retryable: true });
		expect(Object.keys(body).sort()).toEqual(expectedKeys);
		expect(mocks.resetPoolHealth).not.toHaveBeenCalled();
	});

	it('keeps UNAVAILABLE and unauthorized response shapes stable', async () => {
		mocks.dbExecute.mockRejectedValue(Object.assign(new Error('password authentication failed'), { code: '28P01' }));
		const unavailable = await getHealth();
		const unavailableBody = await unavailable.json();
		const unauthorized = await getHealth(null);
		const unauthorizedBody = await unauthorized.json();

		expect(unavailableBody).toMatchObject({ status: 'unavailable', reason: 'AUTH_OR_CONFIG', retryable: false });
		expect(unauthorized.status).toBe(401);
		expect(unauthorizedBody).toMatchObject({ status: 'unavailable', reason: 'UNAUTHORIZED', sqlstate: null });
		expect(Object.keys(unavailableBody).sort()).toEqual(expectedKeys);
		expect(Object.keys(unauthorizedBody).sort()).toEqual(expectedKeys);
	});
});
