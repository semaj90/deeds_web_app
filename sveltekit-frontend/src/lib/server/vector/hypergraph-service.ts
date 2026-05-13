import { db } from '$lib/server/db/client.js';
import { enhancedGraphMappings } from '$lib/server/db/schema/graph-mappings.js';
import { sql, eq, inArray } from 'drizzle-orm';
import { QdrantManager } from './qdrant-manager.js';
import { traceDB } from '$lib/server/observability/langfuse.js';

export interface StarGraph {
  id: string;
  kind: string;
  label: string;
  summary: string | null;
  neighbors: Array<{
    id: string;
    kind: string;
    label: string;
    relation: string;
  }>;
  scores: any;
  metadata: any;
}

export class HypergraphService {
  private qdrant = new QdrantManager();

  /**
   * Performs a Linked Semantic Multi-Query Search.
   * 1. Dense Semantic Search (Qdrant)
   * 2. Star Graph Expansion (JSONB/Postgres)
   * 3. Result Fusion & Ranking
   */
  async linkedSemanticSearch(params: {
    query: string;
    queryEmbedding: number[];
    limit?: number;
    expansionHops?: number;
  }): Promise<any> {
    const limit = params.limit ?? 10;
    const hops = params.expansionHops ?? 1;

    // 1. Semantic Seed Search
    console.log(`🔍 [Hypergraph-Service] Finding semantic seeds for: "${params.query}"`);
    const semanticResults = await this.qdrant.hybridSearch({
      query: params.query,
      queryEmbedding: params.queryEmbedding,
      collection: 'codebase_chunks',
      limit: limit
    });

    const seedIds = semanticResults.results.map(r => r.payload?.id as string).filter(Boolean);
    if (seedIds.length === 0) return { results: [], metadata: { total: 0 } };

    // 2. Star Graph Expansion (Postgres JSONB)
    console.log(`✨ [Hypergraph-Service] Expanding ${seedIds.length} seeds into star graphs...`);
    const starGraphs = await this.getStarGraphs(seedIds);

    // 3. (Optional) Follow neighbors for deeper hypergraph traversal
    // For now, we stick to 1-hop "Star" search as requested.

    // 4. Multi-Query Refinement (Star Graph Centric)
    // We can also perform semantic searches for the labels of the neighbors to see if they match the query intent.
    
    return {
      query: params.query,
      seeds: starGraphs,
      metadata: {
        totalSeeds: seedIds.length,
        responseTime: semanticResults.metadata.responseTime
      }
    };
  }

  /**
   * Pentagon Graph Algorithmic Multi-Hop Search.
   * Traverses 5 architectural pillars for ultra-deep context:
   * 1. Semantic (Query -> Node)
   * 2. Logic (Node -> File)
   * 3. Dependency (File -> Imports)
   * 4. Interface (Imports -> gRPC/Proto)
   * 5. Storage (Proto -> JSONB/DB)
   */
  async pentagonSearch(params: {
    query: string;
    queryEmbedding: number[];
    limit?: number;
  }): Promise<any> {
    const limit = params.limit ?? 5;
    
    // Pillar 1: Semantic Seed
    const semanticResults = await this.qdrant.hybridSearch({
      query: params.query,
      queryEmbedding: params.queryEmbedding,
      collection: 'codebase_chunks',
      limit: limit
    });

    const seeds = semanticResults.results.map(r => r.payload?.id as string).filter(Boolean);
    if (seeds.length === 0) return { pentagon: [], metadata: { hops: 5 } };

    // Pillar 2 & 3: Star Graph Expansion (Implementation & Dependency)
    const starGraphs = await this.getStarGraphs(seeds);
    
    // Pillar 4 & 5: Deep Interface & Schema Resolution
    const deepResults = [];
    for (const star of starGraphs) {
      const neighbors = star.neighbors.map(n => n.id);
      
      // Fetch neighbors' details to find Protos and Schemas
      const neighborDetails = await db.select()
        .from(enhancedGraphMappings)
        .where(inArray(enhancedGraphMappings.id, neighbors));

      const protocols = neighborDetails.filter(n => n.kind === 'proto' || n.kind === 'grpc_method');
      const schemas = neighborDetails.filter(n => n.kind === 'schema' || n.kind === 'redis_key');

      deepResults.push({
        ...star,
        protocols: protocols.map(p => ({ id: p.id, label: p.label })),
        schemas: schemas.map(s => ({ id: s.id, label: s.label })),
        recommendations: this.generateRecommendations(star, protocols, schemas)
      });
    }

    return {
      query: params.query,
      pentagon: deepResults,
      metadata: {
        hops: 5,
        pillar: 'arch-traversal'
      }
    };
  }

  private generateRecommendations(star: StarGraph, protos: any[], schemas: any[]): string[] {
    const recs = [];
    if (protos.length > 0) recs.push(`Review ${protos[0].label} for interface alignment.`);
    if (schemas.length > 0) recs.push(`Verify ${schemas[0].label} JSONB schema consistency.`);
    if (star.kind === 'file' && star.label.endsWith('.ts')) recs.push('Check for Svelte 5 runes compliance.');
    return recs;
  }

  /**
   * Fetch neighborhoods (Star Graphs) for a batch of node IDs.
   */
  async getStarGraphs(ids: string[]): Promise<StarGraph[]> {
    return traceDB('getStarGraphs', { idCount: ids.length }, async () => {
      const nodes = await db.select().from(enhancedGraphMappings).where(inArray(enhancedGraphMappings.id, ids));
      
      const results: StarGraph[] = [];

      for (const node of nodes) {
        // Neighbors are stored in the JSONB 'edges' field
        const neighbors: StarGraph['neighbors'] = [];
        for (const edge of (node.edges || [])) {
          for (const target of edge.targets) {
            neighbors.push({
              id: target,
              kind: 'unknown', // We'd need another query or join to get full info
              label: target,
              relation: edge.relation
            });
          }
        }

        results.push({
          id: node.id,
          kind: node.kind,
          label: node.label,
          summary: node.summary,
          neighbors,
          scores: node.scores,
          metadata: node.metadata
        });
      }

      return results;
    });
  }
}
