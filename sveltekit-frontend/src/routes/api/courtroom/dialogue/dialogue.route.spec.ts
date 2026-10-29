// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server.js';
import { routeInference } from '$lib/server/inference/inference-router.js';

vi.mock('$lib/server/auth-utils.js', () => ({
	requireUser: vi.fn((event: { locals: { user?: unknown } }) => {
		if (!event.locals.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
		return event.locals.user;
	}),
}));

vi.mock('$lib/server/inference/inference-router.js', () => ({
	routeInference: vi.fn(),
}));

function makeEvent(body: unknown, authenticated = true) {
	const request = new Request('http://app.test/api/courtroom/dialogue', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
	return { request, locals: authenticated ? { user: { id: 1 } } : {} } as any;
}

const validRequest = {
	caseId: 'demo-fictional-001',
	storyVersion: 1,
	actorId: 'jester',
	phase: 'cross',
	topic: 'the ledger photograph',
	evidenceIds: ['ledger-photo'],
};

describe('POST /api/courtroom/dialogue', () => {
	beforeEach(() => vi.mocked(routeInference).mockReset());
	afterEach(() => vi.restoreAllMocks());

	it('authenticates before parsing malformed request bodies', async () => {
		await expect(POST(makeEvent('{broken', false))).rejects.toMatchObject({ status: 401 });
		expect(routeInference).not.toHaveBeenCalled();
	});

	it('rejects real-case ids and client-supplied authority fields', async () => {
		for (const body of [
			{ ...validRequest, caseId: 'real-case-123' },
			{ ...validRequest, knownFacts: ['client invented fact'] },
			{ ...validRequest, evidenceIds: ['unreviewed-upload'] },
		]) {
			const response = await POST(makeEvent(body));
			expect(response.status).toBe(400);
		}
		expect(routeInference).not.toHaveBeenCalled();
	});

	it('returns a revision-tagged proposal without authorizing story changes', async () => {
		vi.mocked(routeInference).mockResolvedValue({
			text: JSON.stringify({ text: 'I can only speak to the admitted exhibit.', intent: 'answer', emotion: 'neutral' }),
			model: 'ornith-test-revision', backend: 'llama-server', latencyMs: 15,
		});
		const response = await POST(makeEvent(validRequest));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			caseId: validRequest.caseId,
			actorId: validRequest.actorId,
			phase: validRequest.phase,
			evidenceIds: validRequest.evidenceIds,
			allowedIntents: ['answer', 'decline', 'ask_clarification'],
			modelRevision: 'ornith-test-revision',
			text: 'I can only speak to the admitted exhibit.',
			intent: 'answer',
			emotion: 'neutral',
			proposalOnly: true,
		});
		const inferenceRequest = vi.mocked(routeInference).mock.calls[0][0];
		expect(inferenceRequest.maxTokens).toBe(180);
		expect(inferenceRequest.prompt).toContain('ledger-photo');
		expect(inferenceRequest.prompt).not.toContain('contents are described');
	});

	it('rejects malformed model output and returns unavailable when inference fails', async () => {
		vi.mocked(routeInference).mockResolvedValueOnce({
			text: JSON.stringify({ text: 'I found proof of fraud.', intent: 'invent_evidence' }),
			model: 'test-model', backend: 'llama-server', latencyMs: 15,
		});
		const invalid = await POST(makeEvent(validRequest));
		expect(invalid.status).toBe(502);
		expect(await invalid.json()).toEqual({ error: 'invalid_model_proposal' });

		vi.mocked(routeInference).mockRejectedValueOnce(new Error('offline'));
		const unavailable = await POST(makeEvent(validRequest));
		expect(unavailable.status).toBe(503);
		expect(await unavailable.json()).toEqual({ error: 'dialogue_assistance_unavailable' });
	});
});
