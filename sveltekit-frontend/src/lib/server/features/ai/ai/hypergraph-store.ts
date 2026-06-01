/**
 * hypergraph-store.ts — Unified "Lane 1" storage for interactive agent sessions.
 *
 * This implements the "Hypergraph Store" concept for Lane 1 (Interactive Agent Lane),
 * linking tasks, inferences, knowledge context, and outcomes into a traversable graph.
 */

import { getNeo4jDriver } from '../../../neo4j-driver.js';
import { db } from '../../../db/client.js';
import { eq } from 'drizzle-orm';
import type { OllamaMessage } from '../../../ollama.js';
import { agentSessions } from '../../../db/schema.js';

export enum AgentLane {
  Interactive = 'interactive-agent',
  Analysis = 'background-analysis',
  Maintenance = 'repo-maintenance'
}

export type TaskType =
  | 'fix-recommender'
  | 'wiki-generation'
  | 'streaming-chat'
  | 'tool-calling-loop'
  | 'scene-intent-extraction'
  | 'vlm-escalation';

export interface HyperedgeSession {
  sessionId: string;
  lane: AgentLane;
  taskType: TaskType;
  startTime: number;
  endTime?: number;
  status: 'active' | 'completed' | 'failed';
  metadata: Record<string, any>;
}

/**
 * Records an interactive session start in the Hypergraph (Neo4j)
 * and the Audit Log (Postgres).
 */
export async function recordSessionStart(session: Omit<HyperedgeSession, 'status'>): Promise<void> {
  const driver = getNeo4jDriver();
  const neoSession = driver.session({ database: 'neo4j' });

  try {
    // 1. Create Hyperedge Node in Neo4j
    await neoSession.run(`
      MERGE (s:InteractiveSession {id: $sessionId})
      SET s.lane = $lane,
          s.taskType = $taskType,
          s.startTime = $startTime,
          s.status = 'active',
          s.createdAt = datetime()
    `, {
      sessionId: session.sessionId,
      lane: session.lane,
      taskType: session.taskType,
      startTime: session.startTime
    });

    // 2. Audit log in Postgres via Drizzle
    await db.insert(agentSessions).values({
      sessionId: session.sessionId,
      lane: session.lane,
      taskType: session.taskType,
      status: 'active',
      metadata: session.metadata,
      startTime: new Date(session.startTime),
    }).onConflictDoUpdate({
      target: agentSessions.sessionId,
      set: { status: 'active', updatedAt: new Date() }
    });

    console.log(`[hypergraph] Session started: ${session.sessionId} (Lane: ${session.lane})`);
  } catch (error) {
    console.error(`[hypergraph] Failed to record session start:`, error);
  } finally {
    await neoSession.close();
  }
}

/**
 * Links a Knowledge Chunk or File to a Session in the Hypergraph.
 */
export async function linkKnowledgeToSession(sessionId: string, filePath: string, relevance: number = 1.0): Promise<void> {
  const driver = getNeo4jDriver();
  const neoSession = driver.session({ database: 'neo4j' });

  try {
    await neoSession.run(`
      MATCH (s:InteractiveSession {id: $sessionId})
      MERGE (f:File {path: $filePath})
      MERGE (s)-[r:CONSULTED {relevance: $relevance}]->(f)
      SET r.timestamp = datetime()
    `, { sessionId, filePath, relevance });
  } catch (error) {
    console.warn(`[hypergraph] Failed to link knowledge: ${filePath}`, error);
  } finally {
    await neoSession.close();
  }
}

/**
 * Links an external Research Chunk (Lane 3) to a Session.
 */
export async function linkResearchToSession(sessionId: string, chunkUrl: string, source: string, relevance: number = 1.0): Promise<void> {
  const driver = getNeo4jDriver();
  const neoSession = driver.session({ database: 'neo4j' });

  try {
    await neoSession.run(`
      MERGE (s:InteractiveSession {id: $sessionId})
      MERGE (r:ResearchSource {url: $chunkUrl})
      SET r.source = $source
      MERGE (s)-[rel:CONSULTED_RESEARCH]->(r)
      SET rel.relevance = $relevance, rel.timestamp = datetime()
    `, { sessionId, chunkUrl, source, relevance });
  } catch (error) {
    console.warn(`[hypergraph] Failed to link research: ${chunkUrl}`, error);
  } finally {
    await neoSession.close();
  }
}

export async function linkResearchBatchToSession(
  sessionId: string,
  researchChunks: Array<{ url: string; source: string; relevance?: number }>
): Promise<void> {
  if (researchChunks.length === 0) {
    return;
  }

  const dedupedChunks = Array.from(
    new Map(
      researchChunks.map((chunk) => [
        chunk.url,
        {
          url: chunk.url,
          source: chunk.source,
          relevance: chunk.relevance ?? 1.0,
        },
      ])
    ).values()
  );

  const driver = getNeo4jDriver();
  const neoSession = driver.session({ database: 'neo4j' });

  try {
    await neoSession.run(
      `
        MERGE (s:InteractiveSession {id: $sessionId})
      `,
      { sessionId }
    );

    for (const chunk of dedupedChunks) {
      const existingResult = await neoSession.run(
        `
          MATCH (r:ResearchSource {url: $chunkUrl})
          RETURN elementId(r) AS nodeId
          LIMIT 1
        `,
        { chunkUrl: chunk.url }
      );

      let nodeId = existingResult.records[0]?.get('nodeId') as string | undefined;

      if (!nodeId) {
        const createdResult = await neoSession.run(
          `
            CREATE (r:ResearchSource {url: $chunkUrl, source: $source})
            RETURN elementId(r) AS nodeId
          `,
          { chunkUrl: chunk.url, source: chunk.source }
        );

        nodeId = createdResult.records[0]?.get('nodeId') as string | undefined;
      }

      if (!nodeId) {
        continue;
      }

      await neoSession.run(
        `
          MERGE (s:InteractiveSession {id: $sessionId})
          WITH s
          MATCH (r)
          WHERE elementId(r) = $nodeId
          SET r.source = $source
          MERGE (s)-[rel:CONSULTED_RESEARCH]->(r)
          SET rel.relevance = $relevance, rel.timestamp = datetime()
        `,
        {
          sessionId,
          nodeId,
          source: chunk.source,
          relevance: chunk.relevance,
        }
      );
    }
  } catch (error) {
    console.warn(`[hypergraph] Failed to link research batch for session: ${sessionId}`, error);
  } finally {
    await neoSession.close();
  }
}

/**
 * Records an Inference Step (Message) in the session.
 */
export async function recordInferenceStep(sessionId: string, message: OllamaMessage, latencyMs: number): Promise<void> {
  const driver = getNeo4jDriver();
  const neoSession = driver.session({ database: 'neo4j' });

  try {
    await neoSession.run(`
      MATCH (s:InteractiveSession {id: $sessionId})
      CREATE (i:Inference {
        role: $role,
        content_hash: $contentHash,
        latencyMs: $latencyMs,
        timestamp: datetime()
      })
      MERGE (s)-[:STEP]->(i)
    `, {
      sessionId,
      role: message.role,
      contentHash: Buffer.from(message.content).slice(0, 32).toString('hex'), // Lightweight hash
      latencyMs
    });
  } catch (error) {
    console.warn(`[hypergraph] Failed to record inference step`, error);
  } finally {
    await neoSession.close();
  }
}

/**
 * Finalizes the session and records the outcome.
 */
export async function finalizeSession(sessionId: string, status: 'completed' | 'failed', outcome?: string): Promise<void> {
  const driver = getNeo4jDriver();
  const neoSession = driver.session({ database: 'neo4j' });

  try {
    await neoSession.run(`
      MATCH (s:InteractiveSession {id: $sessionId})
      SET s.status = $status,
          s.endTime = $endTime,
          s.outcome = $outcome
    `, {
      sessionId,
      status,
      endTime: Date.now(),
      outcome: outcome || null
    });

    await db.update(agentSessions)
      .set({
        status,
        endTime: new Date(),
        updatedAt: new Date(),
        outcome: outcome || null
      })
      .where(eq(agentSessions.sessionId, sessionId));
  } finally {
    await neoSession.close();
  }
}
