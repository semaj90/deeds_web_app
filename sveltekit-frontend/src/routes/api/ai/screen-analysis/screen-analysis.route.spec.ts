import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbExecute = vi.fn();
const mockGetAuthorizedCase = vi.fn();
const mockRedisSet = vi.fn().mockResolvedValue('OK');
const mockGetActiveLocalVlmModel = vi.fn();
const mockGetLlamaSessionDescriptor = vi.fn();

vi.mock('$lib/server/db/client.js', () => ({
	db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
	pgRows: (res: unknown) => (Array.isArray(res) ? res : ((res as { rows?: unknown[] })?.rows ?? []))
}));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: (...args: unknown[]) => mockGetAuthorizedCase(...args) }));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({ set: mockRedisSet })
}));

vi.mock('$lib/server/ai/local-llama-provider.js', () => ({
	LLAMA_SERVER_BASE_URL: 'http://127.0.0.1:8090/v1',
	getActiveLocalVlmModel: (...args: unknown[]) => mockGetActiveLocalVlmModel(...args),
	getLlamaSessionDescriptor: (...args: unknown[]) => mockGetLlamaSessionDescriptor(...args)
}));

import { GET, POST } from './+server';

describe('/api/ai/screen-analysis route contract', () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetActiveLocalVlmModel.mockResolvedValue('ornith-1.5-9b');
		mockGetLlamaSessionDescriptor.mockResolvedValue({
			healthy: true,
			modelId: 'ornith-1.5-9b'
		});
		mockDbExecute.mockResolvedValue({
			rows: [
				{
					id: '986b5214-1962-43b2-aff9-c132cdf21e69',
					title: 'Commonwealth v. Sterling',
					case_number: '2026-CR-0986',
					status: 'open',
					jurisdiction: 'Massachusetts',
					description: 'Chain of custody and admissibility review.'
				}
			]
		});
		mockGetAuthorizedCase.mockResolvedValue({ id: '986b5214-1962-43b2-aff9-c132cdf21e69' });
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('GET returns stable top-level keys even when Ornith probe throws', async () => {
		mockGetLlamaSessionDescriptor.mockRejectedValueOnce(new Error('probe failed'));
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

		const res = await GET({} as never);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Object.keys(body).sort()).toEqual([
			'endpoint',
			'healthy',
			'mode',
			'model',
			'ok',
			'timestamp',
			'visionProjectorLoaded'
		]);
		expect(body.ok).toBe(false);
		expect(body.mode).toBe('offline');
	});

	it('POST rejects invalid Zod payloads with 400', async () => {
		const req = new Request('http://localhost/api/ai/screen-analysis', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'screen', message: '' })
		});

		const res = await POST({
			request: req,
			locals: { user: { id: '1' } }
		} as never);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.ok).toBe(false);
	});

	it('POST denies an unrelated case user before reading case context', async () => {
		mockGetAuthorizedCase.mockResolvedValueOnce(null);
		const req = new Request('http://localhost/api/screen-analysis', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'chat', message: 'Summarize the case.', caseId: '986b5214-1962-43b2-aff9-c132cdf21e69' })
		});

		const res = await POST({ request: req, locals: { user: { id: '99' } } } as never);
		expect(res.status).toBe(404);
		expect(mockGetAuthorizedCase).toHaveBeenCalledWith('986b5214-1962-43b2-aff9-c132cdf21e69', 99);
		expect(mockDbExecute).not.toHaveBeenCalled();
	});

	it('POST sends multimodal image_url when :8090 vision projector is loaded, strips <think>, and writes ACE packet', async () => {
		let capturedCompletionBody: Record<string, unknown> | null = null;
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/health')) {
				return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
			}
			if (url.endsWith('/props')) {
				return new Response(JSON.stringify({ modalities: { vision: true } }), { status: 200 });
			}
			if (url.endsWith('/chat/completions')) {
				capturedCompletionBody = JSON.parse(String(init?.body ?? '{}'));
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content:
										'<think>internal draft</think>Screen shows 0 exhibits indexed; upload custody affidavit exhibit first.'
								}
							}
						]
					}),
					{ status: 200 }
				);
			}
			return new Response('{}', { status: 404 });
		}) as unknown as typeof fetch;

		const req = new Request('http://localhost/api/screen-analysis', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				mode: 'screen',
				message: 'Analyze visible dossier screen.',
				caseId: '986b5214-1962-43b2-aff9-c132cdf21e69',
				currentRoute: '/cases/986b5214-1962-43b2-aff9-c132cdf21e69',
				imageBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
				uiSnapshot: {
					pathname: '/cases/986b5214-1962-43b2-aff9-c132cdf21e69',
					headings: ['Commonwealth v. Sterling'],
					metrics: ['Total Evidence: 0']
				}
			})
		});

		const res = await POST({
			request: req,
			locals: { user: { id: '1' } }
		} as never);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.modality).toBe('vlm-vision');
		expect(body.visionProjectorLoaded).toBe(true);
		expect(body.answer).not.toContain('<think>');
		expect(body.answer).toContain('custody affidavit exhibit');
		expect(body.acePacket).toMatchObject({
			sourceRef: 'case:986b5214-1962-43b2-aff9-c132cdf21e69',
			ConceptID: 'vlm_screen_reconnaissance'
		});
		expect(mockRedisSet).toHaveBeenCalledTimes(1);

		const messages = (capturedCompletionBody?.messages ?? []) as Array<{
			role: string;
			content: unknown;
		}>;
		const lastMsg = messages[messages.length - 1];
		expect(Array.isArray(lastMsg.content)).toBe(true);
	});
});
