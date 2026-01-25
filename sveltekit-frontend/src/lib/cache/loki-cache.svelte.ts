/**
 * LokiJS In-Memory Reactive Cache
 * Fast in-memory database with MongoDB-like queries
 */

import { browser } from '$app/environment';
import type { Collection } from 'lokijs';
import Loki from 'lokijs';

interface CacheOptions {
	ttl?: number; // Time to live in milliseconds
	indices?: string[]; // Fields to index for faster queries
}

interface CachedDocument {
	id: string;
	data: any;
	createdAt: number;
	expiresAt: number;
	meta?: any;
}

class LokiCache {
	private db: Loki | null = null;
	private collections = new Map<string, Collection<CachedDocument>>();
	private ready = $state(false);
	private stats = $state({
		collections: 0,
		documents: 0,
		memoryUsage: 0
	});

	constructor() {
		if (browser) {
			this.initialize();
		}
	}

	private initialize() {
		try {
			this.db = new Loki('deeds-cache', {
				autoload: false,
				autosave: false, // Memory-only for speed
				env: 'BROWSER'
			});

			this.ready = true;
			console.log('✅ LokiJS in-memory cache initialized');
		} catch (error) {
			console.error('❌ LokiJS initialization failed:', error);
		}
	}

	/**
	 * Get or create a collection with reactive state
	 */
	getCollection(name: string, options: CacheOptions = {}): Collection<CachedDocument> | null {
		if (!this.db || !this.ready) return null;

		// Return existing collection
		if (this.collections.has(name)) {
			return this.collections.get(name)!;
		}

		// Create new collection
		const collection = this.db.addCollection<CachedDocument>(name, {
			unique: ['id'],
			indices: ['expiresAt', ...(options.indices || [])],
			disableMeta: false
		});

		this.collections.set(name, collection);
		this.updateStats();

		return collection;
	}

	/**
	 * Insert document into collection
	 */
	insert(collectionName: string, id: string, data: any, options: CacheOptions = {}): CachedDocument | null {
		const collection = this.getCollection(collectionName, options);
		if (!collection) return null;

		const now = Date.now();
		const ttl = options.ttl || 3600000; // Default 1 hour

		try {
			// Remove existing document with same id
			const existing = collection.findOne({ id });
			if (existing) {
				collection.remove(existing);
			}

			const doc: CachedDocument = {
				id,
				data,
				createdAt: now,
				expiresAt: now + ttl,
				meta: options
			};

			const inserted = collection.insert(doc);
			this.updateStats();
			return inserted;
		} catch (error) {
			console.error('LokiJS insert error:', error);
			return null;
		}
	}

	/**
	 * Find document by id
	 */
	findById(collectionName: string, id: string): any | null {
		const collection = this.getCollection(collectionName);
		if (!collection) return null;

		try {
			const doc = collection.findOne({ id });

			// Check expiration
			if (doc && Date.now() > doc.expiresAt) {
				collection.remove(doc);
				this.updateStats();
				return null;
			}

			return doc?.data || null;
		} catch (error) {
			console.error('LokiJS find error:', error);
			return null;
		}
	}

	/**
	 * Query collection with LokiJS query syntax
	 */
	query(collectionName: string, queryObj: any = {}): any[] {
		const collection = this.getCollection(collectionName);
		if (!collection) return [];

		try {
			const results = collection.find(queryObj);

			// Filter expired documents
			const now = Date.now();
			const valid = results.filter(doc => {
				if (now > doc.expiresAt) {
					collection.remove(doc);
					return false;
				}
				return true;
			});

			if (valid.length !== results.length) {
				this.updateStats();
			}

			return valid.map(doc => doc.data);
		} catch (error) {
			console.error('LokiJS query error:', error);
			return [];
		}
	}

	/**
	 * Delete document by id
	 */
	delete(collectionName: string, id: string): boolean {
		const collection = this.getCollection(collectionName);
		if (!collection) return false;

		try {
			const doc = collection.findOne({ id });
			if (doc) {
				collection.remove(doc);
				this.updateStats();
				return true;
			}
			return false;
		} catch (error) {
			console.error('LokiJS delete error:', error);
			return false;
		}
	}

	/**
	 * Clear all documents in a collection
	 */
	clearCollection(collectionName: string): boolean {
		const collection = this.getCollection(collectionName);
		if (!collection) return false;

		try {
			collection.clear();
			this.updateStats();
			return true;
		} catch (error) {
			console.error('LokiJS clear collection error:', error);
			return false;
		}
	}

	/**
	 * Clear all collections
	 */
	clearAll(): void {
		if (!this.db) return;

		try {
			for (const [name, collection] of this.collections) {
				collection.clear();
			}
			this.updateStats();
			console.log('✅ All LokiJS collections cleared');
		} catch (error) {
			console.error('LokiJS clear all error:', error);
		}
	}

	/**
	 * Clean expired documents across all collections
	 */
	cleanExpired(): number {
		let removed = 0;
		const now = Date.now();

		for (const collection of this.collections.values()) {
			try {
				const expired = collection.find({ expiresAt: { $lt: now } });
				for (const doc of expired) {
					collection.remove(doc);
					removed++;
				}
			} catch (error) {
				console.error('LokiJS clean expired error:', error);
			}
		}

		if (removed > 0) {
			this.updateStats();
			console.log(`🧹 Cleaned ${removed} expired documents`);
		}

		return removed;
	}

	/**
	 * Update statistics
	 */
	private updateStats(): void {
		let totalDocs = 0;
		for (const collection of this.collections.values()) {
			totalDocs += collection.count();
		}

		this.stats = {
			collections: this.collections.size,
			documents: totalDocs,
			memoryUsage: this.db ? JSON.stringify(this.db.serialize()).length : 0
		};
	}

	/**
	 * Get reactive statistics
	 */
	getStats() {
		return this.stats;
	}

	/**
	 * Check if cache is ready
	 */
	isReady() {
		return this.ready;
	}

	/**
	 * Export database snapshot (for persistence)
	 */
	exportSnapshot(): string | null {
		if (!this.db) return null;

		try {
			return JSON.stringify(this.db.serialize());
		} catch (error) {
			console.error('LokiJS export error:', error);
			return null;
		}
	}

	/**
	 * Import database snapshot
	 */
	importSnapshot(snapshot: string): boolean {
		if (!this.db) return false;

		try {
			const data = JSON.parse(snapshot);
			this.db.loadJSON(data);

			// Rebuild collection map
			this.collections.clear();
			for (const collectionName of this.db.listCollections().map(c => c.name)) {
				const collection = this.db.getCollection(collectionName);
				if (collection) {
					this.collections.set(collectionName, collection as Collection<CachedDocument>);
				}
			}

			this.updateStats();
			console.log('✅ LokiJS snapshot imported');
			return true;
		} catch (error) {
			console.error('LokiJS import error:', error);
			return false;
		}
	}
}

// Singleton instance with reactive state
export const lokiCache = new LokiCache();

/**
 * Composable for LokiJS operations with reactive state
 */
export function useLokiCache() {
	return {
		insert: (collection: string, id: string, data: any, options?: CacheOptions) =>
			lokiCache.insert(collection, id, data, options),
		findById: (collection: string, id: string) => lokiCache.findById(collection, id),
		query: (collection: string, queryObj?: any) => lokiCache.query(collection, queryObj),
		delete: (collection: string, id: string) => lokiCache.delete(collection, id),
		clearCollection: (collection: string) => lokiCache.clearCollection(collection),
		clearAll: () => lokiCache.clearAll(),
		cleanExpired: () => lokiCache.cleanExpired(),
		exportSnapshot: () => lokiCache.exportSnapshot(),
		importSnapshot: (snapshot: string) => lokiCache.importSnapshot(snapshot),
		stats: lokiCache.getStats(),
		isReady: lokiCache.isReady()
	};
}

// Auto-cleanup expired documents every 5 minutes
if (browser) {
	setInterval(() => {
		lokiCache.cleanExpired();
	}, 300000);
}
