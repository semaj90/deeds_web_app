/**
 * Neo4j GDS Retrieval Graph Module
 *
 * Defines and manages the retrievalAnalysis GDS projection for planning algorithms.
 * NOT for retrieval (Qdrant/Postgres handle that) — for planning decisions via graph algorithms.
 *
 * Projection Nodes: Query, Concept, Feature, Packet, Task, Directory, Community, Strategy
 * Projection Edges: USED_STRATEGY, SELECTED_PACKET, SUPPORTS, USED_CONCEPT, SUCCESSFUL_WITH, IN_COMMUNITY, CONTAINS
 *
 * Algorithms:
 *   - PageRank: which concepts/strategies are most important
 *   - Louvain: emergent concept communities
 *   - Node Similarity: concept cousins
 *   - Personalized PageRank: strategy-scoped authority
 */

import { type Driver, type Session, type Result } from 'neo4j-driver';
import { getNeo4jDriver } from '../neo4j-driver';

const RETRIEVAL_PROJECTION_NAME = 'retrievalAnalysis';

export interface GdsProjectionConfig {
  graphName: string;
  nodeLabels: string[];
  relationshipTypes: { [key: string]: { type: string; orientation?: string } };
}

/**
 * Ensure the retrieval analysis projection exists.
 * Creates or refreshes the GDS projection of Query → Concept → Packet → Feature graph.
 */
export async function ensureRetrievalGdsProjection(
  neo4j: Driver,
  force: boolean = false
): Promise<void> {
  const session = neo4j.session();

  try {
    // Check if projection exists
    const existsResult = await session.run(
      `CALL gds.graph.list() YIELD graphName, nodeCount, relationshipCount
       WHERE graphName = $projName
       RETURN graphName, nodeCount, relationshipCount`,
      { projName: RETRIEVAL_PROJECTION_NAME }
    );

    const exists = existsResult.records.length > 0;

    if (exists && !force) {
      console.log(
        `[Neo4j GDS] Projection ${RETRIEVAL_PROJECTION_NAME} already exists, skipping.`
      );
      return;
    }

    // Drop if force refresh
    if (exists && force) {
      await session.run(
        `CALL gds.graph.drop($projName)`,
        { projName: RETRIEVAL_PROJECTION_NAME }
      );
      console.log(`[Neo4j GDS] Dropped existing projection ${RETRIEVAL_PROJECTION_NAME}`);
    }

    // Create projection with all node types and relationship types
    const projectionQuery = `
      CALL gds.graph.project(
        $projName,
        {
          Query: {},
          Strategy: {},
          Concept: {},
          Packet: {},
          Feature: {},
          Task: {},
          Directory: {},
          Community: {}
        },
        {
          USED_STRATEGY: { orientation: 'UNDIRECTED' },
          SELECTED_PACKET: { orientation: 'UNDIRECTED' },
          SUPPORTS: { orientation: 'UNDIRECTED' },
          USED_CONCEPT: { orientation: 'UNDIRECTED' },
          SUCCESSFUL_WITH: { orientation: 'UNDIRECTED' },
          IN_COMMUNITY: { orientation: 'UNDIRECTED' },
          CONTAINS: { orientation: 'UNDIRECTED' },
          DISCOVERED_BY: { orientation: 'UNDIRECTED' }
        }
      )
      YIELD graphName, nodeCount, relationshipCount
      RETURN graphName, nodeCount, relationshipCount
    `;

    const createResult = await session.run(projectionQuery, {
      projName: RETRIEVAL_PROJECTION_NAME
    });

    if (createResult.records.length > 0) {
      const rec = createResult.records[0];
      console.log(
        `[Neo4j GDS] Created projection ${rec.get('graphName')}: ${rec.get('nodeCount')} nodes, ${rec.get('relationshipCount')} edges`
      );
    }
  } finally {
    await session.close();
  }
}

/**
 * Run PageRank on the retrieval projection.
 * Identifies most important concepts and strategies based on graph structure.
 */
export async function runRetrievalPageRank(neo4j: Driver): Promise<void> {
  const session = neo4j.session();

  try {
    // Run PageRank
    const runResult = await session.run(
      `CALL gds.pageRank.write(
        $projName,
        { writeProperty: 'retrievalPageRank', dampingFactor: 0.85, iterations: 20 }
      )
      YIELD nodePropertiesWritten, preProcessingMillis, computeMillis, writeMillis
      RETURN nodePropertiesWritten, preProcessingMillis, computeMillis, writeMillis`,
      { projName: RETRIEVAL_PROJECTION_NAME }
    );

    if (runResult.records.length > 0) {
      const rec = runResult.records[0];
      console.log(
        `[Neo4j GDS] PageRank completed: ${rec.get('nodePropertiesWritten')} nodes written (${rec.get('computeMillis')}ms compute)`
      );
    }
  } finally {
    await session.close();
  }
}

/**
 * Run Louvain community detection on the retrieval projection.
 * Identifies emergent concept communities for task-scoped selection.
 */
export async function runRetrievalCommunityDetection(neo4j: Driver): Promise<void> {
  const session = neo4j.session();

  try {
    const runResult = await session.run(
      `CALL gds.louvain.write(
        $projName,
        { writeProperty: 'retrievalCommunity', relationshipWeightProperty: null }
      )
      YIELD nodePropertiesWritten, communityCount, preProcessingMillis, computeMillis, writeMillis
      RETURN nodePropertiesWritten, communityCount, preProcessingMillis, computeMillis, writeMillis`,
      { projName: RETRIEVAL_PROJECTION_NAME }
    );

    if (runResult.records.length > 0) {
      const rec = runResult.records[0];
      console.log(
        `[Neo4j GDS] Louvain completed: ${rec.get('nodePropertiesWritten')} nodes, ${rec.get('communityCount')} communities (${rec.get('computeMillis')}ms)`
      );
    }
  } finally {
    await session.close();
  }
}

/**
 * Run Node Similarity to find concept/strategy cousins.
 * Writes SIMILAR_RETRIEVAL relationships.
 */
export async function runRetrievalNodeSimilarity(neo4j: Driver): Promise<void> {
  const session = neo4j.session();

  try {
    const runResult = await session.run(
      `CALL gds.nodeSimilarity.write(
        $projName,
        { writeRelationshipType: 'SIMILAR_RETRIEVAL', writeProperty: 'similarity', topK: 10 }
      )
      YIELD nodesCompared, relationshipsWritten, preProcessingMillis, computeMillis, writeMillis
      RETURN nodesCompared, relationshipsWritten, preProcessingMillis, computeMillis, writeMillis`,
      { projName: RETRIEVAL_PROJECTION_NAME }
    );

    if (runResult.records.length > 0) {
      const rec = runResult.records[0];
      console.log(
        `[Neo4j GDS] Node Similarity completed: ${rec.get('nodesCompared')} nodes, ${rec.get('relationshipsWritten')} SIMILAR_RETRIEVAL edges (${rec.get('computeMillis')}ms)`
      );
    }
  } finally {
    await session.close();
  }
}

/**
 * Run Personalized PageRank from a source node.
 * Useful for "what concepts are related to authentication?" queries.
 *
 * @param sourceNodeId The query, concept, or strategy node ID to personalize from
 * @returns Ranked list of concepts/strategies with personalized authority
 */
export async function runRetrievalPersonalizedPageRank(
  neo4j: Driver,
  sourceNodeId: string
): Promise<Array<{ id: string; score: number }>> {
  const session = neo4j.session();

  try {
    // First, find the source node
    const sourceResult = await session.run(
      `MATCH (n) WHERE n.id = $id OR n.conceptId = $id OR n.strategyId = $id
       RETURN id(n) as neoId, labels(n) as labels
       LIMIT 1`,
      { id: sourceNodeId }
    );

    if (sourceResult.records.length === 0) {
      console.warn(`[Neo4j GDS] Source node ${sourceNodeId} not found`);
      return [];
    }

    const sourceNeoId = sourceResult.records[0].get('neoId');

    // Run PPR in stream mode (don't write to avoid polluting the graph)
    const pprResult = await session.run(
      `CALL gds.pageRank.stream(
        $projName,
        {
          sourceNode: $sourceNeoId,
          dampingFactor: 0.85,
          iterations: 20
        }
      )
      YIELD nodeId, score
      MATCH (n) WHERE id(n) = nodeId
      RETURN n.id as id, score
      ORDER BY score DESC
      LIMIT 50`,
      { projName: RETRIEVAL_PROJECTION_NAME, sourceNeoId }
    );

    return pprResult.records.map((rec) => ({
      id: rec.get('id') || rec.get('nodeId'),
      score: rec.get('score')
    }));
  } finally {
    await session.close();
  }
}

/**
 * Get the current projection stats: node count, edge count, last algorithm run.
 */
export async function getRetrievalProjectionStats(
  neo4j: Driver
): Promise<{
  graphName: string;
  nodeCount: number;
  relationshipCount: number;
  lastUpdated?: string;
} | null> {
  const session = neo4j.session();

  try {
    const result = await session.run(
      `CALL gds.graph.list() YIELD graphName, nodeCount, relationshipCount
       WHERE graphName = $projName
       RETURN graphName, nodeCount, relationshipCount`,
      { projName: RETRIEVAL_PROJECTION_NAME }
    );

    if (result.records.length === 0) return null;

    const rec = result.records[0];
    return {
      graphName: rec.get('graphName'),
      nodeCount: rec.get('nodeCount').toNumber(),
      relationshipCount: rec.get('relationshipCount').toNumber()
    };
  } finally {
    await session.close();
  }
}

/**
 * Export top concepts by authority for planner context.
 */
export async function getTopConceptsByAuthority(
  neo4j: Driver,
  limit: number = 10
): Promise<
  Array<{
    conceptId: string;
    temperature: number;
    pageRank: number;
    community: number;
  }>
> {
  const session = neo4j.session();

  try {
    const result = await session.run(
      `MATCH (c:Concept)
       WHERE c.retrievalPageRank IS NOT NULL
       RETURN
         c.conceptId as conceptId,
         c.conceptTemperature as temperature,
         c.retrievalPageRank as pageRank,
         c.retrievalCommunity as community
       ORDER BY c.retrievalPageRank DESC
       LIMIT $limit`,
      { limit }
    );

    return result.records.map((rec) => ({
      conceptId: rec.get('conceptId'),
      temperature: rec.get('temperature') || 0.5,
      pageRank: rec.get('pageRank') || 0,
      community: rec.get('community') || -1
    }));
  } finally {
    await session.close();
  }
}

/**
 * Get concepts in a specific community (from Louvain).
 */
export async function getConceptsByCommunity(
  neo4j: Driver,
  communityId: number
): Promise<
  Array<{
    conceptId: string;
    temperature: number;
    pageRank: number;
  }>
> {
  const session = neo4j.session();

  try {
    const result = await session.run(
      `MATCH (c:Concept)
       WHERE c.retrievalCommunity = $communityId
       RETURN
         c.conceptId as conceptId,
         c.conceptTemperature as temperature,
         c.retrievalPageRank as pageRank
       ORDER BY c.retrievalPageRank DESC`,
      { communityId }
    );

    return result.records.map((rec) => ({
      conceptId: rec.get('conceptId'),
      temperature: rec.get('temperature') || 0.5,
      pageRank: rec.get('pageRank') || 0
    }));
  } finally {
    await session.close();
  }
}
