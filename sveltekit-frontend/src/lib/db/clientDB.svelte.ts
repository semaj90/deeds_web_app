import loki from 'lokijs';
import LokiIndexedAdapter from 'lokijs/src/loki-indexed-adapter';

export class LocalLegalStore {
    private db: loki;
    private cases: Collection<any> | null = null;

    // Reactive array for the UI
    results = $state<any[]>([]);

    // Add Sync State
    syncStatus = $state<'synced' | 'syncing' | 'offline'>('synced');
    lastSyncTime = $state(Date.now());

    constructor() {
        if (typeof window !== 'undefined') {
            const adapter = new LokiIndexedAdapter('legal-ai');
            this.db = new loki('legal.db', {
                adapter,
                autoload: true,
                autoloadCallback: () => this.init()
            });
        } else {
            // Server-side mock or null
            this.db = new loki('legal.db'); // Memory-only for SSR to prevent crash
        }
    }

    private init() {
        this.cases = this.db.getCollection('cases') || this.db.addCollection('cases');
        this.refresh();
    }

    addCase(title: string) {
        if (this.cases) {
            this.cases.insert({ title, created: Date.now() });
            this.db.saveDatabase();
            this.refresh();
        }
    }

    search(query: string) {
        // LokiJS Query
        if (this.cases) {
            this.results = this.cases.find({ 'title': { '$contains': query } });
        }
    }

    private refresh() {
        this.results = this.cases ? this.cases.chain().data() : [];
    }

    async syncWithServer() {
        this.syncStatus = 'syncing';
        try {
            // Call your SvelteKit API to fetch diffs
            const diffs = await fetch('/api/sync').then(r => r.json());
            // this.bulkInsert(diffs); // Update LokiJS - assuming bulkInsert exists or implementing it
            if (this.cases && diffs && Array.isArray(diffs)) {
                 this.cases.insert(diffs);
                 this.db.saveDatabase();
                 this.refresh();
            }
            this.syncStatus = 'synced';
            this.lastSyncTime = Date.now();
        } catch (e) {
            this.syncStatus = 'offline';
            console.error('Sync failed', e);
        }
    }
}

