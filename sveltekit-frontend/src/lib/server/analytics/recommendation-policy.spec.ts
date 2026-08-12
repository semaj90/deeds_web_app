import { describe, expect, it } from 'vitest';

import { policyDecisionReceiptEventSchema, recommendationSignalEventSchema } from '$lib/server/queue/event-fabric.js';

import {
	RecommendationPolicyResultSchema,
	buildRecommendationPolicyResults,
} from './recommendation-policy.js';

describe('recommendation policy', () => {
	it('selects the strongest candidate and produces validated envelopes deterministically', () => {
		const input = {
			policyRevision: 'policy-v1',
			eventRevision: 'event-v1',
			featureRevision: 'feature-v1',
			generatedAt: '2026-08-12T00:00:00.000Z',
			traceId: 'trace-1',
			sourceRef: 'src/lib/server/analytics/recommendation-policy.ts',
			maxResults: 1,
			candidates: [
				{
					eventId: 'evt-high',
					candidateKey: 'candidate-high',
					packetKey: 'packet-high',
					semanticScore: 0.95,
					structuralScore: 0.9,
					graphScore: 0.88,
					workflowScore: 0.9,
					breadthScore: 0.85,
					approximationScore: 0.05,
					utilityBias: 0.2,
					tokenCost: 80,
					latencyMs: 40,
					evidenceCoverage: 0.95,
					freshnessScore: 0.92,
					featureRevision: 'feature-v1',
					graphRevision: 'graph-v1',
					eventRevision: 'event-v1',
				},
				{
					eventId: 'evt-low',
					candidateKey: 'candidate-low',
					packetKey: 'packet-low',
					semanticScore: 0.2,
					structuralScore: 0.15,
					graphScore: 0.1,
					workflowScore: 0.1,
					breadthScore: 0.1,
					approximationScore: 0.7,
					utilityBias: -0.2,
					tokenCost: 2500,
					latencyMs: 500,
					evidenceCoverage: 0.1,
					freshnessScore: 0.1,
					featureRevision: 'feature-v1',
					graphRevision: 'graph-v1',
					eventRevision: 'event-v1',
				},
			],
		} as const;

		const first = buildRecommendationPolicyResults(input);
		const second = buildRecommendationPolicyResults(input);

		expect(first).toHaveLength(1);
		expect(second).toHaveLength(1);
		expect(first[0]?.decisionId).toBe(second[0]?.decisionId);
		expect(first[0]?.featureRow.candidateKey).toBe('candidate-high');
		expect(first[0]?.signal.payload.action).toBe('PREFILL');

		expect(RecommendationPolicyResultSchema.parse(first[0])).toEqual(first[0]);
		expect(recommendationSignalEventSchema.parse(first[0]?.signal)).toEqual(first[0]?.signal);
		expect(policyDecisionReceiptEventSchema.parse(first[0]?.receipt)).toEqual(first[0]?.receipt);
		expect(first[0]?.receipt.payload.decisionId).toBe(first[0]?.decisionId);
		expect(first[0]?.receipt.payload.recommendationEventId).toBe(first[0]?.signal.eventId);
	});

	it('rejects invalid inputs with zod validation', () => {
		expect(() =>
			buildRecommendationPolicyResults({
				policyRevision: 'policy-v1',
				eventRevision: 'event-v1',
				featureRevision: 'feature-v1',
				candidates: [],
			}),
		).toThrow();
	});
});
