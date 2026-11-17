// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({
	getVLMCache: vi.fn(async () => ({ entry: null })),
	setVLMCache: vi.fn(async () => {}),
}));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: { TRITON_URL: 'http://triton.invalid', TRITON_VLM_MODEL: 'vlm' },
}));
vi.mock('$lib/server/ai/local-llama-provider.js', () => ({
	LLAMA_SERVER_BASE_URL: 'http://llama.invalid/v1',
	LOCAL_VLM_MODEL: 'fixture-vlm',
}));
vi.mock('$lib/server/image/resize-for-vlm.js', () => ({
	GEMMA4_VLM_MAX_EDGE: 2048,
	resizeForVLM: vi.fn(async (buffer: Buffer) => ({
		buffer,
		originalWidth: 4,
		originalHeight: 4,
		resized: false,
		mimeType: 'image/jpeg',
	})),
}));
vi.mock('$lib/server/vector-cache.js', () => cache);
vi.mock('$lib/ai/model-ids.js', () => ({ TURBOQUANT_BASE_URL: 'http://turbo.invalid' }));

import { analyzeEvidenceImage, stripModelReasoning } from './vlm-evidence-analyzer.js';

const input = { buffer: Buffer.from('image-fixture'), fileName: 'fixture.png' };

/** Triton is never ready; the llama-server chat call returns `message`. */
function stubFetch(message: Record<string, unknown> | null) {
	const fetchMock = vi.fn(async (url: string | URL) => {
		const href = String(url);
		if (href.startsWith('http://triton.invalid')) return new Response('', { status: 503 });
		if (href.endsWith('/health')) return new Response('{}', { status: message ? 200 : 503 });
		if (href.endsWith('/v1/chat/completions')) {
			return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
		}
		return new Response('', { status: 404 });
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

describe('analyzeEvidenceImage', () => {
	beforeEach(() => {
		cache.getVLMCache.mockClear();
		cache.setVLMCache.mockClear();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reports unreachable models as unavailable with no summary text and no cache write', async () => {
		stubFetch(null);
		const result = await analyzeEvidenceImage(input);

		expect(result.available).toBe(false);
		expect(result.unavailableReason).toBe('VLM_UNREACHABLE');
		expect(result.model).toBe('none');
		expect(result.summary).toBe('');
		expect(result.keyFindings).toEqual([]);
		expect(cache.setVLMCache).not.toHaveBeenCalled();
	});

	it('never returns reasoning_content when content is empty', async () => {
		stubFetch({ content: '', reasoning_content: 'SECRET chain of thought about the image' });
		const result = await analyzeEvidenceImage(input);

		expect(result.available).toBe(false);
		expect(JSON.stringify(result)).not.toContain('SECRET');
		expect(cache.setVLMCache).not.toHaveBeenCalled();
	});

	it('strips inline reasoning blocks from the answer before parsing', async () => {
		stubFetch({
			content:
				'<think>SECRET plan</think>{"summary":"A signed lease page","keyFindings":["Signature present"],"suggestedTags":["lease"]}',
		});
		const result = await analyzeEvidenceImage(input);

		expect(result.available).toBe(true);
		expect(result.summary).toBe('A signed lease page');
		expect(result.keyFindings).toEqual(['Signature present']);
		expect(JSON.stringify(result)).not.toContain('SECRET');
		expect(cache.setVLMCache).toHaveBeenCalledTimes(1);
	});

	it('treats an answer that is only reasoning as an empty answer', async () => {
		stubFetch({ content: '<think>SECRET unfinished reasoning with no answer' });
		const result = await analyzeEvidenceImage(input);

		expect(result.available).toBe(false);
		expect(result.unavailableReason).toBe('VLM_EMPTY_ANSWER');
		expect(JSON.stringify(result)).not.toContain('SECRET');
		expect(cache.setVLMCache).not.toHaveBeenCalled();
	});
});

describe('stripModelReasoning', () => {
	it('keeps plain answers unchanged', () => {
		expect(stripModelReasoning('  A photo of a car.  ')).toBe('A photo of a car.');
	});
});
