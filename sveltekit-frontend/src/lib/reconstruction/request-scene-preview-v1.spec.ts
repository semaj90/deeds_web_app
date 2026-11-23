import { describe, expect, it, vi } from 'vitest';
import { requestScenePreviewV1, ScenePreviewRequestErrorV1 } from './request-scene-preview-v1.js';

describe('scene preview requests', () => {
	it.each(['parameters', 'plans'] as const)('ignores a late %s response after cancellation even if fetch completes', async (stage) => {
		const controller = new AbortController();
		const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
			expect(init?.signal).toBe(controller.signal);
			const isParameters = String(url).endsWith('/parameters');
			const reply = isParameters ? { ok: true, parameters: { accepted: true } } : { ok: true, plan: { accepted: true } };
			if (String(url).endsWith('/' + stage)) {
				const response = Response.json(reply);
				vi.spyOn(response, 'json').mockImplementation(async () => {
					controller.abort();
					return reply;
				});
				return response;
			}
			return Response.json(reply);
		});
		const buildCandidate = vi.fn((parameters: unknown) => parameters);
		await expect(requestScenePreviewV1({
			caseId: 'case-id', signal: controller.signal, parameters: {}, buildCandidate, onValidate: vi.fn()
		}, fetcher)).rejects.toMatchObject({ name: 'AbortError' });
		expect(fetcher).toHaveBeenCalledTimes(stage === 'parameters' ? 1 : 2);
		expect(buildCandidate).toHaveBeenCalledTimes(stage === 'parameters' ? 0 : 1);
	});

	it('marks source conflict responses stale so the coordinator can require a fresh source snapshot', async () => {
		const controller = new AbortController();
		await expect(requestScenePreviewV1({
			caseId: 'case-id', signal: controller.signal, parameters: {}, buildCandidate: (value) => value, onValidate: vi.fn()
		}, vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'Source revision changed' }), { status: 409 })))
		).rejects.toMatchObject({ name: 'ScenePreviewRequestErrorV1', sourceStale: true });
		expect(new ScenePreviewRequestErrorV1('bad request', 400).sourceStale).toBe(false);
	});
});
