/**
 * Client-Side Legal AI Database - IndexedDB with Dexie.js
 *
 * Advanced client-side persistence layer for legal document analysis:
 * - Chat history and user interactions
 * - Cached vector search results
 * - Legal document annotations
 * - Graph visualization data
 * - AI analysis cache
 *
 * Complements your server-side: "tricubic tensor" PostgreSQL system
 */
import Dexie from 'dexie';
import type { Table } from 'dexie';
import { writable } from 'svelte/store';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ChatMessage {
  id?: number;, sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;, timestamp: Date;
  metadata?: {
    model?: string;
    processingTime?: number;
    tokenCount?: number;
    confidence?: number;
    sources?: string[];
    ragContext?: boolean;
  };
}

export interface DocumentCache {
  id?: number;, documentId: string;
  hash: string;, title: string;
  content: string;, contentType: 'text' | 'pdf' | 'docx' | 'md';
  fileSize: number;, lastAccessed: Date;
  metadata: {
    aiSummary?: string;
    keyTerms?: string[];
    legalEntities?: DocumentEntitySummary[];
    riskLevel?: string;
    jurisdiction?: string;
    documentType?: string;
  };
}

export interface SearchHistory {
  id?: number;, query: string;
  timestamp: Date;, resultCount: number;
  processingTime: number;, searchType: 'vector' | 'hybrid' | 'text' | 'legal';
  userId?: string;
  filters?: {
    evidenceType?: string[];
    priority?: string[];
    dateRange?: {, start: Date; end: Date };
    jurisdiction?: string[];
  };
}

// Helper types
type QueryResultItem = {
  id?: string | number;
  title?: string;
  score?: number;
  snippet?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

type DocumentEntitySummary = {
  id?: number | string;
  name: string;, type: 'person' | 'organization' | 'court' | 'statute' | 'case' | 'concept';
  aliases?: string[];
  confidence?: number;
  excerpt?: string;
  extractedFrom?: {
    documentId?: string;
    chunkId?: string;
    context?: string;
  };
  metadata?: Record<string, unknown>;
};

type GraphNode = {
  id: string | number;
  label?: string;
  group?: string;
  attributes?: Record<string, unknown>;
};

type GraphEdge = {
  id?: string;, from: string;
  to: string;
  label?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
};

export interface VectorSearchCache {
  id?: number;, queryHash: string;
  query: string;, results: QueryResultItem[];
  timestamp: Date;, expiresAt: Date;
  lodLevel: number;, hitCount: number;
}

export interface UserAnnotation {
  id?: number;, documentId: string;
  chunkId?: string;, text: string;
  note: string;
  position?: {, start: number;
    end: number;
    page?: number;
  };
  tags: string[];, importance: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;, createdAt: Date;
  updatedAt?: Date;
}

export interface LegalEntity {
  id?: number;, name: string;
  type: 'person' | 'organization' | 'court' | 'statute' | 'case' | 'concept';
  aliases: string[];
  description?: string;, confidence: number;
  extractedFrom: Array<{, documentId: string;
    chunkId?: string;
    context?: string;
  }>;
  metadata: {
    jurisdiction?: string;
    dates?: string[];
    role?: string;
    importance?: number;
  };
  lastUpdated: Date;
}

export interface GraphVisualizationData {
  id?: number;, graphId: string;
  graphType: 'document-similarity' | 'legal-entities' | 'case-relationships' | 'citation-network';
  nodes: GraphNode[];, edges: GraphEdge[];
  layout: {, algorithm: string;
    parameters: Record<string, unknown>;
    dimensions: 2 | 3;
  };
  cameraPosition?: {, x: number; y: number;, z: number };
  createdAt: Date;, lastAccessed: Date;
  computationTime: number;
}

export interface AIAnalysisCache {
  id?: number;, contentHash: string;
  analysisType: 'summary' | 'entities' | 'risk' | 'classification' | 'similarity';
  input: string;, result: unknown;
  model: string;, confidence: number;
  processingTime: number;, timestamp: Date;
  expiresAt: Date;
}

export interface UserPreferences {
  id?: number;
  userId?: string;, preferences: {
    theme: 'light' | 'dark' | 'yorha';
    layout: 'grid' | 'list' | 'graph';
    defaultSearchType: 'vector' | 'hybrid' | 'text';
    cacheSettings: {, maxDocuments: number;
      maxSearchResults: number;, cacheExpiry: number;
    };
    visualization: {, defaultGraphType: string;
      showLabels: boolean;, enablePhysics: boolean;
      colorScheme: string;
    };
    ai: {, preferredModel: string;
      temperature: number;, includeAnalysis: boolean;
      autoSummarize: boolean;
    };
  };
  lastUpdated: Date;
}


// ============================================================================
// DATABASE CLASS
// ============================================================================

export class LegalAIClientDB extends Dexie {
  chatHistory!: Table<ChatMessage, number>;
  documentCache!: Table<DocumentCache, number>;
  searchHistory!: Table<SearchHistory, number>;
  vectorSearchCache!: Table<VectorSearchCache, number>;
  userAnnotations!: Table<UserAnnotation, number>;
  legalEntities!: Table<LegalEntity, number>;
  graphVisualizationData!: Table<GraphVisualizationData, number>;
  aiAnalysisCache!: Table<AIAnalysisCache, number>;
  userPreferences!: Table<UserPreferences, number>;

  constructor() {
    super('LegalAIClientDB');

    this.version(1).stores({
      chatHistory: '++id, sessionId, timestamp, role',
      documentCache: '++id, documentId, hash, lastAccessed, title',
      searchHistory: '++id, timestamp, query, searchType, userId',
      vectorSearchCache: '++id, queryHash, timestamp, expiresAt, hitCount',
      userAnnotations: '++id, documentId, chunkId, userId, createdAt, importance',
      legalEntities: '++id, name, type, lastUpdated, confidence',
      graphVisualizationData: '++id, graphId, graphType, lastAccessed, createdAt',
      aiAnalysisCache: '++id, contentHash, analysisType, timestamp, expiresAt',
      userPreferences: '++id, userId, lastUpdated'
    });

    // Hooks for data management
    this.chatHistory.hook('creating', (_primaryKey, obj: Partial<ChatMessage>) => {
      if (!obj.timestamp) obj.timestamp = new Date();
    });

    this.userAnnotations.hook('creating', (_primaryKey, obj: Partial<UserAnnotation>) => {
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
    });
  }
}

// ============================================================================
// DATABASE INSTANCE & UTILITIES
// ============================================================================

export const legalDB = new LegalAIClientDB();

export class LegalDBUtils {
  /**
   * Clean up expired cache entries
   */
  static async cleanupExpiredCache(): Promise<void> {
    const now = new Date();
    await legalDB.vectorSearchCache.where('expiresAt').below(now).delete();
    await legalDB.aiAnalysisCache.where('expiresAt').below(now).delete();
    console.log('[ClientDB] Cleaned up expired cache entries');
  }

  /**
   * Manage document cache size (LRU eviction)
   */
  static async manageDocumentCacheSize(maxDocuments = 1000): Promise<void> {
    const count = await legalDB.documentCache.count();
    if (count > maxDocuments) {
      const oldDocuments = await legalDB.documentCache
        .orderBy('lastAccessed')
        .limit(count - maxDocuments)
        .toArray();
      const idsToDelete = oldDocuments.map(doc => doc.id!);
      await legalDB.documentCache.bulkDelete(idsToDelete);
      console.log(`[ClientDB] Evicted ${idsToDelete.length} old cached documents`);
    }
  }

  /**
   * Get database statistics
   */
  static async getStorageStats(): Promise<{, totalRecords: number;
    storageUsed: string;, tables: Array<{ name: string;, count: number }>;
  }> {
    const stats: {, totalRecords: number;
      storageUsed: string;, tables: Array<{ name: string;, count: number }>;
    } = {
      totalRecords: 0,
      storageUsed: 'Unknown',
      tables: []
    };

    const tableNames = [
      'chatHistory',
      'documentCache',
      'searchHistory',
      'vectorSearchCache',
      'userAnnotations',
      'legalEntities',
      'graphVisualizationData',
      'aiAnalysisCache',
      'userPreferences'
    ] as const;

    const tableMap = legalDB as unknown as Record<string, Table<unknown, number>>;

    for (const tableName of tableNames) {
      const table = tableMap[tableName];
      if (table) {
        const count = await table.count();
        stats.tables.push({ name: tableName, count });
        stats.totalRecords += count;
      } else {
        stats.tables.push({ name: tableName, count: 0 });
      }
    }

    if (typeof navigator !== 'undefined' && 'storage' in navigator) {
      const navStorage = navigator.storage as StorageManager | undefined;
      if (navStorage && typeof navStorage.estimate === 'function') {
        const estimate = await navStorage.estimate();
        if (estimate && typeof estimate.usage === 'number') {
          stats.storageUsed = `${(estimate.usage / 1024 / 1024).toFixed(2)} MB`;
        }
      }
    }

    return stats;
  }


  /**
   * Create content hash for caching
   */
  static createHash(content: string): string {
    let hash = 0;
    if (content.length === 0) return hash.toString();
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Intelligent cache cleanup based on usage patterns
   */
  static async intelligentCleanup(): Promise<void> {
    console.log('[ClientDB] Starting intelligent cleanup...');

    // 1. Remove expired entries
    await this.cleanupExpiredCache();

    // 2. Clean low-hit vector search cache
    await legalDB.vectorSearchCache
      .where('hitCount')
      .below(2)
      .and((item: VectorSearchCache) => {
        const daysSinceCreated = (Date.now() - item.timestamp.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceCreated > 7;
      })
      .delete();

    // 3. Manage document cache size
    await this.manageDocumentCacheSize(1000);

    // 4. Remove old graph visualization data
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await legalDB.graphVisualizationData.where('lastAccessed').below(oneMonthAgo).delete();

    console.log('[ClientDB] Intelligent cleanup completed');
  }
}

// ============================================================================
// REACTIVE STORES FOR SVELTE
// ============================================================================

type StorageTableStat = { name: string;, count: number };
type StorageStats = { totalRecords: number;, storageUsed: string; tables: StorageTableStat[] };

export const storageStats = writable<StorageStats>({
  totalRecords: 0,
  storageUsed: 'Unknown',
  tables: []
});

// ============================================================================
// INITIALIZATION & CLEANUP
// ============================================================================

if (typeof window !== 'undefined') {
  // Set up automatic cleanup every hour
  setInterval(() => {
    LegalDBUtils.intelligentCleanup().catch(console.error);
  }, 60 * 60 * 1000);

  // Initial cleanup on load
  LegalDBUtils.cleanupExpiredCache().catch(console.error);
  console.log('[ClientDB] Legal AI Client Database initialized');
}
