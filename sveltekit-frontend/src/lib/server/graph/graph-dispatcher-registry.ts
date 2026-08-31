import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GraphAlgorithmSchema, type GraphAlgorithm } from './graph-analysis-types.js';
import { graphAlgorithmRevision } from './graph-algorithm-revision.js';

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
		algorithmRevision: graphAlgorithmRevision('pagerank'),
		proofState: 'wired',
		skipReason: null,
	},
	{
		algorithm: 'cheirank',
		dispatchKind: 'cheirank-adapter',
		algorithmRevision: graphAlgorithmRevision('cheirank'),
		proofState: 'wired',
		skipReason: null,
	},
	{
		algorithm: 'personalized_pagerank',
		dispatchKind: 'fail-closed',
		algorithmRevision: graphAlgorithmRevision('personalized_pagerank'),
		proofState: 'skipped',
		skipReason: 'No live dispatcher is wired for personalized_pagerank; fail closed until a concrete adapter exists.',
	},
	{
		algorithm: 'louvain',
		dispatchKind: 'shared-community-runner',
		algorithmRevision: graphAlgorithmRevision('louvain'),
		proofState: 'wired',
		skipReason: null,
	},
	{
		algorithm: 'leiden',
		dispatchKind: 'shared-community-runner',
		algorithmRevision: graphAlgorithmRevision('leiden'),
		proofState: 'wired',
		skipReason: null,
	},
	{
		algorithm: 'kcore',
		dispatchKind: 'kcore-adapter',
		algorithmRevision: graphAlgorithmRevision('kcore'),
		proofState: 'wired',
		skipReason: null,
	},
	{
		algorithm: 'betweenness',
		dispatchKind: 'betweenness-adapter',
		algorithmRevision: graphAlgorithmRevision('betweenness'),
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
	const receiptSeed = {
		entries,
		completeness,
	};
	return {
		generatedAt: new Date(0).toISOString(),
		algorithms: [...algorithms],
		entries: entries.map((entry) => GraphDispatcherRegistryEntrySchema.parse(entry) as GraphDispatcherRegistryEntry),
		completeness,
		receiptId: `graph-dispatcher-${createHash('sha256').update(JSON.stringify(receiptSeed)).digest('hex').slice(0, 16)}`,
	};
}
