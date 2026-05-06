import { z } from 'zod';

async function getNeo4j() {
  const neo4j = await import('neo4j-driver');
  const driver = neo4j.default.driver(
    process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    neo4j.default.auth.basic(
      process.env.NEO4J_USER ?? 'neo4j',
      process.env.NEO4J_PASSWORD ?? 'neo4j123'
    )
  );
  return driver;
}

export const graphExpandNeighborhoodTool = {
  name: 'graph.expand_neighborhood',
  description: 'Expand a file node\'s import/export neighborhood in the Neo4j codebase graph. Returns adjacent nodes with their cluster, authority score, and SOM position. Use after topology_search to deepen a promising hit.',
  parameters: z.object({
    path: z.string().describe('File path (e.g. src/lib/server/ace/context-assembler.ts)'),
    hops: z.number().int().min(1).max(3).default(2).optional().describe('Graph traversal depth'),
    direction: z.enum(['both', 'imports', 'importedBy']).default('both').optional(),
    limit: z.number().int().min(1).max(100).default(30).optional(),
  }),
  execute: async (args: { path: string; hops?: number; direction?: string; limit?: number }) => {
    const driver = await getNeo4j();
    const session = driver.session();
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
        { path: args.path, limit }
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
      return JSON.stringify({ path: args.path, hops, totalNeighbors: nodes.length, nodes });
    } finally {
      await session.close();
      await driver.close();
    }
  },
} as const;

export const graphShortestPathTool = {
  name: 'graph.shortest_path',
  description: 'Find the shortest import path between two files in the Neo4j codebase graph. Useful for understanding dependency chains and coupling.',
  parameters: z.object({
    from: z.string().describe('Source file path'),
    to: z.string().describe('Target file path'),
    maxHops: z.number().int().min(1).max(10).default(6).optional(),
  }),
  execute: async (args: { from: string; to: string; maxHops?: number }) => {
    const driver = await getNeo4j();
    const session = driver.session();
    try {
      const maxHops = args.maxHops ?? 6;
      const { records } = await session.run(
        `MATCH (a:CodebaseFile {filePath: $from}), (b:CodebaseFile {filePath: $to}),
               p = shortestPath((a)-[:IMPORTS*..${maxHops}]->(b))
         RETURN [n IN nodes(p) | n.filePath] AS path, length(p) AS hops`,
        { from: args.from, to: args.to }
      );
      if (!records.length) return JSON.stringify({ found: false, from: args.from, to: args.to });
      const rec = records[0];
      return JSON.stringify({
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
