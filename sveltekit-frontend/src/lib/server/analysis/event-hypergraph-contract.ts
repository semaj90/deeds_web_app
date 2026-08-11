import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ATLAS_EVENT_SCHEMA_VERSION = 'atlas.event.hypergraph.v1' as const;

export const AtlasEventParticipantRoleSchema = z.enum([
	'actor',
	'target',
	'tool',
	'packet',
	'symbol',
	'task',
	'workflow',
	'input',
	'output',
	'cause',
	'effect',
	'evidence',
	'authority',
	'context',
	'trigger',
	'result',
]);
export type AtlasEventParticipantRole = z.infer<typeof AtlasEventParticipantRoleSchema>;

export const AtlasEventTypeSchema = z.enum([
	'call_execution',
	'import_resolution',
	'reference_link',
	'test_execution',
	'build_failure',
	'compile_failure',
	'packet_retrieval',
	'packet_prefetch',
	'rerank_decision',
	'graph_traversal',
	'workflow_transition',
	'ontology_link',
	'semantic_annotation',
	'tool_call',
]);
export type AtlasEventType = z.infer<typeof AtlasEventTypeSchema>;

export const AtlasEventParticipantSchema = z
	.object({
		entityId: z.string().min(1),
		entityKind: z.string().min(1),
		role: AtlasEventParticipantRoleSchema,
	})
	.strict();
export type AtlasEventParticipant = z.infer<typeof AtlasEventParticipantSchema>;

export const AtlasEventSortKeySchema = z
	.object({
		sourceRevision: z.string().min(1),
		observedAt: z.string().datetime(),
		eventType: AtlasEventTypeSchema,
		eventId: z.string().min(1),
	})
	.strict();
export type AtlasEventSortKey = z.infer<typeof AtlasEventSortKeySchema>;

export const AtlasEventSchema = z
	.object({
		schemaVersion: z.literal(ATLAS_EVENT_SCHEMA_VERSION),
		eventId: z.string().min(1),
		eventType: AtlasEventTypeSchema,
		sourceRef: z.string().min(1),
		packetKey: z.string().min(1).nullable().default(null),
		treeNodeId: z.string().min(1).nullable().default(null),
		workspaceRevision: z.string().min(1),
		sourceRevision: z.string().min(1),
		representationRevision: z.string().min(1),
		producerId: z.string().min(1),
		producerRevision: z.string().min(1),
		canonicalizerRevision: z.string().min(1),
		compilerRevision: z.string().min(1),
		observedAt: z.string().datetime(),
		evidenceRefs: z.array(z.string().min(1)).default([]),
		participants: z.array(AtlasEventParticipantSchema).min(2),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.strict();
export type AtlasEvent = z.infer<typeof AtlasEventSchema>;

export const AtlasEventEnrichmentSchema = z
	.object({
		eventId: z.string().min(1),
		eventType: AtlasEventTypeSchema,
		role: AtlasEventParticipantRoleSchema,
		patterns: z.array(z.string().min(1)).default([]),
		invariants: z.array(z.string().min(1)).default([]),
		risks: z.array(z.string().min(1)).default([]),
		semanticTags: z.array(z.string().min(1)).default([]),
		evidenceRefs: z.array(z.string().min(1)).default([]),
		modelRevision: z.string().min(1),
		producerRevision: z.string().min(1),
	})
	.strict();
export type AtlasEventEnrichment = z.infer<typeof AtlasEventEnrichmentSchema>;

export const OntologyEventTupleSchema = z
	.object({
		tupleId: z.string().min(1),
		eventId: z.string().min(1),
		subjectId: z.string().min(1),
		predicate: z.string().min(1),
		objectId: z.string().min(1),
		participantRole: AtlasEventParticipantRoleSchema,
		evidenceRef: z.string().min(1),
		domainClass: z.string().min(1),
		sourceRevision: z.string().min(1),
		representationRevision: z.string().min(1),
		previousRevisionId: z.string().min(1).nullable().default(null),
		supersedesRevisionId: z.string().min(1).nullable().default(null),
		generatedAt: z.string().datetime(),
	})
	.strict();
export type OntologyEventTuple = z.infer<typeof OntologyEventTupleSchema>;

export const EventBreadthFeaturesSchema = z
	.object({
		packetKey: z.string().min(1),
		workflowBreadth: z.number().finite().min(0),
		taskBreadth: z.number().finite().min(0),
		symbolBreadth: z.number().finite().min(0),
		sessionBreadth: z.number().finite().min(0),
		userBreadth: z.number().finite().min(0),
		processBreadth: z.number().finite().min(0),
		eventTypeBreadth: z.number().finite().min(0),
		neighborhoodBreadth: z.number().finite().min(0),
		telemetryRevision: z.string().min(1),
	})
	.strict();
export type EventBreadthFeatures = z.infer<typeof EventBreadthFeaturesSchema>;

export const EventRecommendationFeatureRowSchema = z
	.object({
		eventId: z.string().min(1),
		candidateKey: z.string().min(1),
		packetKey: z.string().min(1).nullable().default(null),
		semanticScore: z.number().finite().min(0).max(1),
		structuralScore: z.number().finite().min(0).max(1),
		graphScore: z.number().finite().min(0).max(1),
		workflowScore: z.number().finite().min(0).max(1),
		breadthScore: z.number().finite().min(0).max(1),
		approximationScore: z.number().finite().min(0).max(1),
		utilityBias: z.number().finite().min(-1).max(1).default(0),
		tokenCost: z.number().finite().min(0).default(0),
		latencyMs: z.number().finite().min(0).default(0),
		evidenceCoverage: z.number().finite().min(0).max(1).default(0),
		freshnessScore: z.number().finite().min(0).max(1).default(0),
		featureRevision: z.string().min(1),
		graphRevision: z.string().min(1).nullable().default(null),
		eventRevision: z.string().min(1),
	})
	.strict();
export type EventRecommendationFeatureRow = z.infer<typeof EventRecommendationFeatureRowSchema>;

export const RecommendationActionSchema = z.enum([
	'inspect',
	'test',
	'index',
	'graph_expand',
	'prefetch',
	'repair',
	'refactor',
	'document',
	'skip',
]);
export type RecommendationAction = z.infer<typeof RecommendationActionSchema>;

export const RecommendationJudgmentSchema = z
	.object({
		candidateKey: z.string().min(1),
		action: RecommendationActionSchema,
		score: z.number().finite().min(0).max(1),
		reasons: z.array(z.string().min(1)).default([]),
		policyRevision: z.string().min(1),
		featureRevision: z.string().min(1),
		eventRevision: z.string().min(1),
		exactOracleDelta: z.number().finite().nullable().default(null),
		oracleValidated: z.boolean().default(false),
		generatedAt: z.string().datetime(),
	})
	.strict();
export type RecommendationJudgment = z.infer<typeof RecommendationJudgmentSchema>;

export const ExactOracleComparisonSchema = z
	.object({
		k: z.number().int().positive(),
		candidateKeys: z.array(z.string().min(1)),
		exactKeys: z.array(z.string().min(1)),
		intersectionKeys: z.array(z.string().min(1)),
		recallAtK: z.number().finite().min(0).max(1),
		precisionAtK: z.number().finite().min(0).max(1),
		ndcgAtK: z.number().finite().min(0).max(1),
		falseExclusions: z.array(z.string().min(1)).default([]),
		falseInclusions: z.array(z.string().min(1)).default([]),
	})
	.strict();
export type ExactOracleComparison = z.infer<typeof ExactOracleComparisonSchema>;

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
	return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function canonicalizeParticipants(participants: AtlasEventParticipant[]): AtlasEventParticipant[] {
	return [...participants].sort((left, right) => {
		const leftKey = [left.role, left.entityKind, left.entityId].join('|');
		const rightKey = [right.role, right.entityKind, right.entityId].join('|');
		return leftKey.localeCompare(rightKey);
	});
}

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

export function buildAtlasEventId(input: Omit<AtlasEvent, 'eventId'>): string {
	const canonical = canonicalizeAtlasEvent(input);
	const payload = {
		schemaVersion: canonical.schemaVersion,
		eventType: canonical.eventType,
		sourceRef: canonical.sourceRef,
		packetKey: canonical.packetKey,
		treeNodeId: canonical.treeNodeId,
		workspaceRevision: canonical.workspaceRevision,
		sourceRevision: canonical.sourceRevision,
		representationRevision: canonical.representationRevision,
		producerId: canonical.producerId,
		producerRevision: canonical.producerRevision,
		canonicalizerRevision: canonical.canonicalizerRevision,
		compilerRevision: canonical.compilerRevision,
		evidenceRefs: canonical.evidenceRefs,
		participants: canonical.participants,
		metadata: canonical.metadata,
	};
	return `evt:${sha256Hex(stableJson(payload)).slice(0, 24)}`;
}

export function canonicalizeAtlasEvent(input: Omit<AtlasEvent, 'eventId'>): Omit<AtlasEvent, 'eventId'> {
	const parsed = AtlasEventSchema.omit({ eventId: true }).parse({
		...input,
		participants: canonicalizeParticipants(input.participants),
		evidenceRefs: uniqueNonEmpty(input.evidenceRefs ?? []),
	});
	return parsed;
}

export function buildAtlasEvent(input: Omit<AtlasEvent, 'eventId'>): AtlasEvent {
	const canonical = canonicalizeAtlasEvent(input);
	return AtlasEventSchema.parse({
		...canonical,
		eventId: buildAtlasEventId(canonical),
	});
}

export function sortAtlasEvents(events: AtlasEvent[]): AtlasEvent[] {
	return [...events].sort((left, right) => {
		const leftKey = [left.sourceRevision, left.eventType, left.observedAt, left.eventId].join('|');
		const rightKey = [right.sourceRevision, right.eventType, right.observedAt, right.eventId].join('|');
		return leftKey.localeCompare(rightKey);
	});
}

export function compileOntologyEventTuples(event: AtlasEvent): OntologyEventTuple[] {
	const canonical = AtlasEventSchema.parse(event);
	const evidenceRef = canonical.evidenceRefs[0] ?? canonical.sourceRef;
	const generatedAt = canonical.observedAt;

	return canonical.participants.map((participant, index) =>
		OntologyEventTupleSchema.parse({
			tupleId: `tuple:${sha256Hex(stableJson({
				eventId: canonical.eventId,
				role: participant.role,
				entityId: participant.entityId,
				entityKind: participant.entityKind,
				index,
			})).slice(0, 24)}`,
			eventId: canonical.eventId,
			subjectId: canonical.eventId,
			predicate: `participant:${participant.role}`,
			objectId: participant.entityId,
			participantRole: participant.role,
			evidenceRef,
			domainClass: participant.entityKind,
			sourceRevision: canonical.sourceRevision,
			representationRevision: canonical.representationRevision,
			previousRevisionId: null,
			supersedesRevisionId: null,
			generatedAt,
		}),
	);
}

export function buildEventBreadthFeatures(input: {
	packetKey: string;
	workflowIds: Array<string | null | undefined>;
	taskIds: Array<string | null | undefined>;
	symbolIds: Array<string | null | undefined>;
	sessionIds?: Array<string | null | undefined>;
	userIds?: Array<string | null | undefined>;
	processIds?: Array<string | null | undefined>;
	eventTypes: Array<string | null | undefined>;
	neighborhoodIds: Array<string | null | undefined>;
	telemetryRevision: string;
}): EventBreadthFeatures {
	return EventBreadthFeaturesSchema.parse({
		packetKey: input.packetKey,
		workflowBreadth: uniqueNonEmpty(input.workflowIds).length,
		taskBreadth: uniqueNonEmpty(input.taskIds).length,
		symbolBreadth: uniqueNonEmpty(input.symbolIds).length,
		sessionBreadth: uniqueNonEmpty(input.sessionIds ?? []).length,
		userBreadth: uniqueNonEmpty(input.userIds ?? []).length,
		processBreadth: uniqueNonEmpty(input.processIds ?? []).length,
		eventTypeBreadth: uniqueNonEmpty(input.eventTypes).length,
		neighborhoodBreadth: uniqueNonEmpty(input.neighborhoodIds).length,
		telemetryRevision: input.telemetryRevision,
	});
}

export function buildEventRecommendationFeatureRow(input: {
	eventId: string;
	candidateKey: string;
	packetKey?: string | null;
	semanticScore: number;
	structuralScore: number;
	graphScore: number;
	workflowScore: number;
	breadthScore: number;
	approximationScore: number;
	utilityBias?: number;
	tokenCost?: number;
	latencyMs?: number;
	evidenceCoverage?: number;
	freshnessScore?: number;
	featureRevision: string;
	graphRevision?: string | null;
	eventRevision: string;
}): EventRecommendationFeatureRow {
	return EventRecommendationFeatureRowSchema.parse({
		eventId: input.eventId,
		candidateKey: input.candidateKey,
		packetKey: input.packetKey ?? null,
		semanticScore: input.semanticScore,
		structuralScore: input.structuralScore,
		graphScore: input.graphScore,
		workflowScore: input.workflowScore,
		breadthScore: input.breadthScore,
		approximationScore: input.approximationScore,
		utilityBias: input.utilityBias ?? 0,
		tokenCost: input.tokenCost ?? 0,
		latencyMs: input.latencyMs ?? 0,
		evidenceCoverage: input.evidenceCoverage ?? 0,
		freshnessScore: input.freshnessScore ?? 0,
		featureRevision: input.featureRevision,
		graphRevision: input.graphRevision ?? null,
		eventRevision: input.eventRevision,
	});
}

export function judgeRecommendation(input: EventRecommendationFeatureRow & {
	policyRevision: string;
}): RecommendationJudgment {
	const structuralCore = (input.semanticScore + input.structuralScore + input.graphScore) / 3;
	const operationalCore = (input.workflowScore + input.breadthScore + input.freshnessScore) / 3;
	const approximationPenalty = input.approximationScore * 0.2;
	const costPenalty = Math.min(1, (input.tokenCost / 10000) + (input.latencyMs / 1000) * 0.15);
	const rawScore = structuralCore * 0.45 + operationalCore * 0.35 + input.evidenceCoverage * 0.1 + input.utilityBias * 0.1 - approximationPenalty - costPenalty;
	const score = Math.max(0, Math.min(1, Number(rawScore.toFixed(6))));

	let action: RecommendationAction = 'skip';
	if (score >= 0.82) action = 'inspect';
	else if (score >= 0.7) action = 'test';
	else if (score >= 0.58) action = 'prefetch';
	else if (score >= 0.45) action = 'graph_expand';
	else if (score >= 0.3) action = 'document';

	const reasons = uniqueNonEmpty([
		input.semanticScore >= 0.7 ? 'semantic evidence strong' : null,
		input.structuralScore >= 0.7 ? 'structural evidence strong' : null,
		input.graphScore >= 0.7 ? 'graph evidence strong' : null,
		input.workflowScore >= 0.5 ? 'workflow evidence present' : null,
		input.approximationScore > 0.5 ? 'approximation penalty applied' : null,
		input.evidenceCoverage >= 0.5 ? 'evidence coverage sufficient' : null,
	]);

	return RecommendationJudgmentSchema.parse({
		candidateKey: input.candidateKey,
		action,
		score,
		reasons,
		policyRevision: input.policyRevision,
		featureRevision: input.featureRevision,
		eventRevision: input.eventRevision,
		exactOracleDelta: null,
		oracleValidated: false,
		generatedAt: new Date().toISOString(),
	});
}

function dcg(scores: readonly number[]): number {
	return scores.reduce((acc, score, index) => acc + score / Math.log2(index + 2), 0);
}

export function compareAgainstExactOracle(input: {
	k: number;
	candidateKeys: readonly string[];
	exactKeys: readonly string[];
}): ExactOracleComparison {
	const candidateKeys = uniqueNonEmpty([...input.candidateKeys]).slice(0, input.k);
	const exactKeys = uniqueNonEmpty([...input.exactKeys]).slice(0, input.k);
	const intersectionKeys = candidateKeys.filter((key) => exactKeys.includes(key));
	const precisionAtK = candidateKeys.length === 0 ? 1 : intersectionKeys.length / candidateKeys.length;
	const recallAtK = exactKeys.length === 0 ? 1 : intersectionKeys.length / exactKeys.length;
	const relevanceScores = candidateKeys.map((key) => (exactKeys.includes(key) ? 1 : 0));
	const idealScores = [...exactKeys.slice(0, candidateKeys.length)].map(() => 1);
	const ndcgAtK = idealScores.length === 0 ? 1 : dcg(relevanceScores) / Math.max(1e-9, dcg(idealScores));
	const falseExclusions = exactKeys.filter((key) => !candidateKeys.includes(key));
	const falseInclusions = candidateKeys.filter((key) => !exactKeys.includes(key));

	return ExactOracleComparisonSchema.parse({
		k: input.k,
		candidateKeys,
		exactKeys,
		intersectionKeys,
		recallAtK,
		precisionAtK,
		ndcgAtK,
		falseExclusions,
		falseInclusions,
	});
}
