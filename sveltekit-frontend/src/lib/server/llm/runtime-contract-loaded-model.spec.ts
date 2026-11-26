// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLlamaInferenceTarget } from './runtime-contract.js';
import { observeServedChatModelIdV1 } from '$lib/server/ai/llama-server-model-resolver.js';

// A made-up id: the app must follow whatever llama-server reports, whichever family it is.
const LOADED = 'some-new-model-q4.gguf';

const serve = (body: unknown) =>
	vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));

describe('served chat model follows llama-server', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('accepts the loaded model for inference regardless of its name', async () => {
		serve({ data: [{ id: LOADED }] });
		await expect(resolveLlamaInferenceTarget()).resolves.toMatchObject({
			model: LOADED,
			modelSource: 'llama-server-loaded',
		});
	});

	it('reports the loaded id for records', async () => {
		serve({ data: [{ id: LOADED }] });
		await expect(observeServedChatModelIdV1('http://127.0.0.1:8090/v1')).resolves.toBe(LOADED);
	});

	it('returns null instead of a default name when the model cannot be identified', async () => {
		serve({ data: [] });
		await expect(observeServedChatModelIdV1()).resolves.toBeNull();
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
		await expect(observeServedChatModelIdV1()).resolves.toBeNull();
	});
});
