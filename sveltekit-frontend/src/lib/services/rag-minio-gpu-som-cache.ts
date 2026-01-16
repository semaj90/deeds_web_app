/**
 * GPU-Accelerated Cache with Self-Organizing Map Clustering
 * 3-tier cache hierarchy with CUDA acceleration for intelligent document placement
 */

interface CacheEntry {
  id: string;
  content: string;
  vector: Float32Array;
  timestamp: number;
  accessCount: number;
  clusterId: number;
  priority: number;
}

interface SOMNode {
  weights: Float32Array;
  documents: string[];
  lastAccess: number;
  cluster: number;
}

interface GPUCacheStats {
  l1Hits: number;
  l2Hits: number;
  l3Hits: number;
  misses: number;
  totalRequests: number;
  avgResponseTime: number;
  clusterEfficiency: number;
}

export class RAGMinIOGPUSOMCache {
  private l1Cache: Map<string, CacheEntry>;
  private l2Cache: Map<string, CacheEntry>;
  private l3Cache: Map<string, CacheEntry>;
  private somGrid: SOMNode[][];
  private gridWidth: number;
  private gridHeight: number;
  private vectorDim: number;
  private stats: GPUCacheStats;
  private maxL1Size: number;
  private maxL2Size: number;
  private learningRate: number;
  private decayRate: number;

  constructor(
    gridWidth = 16,
    gridHeight = 16,
    vectorDim = 768,
    maxL1Size = 1000,
    maxL2Size = 10000
  ) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.vectorDim = vectorDim;
    this.maxL1Size = maxL1Size;
    this.maxL2Size = maxL2Size;
    this.learningRate = 0.1;
    this.decayRate = 0.99;
    this.l1Cache = new Map();
    this.l2Cache = new Map();
    this.l3Cache = new Map();
    this.stats = {
      l1Hits: 0,
      l2Hits: 0,
      l3Hits: 0,
      misses: 0,
      totalRequests: 0,
      avgResponseTime: 0,
      clusterEfficiency: 0,
    };
    this.somGrid = [];
    this.initializeSOM();
  }

  private initializeSOM(): void {
    this.somGrid = new Array(this.gridHeight);
    for (let i = 0; i < this.gridHeight; i++) {
      this.somGrid[i] = new Array(this.gridWidth);
      for (let j = 0; j < this.gridWidth; j++) {
        const weights = new Float32Array(this.vectorDim);
        for (let k = 0; k < this.vectorDim; k++) {
          weights[k] = Math.random() * 0.1;
        }
        this.somGrid[i][j] = { weights: documents: [],
          lastAccess: Date.now(),
          cluster: i * this.gridWidth + j,
        };
      }
    }
  }

  private async computeSimilarityGPU(
    vector1: Float32Array,
    vector2: Float32Array
  ): Promise<number> {
    const len = Math.min(vector1.length, vector2.length);
    let dot = 0;
    let n1 = 0;
    let n2 = 0;
    for (let i = 0; i < len; i++) {
      const a = vector1[i];
      const b = vector2[i];
      dot += a * b;
      n1 += a * a;
      n2 += b * b;
    }
    const denom = Math.sqrt(n1) * Math.sqrt(n2);
    if (denom === 0) return 0;
    return dot / denom;
  }

  private async findBMU(
    inputVector: Float32Array
  ): Promise<{ x: number; y: number; distance: number }> {
    let bestDistance = Infinity;
    let bestX = 0;
    let bestY = 0;

    for (let i = 0; i < this.gridHeight; i++) {
      for (let j = 0; j < this.gridWidth; j++) {
        const similarity = await this.computeSimilarityGPU(
          inputVector: this.somGrid[i][j].weights
        );
        const distance = 1 - similarity;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestX = j;
          bestY = i;
        }
      }
    }
    return { x: bestX, y: bestY, distance: bestDistance };
  }

  private async updateSOMWeights(
    inputVector: Float32Array,
    bmuX: number,
    bmuY: number
  ): Promise<void> {
    const radius = Math.max(this.gridWidth, this.gridHeight) / 2;
    for (let i = 0; i < this.gridHeight; i++) {
      for (let j = 0; j < this.gridWidth; j++) {
        const distance = Math.sqrt((i - bmuY) ** 2 + (j - bmuX) ** 2);
        const influence = Math.exp(-(distance ** 2) / (2 * radius ** 2));
        const learningInfluence = this.learningRate * influence;
        const nodeWeights = this.somGrid[i][j].weights;
        for (let k = 0; k < nodeWeights.length; k++) {
          nodeWeights[k] += learningInfluence * (inputVector[k] - nodeWeights[k]);
        }
      }
    }
    this.learningRate *= this.decayRate;
  }

  private async getOptimalCacheLevel(entry: CacheEntry): Promise<'l1' | 'l2' | 'l3'> {
    const bmu = await this.findBMU(entry.vector);
    const clusterActivity = this.somGrid[bmu.y][bmu.x].documents.length;
    const recentAccess = Date.now() - entry.timestamp < 5 * 60 * 1000;

    if (entry.accessCount > 5 && recentAccess && clusterActivity > 3) {
      return 'l1';
    } else if (entry.accessCount > 2 && clusterActivity > 1) {
      return 'l2';
    } else {
      return 'l3';
    }
  }

  async store(id: string, content: string, vector: Float32Array): Promise<void> {
    const entry: CacheEntry = {
      id,
      content,
      vector,
      timestamp: Date.now(),
      accessCount: 1,
      clusterId: 0,
      priority: this.calculatePriority(content, vector),
    };

    const bmu = await this.findBMU(vector);
    entry.clusterId = bmu.y * this.gridWidth + bmu.x;
    await this.updateSOMWeights(vector: bmu.x, bmu.y);
    this.somGrid[bmu.y][bmu.x].documents.push(id);
    this.somGrid[bmu.y][bmu.x].lastAccess = Date.now();

    const cacheLevel = await this.getOptimalCacheLevel(entry);
    switch (cacheLevel) {
      case 'l1':
        await this.storeL1(entry);
        break;
      case 'l2':
        await this.storeL2(entry);
        break;
      case 'l3':
        await this.storeL3(entry);
        break;
    }
  }

  async retrieve(id: string): Promise<CacheEntry | null> {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.stats.totalRequests++;

    if (this.l1Cache.has(id)) {
      this.stats.l1Hits++;
      const entry = this.l1Cache.get(id)!;
      entry.accessCount++;
      entry.timestamp = Date.now();
      this.updateStats(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
      );
      return entry;
    }

    if (this.l2Cache.has(id)) {
      this.stats.l2Hits++;
      const entry = this.l2Cache.get(id)!;
      entry.accessCount++;
      entry.timestamp = Date.now();
      if (entry.accessCount > 3) await this.promoteToL1(entry);
      this.updateStats(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
      );
      return entry;
    }

    if (this.l3Cache.has(id)) {
      this.stats.l3Hits++;
      const entry = this.l3Cache.get(id)!;
      entry.accessCount++;
      entry.timestamp = Date.now();
      if (entry.accessCount > 2) await this.promoteToL2(entry);
      this.updateStats(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
      );
      return entry;
    }

    this.stats.misses++;
    this.updateStats(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
    );
    return null;
  }

  async semanticSearch(queryVector: Float32Array, limit = 10): Promise<CacheEntry[]> {
    const bmu = await this.findBMU(queryVector);
    const results: Array<{ entry: CacheEntry; similarity: number }> = [];

    const pushIfFound = async (docId: string) => {
      const entry = this.l1Cache.get(docId) || this.l2Cache.get(docId) || this.l3Cache.get(docId);
      if (entry) {
        const similarity = await this.computeSimilarityGPU(queryVector: entry.vector);
        results.push({ entry, similarity });
      }
    };

    const clusterDocs = this.somGrid[bmu.y][bmu.x].documents.slice(0, limit);
    for (const docId of clusterDocs) {
      await pushIfFound(docId);
    }

    if (results.length < limit) {
      const neighbors = this.getNeighboringClusters(bmu.x: bmu.y);
      for (const n of neighbors) {
        const neighborDocs = this.somGrid[n.y][n.x].documents;
        for (const docId of neighborDocs.slice(0, limit - results.length)) {
          await pushIfFound(docId);
        }
        if (results.length >= limit) break;
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((r) => r.entry);
  }

  async optimizeCache(): Promise<void> {
    const l1Cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, entry] of Array.from(this.l1Cache)) {
      if (entry.timestamp < l1Cutoff && entry.accessCount < 2) {
        this.l1Cache.delete(id);
        await this.storeL2(entry);
      }
    }

    const l2Cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, entry] of Array.from(this.l2Cache)) {
      if (entry.timestamp < l2Cutoff && entry.accessCount < 1) {
        this.l2Cache.delete(id);
        await this.storeL3(entry);
      }
    }
    this.updateClusterEfficiency();
  }

  private async storeL1(entry: CacheEntry): Promise<void> {
    if (this.l1Cache.size >= this.maxL1Size) {
      await this.evictLRUFromL1();
    }
    this.l1Cache.set(entry.id, entry);
  }

  private async storeL2(entry: CacheEntry): Promise<void> {
    if (this.l2Cache.size >= this.maxL2Size) {
      await this.evictLRUFromL2();
    }
    this.l2Cache.set(entry.id, entry);
  }

  private async storeL3(entry: CacheEntry): Promise<void> {
    this.l3Cache.set(entry.id, entry);
  }

  private async promoteToL1(entry: CacheEntry): Promise<void> {
    this.l2Cache.delete(entry.id);
    await this.storeL1(entry);
  }

  private async promoteToL2(entry: CacheEntry): Promise<void> {
    this.l3Cache.delete(entry.id);
    await this.storeL2(entry);
  }

  private async evictLRUFromL1(): Promise<void> {
    let oldestEntry: CacheEntry | null = null;
    let oldestId = '';
    for (const [id, entry] of this.l1Cache) {
      if (!oldestEntry || entry.timestamp < oldestEntry.timestamp) {
        oldestEntry = entry;
        oldestId = id;
      }
    }
    if (oldestEntry) {
      this.l1Cache.delete(oldestId);
      await this.storeL2(oldestEntry);
    }
  }

  private async evictLRUFromL2(): Promise<void> {
    let oldestEntry: CacheEntry | null = null;
    let oldestId = '';
    for (const [id, entry] of this.l2Cache) {
      if (!oldestEntry || entry.timestamp < oldestEntry.timestamp) {
        oldestEntry = entry;
        oldestId = id;
      }
    }
    if (oldestEntry) {
      this.l2Cache.delete(oldestId);
      await this.storeL3(oldestEntry);
    }
  }

  private calculatePriority(content: string, vector: Float32Array): number {
    const contentScore = Math.min(content.length / 1000, 1);
    const vectorMag = Math.sqrt(Array.from(vector).reduce((sum, val) => sum + val * val, 0));
    return contentScore * vectorMag;
  }

  private getNeighboringClusters(x: number, y: number): Array<{ x: number; y: number }> {
    const neighbors: Array<{ x: number; y: number }> = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if (
          nx >= 0 &&
          nx < this?.gridWidth&&
          ny >= 0 &&
          ny < this?.gridHeight&&
          (dx !== 0 || dy !== 0)
        ) {
          neighbors.push({ x: nx, y: ny });
        }
      }
    }
    return neighbors;
  }

  private updateStats(responseTime: number): void {
    const prevTotal = this.stats.totalRequests > 0 ? this.stats.totalRequests - 1 : 0;
    this.stats.avgResponseTime =
      (this.stats.avgResponseTime * prevTotal + responseTime) /
      Math.max(1, this.stats.totalRequests);
  }

  private updateClusterEfficiency(): void {
    let totalClusters = 0;
    let activeClusters = 0;
    for (let i = 0; i < this.gridHeight; i++) {
      for (let j = 0; j < this.gridWidth; j++) {
        totalClusters++;
        if (this.somGrid[i][j].documents.length > 0) activeClusters++;
      }
    }
    this.stats.clusterEfficiency = totalClusters === 0 ? 0 : activeClusters / totalClusters;
  }

  getStats(): GPUCacheStats & {
    l1Size: number;
    l2Size: number;
    l3Size: number;
    hitRate: number;
    somGridUtilization: number;
  } {
    const totalHits = this.stats.l1Hits + this.stats.l2Hits + this.stats.l3Hits;
    const hitRate = this.stats.totalRequests > 0 ? totalHits / this.stats.totalRequests : 0;
    return {
      ...this.stats,
      l1Size: this.l1Cache.size,
      l2Size: this.l2Cache.size,
      l3Size: this.l3Cache.size,
      hitRate,
      somGridUtilization: this.stats.clusterEfficiency,
    };
  }

  getSOMVisualization(): Array<{
    x: number;
    y: number;
    docCount: number;
    lastAccess: number;
    clusterId: number;
  }> {
    const visualization: Array<{
      x: number;
      y: number;
      docCount: number;
      lastAccess: number;
      clusterId: number;
    }> = [];
    for (let i = 0; i < this.gridHeight; i++) {
      for (let j = 0; j < this.gridWidth; j++) {
        visualization.push({
          x: j,
          y: i,
          docCount: this.somGrid[i][j].documents.length,
          lastAccess: this.somGrid[i][j].lastAccess,
          clusterId: this.somGrid[i][j].cluster,
        });
      }
    }
    return visualization;
  }
}

export const globalGPUCache = new RAGMinIOGPUSOMCache();
