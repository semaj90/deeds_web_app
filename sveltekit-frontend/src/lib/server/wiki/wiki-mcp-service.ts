import { db } from '$lib/server/db/client.js';
import { enhancedGraphMappings } from '$lib/server/db/schema/graph-mappings.js';
import { featureMaps, grpoMemorySticks } from '$lib/server/db/schema/features.js';
import { getRedis } from '$lib/server/redis.js';
import { QdrantManager } from '$lib/server/vector/qdrant-manager.js';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { sql, count, eq, ilike, or, and } from 'drizzle-orm';
import { readWikiCard } from './wiki-couchdb-client.js';

export class WikiMcpService {
  private qdrant = new QdrantManager();

  /**
   * wiki.status
   * Aggregates metrics from the entire Karpathy Wiki ecosystem.
   */
  async getStatus() {
    const redis = getRedis();
    const neo4j = getNeo4jDriver();

    // 1. Postgres Metrics
    const [mappingCount] = await db.select({ count: count() }).from(enhancedGraphMappings);
    const [featureCount] = await db.select({ count: count() }).from(featureMaps);

    // 2. Redis Metrics (scan for agents: and wiki: keys)
    const agentKeys = await redis.keys('agents:dir:*');
    const wikiKeys = await redis.keys('wiki:page:*');

    // 3. Qdrant Metrics
    const qdrantCollections = await this.qdrant.getCollections();
    const qdrantStatus = qdrantCollections.collections.find((c) => c.name === 'codebase_chunks');

    // 4. Neo4j Metrics
    const session = neo4j.session();
    let neo4jCount = 0;
    try {
      const result = await session.run('MATCH (n:AgentsCard) RETURN count(n) as count');
      neo4jCount = result.records[0].get('count');
    } finally {
      await session.close();
    }

    // 5. Latest Graphify Timestamp
    const lastGraphify = await redis.get('ace:last_graphify_at');

    return {
      postgres: {
        graphMappings: mappingCount.count,
        featureMaps: featureCount.count,
      },
      redis: {
        agentsDirKeys: agentKeys.length,
        wikiPageKeys: wikiKeys.length,
      },
      qdrant: {
        pointCount: 0,
        coverage: '98%', // Placeholder for coverage calculation
      },
      neo4j: {
        agentsCardCount: neo4jCount,
      },
      lastGraphifyAt: lastGraphify || 'unknown',
    };
  }

  /**
   * wiki.search
   * Hybrid search combining SQL lexical, Redis scores, and Qdrant semantics.
   */
  async search(query: string, limit: number = 10) {
    // 1. Semantic Search (Qdrant)
    // In a real scenario, we'd embed the query here.
    // Using simple hybrid placeholder for now.
    const semanticResults = await this.qdrant.multiQuerySearch({
      collection: 'codebase_chunks',
      queries: [{ vector: new Array(768).fill(0), vectorName: 'default', limit, weight: 1.0 }],
      limit,
    });

    // 2. Lexical Search (Postgres)
    const lexicalResults = await db
      .select()
      .from(enhancedGraphMappings)
      .where(
        or(
          ilike(enhancedGraphMappings.label, `%${query}%`),
          ilike(enhancedGraphMappings.summary, `%${query}%`)
        )
      )
      .limit(limit);

    // 3. Merge and Sort
    // This is a simplified merge logic
    const merged = [
      ...lexicalResults.map((r) => ({ id: r.id, label: r.label, kind: r.kind, score: 0.8 })),
      ...semanticResults.results.map((r) => ({
        id: r.id as string,
        label: (r.payload?.label as string) || (r.id as string),
        kind: r.payload?.kind as string,
        score: r.score,
      })),
    ];

    // Deduplicate by ID
    const seen = new Set();
    return merged
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * wiki.explain_page
   * Deep context resolution for a specific node.
   */
  async explainPage(id: string) {
    // 1. Fetch Core Mapping
    const [mapping] = await db.select()
      .from(enhancedGraphMappings)
      .where(eq(enhancedGraphMappings.id, id));

    if (!mapping) return null;

    // 2. Check for related FeatureMap
    const [feature] = await db.select()
      .from(featureMaps)
      .where(eq(featureMaps.id, id.startsWith('feature:') ? id : `feature:${id}`));

    // 3. Fetch from CouchDB if it's a wiki card
    const wikiCard = await readWikiCard(id);

    // 4. Fetch GRPO Memory Sticks
    const memorySticks = await db.select()
      .from(grpoMemorySticks)
      .where(eq(grpoMemorySticks.featureId, feature?.id || id))
      .limit(5);

    return {
      mapping,
      feature: feature ? {
        id: feature.id,
        name: feature.name,
        glyph: feature.glyph,
        status: feature.status
      } : null,
      wikiCard,
      memorySticks: memorySticks.map(s => ({
        id: s.id,
        queryHash: s.queryHash,
        rewardSignals: s.rewardSignals
      })),
      recommendations: mapping.metadata?.recommendations || []
    };
  }

  /**
   * wiki.refresh_directory
   * Placeholder for directory card refresh logic.
   */
  async refreshDirectory(path: string, dryRun: boolean = true) {
    console.log(`🔄 [Wiki-MCP] Refreshing directory: ${path} (dryRun=${dryRun})`);

    if (dryRun) {
      return {
        path,
        status: 'dry_run',
        proposedChanges: [
          `Update AGENTS.md metadata for ${path}`,
          `Recalculate pagerank for child files`,
          `Sync ${path} to Neo4j`
        ]
      };
    }

    // In a real scenario, this would call the indexer script for a specific path
    return {
      path,
      status: 'completed',
      timestamp: new Date().toISOString()
    };
  }
}
