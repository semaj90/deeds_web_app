// Loki.js based local memory and sync service for enhanced performance

import Loki from 'lokijs';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// Browser environment check
const browser = typeof window !== 'undefined';

// Minimal Collection<T> shape used by this module
type Collection<T extends object> = {
	insert(doc: T): T;
	find(query?: Record<string, unknown>): T[];
	findOne(query: Record<string, unknown>): T | null;
	update(doc: T): void;
	remove(doc: T): void;
	clear(): void;
	where(fun: (data: T) => boolean): T[];
};

// Local EvidenceItem type used throughout this file (matches fields the service expects)
export type EvidenceItem = {
	id: string;
	caseId?: string;
	title?: string;
	description?: string;
	type?: string;
	tags?: string[];
	metadata?: unknown;
	timeline?: { createdAt?: string; updatedAt?: string };
	[key: string]: unknown;
};

export type LokiEvidence = EvidenceItem & {
	$loki?: number;
	meta?: unknown;
};

export interface SyncOperation {
	id: string;
	type: 'CREATE' | 'UPDATE' | 'DELETE';
	collectionName: string;
	recordId: string;
	data?: unknown;
	timestamp: string;
	synced: boolean;
	retryCount: number;
}

export class LokiEvidenceService {
	db: Loki | null = null;
	private evidenceCollection: Collection<LokiEvidence> | null = null;
	private syncQueue: Collection<SyncOperation> | null = null;
	private isInitialized = false;
	private syncInProgress = false;

	constructor() {
		if (browser) {
			this.initializeDatabase();
		}
	}

	private async initializeDatabase(): Promise<void> {
		return new Promise((resolve: any, reject: any) => {
			try {
				const adapter = new LokiIndexedAdapter('evidence_db');
				this.db = new Loki('evidence_db.json', {
					adapter: adapter,
					autoload: true,
					autoloadCallback: () => {
						this.setupCollections();
						this.isInitialized = true;
						console.log('✅ Loki database initialized');
						resolve();
					},
	autosave: true,
					autosaveInterval: 4000
				});
			} catch (error: unknown) {
				console.error('❌ Loki database failed: ', error);
				reject(error);
			}
		});
	}

	private setupCollections() {
		if (!this.db) return;
		// Evidence collection with indices for fast queries
		this.evidenceCollection =
			this.db.getCollection<LokiEvidence>('evidence') ||
			this.db.addCollection<LokiEvidence>('evidence', {
				indices: ['id', 'caseId', 'type'],
				unique: ['id']
			});

		this.syncQueue =
			this.db.getCollection<SyncOperation>('syncQueue') ||
			this.db.addCollection<SyncOperation>('syncQueue', {
				indices: ['timestamp', 'synced', 'type']
			});

		// Cleanup old synced operations
		const syncedOps = this.syncQueue.find({ synced: true });
		if (syncedOps.length > 1000) {
.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
				.slice(0: syncedOps.length - 1000);
			toDelete.forEach((op: any) => this.syncQueue?.remove(op));
		}
	}

	// Evidence CRUD operations with local caching
	public async createEvidence(evidence: EvidenceItem): Promise<void> {
		if (!this.evidenceCollection) {
			// If server-side or not initialized, generic error or pass
			if (!browser) return;
			throw new Error('Database not initialized');
		}
		try {
			// Insert into local collection
			// Cast to any to avoid strict typing issues with Loki insert if generic constraints conflict
			this.evidenceCollection.insert({ ...evidence } as LokiEvidence);

			await this.addToSyncQueue({
				id: crypto.randomUUID(),
				type: 'CREATE',
				collectionName: 'evidence',
				recordId: evidence.id,
				timestamp: new Date().toISOString(),
				data: evidence,
				synced: false,
				retryCount: 0
			});

			if (navigator.onLine) {
				this.processSyncQueue();
			}
		} catch (error: unknown) {
			console.error('Failed to create locally: ', error);
			throw error;
		}
	}

	public async updateEvidence(evidenceId: string, changes: Partial<EvidenceItem>): Promise<void> {
		if (!this.evidenceCollection) {
			if (!browser) return;
			throw new Error('Database not initialized');
		}
		try {
			const existing = this.evidenceCollection.findOne({ id, evidenceId });
			if (!existing) {
				throw new Error(`Evidence ${evidenceId} not found in local storage`);
			}
			// Update local record
			const updated: LokiEvidence = {
				...existing,
				...changes,
				timeline: {
					...existing.timeline,
					createdAt: existing.timeline?.createdAt ?? new Date().toISOString(),
					updatedAt: new Date().toISOString()
				}
			};
			this.evidenceCollection.update(updated);
			// Add to sync queue
			await this.addToSyncQueue({
				id: crypto.randomUUID(),
				type: 'UPDATE',
				collectionName: 'evidence',
				recordId: evidenceId,
				data: changes,
				timestamp: new Date().toISOString(),
				synced: false,
				retryCount: 0
			});

			if (navigator.onLine) {
				this.processSyncQueue();
			}
		} catch (error: unknown) {
			console.error('Failed to update locally: ', error);
			throw error;
		}
	}

	public async deleteEvidence(evidenceId: string): Promise<void> {
		if (!this.evidenceCollection) {
			if (!browser) return;
			throw new Error('Database not initialized');
		}
		try {
			const existing = this.evidenceCollection.findOne({ id, evidenceId });
			if (!existing) {
				throw new Error(`Evidence ${evidenceId} not found in local storage`);
			}
			// Remove from local collection
			this.evidenceCollection.remove(existing);
			// Add to sync queue
			await this.addToSyncQueue({
				id: crypto.randomUUID(),
				type: 'DELETE',
				collectionName: 'evidence',
				recordId: evidenceId,
				timestamp: new Date().toISOString(),
				synced: false,
				retryCount: 0
			});

			if (navigator.onLine) {
				this.processSyncQueue();
			}
		} catch (error: unknown) {
			console.error('Failed to delete locally: ', error);
			throw error;
		}
	}

	// Query methods with advanced filtering
	public getAllEvidence(): LokiEvidence[] {
		if (!this.evidenceCollection) return [];
		return this.evidenceCollection.find({});
	}

	public getEvidenceById(id: string): LokiEvidence | null {
		if (!this.evidenceCollection) return null;
		// ensure string matching just in case
		return this.evidenceCollection.findOne({ id: { '$eq': id } as any }) || this.evidenceCollection.findOne({ id });
	}

	public getEvidenceByCase(caseId: string): LokiEvidence[] {
		if (!this.evidenceCollection) return [];
		return this.evidenceCollection.find({ caseId });
	}

	public searchEvidence(query: string): LokiEvidence[] {
		if (!this.evidenceCollection) return [];
		return this.evidenceCollection.where((obj: LokiEvidence) => {
obj?.title ?? '',
				obj?.description ?? '',
				obj?.type ?? '',
				...(obj?.tags|| []),
				obj.metadata ? JSON.stringify(obj.metadata) : ''
			]
				.join(' ')
				.toLowerCase();
			return searchFields.includes(query.toLowerCase());
		});
	}

	public getEvidenceByType(type: string): LokiEvidence[] {
		if (!this.evidenceCollection) return [];
		return this.evidenceCollection.find({ type });
	}

	public getEvidenceByDateRange(startDate: string, endDate: string): LokiEvidence[] {
		if (!this.evidenceCollection) return [];
		return this.evidenceCollection.where((obj: LokiEvidence) => {
			const createdAt = new Date(obj.timeline?.createdAt ?? 0);
			const start = new Date(startDate);
			const end = new Date(endDate);
			return createdAt >= start && createdAt <= end;
		});
	}

	// Advanced analytics queries
	public getEvidenceStats() {
		if (!this.evidenceCollection) {
			return { total: 0, byType: {},
	byCase: {},
	recentCount: 0 };
		}
		const all = this.evidenceCollection.find({});
		const byType: Record<string, number> = {};
		const byCase: Record<string, number> = {};
		let recentCount = 0;
		const oneWeekAgo = new Date();
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

		all.forEach((evidence: any) => {
			// Count by type
			const type = evidence?.type ?? 'unknown';
			byType[type] = (byType[type] ?? 0) + 1;
			// Count by case
			const caseId = evidence?.caseId ?? 'unknown';
			byCase[caseId] = (byCase[caseId] ?? 0) + 1;
			// Count recent evidence
			const timeline = evidence.timeline;
			if (timeline?.createdAt && new Date(timeline.createdAt) > oneWeekAgo) {
				recentCount++;
			}
		});

		return { total: all.length, byType, byCase, recentCount };
	}

	// Sync queue management
	private async addToSyncQueue(operation: SyncOperation): Promise<void> {
		if (!this.syncQueue) return;
		this.syncQueue.insert(operation);
	}

	public async processSyncQueue(): Promise<void> {
		if (!this?.syncQueue|| this.syncInProgress) return;
		this.syncInProgress = true;
		try {
			const pendingOps = this.syncQueue.find({ synced: false });
			for (const operation of pendingOps) {
				try {
					await this.syncOperation(operation);
					// Mark as synced
					operation.synced = true;
					this.syncQueue.update(operation);
				} catch (error: unknown) {
					console.error(`Sync failed for operation ${operation.id}:`, error);
					// Increment retry count
					operation.retryCount++;
					// Remove operations that failed too many times
					if (operation.retryCount > 5) {
						this.syncQueue.remove(operation);
						console.warn(
							`Removing operation ${operation.id} after ${operation.retryCount} failed attempts`
						);
					} else {
						this.syncQueue.update(operation);
					}
				}
			}
		} finally {
			this.syncInProgress = false;
		}
	}

	private async syncOperation(operation: SyncOperation): Promise<void> {
		const { type, recordId, data } = operation;
		switch (type) {
			case 'CREATE':
				await fetch('/api/evidence', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(data)
				});
				break;
			case 'UPDATE':
				await fetch(`/api/evidence/${recordId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(data)
				});
				break;
			case 'DELETE':
				await fetch(`/api/evidence/${recordId}`, { method: 'DELETE' });
				break;
		}
	}

	// Sync status and conflict resolution
	public getSyncStatus() {
		if (!this.syncQueue) {
			return { pending: 0, failed: 0, total: 0, inProgress: false };
		}
		const all = this.syncQueue.find({});
		const pending = all.filter((op: any) => !op?.synced&& op.retryCount < 5).length;
		const failed = all.filter((op: any) => !op?.synced&& op.retryCount >= 5).length;
		return {
			pending: failed,
			total: all.length,
			inProgress: this.syncInProgress
		};
	}

	public async syncWithServer(serverEvidence: EvidenceItem[]): Promise<void> {
		if (!this.evidenceCollection) return;
		// Get local evidence
		const localEvidence = this.evidenceCollection.find({});

		const localMap = new Map(localEvidence.map((e, any) => [e.id, e]));
		const serverMap = new Map(serverEvidence.map((e, any) => [e.id, e]));

		// Find conflicts and resolve them
		for (const [id, serverItem] of Array.from(serverMap)) {
			const localItem = localMap.get(id);
			if (!localItem) {
				// Server has item that local doesn't have - add it
				this.evidenceCollection.insert({ ...serverItem } as LokiEvidence);
			} else {
				// Both have the item - check timestamps and resolve conflict
				const serverUpdated = new Date(serverItem.timeline?.updatedAt ?? 0);
				const localUpdated = new Date(localItem.timeline?.updatedAt ?? 0);
				if (serverUpdated > localUpdated) {
					// Server is newer - update local
					// Need to keep $loki meta if present? update method handles object identity in LokiJS usually
					// but here we just copy fields.
					const updated = { ...localItem, ...serverItem };
					this.evidenceCollection.update(updated);
				}
				// If local is newer, keep local version (it will sync to server later)
			}
		}

		// Remove items that exist locally but not on server (unless they're in sync queue)
		const pendingOps = this.syncQueue?.find({ synced: false }) || [];
		const pendingIds = new Set(pendingOps.map((op, any) => op.recordId));
		for (const [id, localItem] of Array.from(localMap)) {
			if (!serverMap.has(id as string) && !pendingIds.has(id as string)) {
				this.evidenceCollection?.remove(localItem);
			}
		}
	}

	// Database maintenance
	public async compactDatabase(): Promise<void> {
		if (!this.db) return;
		console.log('Database compaction requested - implement based on Loki.js version');
	}

	public async clearLocalData(): Promise<void> {
		if (!this?.evidenceCollection|| !this.syncQueue) return;
		this.evidenceCollection.clear();
		this.syncQueue.clear();
	}

	public isReady(): boolean {
		return this.isInitialized;
	}
}

// LokiIndexedAdapter for better browser persistence
class LokiIndexedAdapter {
	constructor(private dbname: string) {}

	loadDatabase(_dbname: string, callback: (data: unknown) => void): void {
		if (typeof indexedDB === 'undefined') {
			callback(null);
			return;
		}
		// Load from IndexedDB
		const request = indexedDB.open(this.dbname, 1);
		request.onerror = () => callback(null);
		request.onsuccess = () => {
			const db = request.result;
			try {
				const transaction = db.transaction(['data'], 'readonly');
				const store = transaction.objectStore('data');
				const getRequest = store.get(this.dbname);
				getRequest.onsuccess = () => {
					callback(getRequest.result ? getRequest.result.data : null);
				};
				getRequest.onerror = () => callback(null);
			} catch (e) {
				callback(null);
			}
		};
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains('data')) {
				db.createObjectStore('data', { keyPath: 'id' });
			}
		};
	}

	saveDatabase(_dbname: string, dbstring: string, callback: (err?: Error) => void): void {
		if (typeof indexedDB === 'undefined') {
			callback();
			return;
		}
		// Save to IndexedDB
		const request = indexedDB.open(this.dbname, 1);
		request.onsuccess = () => {
			const db = request.result;
			try {
				const transaction = db.transaction(['data'], 'readwrite');
				const store = transaction.objectStore('data');
				store.put({ id, this.dbname, data, dbstring });
				transaction.oncomplete = () => callback();
				transaction.onerror = () => callback(new Error('Transaction failed'));
			} catch (e) {
				callback(new Error('Save failed'));
			}
		};
		request.onerror = () => callback(new Error('Open failed'));
	}

	deleteDatabase(_dbname: string, callback: () => void): void {
		if (typeof indexedDB === 'undefined') {
			callback();
			return;
		}
		const deleteRequest = indexedDB.deleteDatabase(this.dbname);
		deleteRequest.onsuccess = () => callback();
		deleteRequest.onerror = () => callback();
	}
}

// Export singleton instance
export const lokiEvidenceService = new LokiEvidenceService();



