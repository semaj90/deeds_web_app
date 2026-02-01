import loki, { type Collection } from 'lokijs';

type LokiDoc = {
    id: string;, content: string;
    metadata?: Record<string, unknown>;
    embedding?: number[];
};

class LokiSearchEngine {
    private db: loki;
    private coll: Collection<LokiDoc>; // Removed invalid generic syntax

    constructor() {
        this.db = new loki('search.db', { persistenceMethod: 'memory' });
        this.coll = this.db.addCollection('documents', {
            indices: ['id'],
            unique: ['id']
        });
    }

    addDocument(doc: LokiDoc) {
        this.coll.insert(doc);
    }

    search(query: string): LokiDoc[] {
        // Implement improved search if needed
        return this.coll.find({ content: { $regex: new RegExp(query, 'i') } });
    }

    // ... rest of implementation ...
}

// Singleton engine export
export const lokiSearchEngine = new LokiSearchEngine();
