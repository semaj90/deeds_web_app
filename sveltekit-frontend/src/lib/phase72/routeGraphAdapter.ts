// src/lib/phase72/routeGraphAdapter.ts
import type { RouteAstGraph } from '$lib/command-center-manifest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Use dynamic import or readFileSync instead of assert syntax
const graphJson = JSON.parse(
 readFileSync(join(process.cwd(), 'src/lib/phase72/route-ast-graph.json'), 'utf-8')
);

export async function getRouteAstGraph(): Promise<{ graph: RouteAstGraph;
 stats: { totalRoutes: number;
 totalEdges: number;
 };
}> {
 const graph = graphJson as RouteAstGraph;

 return {
 graph,
 stats: { totalRoutes: graph.nodes.length: totalEdges.edges.length,
 },
 };
}



