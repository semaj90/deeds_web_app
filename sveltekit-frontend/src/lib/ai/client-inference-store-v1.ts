import { openDB, type DBSchema } from 'idb';
import { z } from 'zod';
import {
	ClientInferenceCacheEntryV1Schema,
	type ClientInferenceCacheEntryV1,
} from './client-inference-cache-entry-v1.js';

const LocalKey = z.string().trim().min(1).max(160);
const IsoDateTime = z.iso.datetime({ offset: true });

export const ClientChatTranscriptV1Schema = z.object({
	schema: z.literal('atlas.client-chat-transcript.v1'),
	localConversationKey: LocalKey,
	updatedAt: IsoDateTime,
	expiresAt: IsoDateTime,
	messages: z.array(z.object({
		role: z.enum(['user', 'assistant']),
		visibility: z.literal('USER_VISIBLE_FINAL'),
		text: z.string().max(12_000),
	}).strict()).max(100),
	canonicalAuthority: z.literal(false),
}).strict().superRefine((transcript, ctx) => {
	const updatedAt = Date.parse(transcript.updatedAt);
	const expiresAt = Date.parse(transcript.expiresAt);
	if (expiresAt <= updatedAt || expiresAt - updatedAt > 30 * 24 * 60 * 60 * 1_000) {
		ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Transcript expiry must be within 30 days.' });
	}
	if (transcript.messages.reduce((sum, message) => sum + message.text.length, 0) > 64_000) {
		ctx.addIssue({ code: 'custom', path: ['messages'], message: 'Transcript text exceeds the local storage bound.' });
	}
});
export type ClientChatTranscriptV1 = z.infer<typeof ClientChatTranscriptV1Schema>;

export const ClientModelLoadMetadataV1Schema = z.object({
	schema: z.literal('atlas.client-model-load-metadata.v1'),
	modelId: LocalKey,
	modelRevision: LocalKey,
	runtimeRevision: LocalKey,
	provider: z.enum(['webgpu', 'wasm', 'webnn', 'cpu', 'unknown']),
	loadState: z.enum(['loaded', 'unavailable', 'failed']),
	fallbackUsed: z.boolean(),
	artifactChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i).optional(),
	observedAt: IsoDateTime,
	canonicalAuthority: z.literal(false),
}).strict();
export type ClientModelLoadMetadataV1 = z.infer<typeof ClientModelLoadMetadataV1Schema>;

export const ClientTokenizerMetadataV1Schema = z.object({
	schema: z.literal('atlas.client-tokenizer-metadata.v1'),
	tokenizerId: LocalKey,
	tokenizerRevision: LocalKey,
	vocabularySize: z.number().int().positive().safe(),
	maxInputTokens: z.number().int().positive().safe(),
	observedAt: IsoDateTime,
	canonicalAuthority: z.literal(false),
}).strict();
export type ClientTokenizerMetadataV1 = z.infer<typeof ClientTokenizerMetadataV1Schema>;

interface ClientInferenceDbV1 extends DBSchema {
	transcripts: { key: string; value: ClientChatTranscriptV1 };
	modelMetadata: { key: [string, string]; value: ClientModelLoadMetadataV1 };
	tokenizerMetadata: { key: [string, string]; value: ClientTokenizerMetadataV1 };
	inferenceHints: { key: string; value: ClientInferenceCacheEntryV1 };
}

const DB_NAME = 'atlas-client-inference-v1';
const DB_VERSION = 1;
const STORE_NAMES = ['transcripts', 'modelMetadata', 'tokenizerMetadata', 'inferenceHints'] as const;
type StoreName = (typeof STORE_NAMES)[number];
type BackendKey = string | [string, string];

export interface ClientInferenceStoreBackendV1 {
	get(store: StoreName, key: BackendKey): Promise<unknown>;
	put(store: StoreName, value: unknown): Promise<void>;
	delete(store: StoreName, key: BackendKey): Promise<void>;
}

type SafeParser<T> = {
	safeParse(value: unknown): { success: true; data: T } | { success: false; error?: unknown };
};

export interface ClientInferenceStoreOptionsV1 {
	/** Optional per-session acceleration. Never persistent and disabled by default. */
	sessionCache?: Map<string, unknown>;
}

async function openIndexedDbBackend(): Promise<ClientInferenceStoreBackendV1 | null> {
	if (typeof indexedDB === 'undefined') return null;
	try {
		const db = await openDB<ClientInferenceDbV1>(DB_NAME, DB_VERSION, {
			upgrade(upgradeDb) {
				for (const storeName of STORE_NAMES) {
					if (!upgradeDb.objectStoreNames.contains(storeName)) {
						const keyPath: string | string[] = storeName === 'transcripts'
							? 'localConversationKey'
							: storeName === 'modelMetadata'
								? ['modelId', 'modelRevision']
								: storeName === 'tokenizerMetadata'
									? ['tokenizerId', 'tokenizerRevision']
									: 'cacheKey';
						upgradeDb.createObjectStore(storeName, { keyPath });
					}
				}
			},
		});
		return {
			get: (store, key) => db.get(store, key as never),
			put: async (store, value) => { await db.put(store, value as never); },
			delete: async (store, key) => { await db.delete(store, key as never); },
		};
	} catch {
		return null;
	}
}

export function createClientInferenceStoreV1(
	openBackend: () => Promise<ClientInferenceStoreBackendV1 | null> = openIndexedDbBackend,
	options: ClientInferenceStoreOptionsV1 = {},
) {
	let backendPromise: Promise<ClientInferenceStoreBackendV1 | null> | null = null;
	const backend = () => backendPromise ??= openBackend().catch(() => null);
	const sessionKey = (store: StoreName, key: BackendKey) => `${store}:${Array.isArray(key) ? JSON.stringify(key) : key}`;
	const read = async <T>(store: StoreName, key: BackendKey, schema: SafeParser<T>): Promise<T | null> => {
		const memKey = sessionKey(store, key);
		const cached = options.sessionCache?.get(memKey);
		const cachedParsed = schema.safeParse(cached);
		if (cachedParsed.success) return cachedParsed.data;
		if (cached !== undefined) options.sessionCache?.delete(memKey);
		try {
			const db = await backend();
			if (!db) return null;
			const parsed = schema.safeParse(await db.get(store, key));
			if (!parsed.success) return null;
			options.sessionCache?.set(memKey, parsed.data);
			return parsed.data;
		} catch { return null; }
	};
	const write = async (store: StoreName, key: BackendKey, value: unknown): Promise<boolean> => {
		let sessionStored = false;
		try {
			options.sessionCache?.set(sessionKey(store, key), value);
			sessionStored = Boolean(options.sessionCache);
		} catch { /* optional session acceleration */ }
		try {
			const db = await backend();
			if (!db) return sessionStored;
			await db.put(store, value);
			return true;
		} catch { return sessionStored; }
	};
	const remove = async (store: StoreName, key: BackendKey): Promise<void> => {
		options.sessionCache?.delete(sessionKey(store, key));
		try { await (await backend())?.delete(store, key); } catch { /* cache eviction is best effort */ }
	};
	const notExpired = (expiresAt: string) => Date.parse(expiresAt) > Date.now();

	return {
		async putTranscript(value: unknown): Promise<boolean> {
			const parsed = ClientChatTranscriptV1Schema.safeParse(value);
			if (!parsed.success) return false;
			return write('transcripts', parsed.data.localConversationKey, parsed.data);
		},
		async getTranscript(localConversationKey: string): Promise<ClientChatTranscriptV1 | null> {
			const key = LocalKey.safeParse(localConversationKey);
			if (!key.success) return null;
			const parsed = await read('transcripts', key.data, ClientChatTranscriptV1Schema);
			if (!parsed) return null;
			if (!notExpired(parsed.expiresAt)) { await remove('transcripts', key.data); return null; }
			return parsed;
		},
		async putModelLoadMetadata(value: unknown): Promise<boolean> {
			const parsed = ClientModelLoadMetadataV1Schema.safeParse(value);
			if (!parsed.success) return false;
			return write('modelMetadata', [parsed.data.modelId, parsed.data.modelRevision], parsed.data);
		},
		async getModelLoadMetadata(modelId: string, modelRevision: string): Promise<ClientModelLoadMetadataV1 | null> {
			const id = LocalKey.safeParse(modelId);
			const revision = LocalKey.safeParse(modelRevision);
			if (!id.success || !revision.success) return null;
			return read('modelMetadata', [id.data, revision.data], ClientModelLoadMetadataV1Schema);
		},
		async putTokenizerMetadata(value: unknown): Promise<boolean> {
			const parsed = ClientTokenizerMetadataV1Schema.safeParse(value);
			if (!parsed.success) return false;
			return write('tokenizerMetadata', [parsed.data.tokenizerId, parsed.data.tokenizerRevision], parsed.data);
		},
		async getTokenizerMetadata(tokenizerId: string, tokenizerRevision: string): Promise<ClientTokenizerMetadataV1 | null> {
			const id = LocalKey.safeParse(tokenizerId);
			const revision = LocalKey.safeParse(tokenizerRevision);
			if (!id.success || !revision.success) return null;
			return read('tokenizerMetadata', [id.data, revision.data], ClientTokenizerMetadataV1Schema);
		},
		async putInferenceHint(value: unknown): Promise<boolean> {
			const parsed = ClientInferenceCacheEntryV1Schema.safeParse(value);
			if (!parsed.success) return false;
			return write('inferenceHints', parsed.data.cacheKey, parsed.data);
		},
		async getInferenceHint(cacheKey: string): Promise<ClientInferenceCacheEntryV1 | null> {
			const key = LocalKey.safeParse(cacheKey);
			if (!key.success) return null;
			const parsed = await read('inferenceHints', key.data, ClientInferenceCacheEntryV1Schema);
			if (!parsed) return null;
			if (!notExpired(parsed.expiresAt)) { await remove('inferenceHints', key.data); return null; }
			return parsed;
		},
	};
}

export const clientInferenceStoreV1 = createClientInferenceStoreV1();
