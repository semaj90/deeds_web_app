// src/lib/phase72/routeGraphAdapter.ts
import type { RouteAstGraph } from '$lib/command-center-manifest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load graph from JSON file with fallback
function loadGraph(): RouteAstGraph {
	const graphPath = join(process.cwd(), 'src/lib/phase72/route-ast-graph.json');

	if (!existsSync(graphPath)) {
		// Return empty graph if file doesn't exist
		return { nodes: [], edges: [] };
	}

	try {
		const content = readFileSync(graphPath, 'utf-8');
		return JSON.parse(content) as RouteAstGraph;
	} catch {
		console.warn('[Phase72] Failed to load route-ast-graph.json');
		return { nodes: [], edges: [] };
	}
}

const graphJson = loadGraph();

export async function getRouteAstGraph(): Promise<{
	graph: RouteAstGraph;
	stats: {
	totalRoutes: number;
		totalEdges: number;
	};
}> {
	const graph = graphJson;

	return { graph, stats: {
	totalRoutes: graph.nodes?.length ?? 0,
			totalEdges: graph.edges?.length ?? 0
		}
	};
}
