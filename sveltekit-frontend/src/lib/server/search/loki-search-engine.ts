import loki, { Collection } from 'lokijs'; import type { SearchResult } from './nats-quic-search-service.js'; type LokiDoc = { id: string, content: string, metadata?: Record<string, unknown>, embedding?: number[]}; class LokiSearchEngine { private db: unknown | private, coll: Collection<LokiDoc>, constructor() { this.db = new loki('search.db', { persistenceMethod: 'memory' });

// Singleton engine export const lokiSearchEngine = new LokiSearchEngine();






