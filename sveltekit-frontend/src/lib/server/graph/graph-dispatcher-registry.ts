import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GraphAlgorithmSchema, type GraphAlgorithm } from './graph-analysis-types.js';

export type GraphDispatcherKind =
	| 'pagerank-adapter'
	| 'shared-community-runner'
	| 'cheirank-adapter'
	| 'kcore-adapter'
	| 'betweenness-adapter'
	| 'fail-closed';

export interface GraphDispatcherRegistryEntry {
	algorithm: GraphAlgorithm;
	dispatchKind: GraphDispatcherKind;
	algorithmRevision: string;
	proofState: 'wired' | 'skipped';
	skipReason: string | null;
}

export interface GraphDispatcherRegistrySnapshot {
	generatedAt: string;
	algorithms: GraphAlgorithm[];
	entries: GraphDispatcherRegistryEntry[];
	completeness: {
		exactMatch: boolean;
		missing: GraphAlgorithm[];
		extra: string[];
		duplicateAlgorithms: GraphAlgorithm[];
	};
	receiptId: string;
}

const GraphDispatcherRegistryEntrySchema = z
	.object({
		algorithm: GraphAlgorithmSchema,
		dispatchKind: z.enum([
			'pagerank-adapter',
			'shared-community-runner',
			'cheirank-adapter',
			'kcore-adapter',
			'betweenness-adapter',
			'fail-closed',
		]),
		algorithmRevision: z.string().min(1),
		proofState: z.enum(['wired', 'skipped']),
		skipReason: z.string().min(1).nullable(),
	})
	.strict();

const GRAPH_DISPATCHER_REGISTRY: readonly GraphDispatcherRegistryEntry[] = [
	{
		algorithm: 'pagerank',
		dispatchKind: 'pagerank-adapter',
		algorithmRevision: 'neo4j-gds-pagerank-mutate-v2',
		proofState: 'wired',
		skipReason: null,
	},
	{
		algorithm: 'cheirank',
		dispatchKind: 'cheirank-adapter',
		algorithmRevision: 'todo-cheirank-v1',
		proofState: 'wired',
		skipReason: null,
	},
	{
		algorithm: 'personalized_pagerank',
		dispatchKind: 'pagerank-adapter',
		algorithmRevision: 'neo4j-gds-personalized-pagerank-mutate-v1',
		proofState: 'wired',
		skipReason: null,
	},
	{
		algorithm: 'louvain',
		dispatchKind: 'shared-community-runner',
		algorithmRevision: 'neo4j-gds-louvain-mutate-v1',
		proofState: 'wired',
		skipReason: null,
	},
	{
		algorithm: 'leiden',
		dispatchKind: 'shared-community-runner',
		algorithmRevision: 'neo4j-gds-leiden-mutate-v1',
		proofState: 'wired',
		skipReason: null,
	},
	{
		algorithm: 'kcore',
		dispatchKind: 'kcore-adapter',
		algorithmRevision: 'todo-kcore-v1',
		proofState: 'wired',
		skipReason: null,
	},
	{
		algorithm: 'betweenness',
		dispatchKind: 'betweenness-adapter',
		algorithmRevision: 'todo-betweenness-v1',
		proofState: 'wired',
		skipReason: null,
	},
] as const;

export function listGraphDispatcherRegistry(): GraphDispatcherRegistryEntry[] {
	return GRAPH_DISPATCHER_REGISTRY.map((entry) => ({ ...entry }));
}

export function getGraphDispatcherRegistryEntry(algorithm: GraphAlgorithm): GraphDispatcherRegistryEntry {
	const entry = GRAPH_DISPATCHER_REGISTRY.find((candidate) => candidate.algorithm === algorithm);
	if (!entry) {
		throw new Error(`No graph dispatcher registry entry for algorithm '${algorithm}'`);
	}
	return { ...entry };
}

export function buildGraphDispatcherRegistrySnapshot(): GraphDispatcherRegistrySnapshot {
	const entries = listGraphDispatcherRegistry();
	const algorithms = GraphAlgorithmSchema.options as readonly GraphAlgorithm[];
	const seen = new Set<string>();
	const duplicateAlgorithms: GraphAlgorithm[] = [];
	for (const entry of entries) {
		if (seen.has(entry.algorithm)) duplicateAlgorithms.push(entry.algorithm);
		seen.add(entry.algorithm);
	}
	const missing = algorithms.filter((algorithm) => !seen.has(algorithm));
	const extra = entries
		.map((entry) => entry.algorithm)
		.filter((algorithm) => !algorithms.includes(algorithm));
	const completeness = {
		exactMatch: missing.length === 0 && extra.length === 0 && duplicateAlgorithms.length === 0 && entries.length === algorithms.length,
		missing,
		extra,
		duplicateAlgorithms,
	};
	const receiptSeed = { entries, completeness };
	return {
		generatedAt: new Date(0).toISOString(),
		algorithms: [...algorithms],
		entries: entries.map((entry) => GraphDispatcherRegistryEntrySchema.parse(entry)),
		completeness,
		receiptId: `graph-dispatcher-${createHash('sha256').update(JSON.stringify(receiptSeed)).digest('hex').slice(0, 16)}`,
	};
}
