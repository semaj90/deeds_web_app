import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import neo4j, { type Driver } from 'neo4j-driver';
import type { RequestHandler } from './$types';
import { randomUUID } from 'node:crypto';

type GraphNode = {
  id: string;
  label: string;
  type: string;
  meta: Record<string, unknown>;
};

type GraphLink = {
  id: string;
  source: string;
  target: string;
  score: number;
};

let cachedDriver: Driver | null = null;

function getDriver(): Driver {
  if (cachedDriver) return cachedDriver;
  const uri = env.NEO4J_URI || env.NEO4J_URL || 'bolt://localhost:7687';
  const user = env.NEO4J_USER || env.NEO4J_USERNAME || 'neo4j';
  const password = env.NEO4J_PASSWORD || env.NEO4J_PASS || 'password';

  cachedDriver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    disableLosslessIntegers: true
  });
  return cachedDriver;
}

export const GET: RequestHandler = async () => {
  try {
    const driver = getDriver();
    const session = driver.session();
    try {
      const result = await session.run(
        `
        MATCH (a:Evidence)-[r:SIMILAR]-(b:Evidence)
        RETURN
          a { .id, .title, .type } AS source,
          b { .id, .title, .type } AS target,
          COALESCE(r.score, r.weight, r.similarity, 0.5) AS score
        LIMIT $limit
        `,
        { limit: 250 }
      );

      const nodeMap = new Map<string, GraphNode>();
      const links: GraphLink[] = [];

      for (const record of result.records) {
        const source = (record.get('source') ?? {}) as Record<string, unknown>;
        const target = (record.get('target') ?? {}) as Record<string, unknown>;
        const scoreValue = Number(record.get('score') ?? 0.5) || 0.5;

        const sourceId = String(source?.id ?? randomUUID());
        const targetId = String(target?.id ?? randomUUID());

        if (!nodeMap.has(sourceId)) {
          nodeMap.set(sourceId, {
            id: sourceId,
            label: String(source?.title ?? sourceId),
            type: String(source?.type ?? 'evidence').toLowerCase(),
            meta: source
          });
        }

        if (!nodeMap.has(targetId)) {
          nodeMap.set(targetId, {
            id: targetId,
            label: String(target?.title ?? targetId),
            type: String(target?.type ?? 'evidence').toLowerCase(),
            meta: target
          });
        }

        // Avoid duplicate undirected links by ordering ids
        const linkKey =
          sourceId < targetId
            ? `${sourceId}:${targetId}`
            : `${targetId}:${sourceId}`;

        if (!links.find((link) => link.id === linkKey)) {
          links.push({
            id: linkKey,
            source: sourceId,
            target: targetId,
            score: Math.min(Math.max(scoreValue, 0), 1)
          });
        }
      }

      return json({
        nodes: Array.from(nodeMap.values()),
        links
      });
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error('Neo4j graph fetch failed:', error);
    return json(
      {
        nodes: [],
        links: [],
        error: 'Neo4j graph unavailable'
      },
      { status: 200 }
    );
  }
};

export const prerender = false;
