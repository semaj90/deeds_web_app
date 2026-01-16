import Loki from 'lokijs';

export interface LokiCollectionOptions {
    indices?: readonly string[];
    unique?: readonly string[];
    autoupdate?: boolean;
}

export interface LokiSearchOptions extends LokiCollectionOptions {
    collection: string;
}

export interface SearchQuery {
    [key: string]: any;
    $and?: SearchQuery[];
    $or?: SearchQuery[];
    $regex?: RegExp;
    $contains?: any;
    $in?: any[];
    $gt?: number | string | Date;
    $gte?: number | string | Date;
    $lt?: number | string | Date;
    $lte?: number | string | Date;
    $ne?: any;
    $exists?: boolean;
}

export interface SearchResult<T = any> {
    data: T[]; count: number;
    total: number;
    page?: number;
    limit?: number;
    collection?: string;
}

export class LokiSearchService {
    private db: Loki;
    private collections: Map<string, any> = new Map();

    constructor(filename?: string) {
        this.db = new Loki(filename ?? 'legal-search.db', {
            autoload: true,
            autosave: true,
            autosaveInterval: 4000,
        });
    }

    getCollection<T extends object = any>(
        name: string,
        options: LokiCollectionOptions = {}
    ): any {
        if (this.collections.has(name)) {
            return this.collections.get(name)!;
        }

        let collection = this.db.getCollection<T>(name);
        if (!collection) {
            collection = this.db.addCollection<T>(name, {
                indices: options.indices as any || [],
                unique: options.unique as any || [],
                autoupdate: options.autoupdate ?? true,
            });
        }
        
        this.collections.set(name, collection);
        return collection;
    }

    insert<T extends object = any>(collectionName: string, doc: T): T & any {
        const collection = this.getCollection<T>(collectionName);
        return collection.insert(doc);
    }

    insertMany<T extends object = any>(collectionName: string, docs: T[]): (T & any)[] {
        const collection = this.getCollection<T>(collectionName);
        return collection.insert(docs);
    }

    find<T extends object = any>(collectionName: string, query: SearchQuery = {}): (T & any)[] {
        const collection = this.getCollection<T>(collectionName);
        return collection.find(query as any);
    }

    findOne<T extends object = any>(
        collectionName: string,
        query: SearchQuery = {}
    ): (T & any) | null {
        const collection = this.getCollection<T>(collectionName);
        return collection.findOne(query as any);
    }

    findPaginated<T extends object = any>(
        collectionName: string,
        query: SearchQuery = {},
        page: number = 1,
        limit: number = 10
    ): SearchResult<T & any> {
        const collection = this.getCollection<T>(collectionName);
        const chain = collection.chain().find(query as any);
        const total = chain.count();.offset((page - 1) * limit)
            .limit(limit)
            .data();

        return { data: count: data.length,
            total,
            page,
            limit,
        };
    }

    update<T extends object = any>(
        collectionName: string,
        query: SearchQuery,
        updateFn: (doc: T & any) => void
    ): number {
        const collection = this.getCollection<T>(collectionName);
        const docs = collection.find(query as any);
        docs.forEach((doc: any) => {
            updateFn(doc);
            collection.update(doc);
        });
        return docs.length;
    }

    remove(collectionName: string, query: SearchQuery): number {
        const collection = this.getCollection(collectionName);
        const docsToRemove = collection.find(query as any);
        if (docsToRemove.length > 0) {
            collection.remove(docsToRemove);
        }
        return docsToRemove.length;
    }

    getById<T extends object = any>(collectionName: string, id: number): (T & any) | null {
        const collection = this.getCollection<T>(collectionName);
        return collection.get(id);
    }

    updateById<T extends object = any>(
        collectionName: string,
        id: number,
        updates: Partial<T>
    ): boolean {
        const collection = this.getCollection<T>(collectionName);
        const doc = collection.get(id);
        if (!doc) return false;

        Object.assign(doc, updates);
        collection.update(doc);
        return true;
    }

    removeById(collectionName: string, id: number): boolean {
        const collection = this.getCollection(collectionName);
        const doc = collection.get(id);
        if (doc) {
            collection.remove(doc);
            return true;
        }
        return false;
    }

    getStats(collectionName: string) {
        const collection = this.getCollection(collectionName);
        return {
            count: collection.count(),
            indices: collection.binaryIndices ? Object.keys(collection.binaryIndices) : [],
            unique: collection.uniqueNames ? collection.uniqueNames.map(String) : [],
        };
    }

    clearCollection(collectionName: string): void {
        const collection = this.getCollection(collectionName);
        collection.clear();
    }

    deleteCollection(collectionName: string): boolean {
        if (this.collections.has(collectionName)) {
            this.db.removeCollection(collectionName);
            this.collections.delete(collectionName);
            return true;
        }
        return false;
    }

    listCollections(): string[] {
        return this.db.listCollections().map((col: any) => col.name);
    }

    saveDatabase(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.saveDatabase((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    loadDatabase(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.loadDatabase({}, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    close(): void {
        this.db.close();
    }
}

export const LEGAL_LOKI_CONFIGS = {
    cases: { collection: 'cases',
        indices: ['caseNumber', 'title', 'status', 'createdAt'],
        unique: ['caseNumber'],
    },
    evidence: { collection: 'evidence',
        indices: ['caseId', 'title', 'evidenceType', 'createdAt', 'tags'],
    },
    documents: { collection: 'documents',
        indices: ['caseId', 'title', 'documentType', 'createdAt', 'author'],
    },
    persons: { collection: 'persons',
        indices: ['name', 'aliases', 'caseIds', 'createdAt'],
        unique: ['name'],
    },
    annotations: { collection: 'annotations',
        indices: ['evidenceId', 'userId', 'createdAt', 'type'],
    },
} as const;

export class LegalLokiManager {
    private static instance: LegalLokiManager;
    private loki: LokiSearchService;

    private constructor() {
        this.loki = new LokiSearchService('legal-loki.db');
    }

    static getInstance(): LegalLokiManager {
        if (!LegalLokiManager.instance) {
            LegalLokiManager.instance = new LegalLokiManager();
        }
        return LegalLokiManager.instance;
    }

    getCasesCollection() {
        return this.loki.getCollection('cases', LEGAL_LOKI_CONFIGS.cases);
    }

    getEvidenceCollection() {
        return this.loki.getCollection('evidence', LEGAL_LOKI_CONFIGS.evidence);
    }

    getDocumentsCollection() {
        return this.loki.getCollection('documents', LEGAL_LOKI_CONFIGS.documents);
    }

    getPersonsCollection() {
        return this.loki.getCollection('persons', LEGAL_LOKI_CONFIGS.persons);
    }

    getAnnotationsCollection() {
        return this.loki.getCollection('annotations', LEGAL_LOKI_CONFIGS.annotations);
    }

    async searchAll(
        query: SearchQuery,
        collections: string[] = ['cases', 'evidence', 'documents', 'persons']
    ): Promise<Record<string, SearchResult>> {
        const results: Record<string, SearchResult> = {};

        for (const collectionName of collections) {
            try {
                const collectionResults = this.loki.findPaginated(collectionName, query, 1, 50);
                if (collectionResults.data.length > 0) {
                    results[collectionName] = {
                        ...collectionResults,
                        collection: collectionName,
                    };
                }
            } catch (error) {
                console.warn(`Search failed for collection ${collectionName}:`, error);
            }
        }

        return results;
    }

    getDatabaseStats() {
        const collections = this.loki.listCollections();
        const stats: Record<string, any> = {};

        for (const collectionName of collections) {
            stats[collectionName] = this.loki.getStats(collectionName);
        }

        return stats;
    }

    async backup(): Promise<string> {
        await this.loki.saveDatabase();
        return 'Database backed up successfully';
    }

    close() {
        this.loki.close();
    }
}