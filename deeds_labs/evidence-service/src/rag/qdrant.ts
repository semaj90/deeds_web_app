import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../env.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const qdrant = new QdrantClient({ url: env.qdrant.url });

export async function ensureCollection(): Promise<void> {
  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some((c) => c.name === env.qdrant.collection);

    if (!exists) {
      await qdrant.createCollection(env.qdrant.collection, {
        vectors: {
          size: 768,
          distance: 'Cosine',
        },
      });
      logger.info('Qdrant collection created', { collection: env.qdrant.collection });
    }
  } catch (error) {
    logger.error('Failed to ensure collection exists', { error });
    throw error;
  }
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export async function upsertVectors(points: VectorPoint[]): Promise<void> {
  try {
    await ensureCollection();

    await qdrant.upsert(env.qdrant.collection, {
      wait: true,
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    });

    logger.info('Vectors upserted to Qdrant', { count: points.length });
  } catch (error) {
    logger.error('Failed to upsert vectors', { error });
    throw error;
  }
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export async function searchVectors(
  vector: number[],
  limit: number = 10,
  filter?: Record<string, unknown>
): Promise<SearchResult[]> {
  try {
    const response = await qdrant.search(env.qdrant.collection, {
      vector,
      limit,
      filter,
      with_payload: true,
    });

    const results: SearchResult[] = response.map((r) => ({
      id: String(r.id),
      score: r.score,
      payload: r.payload || {},
    }));

    logger.info('Vector search completed', { resultCount: results.length });
    return results;
  } catch (error) {
    logger.error('Vector search failed', { error });
    throw error;
  }
}

export async function deleteVector(id: string): Promise<void> {
  try {
    await qdrant.delete(env.qdrant.collection, {
      wait: true,
      points: [id],
    });
    logger.info('Vector deleted from Qdrant', { id });
  } catch (error) {
    logger.error('Failed to delete vector', { error });
    throw error;
  }
}
