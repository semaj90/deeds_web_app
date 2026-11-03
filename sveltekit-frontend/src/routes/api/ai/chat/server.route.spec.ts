import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	traceLLM: vi.fn(),
	routeInference: vi.fn(),
}));

vi.mock('$lib/server/observability/langfuse.js', () => ({ traceLLM: mocks.traceLLM }));
vi.mock('$lib/server/inference/inference-router.js', () => ({ routeInference: mocks.routeInference }));

import { POST } from './+server.js';

function request(body: unknown): Request {
	return new Request('http://localhost/api/ai/chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

async function post(body: unknown): Promise<Response> {
	return POST({ request: request(body), locals: { user: { id: 'test-user' } } } as never);
}

describe('/api/ai/chat input boundary', () => {
	beforeEach(() => {
		mocks.traceLLM.mockReset();
		mocks.routeInference.mockReset();
	});

	it.each([{ message: '' }, { prompt: ' \t\n ' }, {}])('rejects blank input before inference: $message', async (body) => {
		const response = await post(body);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'Message is required' });
		expect(mocks.traceLLM).not.toHaveBeenCalled();
		expect(mocks.routeInference).not.toHaveBeenCalled();
	});
});
