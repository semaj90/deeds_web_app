import { db } from '../db/client.js';
import { entities, entityEdges } from '../db/schema/schema-graph.js';
import { sql } from 'drizzle-orm';

/**
 * Worker that parses AST outputs and Engram chat logs,
 * extracting entities and relationships, then upserting them
 * into the Entity Graph Layer (Postgres).
 */
export async function extractAndUpsertGraph(sourceNodes: any[]) {
  for (const node of sourceNodes) {
    // 1. Upsert Entity
    await db.insert(entities).values({
      id: node.id,
      type: node.type || 'file',
      name: node.name,
      description: node.description,
      centralityScore: node.score || 0.0,
      metadata: node.metadata || {},
    }).onConflictDoUpdate({
      target: entities.id,
      set: {
        centralityScore: node.score,
        lastActiveAt: sql`now()`,
      }
    });

    // 2. Upsert Edges
    if (node.edges && node.edges.length > 0) {
      for (const edge of node.edges) {
        await db.insert(entityEdges).values({
          sourceId: node.id,
          targetId: edge.targetId,
          relationType: edge.relationType,
          weight: edge.weight || 1.0,
        }).onConflictDoNothing();
      }
    }
  }
}
