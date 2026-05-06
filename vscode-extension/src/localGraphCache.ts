/**
 * localGraphCache.ts — worker_threads-backed local graph file reader.
 * Keeps the extension host main thread unblocked for large JSON files.
 */

import * as path from 'path';
import { Worker } from 'worker_threads';

export interface GraphNode {
	id: string;
	file?: string;
	label?: string;
	cluster?: number;
	pagerank?: number;
	x?: number;
	y?: number;
}

export interface GraphEdge {
	source: string;
	target: string;
	weight?: number;
}

export interface ClusterEntry {
	id: string;
	label: string;
	members: string[];
	size?: number;
	somBmuRow?: number;
	somBmuCol?: number;
}

export interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
	clusters: ClusterEntry[];
	loadedAt: number;
}

const STALE_MS = 60_000; // re-read after 60 s

let cached: GraphData | null = null;
let loading: Promise<GraphData> | null = null;

export function load(extensionPath: string): Promise<GraphData> {
	if (cached && Date.now() - cached.loadedAt < STALE_MS) {
		return Promise.resolve(cached);
	}
	if (loading) return loading;

	const graphDir      = path.join(extensionPath, '..', 'sveltekit-frontend', 'docs', 'graph');
	const graphPath     = path.join(graphDir, 'codebase-graph.json');
	const clustersPath  = path.join(graphDir, 'hypergraph-clusters.json');
	const workerScript  = path.join(extensionPath, '..', 'vscode-extension', 'workers', 'graphParseWorker.js');

	loading = new Promise<GraphData>((resolve, reject) => {
		let worker: Worker;
		try {
			worker = new Worker(workerScript);
		} catch (err) {
			// worker_threads not available (e.g. restricted sandbox) — fall back to sync read
			loading = null;
			return resolve(syncLoad(graphPath, clustersPath));
		}

		const timer = setTimeout(() => {
			worker.terminate();
			loading = null;
			resolve(syncLoad(graphPath, clustersPath));
		}, 10_000);

		worker.on('message', (msg: { type: string; nodes: GraphNode[]; edges: GraphEdge[]; clusters: ClusterEntry[]; error?: string }) => {
			clearTimeout(timer);
			worker.terminate();
			loading = null;
			if (msg.error) {
				resolve(syncLoad(graphPath, clustersPath));
				return;
			}
			cached = { nodes: msg.nodes, edges: msg.edges, clusters: msg.clusters, loadedAt: Date.now() };
			resolve(cached);
		});

		worker.on('error', () => {
			clearTimeout(timer);
			loading = null;
			resolve(syncLoad(graphPath, clustersPath));
		});

		worker.postMessage({ type: 'parse', graphPath, clustersPath });
	});

	return loading;
}

export function invalidate() { cached = null; }

function syncLoad(graphPath: string, clustersPath: string): GraphData {
	const fs = require('fs') as typeof import('fs');
	try {
		const g = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
		const c = JSON.parse(fs.readFileSync(clustersPath, 'utf8'));
		return {
			nodes:    Array.isArray(g.nodes)    ? g.nodes    : [],
			edges:    Array.isArray(g.edges)    ? g.edges    : [],
			clusters: Array.isArray(c)          ? c          : [],
			loadedAt: Date.now(),
		};
	} catch {
		return { nodes: [], edges: [], clusters: [], loadedAt: Date.now() };
	}
}