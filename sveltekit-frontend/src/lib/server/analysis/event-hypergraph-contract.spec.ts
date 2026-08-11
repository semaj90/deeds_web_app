import { describe, expect, it } from 'vitest';
import {
	buildAtlasEvent,
	buildAtlasEventId,
	buildEventBreadthFeatures,
	buildEventRecommendationFeatureRow,
	compareAgainstExactOracle,
	compileOntologyEventTuples,
	judgeRecommendation,
} from './event-hypergraph-contract.js';

describe('event-hypergraph contract', () => {
	it('canonicalizes n-ary events deterministically', () => {
		const input = {
			schemaVersion: 'atlas.event.hypergraph.v1' as const,
			eventType: 'call_execution' as const,
			sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
			packetKey: 'packet:1',
			treeNodeId: 'tree:1',
			workspaceRevision: 'workspace-v1',
			sourceRevision: 'source-v1',
			representationRevision: 'semantic-768-v1',
			producerId: 'ast-event-compiler',
			producerRevision: 'compiler-v1',
			canonicalizerRevision: 'canonicalizer-v1',
			compilerRevision: 'compiler-v1',
			observedAt: '2026-08-11T00:00:00.000Z',
			evidenceRefs: ['evidence:2', 'evidence:1', 'evidence:1'],
			participants: [
				{ entityId: 'function:rerankCandidates', entityKind: 'symbol', role: 'actor' as const },
				{ entityId: 'tool:semantic-card', entityKind: 'tool', role: 'tool' as const },
			],
			metadata: { source: 'tree-sitter' },
		};

		const first = buildAtlasEvent(input);
		const second = buildAtlasEvent({
			...input,
			participants: [...input.participants].reverse(),
		});

		expect(first.eventId).toBe(second.eventId);
		expect(first.evidenceRefs).toEqual(['evidence:2', 'evidence:1']);
		expect(first.participants[0]?.role).toBe('actor');
	});

	it('projects one n-ary event into canonical ontology tuples', () => {
		const event = buildAtlasEvent({
			schemaVersion: 'atlas.event.hypergraph.v1',
			eventType: 'test_execution',
			sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
			packetKey: 'packet:1',
			treeNodeId: 'tree:1',
			workspaceRevision: 'workspace-v1',
			sourceRevision: 'source-v1',
			representationRevision: 'semantic-768-v1',
			producerId: 'ast-event-compiler',
			producerRevision: 'compiler-v1',
			canonicalizerRevision: 'canonicalizer-v1',
			compilerRevision: 'compiler-v1',
			observedAt: '2026-08-11T00:00:00.000Z',
			evidenceRefs: ['evidence:1'],
			participants: [
				{ entityId: 'function:rerankCandidates', entityKind: 'symbol', role: 'actor' },
				{ entityId: 'test:rerankCandidates.spec.ts', entityKind: 'test', role: 'result' },
			],
			metadata: {},
		});

		const tuples = compileOntologyEventTuples(event);

		expect(tuples).toHaveLength(2);
		expect(tuples[0]?.eventId).toBe(event.eventId);
		expect(tuples[0]?.subjectId).toBe(event.eventId);
		expect(tuples[0]?.predicate).toBe('participant:actor');
	});

	it('builds breadth features and a recommendation judgment from normalized signals', () => {
		const breadth = buildEventBreadthFeatures({
			packetKey: 'packet:1',
			workflowIds: ['workflow:1', 'workflow:1', 'workflow:2'],
			taskIds: ['task:1'],
			symbolIds: ['symbol:1', 'symbol:2'],
			sessionIds: ['session:1', 'session:1', 'session:2'],
			userIds: ['user:1'],
			processIds: ['process:1', 'process:2'],
			eventTypes: ['call_execution', 'test_execution', 'call_execution'],
			neighborhoodIds: ['hop:1', 'hop:2'],
			telemetryRevision: 'telemetry-v1',
		});

		expect(breadth.workflowBreadth).toBe(2);
		expect(breadth.sessionBreadth).toBe(2);
		expect(breadth.userBreadth).toBe(1);
		expect(breadth.processBreadth).toBe(2);
		expect(breadth.eventTypeBreadth).toBe(2);

		const featureRow = buildEventRecommendationFeatureRow({
			eventId: 'evt:1',
			candidateKey: 'candidate:1',
			packetKey: 'packet:1',
			semanticScore: 0.9,
			structuralScore: 0.85,
			graphScore: 0.7,
			workflowScore: 0.75,
			breadthScore: 0.6,
			approximationScore: 0.1,
			utilityBias: 0.1,
			tokenCost: 150,
			latencyMs: 20,
			evidenceCoverage: 0.9,
			freshnessScore: 0.8,
			featureRevision: 'feature-v1',
			graphRevision: 'graph-v1',
			eventRevision: 'event-v1',
		});

		const judgment = judgeRecommendation({
			...featureRow,
			policyRevision: 'policy-v1',
		});

		expect(judgment.score).toBeGreaterThan(0.5);
		expect(judgment.action).not.toBe('skip');
		expect(judgment.policyRevision).toBe('policy-v1');
	});

	it('compares approximate and exact candidate sets against an oracle', () => {
		const oracle = compareAgainstExactOracle({
			k: 3,
			candidateKeys: ['a', 'b', 'x'],
			exactKeys: ['a', 'c', 'd'],
		});

		expect(oracle.intersectionKeys).toEqual(['a']);
		expect(oracle.recallAtK).toBeCloseTo(1 / 3, 5);
		expect(oracle.precisionAtK).toBeCloseTo(1 / 3, 5);
		expect(oracle.falseExclusions).toContain('c');
		expect(oracle.falseInclusions).toContain('x');
	});
});
