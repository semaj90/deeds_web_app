import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	STORY_DB_NAME,
	STORY_DB_VERSION,
	openStoryDb,
	saveStory,
	loadStory,
	saveRun,
	loadRun,
	saveChunks,
	loadChunksForStory,
	evictOldRunsAndChunks,
	type StoryRun,
	type StoryChunk
} from './store.js';
import type { Story } from './engine.js';

interface InMemoryStoreRecord {
	[key: string]: any;
}

class MockIDBIndex {
	constructor(
		private records: Map<string, InMemoryStoreRecord>,
		private keyPath: string
	) {}

	getAll(query?: any): IDBRequest {
		const req: any = {
			result: null,
			error: null,
			onsuccess: null,
			onerror: null
		};
		queueMicrotask(() => {
			const results: any[] = [];
			for (const val of this.records.values()) {
				if (query === undefined || val[this.keyPath] === query) {
					results.push(structuredClone(val));
				}
			}
			req.result = results;
			if (req.onsuccess) req.onsuccess({ target: req } as any);
		});
		return req as IDBRequest;
	}
}

class MockIDBObjectStore {
	public indexes = new Map<string, MockIDBIndex>();

	constructor(
		public name: string,
		public options: { keyPath: string },
		public records: Map<string, InMemoryStoreRecord>
	) {}

	createIndex(name: string, keyPath: string, options?: IDBIndexParameters): IDBIndex {
		const index = new MockIDBIndex(this.records, keyPath);
		this.indexes.set(name, index);
		return index as any;
	}

	index(name: string): IDBIndex {
		const idx = this.indexes.get(name);
		if (!idx) throw new Error(`Index not found: ${name}`);
		return idx as any;
	}

	put(value: any): IDBRequest {
		const key = value[this.options.keyPath];
		this.records.set(key, structuredClone(value));
		const req: any = { result: key, error: null, onsuccess: null, onerror: null };
		queueMicrotask(() => {
			if (req.onsuccess) req.onsuccess({ target: req } as any);
		});
		return req as IDBRequest;
	}

	get(key: any): IDBRequest {
		const req: any = {
			result: undefined,
			error: null,
			onsuccess: null,
			onerror: null
		};
		queueMicrotask(() => {
			const item = this.records.get(key);
			req.result = item ? structuredClone(item) : undefined;
			if (req.onsuccess) req.onsuccess({ target: req } as any);
		});
		return req as IDBRequest;
	}

	getAll(): IDBRequest {
		const req: any = {
			result: [],
			error: null,
			onsuccess: null,
			onerror: null
		};
		queueMicrotask(() => {
			req.result = Array.from(this.records.values()).map((v) => structuredClone(v));
			if (req.onsuccess) req.onsuccess({ target: req } as any);
		});
		return req as IDBRequest;
	}

	delete(key: any): IDBRequest {
		this.records.delete(key);
		const req: any = { result: undefined, error: null, onsuccess: null, onerror: null };
		queueMicrotask(() => {
			if (req.onsuccess) req.onsuccess({ target: req } as any);
		});
		return req as IDBRequest;
	}
}

class MockIDBDatabase {
	public objectStoreNames = {
		contains: (name: string) => this.stores.has(name)
	};
	public stores = new Map<string, MockIDBObjectStore>();
	public closed = false;

	createObjectStore(name: string, options: { keyPath: string }): MockIDBObjectStore {
		const store = new MockIDBObjectStore(name, options, new Map());
		this.stores.set(name, store);
		return store;
	}

	transaction(storeNames: string | string[], mode: IDBTransactionMode): IDBTransaction {
		const db = this;
		const name = Array.isArray(storeNames) ? storeNames[0] : storeNames;
		const store = this.stores.get(name);
		if (!store) throw new Error(`Object store not found: ${name}`);

		const tx: any = {
			objectStore: (n: string) => {
				const s = db.stores.get(n);
				if (!s) throw new Error(`Object store not found: ${n}`);
				return s;
			},
			error: null,
			oncomplete: null,
			onerror: null
		};

		queueMicrotask(() => {
			if (tx.oncomplete) tx.oncomplete({ target: tx } as any);
		});

		return tx as IDBTransaction;
	}

	close(): void {
		this.closed = true;
	}
}

describe('Courtroom Story Store (IndexedDB v2)', () => {
	let mockDb: MockIDBDatabase;

	beforeEach(() => {
		mockDb = new MockIDBDatabase();

		const mockFactory = {
			open: (name: string, version?: number) => {
				const req: any = {
					result: mockDb,
					error: null,
					onsuccess: null,
					onerror: null,
					onupgradeneeded: null
				};
				queueMicrotask(() => {
					if (version !== undefined && req.onupgradeneeded) {
						req.onupgradeneeded({ target: req } as any);
					}
					if (req.onsuccess) {
						req.onsuccess({ target: req } as any);
					}
				});
				return req as IDBOpenDBRequest;
			}
		};

		vi.stubGlobal('indexedDB', mockFactory);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('enforces canonical database name and version 2', () => {
		expect(STORY_DB_NAME).toBe('courtroom-story-v1');
		expect(STORY_DB_VERSION).toBe(2);
	});

	it('initializes all three object stores (stories, runs, chunks) with expected indexes', async () => {
		const db = await openStoryDb();
		expect(db.objectStoreNames.contains('stories')).toBe(true);
		expect(db.objectStoreNames.contains('runs')).toBe(true);
		expect(db.objectStoreNames.contains('chunks')).toBe(true);

		const runStore = mockDb.stores.get('runs');
		expect(runStore?.indexes.has('by_story')).toBe(true);

		const chunkStore = mockDb.stores.get('chunks');
		expect(chunkStore?.indexes.has('by_story')).toBe(true);
	});

	it('persists and loads a story record', async () => {
		const sampleStory: Story = {
			version: 1,
			id: 'story-alpha',
			title: 'The Stolen Land Deed Case',
			actors: [
				{
					id: 'judge-1',
					role: 'judge',
					name: 'Judge Thorne',
					asset: 'judge.glb',
					clips: {},
					personality: { patience: 80, honesty: 95 }
				}
			],
			cues: [
				{
					id: 'cue-0',
					tick: 0,
					actorId: 'judge-1',
					kind: 'phase',
					value: 'opening'
				}
			]
		};

		await saveStory(sampleStory);
		const loaded = await loadStory('story-alpha');
		expect(loaded).toEqual(sampleStory);
	});

	it('persists and loads a story run record with inputs and status', async () => {
		const sampleRun: StoryRun = {
			id: 'run-99',
			storyId: 'story-alpha',
			currentTick: 15,
			status: 'running',
			inputs: [
				{ type: 'SUBMIT_EVIDENCE', id: 'ev-deed-01' },
				{ type: 'TICK', steps: 10 }
			],
			startedAt: '2026-10-31T13:00:00.000Z',
			metadata: { simulationMode: 'offline_preview' }
		};

		await saveRun(sampleRun);
		const loaded = await loadRun('run-99');
		expect(loaded).toEqual(sampleRun);
		expect(loaded?.inputs).toHaveLength(2);
	});

	it('persists and loads story chunks with Float32Array vector embeddings without corruption', async () => {
		const vectorA = new Float32Array([0.123, -0.456, 0.789, 0.0]);
		const vectorB = new Float32Array([-0.987, 0.654, -0.321, 1.0]);

		const chunks: StoryChunk[] = [
			{
				id: 'chunk-1',
				storyId: 'story-alpha',
				text: 'Exhibit A certifies that parcel 44 was transferred in 1982.',
				vector: vectorA,
				metadata: { sourceDoc: 'deed.pdf', page: 1 }
			},
			{
				id: 'chunk-2',
				storyId: 'story-alpha',
				text: 'Witness stated that the notary stamp was authentic.',
				vector: vectorB,
				metadata: { sourceDoc: 'witness_statement.txt', page: 2 }
			},
			{
				id: 'chunk-3',
				storyId: 'story-beta',
				text: 'Unrelated chunk for another story.',
				vector: new Float32Array([0.0, 0.0, 0.0, 0.0])
			}
		];

		await saveChunks(chunks);

		const loadedAlphaChunks = await loadChunksForStory('story-alpha');
		expect(loadedAlphaChunks).toHaveLength(2);
		expect(loadedAlphaChunks.map((c) => c.id).sort()).toEqual(['chunk-1', 'chunk-2']);

		const retrievedChunk1 = loadedAlphaChunks.find((c) => c.id === 'chunk-1');
		expect(retrievedChunk1).toBeDefined();
		// IndexedDB structured cloning may materialize a typed array from another realm.
		// Check the binary view and values, not the current realm's instanceof identity.
		expect(ArrayBuffer.isView(retrievedChunk1?.vector)).toBe(true);
		expect(Object.prototype.toString.call(retrievedChunk1?.vector)).toBe('[object Float32Array]');
		expect(Array.from(retrievedChunk1!.vector!)).toEqual(Array.from(vectorA));

		// Invariant: no hidden reasoning or KV cache stored
		for (const c of loadedAlphaChunks) {
			expect((c as any).hiddenThoughts).toBeUndefined();
			expect((c as any).kv_cache).toBeUndefined();
			expect((c as any).chainOfThought).toBeUndefined();
		}
	});

	it('evicts old runs and orphaned chunks according to quota rules (CSP-42)', async () => {
		// Populate 3 runs
		await saveRun({
			id: 'run-old-1',
			storyId: 'story-old-1',
			currentTick: 10,
			status: 'completed',
			inputs: [],
			startedAt: '2026-10-01T00:00:00.000Z'
		});
		await saveRun({
			id: 'run-old-2',
			storyId: 'story-old-2',
			currentTick: 10,
			status: 'completed',
			inputs: [],
			startedAt: '2026-10-02T00:00:00.000Z'
		});
		await saveRun({
			id: 'run-recent',
			storyId: 'story-recent',
			currentTick: 10,
			status: 'completed',
			inputs: [],
			startedAt: '2026-10-31T00:00:00.000Z'
		});

		// Populate chunks
		await saveChunks([
			{ id: 'chunk-old-1', storyId: 'story-old-1', text: 'Old chunk 1' },
			{ id: 'chunk-old-2', storyId: 'story-old-2', text: 'Old chunk 2' },
			{ id: 'chunk-recent', storyId: 'story-recent', text: 'Recent chunk' }
		]);

		// Enforce maxRuns = 1 (evict oldest 2 runs)
		const receipt = await evictOldRunsAndChunks({ maxRuns: 1, maxChunks: 10 });
		expect(receipt.evictedRunsCount).toBe(2);
		expect(receipt.remainingRunsCount).toBe(1);
		expect(receipt.evictedChunksCount).toBe(2);
		expect(receipt.remainingChunksCount).toBe(1);

		// Old runs should be gone
		expect(await loadRun('run-old-1')).toBeUndefined();
		expect(await loadRun('run-old-2')).toBeUndefined();

		// Recent run stays
		const remaining = await loadRun('run-recent');
		expect(remaining).toBeDefined();
		expect(remaining?.id).toBe('run-recent');

		// Only recent chunk remains
		const remainingChunks = await loadChunksForStory('story-recent');
		expect(remainingChunks).toHaveLength(1);
		expect(remainingChunks[0].id).toBe('chunk-recent');
	});
});
