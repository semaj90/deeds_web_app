/**
 * Qdrant Vector Database Client
 * Resilient client with SDK-first dynamic import, HTTP fallback, and API key support
 */

// Type definitions
interface SearchRequestBody {
	vector?: number[];
	limit?: number;
	with_payload?: boolean;
	filter?: Record<string, unknown>;
	[key: string]: unknown;
}

interface SearchHit {
	id: string | number;
	score?: number;
	payload?: Record<string, unknown>;
}

interface CollectionsListResponse {
	collections?: Array<{ name: string }>;
}

interface PayloadIndexBody {
	field_name: string;
	field_schema?: string;
	wait?: boolean;
	[key: string]: unknown;
}

interface CreateCollectionBody {
	vectors: { size: number;
		distance?: 'Cosine' | 'Dot' | 'Euclid';
	};
	[key: string]: unknown;
}

const DEFAULT_QDRANT = 'http://localhost:6333';

function getQdrantUrl(): string {
	if (process.env.QDRANT_URL) return process.env.QDRANT_URL;
	if (process.env.QDRANT_HOST && process.env.QDRANT_PORT) {
		return `http://${process.env.QDRANT_HOST}:${process.env.QDRANT_PORT}`;
	}
	return DEFAULT_QDRANT;
}

function getApiKeyHeader(): Record<string, string> {
	const key = process.env.QDRANT_API_KEY || '';
	return key ? { Authorization: `ApiKey ${key}` } : {};
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

async function ensureFetch(): Promise<FetchFn> {
	if (typeof globalThis.fetch === 'function') {
		return globalThis.fetch as unknown as FetchFn;
	}
	try {
		const nf = await import('node-fetch');
		const mod = nf as { default?: unknown };
		return (mod.default || nf) as unknown as FetchFn;
	} catch {
		throw new Error('fetch is not available and node-fetch cannot be loaded');
	}
}

// SDK client interface
interface SdkClientLike {
	collections?: {
		list?: () => Promise<CollectionsListResponse>;
		create?: (name: string, body: CreateCollectionBody) => Promise<unknown>;
		createPayloadIndex?: (name: string, body: PayloadIndexBody) => Promise<unknown>;
	};
	points?: {
		search?: (opts: Record<string, unknown>) => Promise<SearchHit[]>;
		upsert?: (opts: Record<string, unknown>) => Promise<unknown>;
		delete?: (opts: Record<string, unknown>) => Promise<unknown>;
	};
	createCollection?: (name: string, body: CreateCollectionBody) => Promise<unknown>;
	getCollections?: () => Promise<CollectionsListResponse>;
	createPayloadIndex?: (name: string, body: PayloadIndexBody) => Promise<unknown>;
	search?: (collectionName: string, body: SearchRequestBody) => Promise<SearchHit[]>;
	upsert?: (collectionName: string, body: Record<string, unknown>) => Promise<unknown>;
	delete?: (collectionName: string, body: Record<string, unknown>) => Promise<unknown>;
}

async function tryCreateSdkClient(): Promise<SdkClientLike | null> {
	try {
		const mod = await import('@qdrant/js-client-rest');
		type Ctor = new (opts?: Record<string, unknown>) => unknown;
		const maybe = mod as { QdrantClient?: Ctor; default?: Ctor };
		const ctor = maybe?.QdrantClient ?? maybe?.default;

		if (typeof ctor === 'function') {
			const url = getQdrantUrl();
			const apiKey = process.env.QDRANT_API_KEY;
			const opts: Record<string, unknown> = { url };
			if (apiKey) opts.apiKey = apiKey;
			return new ctor(opts) as unknown as SdkClientLike;
		}
		return null;
	} catch {
		return null;
	}
}

// HTTP fallback methods
async function httpRequest(path: string, method = 'GET', body?: unknown): Promise<unknown> {
	const f = await ensureFetch();
	const base = getQdrantUrl().replace(/\/$/, '');
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...getApiKeyHeader()
	};
	const url = path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
	const init: RequestInit = { method: headers };
	if (body !== undefined) init.body = JSON.stringify(body);

	const res = await f(url, init);
	if (!res.ok) {
		const txt = await res.text().catch(() => '');
		throw new Error(`Qdrant HTTP ${res.status} ${res.statusText}: ${txt}`);
	}
	if (res.status === 204) return null;
	return res.json().catch(() => null);
}

async function httpGetCollections(): Promise<CollectionsListResponse> {
	return (await httpRequest('/collections')) as CollectionsListResponse;
}

async function httpCreateCollection(name: string, body: CreateCollectionBody): Promise<unknown> {
	return await httpRequest(`/collections/${encodeURIComponent(name)}`, 'PUT', body);
}

async function httpCreatePayloadIndex(collectionName: string, body: PayloadIndexBody): Promise<unknown> {
	const base = getQdrantUrl().replace(/\/$/, '');
	const tries = [
		`${base}/collections/${encodeURIComponent(collectionName)}/payload/index`,
		`${base}/collections/${encodeURIComponent(collectionName)}/index`,
		`${base}/collections/${encodeURIComponent(collectionName)}/create_index`
	];

	const f = await ensureFetch();
	for (const ep of tries) {
		try {
			const res = await f(ep, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...getApiKeyHeader() },
				body: JSON.stringify(body)
			});
			if (res.ok) return await res.json();
		} catch {
			// try next
		}
	}
	throw new Error('createPayloadIndex failed (all HTTP endpoints tried)');
}

async function httpSearch(collectionName: string, body: SearchRequestBody): Promise<SearchHit[]> {
	return (await httpRequest(
		`/collections/${encodeURIComponent(collectionName)}/points/search`,
		'POST',
		body
	)) as SearchHit[];
}

async function httpUpsert(
	collectionName: string,
	points: Array<Record<string, unknown>>
): Promise<unknown> {
	return await httpRequest(
		`/collections/${encodeURIComponent(collectionName)}/points?wait=true`,
		'PUT',
		{ points }
	);
}

async function httpDelete(collectionName: string, ids: (string | number)[]): Promise<unknown> {
	return await httpRequest(
		`/collections/${encodeURIComponent(collectionName)}/points/delete`,
		'POST',
		{ points: ids }
	);
}

// Main Qdrant client facade
const qdrant = {
	async getCollections(): Promise<CollectionsListResponse> {
		const sdk = await tryCreateSdkClient();
		if (sdk) {
			try {
				if (sdk.collections?.list) return await sdk.collections.list();
				if (typeof sdk.getCollections === 'function') return await sdk.getCollections();
			} catch (e) {
				console.warn('[Qdrant] SDK getCollections failed, falling back to HTTP', e);
			}
		}
		return await httpGetCollections();
	},

	async createCollection(collectionName: string, body: CreateCollectionBody): Promise<unknown> {
		const sdk = await tryCreateSdkClient();
		if (sdk) {
			try {
				if (sdk.collections?.create) return await sdk.collections.create(collectionName, body);
				if (typeof sdk.createCollection === 'function') return await sdk.createCollection(collectionName, body);
			} catch (e) {
				console.warn('[Qdrant] SDK createCollection failed, falling back to HTTP', e);
			}
		}
		return await httpCreateCollection(collectionName, body);
	},

	async createPayloadIndex(collectionName: string, body: PayloadIndexBody): Promise<unknown> {
		const sdk = await tryCreateSdkClient();
		if (sdk) {
			try {
				if (sdk.collections?.createPayloadIndex) {
					return await sdk.collections.createPayloadIndex(collectionName, body);
				}
				if (typeof sdk.createPayloadIndex === 'function') {
					return await sdk.createPayloadIndex(collectionName, body);
				}
			} catch (e) {
				console.warn('[Qdrant] SDK createPayloadIndex failed, falling back to HTTP', e);
			}
		}
		return await httpCreatePayloadIndex(collectionName, body);
	},

	async search(collectionName: string, body: SearchRequestBody): Promise<SearchHit[]> {
		const sdk = await tryCreateSdkClient();
		if (sdk) {
			try {
				if (sdk.points?.search) {
					return await sdk.points.search({ collection_name: collectionName, ...body });
				}
				if (typeof sdk.search === 'function') {
					return await sdk.search(collectionName, body);
				}
			} catch (e) {
				console.warn('[Qdrant] SDK search failed, falling back to HTTP', e);
			}
		}
		return await httpSearch(collectionName, body);
	},

	async upsert(collectionName: string, points: Array<Record<string, unknown>>): Promise<unknown> {
		const sdk = await tryCreateSdkClient();
		if (sdk) {
			try {
				if (sdk.points?.upsert) {
					return await sdk.points.upsert({ collection_name: collectionName, points });
				}
				if (typeof sdk.upsert === 'function') {
					return await sdk.upsert(collectionName, { points });
				}
			} catch (e) {
				console.warn('[Qdrant] SDK upsert failed, falling back to HTTP', e);
			}
		}
		return await httpUpsert(collectionName, points);
	},

	async delete(collectionName: string, ids: (string | number)[]): Promise<unknown> {
		const sdk = await tryCreateSdkClient();
		if (sdk) {
			try {
				if (typeof sdk.delete === 'function') {
					return await sdk.delete(collectionName, { points: ids });
				}
				if (sdk.points?.delete) {
					return await sdk.points.delete({ collection_name: collectionName, points: ids });
				}
			} catch (e) {
				console.warn('[Qdrant] SDK delete failed, falling back to HTTP', e);
			}
		}
		return await httpDelete(collectionName, ids);
	}
};

async function qdrantHealthCheck(): Promise<boolean> {
	try {
		const f = await ensureFetch();
		const url = `${getQdrantUrl().replace(/\/$/, '')}/health`;
		const res = await f(url, { method: 'GET', headers: getApiKeyHeader() });
		return res.ok;
	} catch {
		return false;
	}
}

async function waitForQdrantReady(maxRetries = 15, delayMs = 2000): Promise<boolean> {
	for (let i = 0; i < maxRetries; i++) {
		if (await qdrantHealthCheck()) {
			console.log(`🟢 Qdrant ready (attempt ${i + 1}/${maxRetries})`);
			return true;
		}
		console.log(`⏳ Waiting for Qdrant... (${i + 1}/${maxRetries})`);
		await new Promise((r) => setTimeout(r, delayMs));
	}
	console.error('❌ Qdrant did not become ready in time.');
	return false;
}

async function initQdrantIndexes(
	collectionName = process.env.QDRANT_COLLECTION || 'documents'
): Promise<{ ok: boolean; error?: string }> {
	try {
		const cols = await qdrant.getCollections();
		const exists = cols?.collections?.some((c) => c.name === collectionName);

		if (!exists) {
			const vectorSize = Number(process.env.EMBED_DIM || '1536');
			await qdrant.createCollection(collectionName, {
				vectors: { size: vectorSize, distance: 'Cosine' }
			});
			console.log(`✅ Created collection: ${collectionName}`);
		}

		const pairs: Array<[string, string]> = [
			['type', 'keyword'],
			['title', 'text'],
			['tags', 'keyword']
		];

		for (const [field, _schema] of pairs) {
			try {
				await qdrant.createPayloadIndex(collectionName, { field_name: field });
			} catch (e) {
				console.warn(`Failed to create payload index for field: '${field}'`, e);
			}
		}

		return { ok: true };
	} catch (e) {
		console.error('initQdrantIndexes failed:', e);
		return { ok: false, error: String(e) };
	}
}

async function bootstrapQdrant(collectionName?: string): Promise<{ ok: boolean; error?: string }> {
	const ready = await waitForQdrantReady();
	if (!ready) throw new Error('Qdrant startup timeout');
	return await initQdrantIndexes(collectionName || process.env.QDRANT_COLLECTION || 'documents');
}

export { qdrant, initQdrantIndexes, qdrantHealthCheck, waitForQdrantReady, bootstrapQdrant };
export type { SearchHit, CollectionsListResponse, CreateCollectionBody, PayloadIndexBody };



