/**
 * src/lib/server/retrieval/cold-storage-retrieval-service.ts
 * 
 * 4D Topology Backend for Cold Storage Cosine Retrieval.
 * Provides a Postgres-based retrieval lane using pgvector.
 */

import { pool } from '$lib/server/db/client';
import { type HyperRagHit } from './hyperrag-fusion-service';

export class ColdStorageRetrievalService {
  /**
   * Performs a cosine similarity search on embedded_summaries in Postgres.
   */
  public static async search(vector: number[], limit: number = 5): Promise<HyperRagHit[]> {
    console.log(`❄️  Cold Storage: Performing cosine search (limit: ${limit})`);

    try {
      const vectorStr = `[${vector.join(',')}]`;
      const res = await pool.query(`
        SELECT 
          id,
          chunk_id as qdrantId,
          source_type as source,
          summary_text as content,
          gpu_cluster as gpuCluster,
          1 - (embedding <=> $1::vector) as score
        FROM embedded_summaries
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `, [vectorStr, limit]);

      return res.rows.map(r => ({
        id: r.id,
        qdrantId: r.qdrantid,
        content: r.content,
        score: Number(r.score),
        gpuCluster: r.gpucluster,
        lane: 'cold_storage',
        signals: {
          lexical: 0,
          topology: 0.5, // Assumed topology grounding
          semantic: Number(r.score)
        }
      } as any));
    } catch (err) {
      console.error('[ColdStorageRetrievalService] Search failed:', err);
      return [];
    }
  }
}
