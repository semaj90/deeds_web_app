import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
	buildEventRecommendationFeatureRow,
	judgeRecommendation,
	type EventRecommendationFeatureRow,
	type RecommendationJudgment,
	RecommendationJudgmentSchema,
	EventRecommendationFeatureRowSchema,
} from '$lib/server/analysis/event-hypergraph-contract.js';
import {
	policyDecisionReceiptEventSchema,
	recommendationSignalEventSchema,
	type PolicyDecisionReceiptEventV1,
	type RecommendationSignalEventV1,
} from '$lib/server/queue/event-fabric.js';

const RecommendationPolicyInputSchema = z.object({
	policyRevision: z.string().min(1),
	eventRevision: z.string().min(1),
	featureRevision: z.string().min(1),
	generatedAt: z.string().datetime().optional(),
	traceId: z.string().min(1).optional(),
	sourceRef: z.string().min(1).optional(),
	maxResults: z.number().int().positive().max(16).default(5),
	candidates: z.array(EventRecommendationFeatureRowSchema).min(1).max(64),
});

export type RecommendationPolicyInput = z.infer<typeof RecommendationPolicyInputSchema>;

export const RecommendationPolicyResultSchema = z
	.object({
		decisionId: z.string().min(1),
		featureRow: EventRecommendationFeatureRowSchema,
		judgment: RecommendationJudgmentSchema,
		signal: recommendationSignalEventSchema,
		receipt: policyDecisionReceiptEventSchema,
	})
	.strict();

export type RecommendationPolicyResult = z.infer<typeof RecommendationPolicyResultSchema>;

function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
	return JSON.stringify(value, (_key, item) => {
		if (Array.isArray(item)) return item;
		if (item && typeof item === 'object') {
			return Object.keys(item as Record<string, unknown>)
				.sort()
				.reduce<Record<string, unknown>>((acc, key) => {
					acc[key] = (item as Record<string, unknown>)[key];
					return acc;
				}, {});
		}
		return item;
	});
}

function buildDecisionId(input: {
	policyRevision: string;
	eventRevision: string;
	featureRevision: string;
	featureRow: EventRecommendationFeatureRow;
	judgment: RecommendationJudgment;
}): string {
	return `rec:${sha256Hex(stableJson(input)).slice(0, 24)}`;
}

function mapJudgmentToSignalAction(
	action: RecommendationJudgment['action']
): 'PREFETCH' | 'PREFILL' | 'BOOST' | 'KEEP_HOT' | 'DEMOTE' {
	switch (action) {
		case 'inspect':
			return 'BOOST';
		case 'test':
			return 'PREFILL';
		case 'index':
			return 'BOOST';
		case 'graph_expand':
			return 'PREFILL';
		case 'repair':
			return 'PREFETCH';
		case 'refactor':
			return 'KEEP_HOT';
		case 'document':
			return 'KEEP_HOT';
		case 'skip':
		default:
			return 'DEMOTE';
	}
}

function buildSignal(event: {
	featureRow: EventRecommendationFeatureRow;
	judgment: RecommendationJudgment;
	traceId?: string;
	sourceRef?: string;
}): RecommendationSignalEventV1 {
	const targetType = event.featureRow.packetKey ? 'packet' : 'task';
	const targetId = event.featureRow.packetKey ?? event.featureRow.candidateKey;

	return recommendationSignalEventSchema.parse({
		eventId: randomUUID(),
		eventType: 'recommendation.signal',
		occurredAt: event.judgment.generatedAt,
		traceId: event.traceId,
		sourceRef: event.sourceRef ?? event.featureRow.packetKey ?? event.featureRow.candidateKey,
		payload: {
			candidateId: event.featureRow.candidateKey,
			targetType,
			targetId,
			action: mapJudgmentToSignalAction(event.judgment.action),
			score: event.judgment.score,
			confidence: Math.max(0, Math.min(1, Number((event.judgment.score * 0.9 + 0.05).toFixed(6)))),
			utility: event.featureRow.evidenceCoverage ?? undefined,
			sourceEvidenceRefs: event.featureRow.packetKey ? [event.featureRow.packetKey] : [],
			featureRevision: event.featureRow.featureRevision,
			graphRevision: event.featureRow.graphRevision ?? undefined,
			modelRevision: undefined,
			expiresAt: undefined,
		},
	});
}

function buildReceipt(event: {
	featureRow: EventRecommendationFeatureRow;
	judgment: RecommendationJudgment;
	signal: RecommendationSignalEventV1;
	traceId?: string;
	sourceRef?: string;
}): PolicyDecisionReceiptEventV1 {
	const decisionId = buildDecisionId({
		policyRevision: event.judgment.policyRevision,
		eventRevision: event.judgment.eventRevision,
		featureRevision: event.judgment.featureRevision,
		featureRow: event.featureRow,
		judgment: event.judgment,
	});

	return policyDecisionReceiptEventSchema.parse({
		eventId: randomUUID(),
		eventType: 'policy.decision.receipt',
		occurredAt: event.judgment.generatedAt,
		traceId: event.traceId ?? event.signal.traceId,
		sourceRef: event.sourceRef ?? event.signal.sourceRef,
		payload: {
			decisionId,
			recommendationEventId: event.signal.eventId,
			decision: event.judgment.action === 'skip' ? 'rejected' : 'applied',
			decidedBy: 'recommendation-policy',
			decisionReason: event.judgment.reasons.join('; ') || undefined,
			policyRevision: event.judgment.policyRevision,
			resultingStateHash: sha256Hex(stableJson({
				featureRow: event.featureRow,
				judgment: event.judgment,
			})),
			sourceEvidenceRefs: event.signal.payload.sourceEvidenceRefs,
		},
	});
}

export function buildRecommendationPolicyResults(
	input: RecommendationPolicyInput
): RecommendationPolicyResult[] {
	const parsed = RecommendationPolicyInputSchema.parse(input);

	const sortedFeatureRows = parsed.candidates
		.map((candidate) =>
			buildEventRecommendationFeatureRow({
				eventId: candidate.eventId,
				candidateKey: candidate.candidateKey,
				packetKey: candidate.packetKey,
				semanticScore: candidate.semanticScore,
				structuralScore: candidate.structuralScore,
				graphScore: candidate.graphScore,
				workflowScore: candidate.workflowScore,
				breadthScore: candidate.breadthScore,
				approximationScore: candidate.approximationScore,
				utilityBias: candidate.utilityBias,
				tokenCost: candidate.tokenCost,
				latencyMs: candidate.latencyMs,
				evidenceCoverage: candidate.evidenceCoverage,
				freshnessScore: candidate.freshnessScore,
				featureRevision: candidate.featureRevision,
				graphRevision: candidate.graphRevision ?? null,
				eventRevision: candidate.eventRevision,
			}),
	)
		.sort((left, right) => {
			const leftJudgment = judgeRecommendation({
				...left,
				policyRevision: parsed.policyRevision,
			});
			const rightJudgment = judgeRecommendation({
				...right,
				policyRevision: parsed.policyRevision,
			});
			return rightJudgment.score - leftJudgment.score;
		})
		.slice(0, parsed.maxResults);

	return sortedFeatureRows.map((featureRow) => {
		const judgment = judgeRecommendation({
			...featureRow,
			policyRevision: parsed.policyRevision,
		});
		const generatedAt = parsed.generatedAt ?? judgment.generatedAt;
		const normalizedJudgment = RecommendationJudgmentSchema.parse({
			...judgment,
			generatedAt,
		});
		const signal = buildSignal({
			featureRow,
			judgment: normalizedJudgment,
			traceId: parsed.traceId,
			sourceRef: parsed.sourceRef,
		});
		const receipt = buildReceipt({
			featureRow,
			judgment: normalizedJudgment,
			signal,
			traceId: parsed.traceId,
			sourceRef: parsed.sourceRef,
		});

		return RecommendationPolicyResultSchema.parse({
			decisionId: receipt.payload.decisionId,
			featureRow,
			judgment: normalizedJudgment,
			signal,
			receipt,
		});
	});
}
