/**
 * Phase 76: Local Legal Document Store (LokiJS)
 * Offline-first database with sync to Polyglot Persistence backend
 */

import loki from 'lokijs';
import LokiIndexedAdapter from 'lokijs/src/loki-indexed-adapter';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface LegalDoc {
	id: string; title: string;
	content: string; type: 'contract' | 'statute' | 'case' | 'memo';
	caseId?: string; tags: string[];
	createdAt: number; updatedAt: number;
	syncedAt?: number;
}

type LegalDocCollection = loki.Collection<LegalDoc>;

export class LocalLegalStore {
	// ========================================
	// Reactive State (Svelte 5 runes)
	// ========================================

	/**
	 * Search results (reactive)
	 */
	results: LegalDoc[] = $state([]);

	/**
	 * Sync status with backend
	 */
	syncStatus: SyncStatus = $state('offline');

	/**
	 * Last successful sync timestamp
	 */
	lastSyncTime: number = $state(0);

	/**
	 * Total documents in local DB
	 */
	documentCount: number = $state(0);

	/**
	 * Pending changes to sync
	 */
	pendingChanges: number = $state(0);

	/**
	 * Initialization state
	 */
	isInitialized: boolean = $state(false);

	// ========================================
	// Private Properties
	// ========================================

	private db!: loki;
	private documents!: LegalDocCollection;
	private syncInterval: number | null = null;

	// ========================================
	// Constructor
	// ========================================

	constructor() {
		if (typeof window !== 'undefined') {
			this.init();
		}
	}

	// ========================================
	// Initialization
	// ========================================

	/**
	 * Initialize LokiJS database
	 */
	async init(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				const adapter = new LokiIndexedAdapter('legal-ai-db');
				this.db = new loki('legal-documents.db', {
					adapter,
					autoload: true,
					autoloadCallback: () => {
						this.onDatabaseLoaded();
						resolve();
					},
					autosave: true,
					autosaveInterval: 4000
				});
			} catch (error) {
				console.error('❌ Failed to initialize LokiJS:', error);
				this.syncStatus = 'error';
				reject(error);
			}
		});
	}

	/**
	 * Called when database is loaded from IndexedDB
	 */
	private onDatabaseLoaded() {
		// Get or create documents collection
		this.documents =
			this.db.getCollection<LegalDoc>('documents') ||
			this.db.addCollection<LegalDoc>('documents', {
				indices: ['id', 'caseId', 'type', 'createdAt']
			});

		// Update counts
		this.documentCount = this.documents.count();
		this.isInitialized = true;

		// Refresh results
		this.refresh();

		console.log(`✅ LokiJS initialized with ${this.documentCount} documents`);
	}

	// ========================================
	// CRUD Operations
	// ========================================

	/**
	 * Add a new document
	 */
	addDocument(doc: Omit<LegalDoc, 'id' | 'createdAt' | 'updatedAt'>): LegalDoc {
		const newDoc: LegalDoc = {
			...doc,
			id: this.generateId(),
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		this.documents.insert(newDoc);
		this.db.saveDatabase();

		this.documentCount++;
		this.pendingChanges++;
		this.refresh();

		console.log(`✅ Added document: ${newDoc.title}`);
		return newDoc;
	}

	/**
	 * Update an existing document
	 */
	updateDocument(id: string, updates: Partial<LegalDoc>): void {
		const doc = this.documents.findOne({ id });
		if (doc) {
			Object.assign(doc, updates, { updatedAt: Date.now() });
			this.documents.update(doc);
			this.db.saveDatabase();

			this.pendingChanges++;
			this.refresh();

			console.log(`✅ Updated document: ${id}`);
		}
	}

	/**
	 * Delete a document
	 */
	deleteDocument(id: string): void {
		const doc = this.documents.findOne({ id });
		if (doc) {
			this.documents.remove(doc);
			this.db.saveDatabase();

			this.documentCount--;
			this.pendingChanges++;
			this.refresh();

			console.log(`✅ Deleted document: ${id}`);
		}
	}

	/**
	 * Find document by ID
	 */
	findById(id: string): LegalDoc | null {
		return this.documents.findOne({ id });
	}

	/**
	 * Bulk insert documents
	 */
	bulkInsert(docs: Omit<LegalDoc, 'id' | 'createdAt' | 'updatedAt'>[]): void {
		const newDocs = docs.map((doc) => ({
			...doc,
			id: this.generateId(),
			createdAt: Date.now(),
			updatedAt: Date.now()
		}));

		this.documents.insert(newDocs);
		this.db.saveDatabase();

		this.documentCount += newDocs.length;
		this.refresh();

		console.log(`✅ Bulk inserted ${newDocs.length} documents`);
	}

	// ========================================
	// Search & Query
	// ========================================

	/**
	 * Search documents by query
	 */
	search(query: string): void {
		if (!query.trim()) {
			this.results = this.documents.chain().limit(100).data();
			return;
		}

		this.results = this.documents.find({
			$or: [
				{ title: { $contains: query } },
				{ content: { $contains: query } },
				{ tags: { $contains: query } }
			]
		});
	}

	/**
	 * Filter by type
	 */
	filterByType(type: LegalDoc['type']): void {
		this.results = this.documents.find({ type });
	}

	/**
	 * Get documents by case ID
	 */
	getByCaseId(caseId: string): LegalDoc[] {
		return this.documents.find({ caseId });
	}

	/**
	 * Get all documents
	 */
	getAll(): LegalDoc[] {
		return this.documents.chain().simplesort('updatedAt', true).data();
	}

	/**
	 * Refresh results (load all documents)
	 */
	private refresh(): void {
		this.results = this.documents.chain().simplesort('updatedAt', true).limit(100).data();
	}

	// ========================================
	// Sync with Backend
	// ========================================

	/**
	 * Sync with Polyglot Persistence backend
	 */
	async syncWithServer(): Promise<void> {
		if (this.syncStatus === 'syncing') {
			console.log('⏳ Sync already in progress');
			return;
		}

		this.syncStatus = 'syncing';

		try {
			// Fetch updates from server
			const response = await fetch('/api/sync/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lastSyncTime: this.lastSyncTime,
					pendingChanges: this.pendingChanges
				})
			});

			if (!response.ok) {
				throw new Error(`Sync failed: ${response.statusText}`);
			}

			const { documents: deletedIds } = (await response.json()) as {
				documents?: Omit<LegalDoc, 'id' | 'createdAt' | 'updatedAt'>[];
				deletedIds?: string[];
			};

			// Apply updates
			if (documents && documents.length > 0) {
				this.bulkInsert(documents);
			}

			// Handle deletions
			if (deletedIds && deletedIds.length > 0) {
				deletedIds.forEach((id: string) => this.deleteDocument(id));
			}

			// Update sync state
			this.syncStatus = 'synced';
			this.lastSyncTime = Date.now();
			this.pendingChanges = 0;

			console.log(`✅ Synced with server (${documents?.length || 0} updates)`);
		} catch (error) {
			console.error('❌ Sync failed:', error);
			this.syncStatus = 'offline';
		}
	}

	/**
	 * Start automatic background sync
	 */
	startAutoSync(intervalSeconds = 60) {
		if (this.syncInterval) {
			this.stopSync();
		}

		this.syncInterval = window.setInterval(() => {
			this.syncWithServer();
		}, intervalSeconds * 1000);

		// Initial sync
		this.syncWithServer();

		console.log(`✅ Auto-sync started (every ${intervalSeconds}s)`);
	}

	/**
	 * Stop automatic sync
	 */
	stopSync() {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
			this.syncInterval = null;
			console.log('✅ Auto-sync stopped');
		}
	}

	// ========================================
	// Utility
	// ========================================

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * Clear all documents
	 */
	clear(): void {
		this.documents.clear();
		this.db.saveDatabase();

		this.documentCount = 0;
		this.pendingChanges = 0;
		this.refresh();

		console.log('✅ All documents cleared');
	}

	/**
	 * Get database statistics
	 */
	getStats() {
		return {
			totalDocuments: this.documentCount,
			pendingChanges: this.pendingChanges,
			syncStatus: this.syncStatus,
			lastSyncTime: this.lastSyncTime,
			isInitialized: this.isInitialized,
			byType: { contract: this.documents.count({ type: 'contract' }),
				statute: this.documents.count({ type: 'statute' }),
				case: this.documents.count({ type: 'case' }),
				memo: this.documents.count({ type: 'memo' })
			}
		};
	}
}




