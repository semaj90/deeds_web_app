// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server.js';

const mocks = vi.hoisted(() => ({
	insertValues: vi.fn(),
	resolveTarget: vi.fn(),
}));

vi.mock('$lib/server/auth-utils.js', () => ({
	requireAdmin: (event: { locals: { user?: { id: string; role: string } } }) => {
		const user = event.locals.user;
		if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 });
		if (user.role !== 'admin' && user.role !== 'superadmin') {
			throw Object.assign(new Error('Admin access required'), { status: 403 });
		}
		return user;
	},
}));

vi.mock('$lib/server/llm/runtime-contract.js', () => ({
	resolveLlamaInferenceTarget: mocks.resolveTarget,
}));

vi.mock('$lib/server/db/client.js', () => ({
	db: { insert: vi.fn(() => ({ values: mocks.insertValues })) },
}));

vi.mock('$lib/server/db/schema.js', () => ({ chatMessages: {} }));

function makeEvent(body: unknown, user: { id: string; role: string } | null = { id: '7', role: 'admin' }) {
	return {
		request: new Request('http://localhost/api/admin/chat', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: typeof body === 'string' ? body : JSON.stringify(body),
		}),
		locals: { user: user ?? undefined },
	} as never;
}

describe('POST /api/admin/chat', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.insertValues.mockResolvedValue(undefined);
		mocks.resolveTarget.mockResolvedValue({ baseUrl: 'http://llama.test/', model: 'ornith-1.5-9b' });
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
			choices: [{ message: { content: 'grounded answer' } }],
			usage: { total_tokens: 12 },
		}), { status: 200, headers: { 'content-type': 'application/json' } })));
	});

	afterEach(() => vi.unstubAllGlobals());

	it('rejects unauthenticated callers before parsing or side effects', async () => {
		await expect(POST(makeEvent('{invalid json', null))).rejects.toMatchObject({ status: 401 });
		expect(mocks.resolveTarget).not.toHaveBeenCalled();
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it('rejects non-admin callers before resolving the model', async () => {
		await expect(POST(makeEvent({ message: 'hi', chatId: 'test' }, { id: '8', role: 'user' })))
			.rejects.toMatchObject({ status: 403 });
		expect(mocks.resolveTarget).not.toHaveBeenCalled();
	});

	it('returns 400 for malformed JSON and invalid bounded input', async () => {
		const malformed = await POST(makeEvent('{invalid json'));
		expect(malformed.status).toBe(400);
		expect(await malformed.json()).toEqual({ error: 'invalid_json' });

		const invalid = await POST(makeEvent({ message: ' ', chatId: 'test', history: Array(33).fill({ role: 'user', content: 'x' }) }));
		expect(invalid.status).toBe(400);
		expect(mocks.resolveTarget).not.toHaveBeenCalled();
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it('does not persist a user message when the active model cannot be resolved', async () => {
		mocks.resolveTarget.mockRejectedValue(new Error('model unavailable'));
		const response = await POST(makeEvent({ message: 'hello', chatId: 'test' }));
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'llama_server_unavailable' });
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it('uses the loaded llama-server model and records both messages', async () => {
		const fetchMock = vi.mocked(fetch);
		const response = await POST(makeEvent({ message: 'hello', chatId: 'test' }));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ content: 'grounded answer' });
		expect(fetchMock).toHaveBeenCalledWith('http://llama.test/v1/chat/completions', expect.objectContaining({
			method: 'POST',
			body: expect.stringContaining('"model":"ornith-1.5-9b"'),
		}));
		expect(mocks.insertValues).toHaveBeenCalledTimes(2);
	});
});
