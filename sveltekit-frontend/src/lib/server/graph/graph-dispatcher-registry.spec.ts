import { describe, expect, it } from 'vitest';
import { GraphAlgorithmSchema } from './graph-analysis-types.js';
import {
	buildGraphDispatcherRegistrySnapshot,
	getGraphDispatcherRegistryEntry,
	listGraphDispatcherRegistry,
} from './graph-dispatcher-registry.js';

describe('graph dispatcher registry', () => {
	it('covers every graph algorithm exactly once', () => {
		const snapshot = buildGraphDispatcherRegistrySnapshot();
		expect(snapshot.completeness.exactMatch).toBe(true);
		expect(snapshot.completeness.missing).toEqual([]);
		expect(snapshot.completeness.extra).toEqual([]);
		expect(snapshot.completeness.duplicateAlgorithms).toEqual([]);
		expect(snapshot.entries.map((entry) => entry.algorithm)).toEqual(GraphAlgorithmSchema.options);
	});

	it('routes personalized_pagerank through the PageRank adapter', () => {
		const entry = getGraphDispatcherRegistryEntry('personalized_pagerank');
		expect(entry.dispatchKind).toBe('pagerank-adapter');
		expect(entry.proofState).toBe('wired');
		expect(entry.algorithmRevision).toBe('neo4j-gds-personalized-pagerank-mutate-v1');
	});

	it('is replayable as a pure registry list', () => {
		expect(listGraphDispatcherRegistry()).toHaveLength(GraphAlgorithmSchema.options.length);
	});
});
