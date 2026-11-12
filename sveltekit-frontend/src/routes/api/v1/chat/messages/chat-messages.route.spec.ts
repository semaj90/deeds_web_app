// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const limit = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const values = vi.hoisted(() => vi.fn());
const insert = vi.hoisted(() => vi.fn());
const where = vi.hoisted(() => vi.fn());
const set = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const getAuthorizedCase = vi.hoisted(() => vi.fn());
const recordChatMessageForRecall = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db/client', () => ({ db: { select, insert, update } }));
vi.mock('$lib/server/db', async () => {
	const { z } = await import('zod');
	return {
		chatMessages: { name: 'chat_messages' },
		chatMetadata: { chatId: 'chat_id', userId: 'user_id', caseId: 'case_id' },
		insertChatMessageSchema: z.object({
			sessionId: z.string().min(1),
			role: z.string(),
			content: z.string().min(1),
		}),
	};
});
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => 'eq') }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase }));
vi.mock('$lib/server/ace/chat-memory.js', () => ({ recordChatMessageForRecall }));

import { POST } from './+server';

const CASE_ID = 'a2b6d51c-5595-4ccd-a86b-ff89c0d349cc';

function call(body: Record<string, unknown>, user: unknown = { id: 7 }) {
	return POST({
		request: new Request('http://localhost/api/v1/chat/messages', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
		locals: { user },
	} as never);
}

const message = { sessionId: 'chat_1', role: 'user', content: 'hello' };

beforeEach(() => {
	limit.mockReset().mockResolvedValue([{ userId: 7, caseId: null }]);
	select.mockReset().mockReturnValue({ from: () => ({ where: () => ({ limit }) }) });
	values.mockReset().mockResolvedValue(undefined);
	insert.mockReset().mockReturnValue({ values });
	where.mockReset().mockResolvedValue(undefined);
	set.mockReset().mockReturnValue({ where });
	update.mockReset().mockReturnValue({ set });
	getAuthorizedCase.mockReset().mockResolvedValue({ id: CASE_ID });
	recordChatMessageForRecall.mockReset();
});

describe('POST /api/v1/chat/messages ownership', () => {
	it('requires a real authenticated actor and writes nothing without one', async () => {
		for (const user of [null, { id: 'abc' }, { id: 0 }]) {
			expect((await call(message, user)).status).toBe(401);
		}
		expect(insert).not.toHaveBeenCalled();
	});

	it('appends to a session the actor owns', async () => {
		const response = await call(message);
		expect(response.status).toBe(201);
		expect(insert).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledOnce();
	});

	it('returns the same non-disclosing 404 for a foreign session, an unknown session and a missing owner row', async () => {
		for (const rows of [[{ userId: 8, caseId: null }], []]) {
			limit.mockResolvedValueOnce(rows);
			const response = await call(message);
			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toEqual({ error: 'Chat session not found' });
		}
		expect(insert).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
		expect(recordChatMessageForRecall).not.toHaveBeenCalled();
	});

	it('rejects a case-bound session when current case access is gone', async () => {
		limit.mockResolvedValueOnce([{ userId: 7, caseId: CASE_ID }]);
		getAuthorizedCase.mockResolvedValueOnce(null);
		expect((await call(message)).status).toBe(404);
		expect(getAuthorizedCase).toHaveBeenCalledWith(CASE_ID, 7);
		expect(insert).not.toHaveBeenCalled();
	});

	it('still rejects an invalid body before touching the database', async () => {
		expect((await call({ sessionId: '', role: 'user', content: '' })).status).toBe(400);
		expect(select).not.toHaveBeenCalled();
	});
});
