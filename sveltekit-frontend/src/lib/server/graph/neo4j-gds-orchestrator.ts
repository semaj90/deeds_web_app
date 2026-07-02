/**
 * Neo4j GDS Orchestrator
 *
 * Executes graph algorithms (PageRank, HITS, Louvain, SOM) against the
 * codebase feature dependency graph and writes results to feature_statistics.
 *
 * Load-bearing principle: Graph algorithms run BEFORE summaries.
 * Results feed feature_statistics table, which is ephemeral (can be rebuilt).
 * feature identity remains immutable in atlas_packets / codebase_chunk_index.
 */

import neo4j, { type Driver, type Session } from 'neo4j-driver';
import { db } from '../db/client.js';
import { feature_statistics } from '../db/schema-postgres.js';
import { eq } from 'drizzle-orm';

export interface GDSAlgorithmResult {
  algorithm: 'pagerank' | 'hits' | 'louvain' | 'som';
  status: 'success' | 'failed' | 'skipped';
  runtime_ms: number;
  nodes_processed: number;
  error?: string;
}

export interface FeatureStatisticsUpdate {
  feature_id: string;
  pagerank: number;
  hits_authority: number;
  hits_hub: number;
  community: number;
  som_cluster: number;
  som_cell_x: number;
  som_cell_y: number;
  cluster_degree: number;
  in_degree: number;
  out_degree: number;
  betweenness: number;
  freshness_days: number;
  last_updated: Date;
}

export class Neo4jGDSOrchestrator {
  private driver: Driver;
  private session: Session | null = null;

  constructor(private neo4jUrl: string = 'neo4j://localhost:7687', private neo4jUser: string = 'neo4j', private neo4jPassword: string = 'password') {
    this.driver = neo4j.driver(neo4jUrl, neo4j.auth.basic(neo4jUser, neo4jPassword));
  }

  async initialize(): Promise<void> {
    // Verify connection
    const testSession = this.driver.session();
    try {
      const result = await testSession.run('RETURN 1');
      if (!result.records.length) throw new Error('Neo4j connection test returned empty result');
      this.session = this.driver.session();
    } catch (err) {
      throw new Error(`Failed to connect to Neo4j at ${this.neo4jUrl}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await testSession.close();
    }
  }

  /**
   * Run PageRank algorithm on the codebase graph
   * Identifies central/influential features
   */
  async runPageRank(maxIterations: number = 20): Promise<GDSAlgorithmResult> {
    if (!this.session) throw new Error('Orchestrator not initialized');

    const startTime = Date.now();
    try {
      // Create in-memory graph projection
      await this.session.run(
        `
        CALL gds.graph.project.cypher(
          'codebase_graph',
          'MATCH (f:Feature) RETURN id(f) as id, f.feature_id as feature_id',
          'MATCH (f1:Feature)-[r:IMPORTS|BELONGS_TO_CLUSTER|SIMILAR_TOPOLOGY]->(f2:Feature) RETURN id(f1) as source, id(f2) as target, type(r) as type'
        )
        YIELD graphName, nodeCount, relationshipCount
        RETURN graphName, nodeCount, relationshipCount
        `
      );

      // Run PageRank
      const pageRankResult = await this.session.run(
        `
        CALL gds.pageRank.stream('codebase_graph', {
          maxIterations: $maxIterations,
          dampingFactor: 0.85
        })
        YIELD nodeId, score
        WITH gds.util.asNode(nodeId) as node, score
        RETURN node.feature_id as feature_id, score as pagerank_score
        ORDER BY score DESC
        `,
        { maxIterations }
      );

      const nodesProcessed = pageRankResult.records.length;

      // Write results to feature_statistics
      for (const record of pageRankResult.records) {
        const feature_id = record.get('feature_id') as string;
        const pagerank = record.get('pagerank_score') as number;

        await db
          .update(feature_statistics)
          .set({
            pagerank,
            last_updated: new Date()
          })
          .where(eq(feature_statistics.feature_id, feature_id));
      }

      // Drop the projection
      await this.session.run('CALL gds.graph.drop("codebase_graph")');

      return {
        algorithm: 'pagerank',
        status: 'success',
        runtime_ms: Date.now() - startTime,
        nodes_processed: nodesProcessed
      };
    } catch (err) {
      return {
        algorithm: 'pagerank',
        status: 'failed',
        runtime_ms: Date.now() - startTime,
        nodes_processed: 0,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Run HITS algorithm (Hubs and Authorities)
   * Identifies authoritative and hub-like features
   */
  async runHITS(): Promise<GDSAlgorithmResult> {
    if (!this.session) throw new Error('Orchestrator not initialized');

    const startTime = Date.now();
    try {
      // Create projection
      await this.session.run(
        `
        CALL gds.graph.project.cypher(
          'codebase_hits',
          'MATCH (f:Feature) RETURN id(f) as id, f.feature_id as feature_id',
          'MATCH (f1:Feature)-[r:IMPORTS|SIMILAR_TOPOLOGY]->(f2:Feature) RETURN id(f1) as source, id(f2) as target'
        )
        YIELD graphName, nodeCount, relationshipCount
        RETURN graphName, nodeCount, relationshipCount
        `
      );

      // Run HITS
      const hitsResult = await this.session.run(
        `
        CALL gds.hits.stream('codebase_hits', {
          maxIterations: 20
        })
        YIELD nodeId, values
        WITH gds.util.asNode(nodeId) as node, values
        RETURN node.feature_id as feature_id, values.authority as authority, values.hub as hub
        ORDER BY authority DESC
        `
      );

      const nodesProcessed = hitsResult.records.length;

      // Write results
      for (const record of hitsResult.records) {
        const feature_id = record.get('feature_id') as string;
        const authority = record.get('authority') as number;
        const hub = record.get('hub') as number;

        await db
          .update(feature_statistics)
          .set({
            hits_authority: authority,
            hits_hub: hub,
            last_updated: new Date()
          })
          .where(eq(feature_statistics.feature_id, feature_id));
      }

      // Drop projection
      await this.session.run('CALL gds.graph.drop("codebase_hits")');

      return {
        algorithm: 'hits',
        status: 'success',
        runtime_ms: Date.now() - startTime,
        nodes_processed: nodesProcessed
      };
    } catch (err) {
      return {
        algorithm: 'hits',
        status: 'failed',
        runtime_ms: Date.now() - startTime,
        nodes_processed: 0,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Run Louvain community detection
   * Identifies clusters of related features
   */
  async runLouvain(): Promise<GDSAlgorithmResult> {
    if (!this.session) throw new Error('Orchestrator not initialized');

    const startTime = Date.now();
    try {
      // Create projection (undirected for Louvain)
      await this.session.run(
        `
        CALL gds.graph.project.cypher(
          'codebase_louvain',
          'MATCH (f:Feature) RETURN id(f) as id, f.feature_id as feature_id',
          'MATCH (f1:Feature)-[r:IMPORTS|BELONGS_TO_CLUSTER|SIMILAR_TOPOLOGY]-(f2:Feature) RETURN id(f1) as source, id(f2) as target, r.weight as weight'
        )
        YIELD graphName, nodeCount, relationshipCount
        RETURN graphName, nodeCount, relationshipCount
        `
      );

      // Run Louvain
      const louvainResult = await this.session.run(
        `
        CALL gds.louvain.stream('codebase_louvain', {
          seed: 42,
          includeIntermediateCommunities: false
        })
        YIELD nodeId, communityId
        WITH gds.util.asNode(nodeId) as node, communityId
        RETURN node.feature_id as feature_id, communityId as community
        ORDER BY community ASC
        `
      );

      const nodesProcessed = louvainResult.records.length;

      // Write results
      for (const record of louvainResult.records) {
        const feature_id = record.get('feature_id') as string;
        const community = record.get('community') as number;

        await db
          .update(feature_statistics)
          .set({
            community,
            last_updated: new Date()
          })
          .where(eq(feature_statistics.feature_id, feature_id));
      }

      // Drop projection
      await this.session.run('CALL gds.graph.drop("codebase_louvain")');

      return {
        algorithm: 'louvain',
        status: 'success',
        runtime_ms: Date.now() - startTime,
        nodes_processed: nodesProcessed
      };
    } catch (err) {
      return {
        algorithm: 'louvain',
        status: 'failed',
        runtime_ms: Date.now() - startTime,
        nodes_processed: 0,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Compute SOM (Self-Organizing Map) topology
   * Maps features to a 20×20 grid based on similarity
   * This is a stub — actual SOM computation happens in TurboVec
   */
  async computeSOMTopology(): Promise<GDSAlgorithmResult> {
    if (!this.session) throw new Error('Orchestrator not initialized');

    const startTime = Date.now();
    try {
      // Query all features with embeddings
      const features = await db.query.feature_statistics.findMany();

      if (features.length === 0) {
        return {
          algorithm: 'som',
          status: 'skipped',
          runtime_ms: 0,
          nodes_processed: 0
        };
      }

      // For now, assign SOM cells based on community + authority
      // Real implementation: call TurboVec :8791 for GPU-accelerated SOM
      let cellAssignments = 0;

      for (const feature of features) {
        // Deterministic grid assignment: use community + hits_authority to seed position
        const gridX = Math.floor(((feature.hits_authority ?? 0) * 10) % 20);
        const gridY = Math.floor(((feature.community ?? 0) * 10) % 20);

        await db
          .update(feature_statistics)
          .set({
            som_cell_x: gridX,
            som_cell_y: gridY,
            som_cluster: gridY * 20 + gridX, // Flatten 2D to 1D cluster ID
            last_updated: new Date()
          })
          .where(eq(feature_statistics.feature_id, feature.feature_id));

        cellAssignments++;
      }

      return {
        algorithm: 'som',
        status: 'success',
        runtime_ms: Date.now() - startTime,
        nodes_processed: cellAssignments
      };
    } catch (err) {
      return {
        algorithm: 'som',
        status: 'failed',
        runtime_ms: Date.now() - startTime,
        nodes_processed: 0,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Run all algorithms in sequence
   */
  async runFullPipeline(): Promise<GDSAlgorithmResult[]> {
    const results: GDSAlgorithmResult[] = [];

    console.log('Starting Neo4j GDS pipeline...');

    const pageRankResult = await this.runPageRank();
    results.push(pageRankResult);
    console.log(`PageRank: ${pageRankResult.status} (${pageRankResult.nodes_processed} nodes, ${pageRankResult.runtime_ms}ms)`);

    const hitsResult = await this.runHITS();
    results.push(hitsResult);
    console.log(`HITS: ${hitsResult.status} (${hitsResult.nodes_processed} nodes, ${hitsResult.runtime_ms}ms)`);

    const louvainResult = await this.runLouvain();
    results.push(louvainResult);
    console.log(`Louvain: ${louvainResult.status} (${louvainResult.nodes_processed} nodes, ${louvainResult.runtime_ms}ms)`);

    const somResult = await this.computeSOMTopology();
    results.push(somResult);
    console.log(`SOM: ${somResult.status} (${somResult.nodes_processed} nodes, ${somResult.runtime_ms}ms)`);

    return results;
  }

  async close(): Promise<void> {
    if (this.session) {
      await this.session.close();
    }
    await this.driver.close();
  }
}

/**
 * Convenience function to run the full pipeline
 */
export async function runNeo4jGDSPipeline(
  neo4jUrl?: string,
  neo4jUser?: string,
  neo4jPassword?: string
): Promise<GDSAlgorithmResult[]> {
  const orchestrator = new Neo4jGDSOrchestrator(neo4jUrl, neo4jUser, neo4jPassword);

  try {
    await orchestrator.initialize();
    return await orchestrator.runFullPipeline();
  } finally {
    await orchestrator.close();
  }
}
