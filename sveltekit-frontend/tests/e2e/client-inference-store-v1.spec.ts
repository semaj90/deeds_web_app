import { expect, test } from '@playwright/test';

const origin = 'http://127.0.0.1:5173';
const sha = (letter: string) => `sha256:${letter.repeat(64)}`;
const shaA = sha('a');
const shaB = sha('b');

test('client inference cache replays in isolated browser IndexedDB without model calls', async ({ page }) => {
	test.setTimeout(60_000);
	await page.goto(`${origin}/favicon.ico`);

	const firstPass = await page.evaluate(async ({ previewChecksum, shaA }) => {
		const storeModulePath: string = '/src/lib/ai/client-inference-store-v1.ts';
		const cacheEntryModulePath: string = '/src/lib/ai/client-inference-cache-entry-v1.ts';
		const { createClientInferenceStoreV1 } = await import(storeModulePath);
		const {
			checksumClientInferenceInputV1,
			deriveClientInferenceCacheKeyV1,
		} = await import(cacheEntryModulePath);
		const nowMs = Date.now();
		const now = new Date(nowMs).toISOString();
		const later = new Date(nowMs + 15 * 60_000).toISOString();
		const inputText = 'deterministic local preview input';
		const inputDigest = await checksumClientInferenceInputV1(inputText);
		const repeatedInputDigest = await checksumClientInferenceInputV1(inputText);
		const changedInputDigest = await checksumClientInferenceInputV1(`${inputText}!`);
		const identity = {
			model: { id: 'preview-model', revision: 'model:r1' },
			representation: { id: 'preview', revision: 'preview:r1' },
			tokenizer: { id: 'preview-tokenizer', revision: 'tokenizer:r1' },
			inputChecksum: inputDigest,
		};
		const cacheKey = await deriveClientInferenceCacheKeyV1(identity);
		const revisionChangedKey = await deriveClientInferenceCacheKeyV1({
			...identity,
			representation: { ...identity.representation, revision: 'preview:r2' },
		});
		const changedInputKey = await deriveClientInferenceCacheKeyV1({
			...identity,
			inputChecksum: changedInputDigest,
		});
		const store = createClientInferenceStoreV1();
		const entry = {
			schema: 'atlas.client-inference-cache-entry.v1', schemaVersion: 1, cacheKey,
			model: identity.model, representation: identity.representation, tokenizer: identity.tokenizer,
			inputChecksum: inputDigest, previewText: 'preview only', previewChecksum,
			createdAt: now, expiresAt: later, canonicalAuthority: false,
		};
		const stored = await store.putInferenceHint(entry);
		const hit = await store.getInferenceHint(cacheKey);
		const miss = await store.getInferenceHint(changedInputKey);
		const mismatchMiss = await store.getInferenceHint(revisionChangedKey);
		const expiredCreatedAt = new Date(nowMs - 60 * 60_000).toISOString();
		const expiredEntry = {
			...entry, cacheKey: shaA, createdAt: expiredCreatedAt,
			expiresAt: new Date(nowMs - 30 * 60_000).toISOString(),
		};
		const expiredStored = await store.putInferenceHint(expiredEntry);
		const expiredRead = await store.getInferenceHint(shaA);
		const webgpuUnavailableStored = await store.putModelLoadMetadata({
			schema: 'atlas.client-model-load-metadata.v1', modelId: 'preview-model',
			modelRevision: 'model:webgpu-unavailable', runtimeRevision: 'transformers:r1',
			provider: 'webgpu', loadState: 'unavailable', fallbackUsed: false,
			observedAt: now, canonicalAuthority: false,
		});
		const fallbackStored = await store.putModelLoadMetadata({
			schema: 'atlas.client-model-load-metadata.v1', modelId: 'preview-model',
			modelRevision: 'model:wasm-fallback', runtimeRevision: 'transformers:r1',
			provider: 'wasm', loadState: 'loaded', fallbackUsed: true,
			observedAt: now, canonicalAuthority: false,
		});
		return {
			stored, hit: hit?.previewText ?? null, miss, mismatchMiss,
			inputDigest, repeatedInputDigest, changedInputDigest,
			cacheKey, revisionChangedKey, changedInputKey,
			expiredStored, expiredRead, webgpuUnavailableStored, fallbackStored,
		};
	}, { previewChecksum: shaB, shaA });

	await page.reload();
	const afterReload = await page.evaluate(async (cacheKey) => {
		const storeModulePath: string = '/src/lib/ai/client-inference-store-v1.ts';
		const { createClientInferenceStoreV1 } = await import(storeModulePath);
		const store = createClientInferenceStoreV1();
		const entry = await store.getInferenceHint(cacheKey);
		const unavailable = await store.getModelLoadMetadata('preview-model', 'model:webgpu-unavailable');
		const fallback = await store.getModelLoadMetadata('preview-model', 'model:wasm-fallback');
		return {
			previewText: entry?.previewText ?? null,
			canonicalAuthority: entry?.canonicalAuthority ?? null,
			unavailableProvider: unavailable?.provider ?? null,
			unavailableState: unavailable?.loadState ?? null,
			unavailableFallbackUsed: unavailable?.fallbackUsed ?? null,
			fallbackProvider: fallback?.provider ?? null,
			fallbackState: fallback?.loadState ?? null,
			fallbackUsed: fallback?.fallbackUsed ?? null,
		};
	}, firstPass.cacheKey);
	expect(firstPass.stored).toBe(true);
	expect(firstPass.hit).toBe('preview only');
	expect(firstPass.miss).toBeNull();
	expect(firstPass.mismatchMiss).toBeNull();
	expect(firstPass.inputDigest).toBe(firstPass.repeatedInputDigest);
	expect(firstPass.inputDigest).not.toBe(firstPass.changedInputDigest);
	expect(firstPass.cacheKey).not.toBe(firstPass.revisionChangedKey);
	expect(firstPass.cacheKey).not.toBe(firstPass.changedInputKey);
	expect(firstPass.expiredStored).toBe(true);
	expect(firstPass.expiredRead).toBeNull();
	expect(firstPass.webgpuUnavailableStored).toBe(true);
	expect(firstPass.fallbackStored).toBe(true);
	expect(afterReload).toEqual({
		previewText: 'preview only', canonicalAuthority: false,
		unavailableProvider: 'webgpu', unavailableState: 'unavailable', unavailableFallbackUsed: false,
		fallbackProvider: 'wasm', fallbackState: 'loaded', fallbackUsed: true,
	});
	expect(afterReload.previewText).toBe('preview only');
});
