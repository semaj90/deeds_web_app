import { QdrantManager } from '../vector/qdrant-manager.js';
import { getNeo4jDriver } from '../neo4j-driver.js';
import { db } from '../db/client.js';
import { enhancedGraphMappings } from '../db/schema/graph-mappings.js';
import { eq, or, ilike, sql } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

export interface PentagonTrace {
  query: string;
  seedHits: number;
  implementationNodes: number;
  dependencyNodes: number;
  interfaceNodes: number;
  storageNodes: number;
  agentsContextUsed: boolean;
  recommendations: string[];
}

export async function executePentagonSearch(query: string, options: { limit?: number; dryRun?: boolean } = {}) {
  const limit = options.limit ?? 10;
  const dryRun = options.dryRun ?? false;
  const qdrant = new QdrantManager();
  const neo4j = getNeo4jDriver();
  
  const trace: PentagonTrace = {
    query,
    seedHits: 0,
    implementationNodes: 0,
    dependencyNodes: 0,
    interfaceNodes: 0,
    storageNodes: 0,
    agentsContextUsed: false,
    recommendations: []
  };

  // 1. Pillar: Semantic Seed (Qdrant)
  // (In a real implementation we would embed the query first)
  // For now, we simulate hits or use Postgres lexical as a fallback
  const mappings = await db.select()
    .from(enhancedGraphMappings)
    .where(or(
      ilike(enhancedGraphMappings.label, `%${query}%`),
      ilike(enhancedGraphMappings.summary, `%${query}%`)
    ))
    .limit(limit);
  
  trace.seedHits = mappings.length;

  // 2. Pillar: Implementation (Resolve files/routes)
  const implFiles = mappings.filter(m => m.kind === 'file' || m.kind === 'route');
  trace.implementationNodes = implFiles.length;

  // 3. Pillar: Dependency (Neo4j / Imports)
  if (implFiles.length > 0) {
    const session = neo4j.session();
    try {
      const result = await session.run(
        `MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile)
         WHERE a.id IN $ids OR b.id IN $ids
         RETURN count(DISTINCT b) as count`,
        { ids: implFiles.map(f => f.id) }
      );
      trace.dependencyNodes = result.records[0].get('count').toNumber();
    } finally {
      await session.close();
    }
  }

  // 4. Pillar: Interface (Proto / gRPC)
  const interfaceKeywords = ['proto', 'grpc', 'interface', 'service', 'client'];
  const hasInterfaceRef = mappings.some(m => 
    interfaceKeywords.some(kw => m.label.toLowerCase().includes(kw) || m.summary.toLowerCase().includes(kw))
  );
  if (hasInterfaceRef) trace.interfaceNodes = 2; // Simulated count

  // 5. Pillar: Storage (Schema / Redis / JSONB)
  const storageKeywords = ['schema', 'redis', 'db', 'table', 'jsonb', 'postgres'];
  const hasStorageRef = mappings.some(m => 
    storageKeywords.some(kw => m.label.toLowerCase().includes(kw) || m.summary.toLowerCase().includes(kw))
  );
  if (hasStorageRef) trace.storageNodes = 3; // Simulated count

  // Recommendations logic
  if (trace.interfaceNodes > 0) trace.recommendations.push("Review proto for interface alignment");
  if (trace.storageNodes > 0) trace.recommendations.push("Verify schema JSONB consistency");
  if (trace.seedHits === 0) trace.recommendations.push("Broaden search query for better semantic coverage");

  // Save trace
  if (!dryRun) {
    await savePentagonTrace(trace);
  }

  return {
    mappings,
    trace
  };
}

async function savePentagonTrace(trace: PentagonTrace) {
  const dir = 'logs/pentagon-search';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const latestPath = path.join(dir, 'latest.json');
  const runsPath = path.join(dir, 'runs.jsonl');
  
  fs.writeFileSync(latestPath, JSON.stringify(trace, null, 2));
  fs.appendFileSync(runsPath, JSON.stringify({ ...trace, timestamp: new Date().toISOString() }) + '\n');
}
