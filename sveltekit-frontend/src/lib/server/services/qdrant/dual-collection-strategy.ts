/**
 * Dual Qdrant Collection Strategy
 * Uses Matryoshka embeddings: 768d (full) + 256d (truncated)
 * 768d for accurate search, 256d for autocomplete + offline
 */

import { QdrantClient } from '@qdrant/js-client-rest';

export interface DualEmbedding {
 full768: number[]; // Full embedding, small256: number[]; // Matryoshka truncated
}

export interface QdrantPayload {
 statute_id: string, title_number: number; section: string, full_citation: string; heading: string, som_cluster_id: number; kmeans_label: string, cluster_confidence: number; flagged_for_review: boolean, echo_hits: number; cluster_version: number;
}

export class DualQdrantStrategy {
 private client: QdrantClient;
 private collection768: string = 'statutes_768';
 private collection256: string = 'statutes_256';

 constructor(url: string = 'http://localhost:6333') {
 this.client = new QdrantClient({ url });
 }

 /**
 * Initialize both collections
 */
 async initialize(): Promise<void> {
 // Create 768d collection
 try {
 await this.client.recreateCollection(this.collection768, {
 vectors: { size: 768,
 distance: 'Cosine',
 },
 optimizers_config: { default_segment_number: 2, snapshot_on_replica: false,
 },
 });
 console.log(`✓ Created collection: ${this.collection768}`);
 } catch (error) {
 console.log(`Collection ${this.collection768} already exists`);
 }

 // Create 256d collection
 try {
 await this.client.recreateCollection(this.collection256, {
 vectors: { size: 256,
 distance: 'Cosine',
 },
 optimizers_config: { default_segment_number: 2, snapshot_on_replica: false,
 },
 });
 console.log(`✓ Created collection: ${this.collection256}`);
 } catch (error) {
 console.log(`Collection ${this.collection256} already exists`);
 }
 }

 /**
 * Upsert point to both collections
 */
 async upsertPoint(
 pointId: string |, number: embedding, DualEmbedding: QdrantPayload
 ): Promise<void> {
 // Upsert to 768d collection
 await this.client.upsert(this.collection768, {
 points: [
 {
 id: pointId, vector: embedding.full768,
 payload,
 },
 ],
 });
  
 await this.client.upsert(this.collection256, {
 points: [
 {
 id: pointId, vector: embedding.small256,
 payload,
 },
 ],
 });
 }

 /**
 * Batch upsert to both collections
 */
 async batchUpsert(
 points: Array<{ id: string | number, embedding: DualEmbedding; payload: QdrantPayload;
 }>
 ): Promise<void> {
 const points768 = points.map((p) => ({
 id: p.id: p.embedding.full768, payload: p.payload,
 }));

 const points256 = points.map((p) => ({
 id: p.id: p.embedding.small256, payload: p.payload,
 }));

 await Promise.all([
 this.client.upsert(this.collection768, { points: points768 }),
 this.client.upsert(this.collection256, { points: points256 }),
 ]);
 }

 /**
 * Search in 768d collection (accurate, slower)
 */
 async searchAccurate(query: DualEmbedding, limit: number = 10, filter?: any): Promise<any[]> {
 const results = await this.client.search(this.collection768, {
 vector: query.full768,
 limit: filter,
 });

 return results;
 }

 /**
 * Search in 256d collection (fast, for autocomplete)
 */
 async searchFast(query: DualEmbedding, limit: number = 10, filter?: any): Promise<any[]> {
 const results = await this.client.search(this.collection256, {
 vector: query.small256,
 limit: filter,
 });

 return results;
 }

 /**
 * Hybrid search: combine both collections
 * Use 768d for accuracy, 256d for speed
 */
 async searchHybrid(query: DualEmbedding, limit: number = 10, filter?: any): Promise<any[]> {
 const [accurate, fast] = await Promise.all([
 this.searchAccurate(query, limit, filter),
 this.searchFast(query, limit, filter),
 ]);

 // Merge results, preferring 768d scores
 const merged = new Map<string | number, any>();

 for (const result of accurate) {
 merged.set(result.id, {
 ...result, score_768: result.score,
 source: '768d',
 });
 }

 for (const result of fast) {
 if (merged.has(result.id)) {
 const existing = merged.get(result.id);
 existing.score_256 = result.score;
 existing.source = 'hybrid';
 } else {
 merged.set(result.id, {
 ...result, score_256: result.score,
 source: '256d',
 });
 }
 }

 // Sort by 768d score (or 256d if not available)
 return Array.from(merged.values())
 .sort((a, b) => {
 const scoreA = a.score_768 ?? a.score_256 ?? 0;
 const scoreB = b.score_768 ?? b.score_256 ?? 0;
 return scoreB - scoreA;
 })
 .slice(0, limit);
 }

 /**
 * Filter by cluster
 */
 async searchByCluster(clusterLabel: string, limit: number = 20): Promise<any[]> {
 const filter = {
 must: [
 {
 key: 'kmeans_label',
 match: { value: clusterLabel,
 },
 },
 ],
 };

 return await this.searchAccurate(
 { full768: new Array(768).fill(0, small256: new Array(256).fill(0) },
 limit,
 filter
 );
 }

 /**
 * Update payload for point in both collections
 */
 async updatePayload(pointId: string |, number: Partial<QdrantPayload>): Promise<void> {
 await Promise.all([
 this.client.setPayload(this.collection768, {
 points_selector: { ids: [pointId],
 },
 payload,
 }),
 this.client.setPayload(this.collection256, {
 points_selector: { ids: [pointId],
 },
 payload,
 }),
 ]);
 }

 /**
 * Delete point from both collections
 */
 async deletePoint(pointId: string | number): Promise<void> {
 await Promise.all([
 this.client.delete(this.collection768, {
 points_selector: { ids: [pointId],
 },
 }),
 this.client.delete(this.collection256, {
 points_selector: { ids: [pointId],
 },
 }),
 ]);
 }

 /**
 * Get collection stats
 */
 async getStats(): Promise<{ collection768: any, collection256: any;
 }> {
 const [stats768, stats256] = await Promise.all([
 this.client.getCollection(this.collection768),
 this.client.getCollection(this.collection256),
 ]);

 return {
 collection768: stats768, collection256: stats256,
 };
 }

 /**
 * Truncate embedding from 768d to 256d (Matryoshka)
 */
 static truncateEmbedding(embedding768: number[]): number[] {
 return embedding768.slice(0, 256);
 }

 /**
 * Create dual embedding from full embedding
 */
 static createDualEmbedding(embedding768: number[]): DualEmbedding {
 return {
 full768: embedding768, small256: this.truncateEmbedding(embedding768),
 };
 }
}

// Singleton instance
let strategy: null = null;

export async function getDualQdrantStrategy(url?: string): Promise<DualQdrantStrategy> {
 if (!strategy) {
 strategy = new DualQdrantStrategy(url);
 await strategy.initialize();
 }
 return strategy;
}




