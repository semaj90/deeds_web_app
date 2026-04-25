/**
 * Adaptive Index Orchestrator
 * Manages dynamic indexing of legal documents based on usage patterns
 *
 * Stack: EventEmitter-based service for managing vector indices
 */

import { EventEmitter } from 'events';

// Types
export interface IndexConfig {
  name: string;
  type: 'vector' | 'keyword' | 'hybrid';
  fields: string[];
  dimensions?: number;
  options?: Record<string, unknown>;
}

export interface IndexStats {
  documentCount: number;
  sizeBytes: number;
  lastUpdated: number;
  queryCount: number;
  avgLatencyMs: number;
}

export interface OrchestratorConfig {
  maxIndices: number;
  autoOptimize: boolean;
  minUsageThreshold: number;
}

export class AdaptiveIndexOrchestrator extends EventEmitter {
  private indices: Map<string, IndexConfig> = new Map();
  private stats: Map<string, IndexStats> = new Map();
  private config: OrchestratorConfig;

  constructor(config?: Partial<OrchestratorConfig>) {
    super();
    this.config = {
      maxIndices: config?.maxIndices ?? 10,
      autoOptimize: config?.autoOptimize ?? true,
      minUsageThreshold: config?.minUsageThreshold ?? 100,
    };
  }

  /**
   * Register a new index
   */
  async registerIndex(config: IndexConfig): Promise<void> {
    if (this.indices.has(config.name)) {
      throw new Error(`Index ${config.name} already exists`);
    }

    if (this.indices.size >= this.config.maxIndices) {
      await this.evictLeastUsedIndex();
    }

    this.indices.set(config.name, config);
    this.stats.set(config.name, {
      documentCount: 0,
      sizeBytes: 0,
      lastUpdated: Date.now(),
      queryCount: 0,
      avgLatencyMs: 0,
    });

    this.emit('indexRegistered', config);
  }

  /**
   * Update index statistics
   */
  updateStats(indexName: string, updates: Partial<IndexStats>): void {
    const currentStats = this.stats.get(indexName);
    if (!currentStats) return;

    this.stats.set(indexName, { ...currentStats, ...updates });

    if (this.config.autoOptimize) {
      this.checkOptimizationNeeded(indexName);
    }
  }

  /**
   * Record a query against an index
   */
  recordQuery(indexName: string, latencyMs: number): void {
    const stats = this.stats.get(indexName);
    if (!stats) return;

    const newQueryCount = stats.queryCount + 1;
    const newAvgLatency =
      (stats.avgLatencyMs * stats.queryCount + latencyMs) / newQueryCount;

    this.stats.set(indexName, {
      ...stats,
      queryCount: newQueryCount,
      avgLatencyMs: newAvgLatency,
      lastUpdated: Date.now(),
    });
  }

  /**
   * Check if an index needs optimization
   */
  private checkOptimizationNeeded(indexName: string): void {
    const stats = this.stats.get(indexName);
    if (!stats) return;

    if (stats.avgLatencyMs > 200 && stats.queryCount > this.config.minUsageThreshold) {
      this.emit('optimizeNeeded', indexName);
    }
  }

  /**
   * Evict the least used index to make space
   */
  private async evictLeastUsedIndex(): Promise<void> {
    let leastUsedName: string | null = null;
    let minScore = Infinity;

    for (const [name, stats] of this.stats) {
      const timeFactor = (Date.now() - stats.lastUpdated) / (1000 * 60 * 60);
      const score = stats.queryCount / (timeFactor + 1);

      if (score < minScore) {
        minScore = score;
        leastUsedName = name;
      }
    }

    if (leastUsedName) {
      this.indices.delete(leastUsedName);
      this.stats.delete(leastUsedName);
      this.emit('indexEvicted', leastUsedName);
    }
  }

  /**
   * Get all registered indices
   */
  getIndices(): IndexConfig[] {
    return Array.from(this.indices.values());
  }

  /**
   * Get stats for an index
   */
  getIndexStats(indexName: string): IndexStats | undefined {
    return this.stats.get(indexName);
  }

  /**
   * Clear all indices
   */
  clear(): void {
    this.indices.clear();
    this.stats.clear();
    this.emit('cleared');
  }
}

/**
 * Singleton instance
 */
let orchestratorInstance: AdaptiveIndexOrchestrator | null = null;

export function getOrchestrator(): AdaptiveIndexOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AdaptiveIndexOrchestrator();
  }
  return orchestratorInstance;
}
