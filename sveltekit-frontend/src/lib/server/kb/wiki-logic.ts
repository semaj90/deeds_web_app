import fs from 'node:fs';
import path from 'node:path';
import { getRedis } from '../redis.js';
import { db } from '../db/client.js';
import { enhancedGraphMappings } from '../db/schema/graph-mappings.js';
import { count, eq, sql } from 'drizzle-orm';
import { glob } from 'glob';

const GRAPH_PATH = 'docs/graph/codebase-graph.json';

export async function getWikiStatus() {
  const redis = getRedis();
  
  // 1. Page Count (Postgres enhanced_graph_mappings)
  const [mappingCount] = await db.select({ value: count() }).from(enhancedGraphMappings);
  
  // 2. Last Graphify Timestamp
  let lastGraphify = null;
  if (fs.existsSync(GRAPH_PATH)) {
    const stats = fs.statSync(GRAPH_PATH);
    lastGraphify = stats.mtime.toISOString();
  }

  // 3. Redis Stats
  const agentsKeys = await redis.keys('agents:dir:*');
  const karpathyKeys = await redis.keys('karpathy:dir:*');

  // 4. Stale Directories (placeholder logic: dirs in graph not in Redis)
  const graph = fs.existsSync(GRAPH_PATH) ? JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8')) : { directories: [] };
  const graphDirs = (graph.directories ?? []).map((d: any) => d.dir);
  const cachedDirs = new Set(agentsKeys.map(k => k.replace('agents:dir:', '').replace(/-/g, '/')));
  const staleDirs = graphDirs.filter((d: string) => !cachedDirs.has(d)).slice(0, 10);

  return {
    pageCount: mappingCount.value,
    lastGraphify,
    redis: {
      agentsCards: agentsKeys.length,
      karpathyCards: karpathyKeys.length
    },
    staleDirectories: staleDirs,
    directoryCount: graphDirs.length
  };
}

export async function searchWiki(query: string, options: { limit?: number } = {}) {
  // Pattern A: rg + Redis Karpathy blend (Placeholder for now)
  // Pattern B: codebase-graph.json metadata
  // Pattern C: Qdrant semantic search
  
  // For now, let's just do a basic Postgres/Graph search
  const results = await db.select()
    .from(enhancedGraphMappings)
    .where(sql`${enhancedGraphMappings.summary} ILIKE ${'%' + query + '%'}`)
    .limit(options.limit ?? 10);

  return results.map(r => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    path: r.path,
    summary: r.summary,
    score: 1.0 // Placeholder
  }));
}

export async function explainWikiPage(id: string) {
  const record = await db.select()
    .from(enhancedGraphMappings)
    .where(eq(enhancedGraphMappings.id, id))
    .limit(1);

  if (record.length === 0) return null;

  return {
    ...record[0],
    recommendations: ['Check related features', 'Audit dependencies'] // Placeholder
  };
}
