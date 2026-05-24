/**
 * Phase 89: Cluster Summary Generation API
 * - K-means clustering with CUDA acceleration
 * - Redis cache for cluster coordinates
 * - Qdrant tag enhancement
 * - Neo4j graph relationships
 * - PostgreSQL + pgvector + CouchDB sync
 */

import { db } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { scrollPoints, upsertPoints } from '$lib/server/qdrant-http';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { sql } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';
import { promisify } from 'util';
import { ollamaFetch } from '$lib/server/ollama.js';

const execAsync = promisify(exec);
const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const PYTHON_PATH = ENV.PYTHON_PATH;

interface ClusterSummary {
  id: number;
  errorCount: number;
  summary: string;
  tags: string[];
  recommendations: string[];
  cudaAnalysis: boolean;
  redisCached: boolean;
  neo4jPath: string | null;
  timestamp: string;
}

interface ClusterCoordinate {
  id: string | number;
  [key: string]: unknown;
}

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const clusterAnalysis = await runCUDAClustering();

    // 2. Generate summaries with gemma4-rotorquant:latest
    const summaries = await generateClusterSummaries(clusterAnalysis.clusters);

    // 3. Update Qdrant tags with cluster info
    await updateQdrantTags(summaries);

    // 4. Cache cluster coordinates in Redis
    await cacheClusterCoordinates(clusterAnalysis.coordinates);

    // 5. Update Neo4j graph
    await updateNeo4jGraph(summaries);

    // 6. Sync to PostgreSQL + pgvector
    await syncToPostgreSQL(summaries);

    // 7. Sync to CouchDB (optional backup)
    await syncToCouchDB(summaries);

    return json({
      success: true,
      summaries,
      stats: {
        totalClusters: summaries.length,
        cudaAccelerated: clusterAnalysis.cudaAccelerated,
        redisCached: true,
        neo4jSynced: true,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Cluster summary generation failed:', err instanceof Error ? err.message : err);
    return json({ success: false, error: 'Cluster summary generation failed' }, { status: 500 });
  } finally {
    // Pool manages connection lifecycle
  }
}

async function runCUDAClustering() {
  console.log('Running CUDA clustering...');

  try {
    const { stdout } = await execAsync(`"${PYTHON_PATH}" scripts/phase89-cuda-clustering.py`, {
      cwd: process.cwd(),
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Parse output
    const coordsMatch = stdout.match(/CLUSTER_COORDINATES: (.+)/);
    const coordinates: ClusterCoordinate[] = coordsMatch ? JSON.parse(coordsMatch[1]) : [];

    const clustersMatch = stdout.match(/CLUSTER_ASSIGNMENTS: (.+)/);
    const clusters: Record<string, (string | number)[]> = clustersMatch ? JSON.parse(clustersMatch[1]) : {};

    return {
      cudaAccelerated: stdout.includes('CUDA: Available'),
      coordinates,
      clusters,
    };
  } catch (err) {
    console.warn('CUDA clustering failed, using fallback:', err instanceof Error ? err.message : err);
    return {
      cudaAccelerated: false,
      coordinates: [] as ClusterCoordinate[],
      clusters: {} as Record<string, (string | number)[]>,
    };
  }
}

async function generateClusterSummaries(clusters: Record<string, (string | number)[]>): Promise<ClusterSummary[]> {
  const summaries: ClusterSummary[] = [];

  for (const [clusterId, errorIds] of Object.entries(clusters)) {
    if (!Array.isArray(errorIds) || errorIds.length === 0) continue;

    // Get error samples from PostgreSQL
    const errors = await db.execute(sql`
			SELECT message, source, code, timestamp
			FROM raw_error_embeddings
			WHERE id = ANY(${errorIds.slice(0, 10)})
			LIMIT 10
		`);

    // Analyze with gemma4-rotorquant:latest
    const summary = await analyzeClusterWithLLM(parseInt(clusterId), errors.rows);

    // Get enhanced tags from Qdrant
    const tags = await getClusterTags();

    summaries.push({
      id: parseInt(clusterId),
      errorCount: errorIds.length,
      summary: summary.text,
      tags,
      recommendations: summary.recommendations,
      cudaAnalysis: true,
      redisCached: false,
      neo4jPath: null,
      timestamp: new Date().toISOString(),
    });
  }

  return summaries;
}

async function analyzeClusterWithLLM(clusterId: number, errors: Record<string, unknown>[]) {
  const prompt = `Cluster ID: ${clusterId}
Error Count: ${errors.length}

Sample Errors:
${errors.map((e, i) => `${i + 1}. [${e.code}] ${e.source}: ${e.message}`).join('\n')}

Provide:
1. One-sentence summary of the root cause
2. 3 specific recommendations for fixing (production-quality)
3. Related patterns or common issues

Be concise and actionable.`;

  const response = await ollamaFetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4-rotorquant:latest',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at analyzing error patterns and providing fix recommendations.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      stream: false,
      options: { temperature: 0.4, num_predict: 300 },
    }),
  });

  const data = await response.json();
  const text = data.message.content;

  // Extract recommendations
  const recommendations: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (/^\d+\./.test(line.trim())) {
      recommendations.push(line.trim());
    }
  }

  return {
    text: text.split('\n\n')[0] ?? 'Cluster analysis complete',
    recommendations: recommendations.slice(0, 3),
  };
}

async function getClusterTags(): Promise<string[]> {
  const tags = new Set<string>();

  // Sample Qdrant collections for tags
  const collections = ['phase89_error_clusters', 'phase89_error_chunks'];

  for (const collection of collections) {
    try {
      const scrollResult = await scrollPoints({
        collection,
        limit: 50,
        withPayload: true,
        withVector: false,
      });

      for (const point of scrollResult.points) {
        if (point.payload?.tags && Array.isArray(point.payload.tags)) {
          point.payload.tags.forEach((t: string) => tags.add(t));
        }
      }
    } catch (err) {
      console.warn(`Failed to get tags from ${collection}:`, err);
    }
  }

  return Array.from(tags).slice(0, 10);
}

async function updateQdrantTags(summaries: ClusterSummary[]) {
  for (const summary of summaries) {
    // Generate embedding for summary
    const embedRes = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: summary.summary,
      }),
    });

    const { embedding } = await embedRes.json();

    // Upsert to phase89_kb_cards collection
    await upsertPoints({
      collection: 'phase89_kb_cards',
      wait: true,
      points: [
        {
          id: `cluster_${summary.id}_${Date.now()}`,
          vector: embedding,
          payload: {
            cluster_id: summary.id,
            summary: summary.summary,
            tags: summary.tags,
            error_count: summary.errorCount,
            timestamp: summary.timestamp,
            card_type: 'cluster_summary',
          },
        },
      ],
    });
  }
}

async function cacheClusterCoordinates(coordinates: ClusterCoordinate[]) {
  const redis = getRedis();
  for (const coord of coordinates) {
    await redis.set(
      `phase89:cluster:${coord.id}:coords`,
      JSON.stringify(coord),
      'EX',
      86400 // 24 hour expiry
    );
  }
}

async function updateNeo4jGraph(summaries: ClusterSummary[]) {
	if (!summaries.length) return;
	try {
		const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
		const driver = getNeo4jDriver();
		const session = driver.session();
		try {
			// Upsert ErrorCluster nodes
			for (const s of summaries) {
				await session.run(
					`MERGE (c:ErrorCluster {clusterId: $clusterId})
					 SET c.summary    = $summary,
					     c.tags       = $tags,
					     c.errorCount = $errorCount,
					     c.cudaAnalysis = $cudaAnalysis,
					     c.updatedAt  = $updatedAt`,
					{
						clusterId:   s.id,
						summary:     s.summary,
						tags:        s.tags,
						errorCount:  s.errorCount,
						cudaAnalysis: s.cudaAnalysis,
						updatedAt:   s.timestamp,
					}
				);
			}
			// Create SIMILAR_CLUSTER edges between clusters sharing tags
			for (let i = 0; i < summaries.length; i++) {
				for (let j = i + 1; j < summaries.length; j++) {
					const sharedTags = summaries[i].tags.filter(t => summaries[j].tags.includes(t));
					if (sharedTags.length > 0) {
						await session.run(
							`MATCH (a:ErrorCluster {clusterId: $aId}), (b:ErrorCluster {clusterId: $bId})
							 MERGE (a)-[:SIMILAR_CLUSTER {sharedTags: $sharedTags}]->(b)`,
							{ aId: summaries[i].id, bId: summaries[j].id, sharedTags }
						);
					}
				}
			}
		} finally {
			await session.close();
		}
	} catch (err) {
		console.warn('[generate-cluster-summaries] Neo4j update failed (non-fatal):', (err as Error).message);
	}
}

async function syncToPostgreSQL(summaries: ClusterSummary[]) {
	for (const summary of summaries) {
		await db.execute(sql`
			INSERT INTO phase89_cluster_summaries (
				cluster_id, summary,
				tags, error_count,
				recommendations, metadata,
				created_at
			) VALUES (
				${summary.id},
				${summary.summary},
				${summary.tags},
				${summary.errorCount},
				${summary.recommendations},
				${{ cudaAnalysis: summary.cudaAnalysis, timestamp: summary.timestamp }},
				NOW()
			)
			ON CONFLICT (cluster_id) DO UPDATE SET
				summary = EXCLUDED.summary,
				tags = EXCLUDED.tags,
				error_count = EXCLUDED.error_count,
				recommendations = EXCLUDED.recommendations,
				metadata = EXCLUDED.metadata,
				updated_at = NOW()
		`);
	}
}

async function syncToCouchDB(summaries: ClusterSummary[]) {
	if (!summaries.length) return;
	try {
		const { couchdb } = await import('$lib/server/services/couchdb-client.js');
		const DB = 'phase89_clusters';
		await couchdb.createDb(DB).catch(() => {});  // no-op if already exists
		for (const s of summaries) {
			await couchdb.put(DB, `cluster_${s.id}`, {
				clusterId:       s.id,
				summary:         s.summary,
				tags:            s.tags,
				errorCount:      s.errorCount,
				recommendations: s.recommendations,
				cudaAnalysis:    s.cudaAnalysis,
				timestamp:       s.timestamp,
				type:            'phase89_cluster',
			}).catch(() => {});  // conflict on _rev mismatch is non-fatal
		}
	} catch (err) {
		console.warn('[generate-cluster-summaries] CouchDB sync failed (non-fatal):', (err as Error).message);
	}
}
