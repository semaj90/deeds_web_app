/**
 * graphParseWorker.js — worker_threads graph JSON parser.
 * Runs off the extension host main thread for large files (>5 MB).
 *
 * Protocol (parentPort messages):
 *   IN:  { type: 'parse', graphPath: string, clustersPath: string }
 *   OUT: { type: 'result', nodes: Node[], clusters: Cluster[], error?: string }
 */

'use strict';

const { parentPort } = require('worker_threads');
const fs = require('fs');

parentPort.on('message', msg => {
	if (msg.type !== 'parse') return;
	try {
		const graphRaw    = fs.readFileSync(msg.graphPath,    'utf8');
		const clusterRaw  = fs.readFileSync(msg.clustersPath, 'utf8');
		const graph       = JSON.parse(graphRaw);
		const clusterData = JSON.parse(clusterRaw);

		const nodes    = Array.isArray(graph.nodes)   ? graph.nodes    : [];
		const edges    = Array.isArray(graph.edges)   ? graph.edges    : [];
		const clusters = Array.isArray(clusterData)   ? clusterData    : [];

		// Build cluster→member index
		const memberMap = new Map();
		for (const n of nodes) {
			const c = n.cluster ?? n.gpuCluster ?? n.somCluster;
			if (c !== undefined && c !== null) {
				if (!memberMap.has(c)) memberMap.set(c, []);
				memberMap.get(c).push(n.id ?? n.file ?? n.label ?? '');
			}
		}

		// Enrich cluster objects with live member lists
		const enriched = clusters.map((c, i) => ({
			...c,
			id:      c.id ?? String(i),
			label:   c.label ?? c.community ?? `Cluster ${i}`,
			members: c.members ?? memberMap.get(i) ?? memberMap.get(c.id) ?? [],
		}));

		parentPort.postMessage({ type: 'result', nodes, edges, clusters: enriched });
	} catch (err) {
		parentPort.postMessage({ type: 'result', nodes: [], edges: [], clusters: [],
		                         error: err.message });
	}
});
