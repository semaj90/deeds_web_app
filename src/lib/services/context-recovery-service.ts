import { redis } from '$lib/services/redis';
import { searchParentAtlas } from '$lib/services/atlas';
import { searchQdrant } from '$lib/services/qdrant';
import { searchPgTrgm } from '$lib/services/pg-trgm';
import { embedQuery } from '$lib/services/embedding';
import { classifyDominantCluster } from '$lib/services/cluster';
import { db } from '$lib/server/db/client';
import { llmStuckEvents } from '$lib/schema/llm-stuck-events';
import { hash } from '$lib/utils/hash';

export async function recoverWhenLost(input: {
  runId: string;
  agent: string;
  query: string;
  symptom: string;
  toolsTried?: string[];
}) {
  // 1. Embed the query and classify the dominant cluster
  const queryVec = await embedQuery(input.query);
  const domCluster = await classifyDominantCluster(queryVec);

  // 2. Check Redis for cache hit
  const cacheKey = `lost-cache:${domCluster}:${hash(input.query)}`;
  const cacheHit = await redis.get(cacheKey);
    if (cacheHit) {
      console.log('Cache hit for query: ' + input.query);
      return {
        cache_hit: true,
        dominant_cluster: domCluster,
        results: JSON.parse(cacheHit) as any,
      };
    }

  // 3. Query Parent Atlas, Qdrant, and pg_trgm
  const atlasHits = await searchParentAtlas(input.query, domCluster);
  const qdrantHits = await searchQdrant(queryVec, domCluster);
  const pgHits = await searchPgTrgm(input.query);

  // 4. Fuse and Limit Results
  const allHits = [...atlasHits, ...qdrantHits, ...pgHits];
  const results = fuseAndLimit(allHits, 8);

  // 5. Write to cache
  await redis.set(
    cacheKey,
    JSON.stringify(results),
    'EX',
    3600
  );

  // 6. Write to database (Stuck Event Logging)
  await db.insert(llmStuckEvents).values({
    id: crypto.randomUUID(),
    runId: input.runId,
    agent: input.agent,
    phase: 'lost_recovery',
    query: input.query,
    symptom: input.symptom,
    retryQuery: results[0]?.nextQuery ?? null,
    sourceRefs: results.flatMap((r) => r.sourceRefs ?? []),
    toolsTried: input.toolsTried ?? [],
    cacheHit: false,
    dominantCluster: domCluster,
    similarityScore: results[0]?.score ?? null
  });

  return {
    cache_hit: false,
    dominant_cluster: domCluster,
    results
  };
}

/**
 * Helper function to fuse and limit search results from multiple sources.
 * @param hits Array of search result objects.
 * @param limit Maximum number of results to keep.
 * @returns Array of top K results.
 */
function fuseAndLimit(hits: any[], limit: number): any[] {
    // Implementation of fusion logic goes here...
    return hits.slice(0, limit);
}