import { ENV } from '$lib/server/env.server.js';
import {
  GRAPH_EXPAND_NEO4J_TIMEOUT_MS,
  graphAnalysisNeighborhoodInputSchema,
  graphShortestPathInputSchema,
  serializeBoundedReadResult,
} from '../read-tool-bounds.js';

async function getNeo4j() {
  const neo4j = await import('neo4j-driver');
  const driver = neo4j.default.driver(
    ENV.NEO4J_URI,
    neo4j.default.auth.basic(
      ENV.NEO4J_USER,
      ENV.NEO4J_PASSWORD
    )
  );
  return { driver, readAccessMode: neo4j.default.session.READ };
}

export const graphExpandNeighborhoodTool = {
  name: 'graph.expand_neighborhood',
  description: 'Expand a file node\'s import/export neighborhood in the Neo4j codebase graph. Returns adjacent nodes with their cluster, authority score, and SOM position. Use after topology_search to deepen a promising hit.',
  parameters: graphAnalysisNeighborhoodInputSchema.describe('Bounded, read-only graph neighborhood lookup.'),
  execute: async (args: { path: string; hops?: number; direction?: string; limit?: number }) => {
    const { driver, readAccessMode } = await getNeo4j();
    const session = driver.session({ defaultAccessMode: readAccessMode });
    try {
      const hops = args.hops ?? 2;
      const limit = args.limit ?? 30;
      const rel = args.direction === 'imports' ? '-[:IMPORTS]->' :
                  args.direction === 'importedBy' ? '<-[:IMPORTS]-' : '-[:IMPORTS]-';
      const { records } = await session.run(
        `MATCH (start:CodebaseFile {filePath: $path})
         MATCH (start)${rel}(neighbor:CodebaseFile)
         WHERE neighbor.filePath <> $path
         RETURN neighbor.filePath AS path,
                neighbor.cluster AS cluster,
                neighbor.gpuCluster AS gpuCluster,
                neighbor.authorityScore AS authorityScore,
                neighbor.somBmuRow AS somRow,
                neighbor.somBmuCol AS somCol,
                neighbor.topoByte AS topoByte
         LIMIT $limit`,
        { path: args.path, limit },
        { timeout: GRAPH_EXPAND_NEO4J_TIMEOUT_MS },
      );
      const nodes = records.map(r => ({
        path: r.get('path'),
        cluster: r.get('cluster'),
        gpuCluster: r.get('gpuCluster'),
        authorityScore: r.get('authorityScore'),
        somRow: r.get('somRow'),
        somCol: r.get('somCol'),
        topoByte: r.get('topoByte'),
      }));
      return serializeBoundedReadResult({ path: args.path, hops, totalNeighbors: nodes.length, nodes });
    } finally {
      await session.close();
      await driver.close();
    }
  },
} as const;

export const graphShortestPathTool = {
  name: 'graph.shortest_path',
  description: 'Find the shortest import path between two files in the Neo4j codebase graph. Useful for understanding dependency chains and coupling.',
  parameters: graphShortestPathInputSchema.describe('Bounded, read-only shortest import path lookup.'),
  execute: async (args: { from: string; to: string; maxHops?: number }) => {
    const { driver, readAccessMode } = await getNeo4j();
    const session = driver.session({ defaultAccessMode: readAccessMode });
    try {
      const maxHops = args.maxHops ?? 6;
      const { records } = await session.run(
        `MATCH (a:CodebaseFile {filePath: $from}), (b:CodebaseFile {filePath: $to}),
               p = shortestPath((a)-[:IMPORTS*..${maxHops}]->(b))
         RETURN [n IN nodes(p) | n.filePath] AS path, length(p) AS hops`,
        { from: args.from, to: args.to },
        { timeout: GRAPH_EXPAND_NEO4J_TIMEOUT_MS },
      );
      if (!records.length) return serializeBoundedReadResult({ found: false, from: args.from, to: args.to });
      const rec = records[0];
      return serializeBoundedReadResult({
        found: true,
        from: args.from,
        to: args.to,
        hops: rec.get('hops'),
        path: rec.get('path'),
      });
    } finally {
      await session.close();
      await driver.close();
    }
  },
} as const;
