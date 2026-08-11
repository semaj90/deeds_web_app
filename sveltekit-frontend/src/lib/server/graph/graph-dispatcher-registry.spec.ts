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

	it('returns a stable fail-closed entry for personalized_pagerank', () => {
		const entry = getGraphDispatcherRegistryEntry('personalized_pagerank');

		expect(entry.dispatchKind).toBe('fail-closed');
		expect(entry.proofState).toBe('skipped');
		expect(entry.skipReason).toContain('fail closed');
	});

	it('is replayable as a pure registry list', () => {
		expect(listGraphDispatcherRegistry()).toHaveLength(GraphAlgorithmSchema.options.length);
	});
});
