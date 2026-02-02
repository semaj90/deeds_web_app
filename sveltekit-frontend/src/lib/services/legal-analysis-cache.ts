/**
 * LokiJS-based cache for legal document analysis results
 * Provides fast client-side lookup without re-analyzing
 */
import Loki from 'lokijs';

export interface LegalAnalysisCacheEntry {
  evidenceId: string;
  evidenceTitle: string;
  evidenceHash: string; // Hash of content to detect changes
  analysis: unknown;
  comparison: unknown;
  processingTime: number;
  timestamp: number;
  expiresAt?: number;
}

class LegalAnalysisCache {
  private db: Loki | null = null;
  private collection: Loki.Collection<LegalAnalysisCacheEntry> | null = null;
  private initialized = false;

  constructor() {
    // Initialize LokiJS database in memory
    this.db = new Loki('legal-analysis-cache.db', {
      autosave: true,
      autosaveInterval: 4000,
      persistenceMethod: 'localStorage',
      autoload: true,
      autoloadCallback: () => this.initialize()
    });
  }

  private initialize() {
    if (!this.db) return;
    this.collection = this.db.getCollection('analyses');
    if (!this.collection) {
      this.collection = this.db.addCollection('analyses', {
        unique: ['evidenceId'],
        indices: ['evidenceHash', 'timestamp', 'expiresAt']
      });
    }
    this.initialized = true;
    this.cleanExpired();
  }

  // Generate hash from evidence content for change detection
  private hashContent(title: string, description: string = '', tags: string[] = []): string {
    const content = `${title}|${description}|${tags.join(',')}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get cached analysis result
   * Returns: null if not found or expired
   */
  async get(
    evidenceId: string, 
    title: string, 
    description?: string, 
    tags?: string[]
  ): Promise<LegalAnalysisCacheEntry | null> {
    if (!this.initialized || !this.collection) {
      return null;
    }
    
    const entry = this.collection.findOne({ evidenceId });
    if (!entry) {
        return null;
    }

    // Check if expired
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.collection.remove(entry);
      return null;
    }

    // Check if content has changed
    const currentHash = this.hashContent(title, description, tags);
    if (entry.evidenceHash !== currentHash) {
      this.collection.remove(entry);
      return null;
    }

    return entry;
  }

  /**
   * Store analysis result in cache
   */
  async set(
    evidenceId: string,
    title: string,
    description: string = '',
    tags: string[] = [],
    analysis: unknown,
    comparison: unknown,
    processingTime: number,
    ttl: number = 24 * 60 * 60 * 1000 // Default 24 hours
  ): Promise<void> {
    if (!this.initialized || !this.collection) {
      // Wait for initialization (simplified check)
      if (!this.db) return;
      this.initialize();
    }
    
    if (!this.collection) return;

    const contentHash = this.hashContent(title, description, tags);
    const now = Date.now();

    const existing = this.collection.findOne({ evidenceId });
    if (existing) {
      this.collection.remove(existing);
    }

    this.collection.insert({
      evidenceId,
      evidenceTitle: title,
      evidenceHash: contentHash,
      analysis,
      comparison,
      processingTime,
      timestamp: now,
      expiresAt: now + ttl
    });
    console.log(`✅ Cached legal analysis for: ${title}`);
  }

  clear(): void {
    if (!this.collection) return;
    this.collection.clear();
    console.log('Cleared all legal analysis cache');
  }

  private cleanExpired(): void {
    if (!this.collection) return;
    const now = Date.now();
    const expired = this.collection.find({ expiresAt: { $lt: now } });
    expired.forEach((entry) => this.collection!.remove(entry));
  }

  getAll(limit: number = 100): LegalAnalysisCacheEntry[] {
    if (!this.collection) return [];
    return this.collection
      .chain()
      .simplesort('timestamp', true)
      .limit(limit)
      .data();
  }
}

export const legalAnalysisCache = new LegalAnalysisCache();
