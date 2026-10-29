import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/auth-utils.js', () => ({ requireAdmin }));

import { GET } from './jobs/+server.js';

describe('GET /api/batch-summary/jobs', () => {
	beforeEach(() => {
		requireAdmin.mockReset().mockImplementation((event: any) => {
			if (!event.locals.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
			if (event.locals.user.role !== 'admin') throw Object.assign(new Error('Admin access required'), { status: 403 });
			return event.locals.user;
		});
	});

	it('rejects unauthenticated callers before reading the job manifest', async () => {
		await expect(GET({ locals: {} } as any)).rejects.toMatchObject({ status: 401 });
		expect(requireAdmin).toHaveBeenCalledOnce();
	});

	it('rejects authenticated non-admin callers', async () => {
		await expect(GET({ locals: { user: { id: 'user-1', role: 'user' } } } as any)).rejects.toMatchObject({ status: 403 });
	});
});
