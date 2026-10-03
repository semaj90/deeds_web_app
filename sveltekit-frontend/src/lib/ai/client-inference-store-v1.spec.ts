import { describe, expect, it } from 'vitest';
import {
	createClientInferenceStoreV1,
	type ClientInferenceStoreBackendV1,
} from './client-inference-store-v1.js';

type Store = Parameters<ClientInferenceStoreBackendV1['get']>[0];
type BackendKey = Parameters<ClientInferenceStoreBackendV1['get']>[1];

function memoryBackend() {
	const stores = new Map<Store, Map<string, unknown>>();
	const keyOf = (key: BackendKey) => Array.isArray(key) ? JSON.stringify(key) : String(key);
	const backend: ClientInferenceStoreBackendV1 = {
		async get(store, key) { return stores.get(store)?.get(keyOf(key)); },
		async put(store, value) {
			const row = value as Record<string, unknown>;
			const id = store === 'transcripts'
				? row.localConversationKey
				: store === 'modelMetadata'
					? [row.modelId, row.modelRevision]
					: store === 'tokenizerMetadata'
						? [row.tokenizerId, row.tokenizerRevision]
						: row.cacheKey;
			if (typeof id !== 'string' && !Array.isArray(id)) throw new Error('invalid key');
			const map = stores.get(store) ?? new Map<string, unknown>();
			map.set(keyOf(id as BackendKey), value);
			stores.set(store, map);
		},
		async delete(store, key) { stores.get(store)?.delete(keyOf(key)); },
	};
	return backend;
}

const testNow = Date.now();
const now = new Date(testNow).toISOString();
const later = (ms: number) => new Date(testNow + ms).toISOString();
const sha = `sha256:${'b'.repeat(64)}`;
const transcript = () => ({
	schema: 'atlas.client-chat-transcript.v1',
	localConversationKey: 'local-only-1',
	updatedAt: now,
	expiresAt: later(24 * 60 * 60 * 1_000),
	messages: [{ role: 'user', visibility: 'USER_VISIBLE_FINAL', text: 'hello' }],
	canonicalAuthority: false,
});

describe('ClientInferenceStoreV1', () => {
	it('round-trips only explicit local transcript and revision-keyed metadata', async () => {
		const backend = memoryBackend();
		const first = createClientInferenceStoreV1(async () => backend);
		expect(await first.putTranscript(transcript())).toBe(true);
		expect(await first.putModelLoadMetadata({
			schema: 'atlas.client-model-load-metadata.v1', modelId: 'm', modelRevision: 'm:r1',
			runtimeRevision: 'transformers:v1', provider: 'webgpu', loadState: 'loaded',
			fallbackUsed: false, artifactChecksum: sha, observedAt: now, canonicalAuthority: false,
		})).toBe(true);
		expect(await first.putModelLoadMetadata({
			schema: 'atlas.client-model-load-metadata.v1', modelId: 'm', modelRevision: 'm:r2',
			runtimeRevision: 'transformers:v1', provider: 'webgpu', loadState: 'loaded',
			fallbackUsed: false, artifactBytes: new Uint8Array([1, 2, 3]), observedAt: now, canonicalAuthority: false,
		})).toBe(false);
		expect(await first.putTokenizerMetadata({
			schema: 'atlas.client-tokenizer-metadata.v1', tokenizerId: 't', tokenizerRevision: 't:r1',
			vocabularySize: 32_000, maxInputTokens: 2_048, observedAt: now, canonicalAuthority: false,
		})).toBe(true);
		expect(await first.putInferenceHint({
			schema: 'atlas.client-inference-cache-entry.v1', schemaVersion: 1, cacheKey: sha,
			model: { id: 'm', revision: 'm:r1' }, representation: { id: 'preview', revision: 'preview:v1' },
			tokenizer: { id: 't', revision: 't:r1' }, inputChecksum: sha, previewText: 'preview only',
			previewChecksum: sha, createdAt: now, expiresAt: later(30 * 60 * 1_000), canonicalAuthority: false,
		})).toBe(true);

		const reloaded = createClientInferenceStoreV1(async () => backend);
		expect(await reloaded.getTranscript('local-only-1')).toEqual(transcript());
		expect(await reloaded.getModelLoadMetadata('m', 'm:r1')).toMatchObject({ provider: 'webgpu' });
		expect(await reloaded.getModelLoadMetadata('m', 'm:r2')).toBeNull();
		expect(await reloaded.getTokenizerMetadata('t', 't:r1')).toMatchObject({ vocabularySize: 32_000 });
		expect(await reloaded.getInferenceHint(sha)).toMatchObject({ previewText: 'preview only', canonicalAuthority: false });
	});

	it('rejects hidden/non-user-visible transcript fields and fails closed on unavailable storage', async () => {
		const store = createClientInferenceStoreV1(async () => memoryBackend());
		expect(await store.putTranscript({ ...transcript(), hiddenThoughts: 'forbidden' })).toBe(false);
		expect(await store.putTranscript({
			...transcript(), messages: [{ role: 'system', visibility: 'USER_VISIBLE_FINAL', text: 'no' }],
		})).toBe(false);

		const unavailable = createClientInferenceStoreV1(async () => null);
		expect(await unavailable.putTranscript(transcript())).toBe(false);
		expect(await unavailable.getTranscript('local-only-1')).toBeNull();
	});

	it('turns storage/quota errors into cache misses without escaping', async () => {
		const failingBackend: ClientInferenceStoreBackendV1 = {
			async get() { throw new Error('quota'); },
			async put() { throw new Error('quota'); },
			async delete() { throw new Error('quota'); },
		};
		const store = createClientInferenceStoreV1(async () => failingBackend);
		expect(await store.putTranscript(transcript())).toBe(false);
		expect(await store.getTranscript('local-only-1')).toBeNull();
	});

	it('uses an explicitly enabled Map for session fallback and evicts expired local entries', async () => {
		const sessionCache = new Map<string, unknown>();
		const first = createClientInferenceStoreV1(async () => null, { sessionCache });
		expect(await first.putTranscript(transcript())).toBe(true);
		const nextAdapter = createClientInferenceStoreV1(async () => null, { sessionCache });
		expect(await nextAdapter.getTranscript('local-only-1')).toMatchObject({ canonicalAuthority: false });

		const expired = {
			...transcript(), updatedAt: '2020-01-01T00:00:00.000Z', expiresAt: '2020-01-01T00:30:00.000Z',
		};
		expect(await first.putTranscript(expired)).toBe(true);
		expect(await nextAdapter.getTranscript('local-only-1')).toBeNull();
		expect(sessionCache.size).toBe(0);
	});
});
