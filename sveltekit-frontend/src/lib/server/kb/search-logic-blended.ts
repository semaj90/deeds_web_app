import { db } from '../db/client.js';
import { entities } from '../db/schema/schema-graph.js';
import { sql } from 'drizzle-orm';

/**
 * Implements the RotorQuant / Karpathy blended ranking formula.
 * Fuses Vector score, Graph Centrality, and Recency using the new
 * Postgres Semantic Entity Graph Layer.
 */
export async function retrieveRankedEntities(vectorMatches: { id: string, score: number }[]) {
  if (vectorMatches.length === 0) return [];

  const ids = vectorMatches.map(m => m.id);

  // Fetch the graph properties for these matches
  const rows = await db.select({
    id: entities.id,
    centralityScore: entities.centralityScore,
    lastActiveAt: entities.lastActiveAt,
    // Calculate blended score in SQL
    blendedScore: sql<number>`
      (0.4 * ${entities.centralityScore}) +
      (0.2 * EXP(-0.1 * EXTRACT(EPOCH FROM (NOW() - ${entities.lastActiveAt}))/86400))
    `.as('blendedScore')
  })
  .from(entities)
  .where(sql`${entities.id} IN ${ids}`);

  const graphDataMap = new Map(rows.map(r => [r.id, r]));

  // Combine Vector score (which is provided by Qdrant/pgvector input) with Graph + Recency
  const finalResults = vectorMatches.map(match => {
    const graphData = graphDataMap.get(match.id);
    const graphScore = graphData ? graphData.blendedScore : 0;
    
    return {
      id: match.id,
      vectorScore: match.score,
      graphScore: graphScore,
      finalScore: (0.4 * match.score) + graphScore
    };
  });

  // Sort descending by finalScore
  finalResults.sort((a, b) => b.finalScore - a.finalScore);

  return finalResults;
}
