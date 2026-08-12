import { describe, expect, it } from 'vitest';

import {
	DailyGraphifyBoardRecommendationSchema,
	buildDailyGraphifyBoardRecommendations,
} from './daily-graphify-board-recommendations.js';

describe('daily graphify board recommendations', () => {
	it('ranks board tasks into validated kanban recommendations', async () => {
		const board = {
			generated: '2026-08-12T00:00:00.000Z',
			collection: 'deeds-web-app',
			boardSource: 'docs/graph/kanban-board.json',
			recommendationSource: 'daily-graphify',
			workflowState: 'live',
			recommendationPromotion: {
				proposalCount: 0,
				promotedCount: 0,
				reviewRequiredCount: 0,
			},
			columns: [
				{
					id: 'backlog',
					label: 'Backlog',
					tasks: [
						{
							id: 'graphify-daily-refresh',
							priority: 'P0' as const,
							label: 'Refresh Graphify daily',
							script: 'npm run graphify daily',
							gate: 'Graphify freshness proof',
							blockedBy: [],
							status: 'READY',
							origin: 'daily_graphify',
							source_ref: 'src/lib/server/atlas/board/daily-graphify-board.ts',
							tree_node_id: 'tree:daily-graphify',
							packet_key: 'packet:daily-graphify',
							evidence_refs: ['evidence:graphify'],
							reason_codes: ['FRESHNESS'],
							confidence: 0.94,
						},
						{
							id: 'classifier-validator',
							priority: 'P2' as const,
							label: 'Schema validator for classifier output',
							script: 'npm run test:classifier',
							gate: 'Zod validation proof',
							blockedBy: ['graphify-daily-refresh'],
							status: 'BLOCKED',
							origin: 'atlas_recommendation',
							source_ref: 'src/lib/server/atlas/domain-taxonomy.ts',
							tree_node_id: 'tree:classifier',
							packet_key: null,
							evidence_refs: ['evidence:classifier'],
							reason_codes: ['SCHEMA_VALIDATION'],
							confidence: 0.67,
						},
					],
				},
			],
			promotedRecommendations: [],
			reviewRequiredRecommendations: [],
			temporalRecommendations: [],
			workflowDag: [],
			warnings: [],
		} as const;

		const first = await buildDailyGraphifyBoardRecommendations(board);
		const second = await buildDailyGraphifyBoardRecommendations(board);

		expect(first).toHaveLength(2);
		expect(first[0]?.taskId).toBe('graphify-daily-refresh');
		expect(first[0]?.retrievalMode).toBe('sparse');
		expect(first[0]?.domainClassification.primary_label).toBeTruthy();
		expect(first[0]?.posTaggerOutput.part_of_speech).toBeTruthy();
		expect(first[0]?.featureMatrixSetup.semantic_dimension).toBe(768);
		expect(first[0]?.policyResult.receipt.payload.decisionId).toBe(first[0]?.policyResult.decisionId);
		expect(second[0]?.policyResult.receipt.payload.decisionId).toBe(first[0]?.policyResult.decisionId);
		expect(DailyGraphifyBoardRecommendationSchema.parse(first[0])).toEqual(first[0]);
	});
});
