import type { openDB, type IDBPDatabase } from 'idb';

// Define the Document interface as it's used by this service.
// This should be compatible with the Document interface in rag-sync-agent.ts.
interface Document {
 id: string;
 content?: string;
 metadata?: Record<string, unknown>;
 syncStatus: 'pending' | 'synced' | 'failed';
 embedding?: number[];
}

const DB_NAME = 'legal-ai-db';
const DB_VERSION = 1;
const STORE_NAME = 'documents'; // Object store for documents

export class IndexedDBService {
 private db: Promise<IDBPDatabase>;

 constructor() {
 this.db = openDB(DB_NAME, DB_VERSION, {
 upgrade(db) {
 // Create an object store for documents if it doesn't exist
 if (!db.objectStoreNames.contains(STORE_NAME)) {
 db.createObjectStore(STORE_NAME, { keyPath: 'id' });
 }
 },
 });
 }

 /**
 * Retrieves all documents from the 'documents' object store.
 * The 'type' parameter is currently unused but kept for API compatibility
 * with the calling code in rag-sync-agent.ts.
 * In a more complex scenario, documents might have a 'type' property
 * that could be used for filtering.
 */
 async getDocumentsByType(type: string): Promise<Document[]> {
 const db = await this.db;
 // For now, we fetch all documents. If 'type' needs to be filtered,
 // documents would need a 'type' property and a cursor could be used.
 console.log(`IndexedDBService: Fetching documents of type "${type}"`); // Log for context
 return db.getAll(STORE_NAME);
 }

 /**
 * Caches or updates a document in the 'documents' object store.
 * Uses 'put' which will add a new record or update an existing one
 * if a record with the same keyPath ('id') already exists.
 */
 async cacheDocument(document: Document): Promise<void> {
 const db = await this.db;
 await db.put(STORE_NAME, document);
 console.log(`IndexedDBService: Cached document with ID: ${document.id}`); // Log for context
 }
}
