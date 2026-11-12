import { beforeEach, describe, expect, it, vi } from 'vitest';

const values = vi.hoisted(() => vi.fn());
const insert = vi.hoisted(() => vi.fn(() => ({ values })));
const getAuthorizedCase = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db/client', () => ({ db: { insert } }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase }));

import { POST } from './+server';

function call(body: Record<string, unknown>, user: unknown = { id: 7 }) {
	return POST({
		request: new Request('http://localhost/api/v1/chat/sessions', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
		locals: { user },
	} as never);
}

beforeEach(() => {
	values.mockReset().mockResolvedValue(undefined);
	insert.mockClear();
	getAuthorizedCase.mockReset().mockResolvedValue({ id: 'a2b6d51c-5595-4ccd-a86b-ff89c0d349cc' });
});

describe('POST /api/v1/chat/sessions identity binding', () => {
	it('requires a real authenticated actor', async () => {
		const response = await call({ userId: '7' }, null);
		expect(response.status).toBe(401);
		expect(insert).not.toHaveBeenCalled();
	});

	it('rejects a request body that names another user', async () => {
		const response = await call({ userId: '8' });
		expect(response.status).toBe(403);
		expect(insert).not.toHaveBeenCalled();
	});

	it('rejects case sessions without current case access', async () => {
		getAuthorizedCase.mockResolvedValueOnce(null);
		const response = await call({ userId: '7', caseId: 'a2b6d51c-5595-4ccd-a86b-ff89c0d349cc' });
		expect(response.status).toBe(404);
		expect(insert).not.toHaveBeenCalled();
	});

	it('stores the authenticated actor as the session owner', async () => {
		const response = await call({ userId: '7' });
		expect(response.status).toBe(201);
		expect(insert).toHaveBeenCalledOnce();
		expect(values).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, caseId: null }));
		await expect(response.json()).resolves.toMatchObject({ userId: '7' });
	});
});
