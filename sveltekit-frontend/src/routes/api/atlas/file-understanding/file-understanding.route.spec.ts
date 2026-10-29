import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getDatabaseUrl: vi.fn(),
	poolConstructor: vi.fn(),
	connect: vi.fn(),
}));

vi.mock('$lib/config/env.server.js', () => ({ getDatabaseUrl: mocks.getDatabaseUrl }));
vi.mock('$lib/server/auth-utils.js', () => ({
	requireUser: (event: { locals?: { user?: { id: string } } }) => {
		if (!event.locals?.user) throw new Response('Unauthorized', { status: 401 });
	},
}));
vi.mock('pg', () => ({
	default: {
		Pool: class {
			constructor(options: unknown) {
				mocks.poolConstructor(options);
			}

			connect() {
				return mocks.connect();
			}
		},
	},
}));

import { GET, POST } from './+server.js';

function makePostEvent(body: unknown) {
	return {
		locals: { user: { id: 'user-1' } },
		request: new Request('http://localhost/api/atlas/file-understanding', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
	} as never;
}

describe('/api/atlas/file-understanding database configuration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getDatabaseUrl.mockImplementation(() => {
			throw new Error('DATABASE_URL_REQUIRED');
		});
	});

	it('fails closed with 503 for GET without constructing a pool', async () => {
		const response = await GET({
			locals: { user: { id: 'user-1' } },
			url: new URL('http://localhost/api/atlas/file-understanding'),
		} as never);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'Database is not configured' });
		expect(mocks.poolConstructor).not.toHaveBeenCalled();
	});

	it('validates POST input before resolving database configuration', async () => {
		const invalid = await POST(makePostEvent({ packet_key: '' }));
		expect(invalid.status).toBe(400);
		expect(mocks.getDatabaseUrl).not.toHaveBeenCalled();

		const valid = await POST(makePostEvent({ packet_key: 'packet-1' }));
		expect(valid.status).toBe(503);
		expect(await valid.json()).toEqual({ error: 'Database is not configured' });
		expect(mocks.poolConstructor).not.toHaveBeenCalled();
	});
});
