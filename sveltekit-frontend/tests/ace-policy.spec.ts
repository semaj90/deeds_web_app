import { describe, expect, it } from 'vitest';

import {
	completeToolParameters,
	determineACEPolicy,
	shouldUseWebSearchFallback,
} from '$lib/server/ace/policy.js';

describe('ACE policy layer', () => {
	it('selects web-augmented policy when retrieval is sparse', () => {
		const decision = determineACEPolicy('Find current authority on this issue', {
			userProfile: null,
			caseContext: null,
			glossaryMatches: null,
			ragChunks: [],
			kbChunks: [],
			caseChunks: [],
			kagNeighbors: [],
			chatHistory: [],
			entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
			practiceTemplate: null,
			queryTags: [],
			webSearchContext: null,
			persona: 'neutral',
			evidenceMetadata: null,
			evidenceConnections: null,
			userAnalyticsContext: null,
			codebaseContext: null,
			policyDecision: null,
		});

		expect(decision.action).toBe('call_web_search');
		expect(decision.allowWebSearch).toBe(true);
		expect(decision.budget.tier).toBe('web_augmented');
	});

	it('uses smaller budgets when local retrieval is already strong', () => {
		const decision = determineACEPolicy('Summarize this doctrine', {
			userProfile: null,
			caseContext: null,
			glossaryMatches: [
				{
					id: 'g1',
					term: 'Doctrine',
					definition: 'Defined',
					source: 'legal_glossary',
					category: null,
					jurisdiction: null,
					citation: null,
					confidence: 0.9,
					sourceNodeId: null,
				},
			],
			ragChunks: [],
			kbChunks: [{ content: 'authoritative text', score: 0.88, source: 'kb' }],
			caseChunks: [],
			kagNeighbors: [],
			chatHistory: [],
			entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
			practiceTemplate: null,
			queryTags: [],
			webSearchContext: null,
			persona: 'neutral',
			evidenceMetadata: null,
			evidenceConnections: null,
			userAnalyticsContext: null,
			codebaseContext: null,
			policyDecision: null,
		});

		expect(decision.allowWebSearch).toBe(false);
		expect(['small', 'medium']).toContain(decision.budget.tier);
	});

	it('fills query and caseId before tool execution', () => {
		const completion = completeToolParameters('graph_expand', {}, {
			message: 'expand related evidence for this case',
			caseId: '11111111-1111-1111-1111-111111111111',
		});

		expect(completion.args.caseId).toBe('11111111-1111-1111-1111-111111111111');
		expect(completion.sources.caseId).toBe('active_case');
		expect(completion.missing).toHaveLength(0);
	});

	it('uses message text as a fallback query for web search tools', () => {
		const completion = completeToolParameters('web_search', {}, {
			message: 'latest california filing requirements',
		});

		expect(completion.args.query).toBe('latest california filing requirements');
		expect(completion.sources.query).toBe('user_message');
	});

	it('gates web search by retrieval confidence', () => {
		expect(shouldUseWebSearchFallback(0.32)).toBe(true);
		expect(shouldUseWebSearchFallback(0.81)).toBe(false);
	});
});