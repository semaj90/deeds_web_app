/**
 * NLP sidecar feature compiler contracts.
 *
 * This is the additive pass/feature surface for the miniforge NLP sidecar:
 * structural AST units, semantic cards, HMM observations, and the wide
 * experiment feature matrix with a narrow control5 summary.
 *
 * The goal is to keep the sidecar typed without turning it into a retrieval
 * owner. All promotion remains outside this module.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
	buildAtlasEvent,
	buildEventBreadthFeatures,
	buildEventRecommendationFeatureRow,
	compileOntologyEventTuples,
	judgeRecommendation,
	type AtlasEvent,
	type AtlasEventParticipant,
	type EventBreadthFeatures,
	type EventRecommendationFeatureRow,
	type OntologyEventTuple,
	type RecommendationJudgment,
} from './event-hypergraph-contract.js';
import { buildRecommendationPolicyResults, type RecommendationPolicyResult } from '$lib/server/analytics/recommendation-policy.js';

const EvidenceSpanSchema = z
	.object({
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1).nullable().default(null),
		packetKey: z.string().min(1).nullable().default(null),
		startByte: z.number().int().nonnegative().nullable().default(null),
		endByte: z.number().int().nonnegative().nullable().default(null),
		startLine: z.number().int().nonnegative().nullable().default(null),
		endLine: z.number().int().nonnegative().nullable().default(null),
		confidence: z.number().finite().min(0).max(1).nullable().default(null),
		excerpt: z.string().nullable().default(null),
		kind: z.string().min(1).nullable().default(null),
	})
	.strict();
export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;

export const AnalysisPassFamilySchema = z.enum([
	'structural',
	'lexical',
	'linguistic',
	'semantic',
	'sequence',
	'rerank',
	'grounded',
	'classify',
]);
export type AnalysisPassFamily = z.infer<typeof AnalysisPassFamilySchema>;

export const AnalysisPassStatusSchema = z.enum(['succeeded', 'skipped', 'failed']);
export type AnalysisPassStatus = z.infer<typeof AnalysisPassStatusSchema>;

export const AnalysisPassResultSchema = z
	.object({
		requestId: z.string().min(1),
		packetKey: z.string().min(1).nullable().default(null),
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		family: AnalysisPassFamilySchema,
		passName: z.string().min(1),
		passRevision: z.string().min(1),
		backend: z.string().min(1),
		backendVersion: z.string().min(1),
		device: z.enum(['cpu', 'cuda', 'external']),
		inputHash: z.string().min(1),
		outputHash: z.string().min(1),
		startedAt: z.string().datetime(),
		completedAt: z.string().datetime(),
		status: AnalysisPassStatusSchema,
		features: z.record(z.string(), z.union([z.number().finite(), z.boolean(), z.null()])).default({}),
		artifacts: z.record(z.string(), z.unknown()).default({}),
		evidence: z.array(EvidenceSpanSchema).default([]),
		warnings: z.array(z.string()).default([]),
	})
	.strict();
export type AnalysisPassResult = z.infer<typeof AnalysisPassResultSchema>;

export const AstUnitSchema = z
	.object({
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		treeNodeId: z.string().min(1),
		symbolVersionId: z.string().min(1).nullable().default(null),
		language: z.string().min(1),
		nodeKind: z.string().min(1),
		qualifiedSymbol: z.string().min(1).nullable().default(null),
		byteStart: z.number().int().nonnegative(),
		byteEnd: z.number().int().nonnegative(),
		lineStart: z.number().int().nonnegative(),
		lineEnd: z.number().int().nonnegative(),
		parentSymbol: z.string().min(1).nullable().default(null),
		imports: z.array(z.string().min(1)).default([]),
		exports: z.array(z.string().min(1)).default([]),
		calls: z.array(z.string().min(1)).default([]),
		references: z.array(z.string().min(1)).default([]),
		tests: z.array(z.string().min(1)).default([]),
		comments: z.array(z.string().min(1)).default([]),
		docstrings: z.array(z.string().min(1)).default([]),
		parserEngine: z.string().min(1),
		parserRevision: z.string().min(1),
		grammarRevision: z.string().min(1),
		chunker: z.string().min(1),
		chunkerRevision: z.string().min(1),
		structuralRevision: z.string().min(1),
		contentHash: z.string().min(1),
	})
	.strict();
export type AstUnit = z.infer<typeof AstUnitSchema>;

export const SemanticCodeCardSchema = z
	.object({
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		treeNodeId: z.string().min(1),
		symbolVersionId: z.string().min(1).nullable().default(null),
		language: z.string().min(1),
		symbol: z.string().min(1),
		kind: z.string().min(1),
		role: z.string().min(1),
		calls: z.array(z.string().min(1)).default([]),
		references: z.array(z.string().min(1)).default([]),
		invariants: z.array(z.string().min(1)).default([]),
		excerpt: z.string().min(1),
		lexicalFacts: z.array(z.string().min(1)).default([]),
		linguisticFacts: z.array(z.string().min(1)).default([]),
		structuralRevision: z.string().min(1),
		semanticCardRevision: z.string().min(1),
		semanticRevision: z.string().min(1),
		inputHash: z.string().min(1),
		outputHash: z.string().min(1),
	})
	.strict();
export type SemanticCodeCard = z.infer<typeof SemanticCodeCardSchema>;

export const HMMObservationSchema = z
	.object({
		requestId: z.string().min(1),
		packetKey: z.string().min(1).nullable().default(null),
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		position: z.number().int().nonnegative(),
		observation: z.string().min(1),
		weight: z.number().finite().default(1),
		sourcePass: z.string().min(1),
		stateHint: z.string().min(1).nullable().default(null),
		createdAt: z.string().datetime(),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.strict();
export type HMMObservation = z.infer<typeof HMMObservationSchema>;

/**
 * BEST-FIT-SCORE-SEMANTICS-02: `heuristicFitScore`/`heuristicPriorScore`/`heuristicFitMargin`
 * are okf-fit.ts's hand-specified heuristic outputs, not ML inference -- see okf-fit.ts's
 * OkfFitResult doc comment. Metadata keys renamed to match; old snake_case keys kept alongside
 * as deprecated compatibility aliases so existing HMM metadata consumers don't silently break.
 *
 * KNOWN UNRESOLVED (BEST-FIT-SCORE-AUDIT-01 finding #12, NOT fixed this pass): callers of this
 * function currently pass a heuristic revision string (OKF_FIT_VERSION) as `sourceRevision`, but
 * HMMObservationSchema.sourceRevision's real meaning is an actual source-content revision, which
 * OKF web-research topics don't have. Substituting one for the other is exactly the provenance
 * collision the audit flagged. Left as-is pending a real design decision (does
 * HMMObservationSchema need an optional field for "no real source revision exists" vs. requiring
 * one) rather than papering over it with another fabricated value.
 */
export function buildHMMObservationFromOkfFit(input: {
	requestId?: string;
	packetKey?: string | null;
	sourceRef: string;
	sourceRevision: string;
	position?: number;
	fitDecision: 'ACCEPT' | 'REVIEW' | 'ABSTAIN';
	heuristicFitScore: number;
	heuristicPriorScore: number;
	heuristicFitMargin: number;
	evidenceCount?: number;
}): HMMObservation {
	const stateHint =
		input.fitDecision === 'ACCEPT' ? 'VALIDATE'
		: input.fitDecision === 'REVIEW' ? 'DIAGNOSE'
		: 'RECOVER';

	return HMMObservationSchema.parse({
		requestId: input.requestId ?? randomUUID(),
		packetKey: input.packetKey ?? null,
		sourceRef: input.sourceRef,
		sourceRevision: input.sourceRevision,
		position: input.position ?? 0,
		observation: `OKF_FIT_${input.fitDecision}`,
		weight: Math.max(0, Math.min(1, input.heuristicFitScore)),
		sourcePass: 'okf_fit',
		stateHint,
		createdAt: new Date().toISOString(),
		metadata: {
			heuristic_fit_score: input.heuristicFitScore,
			heuristic_prior_score: input.heuristicPriorScore,
			heuristic_fit_margin: input.heuristicFitMargin,
			evidence_count: input.evidenceCount ?? 0,
			// Deprecated compatibility aliases -- see this function's doc comment above.
			logistic_regression_score: input.heuristicFitScore,
			naive_bayes_score: input.heuristicPriorScore,
			fit_margin: input.heuristicFitMargin,
		},
	});
}

export const Control5Schema = z
	.object({
		lexical_confidence: z.number().finite().min(0).max(1).nullable().default(null),
		semantic_confidence: z.number().finite().min(0).max(1).nullable().default(null),
		structural_confidence: z.number().finite().min(0).max(1).nullable().default(null),
		topological_confidence: z.number().finite().min(0).max(1).nullable().default(null),
		execution_confidence: z.number().finite().min(0).max(1).nullable().default(null),
	})
	.strict();
export type Control5 = z.infer<typeof Control5Schema>;

const FeatureValueSchema = z.union([z.number().finite(), z.boolean(), z.null()]);

function passIdentityKey(passResult: AnalysisPassResult): string {
	return [
		passResult.requestId,
		passResult.packetKey ?? '-',
		passResult.sourceRef,
		passResult.sourceRevision,
		passResult.family,
		passResult.passName,
		passResult.passRevision,
		passResult.inputHash,
		passResult.outputHash,
	].join('|');
}

function canonicalPassResults(passResults: AnalysisPassResult[]): AnalysisPassResult[] {
	const sorted = [...passResults].sort((a, b) => {
		const left = passIdentityKey(a);
		const right = passIdentityKey(b);
		return left.localeCompare(right) || a.startedAt.localeCompare(b.startedAt) || a.completedAt.localeCompare(b.completedAt);
	});

	const seen = new Set<string>();
	for (const passResult of sorted) {
		const key = passIdentityKey(passResult);
		if (seen.has(key)) {
			throw new Error(`Duplicate analysis pass result for ${key}`);
		}
		seen.add(key);
	}

	return sorted;
}

export const ExperimentFeatureMatrixSchema = z
	.object({
		requestId: z.string().min(1),
		candidateId: z.string().min(1),
		packetKey: z.string().min(1).nullable().default(null),
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		featureRevision: z.string().min(1),
		graphRevision: z.string().min(1).nullable().default(null),
		representationRevision: z.string().min(1).nullable().default(null),
		dense_cosine: z.number().finite().nullable().default(null),
		bm25: z.number().finite().nullable().default(null),
		rrf: z.number().finite().nullable().default(null),
		ast_match: z.number().finite().nullable().default(null),
		pagerank: z.number().finite().nullable().default(null),
		cheirank: z.number().finite().nullable().default(null),
		community_affinity: z.number().finite().nullable().default(null),
		hop_distance: z.number().finite().nullable().default(null),
		kmeans_distance: z.number().finite().nullable().default(null),
		som_distance: z.number().finite().nullable().default(null),
		manifold_distance: z.number().finite().nullable().default(null),
		cross_encoder_score: z.number().finite().nullable().default(null),
		mixedbread_score: z.number().finite().nullable().default(null),
		historical_execution_success: z.number().finite().nullable().default(null),
		test_impact: z.number().finite().nullable().default(null),
		reranker_score: z.number().finite().nullable().default(null),
		control5: Control5Schema.nullable().default(null),
		features: z.record(z.string(), FeatureValueSchema).default({}),
		passCount: z.number().int().nonnegative().default(0),
		inputHash: z.string().min(1),
		outputHash: z.string().min(1),
	})
	.strict();
export type ExperimentFeatureMatrix = z.infer<typeof ExperimentFeatureMatrixSchema>;

export interface EventHypergraphBundle {
	events: AtlasEvent[];
	ontologyEventTuples: OntologyEventTuple[];
	eventBreadthFeatures: EventBreadthFeatures | null;
	recommendationFeatureRows: EventRecommendationFeatureRow[];
	recommendationJudgment: RecommendationJudgment | null;
	recommendationPolicyResults: RecommendationPolicyResult[];
}

export interface CompileEventHypergraphBundleInput {
	requestId: string;
	packetKey?: string | null;
	sourceRef: string;
	sourceRevision: string;
	workspaceRevision?: string | null;
	passResults: AnalysisPassResult[];
	control5?: Control5 | null;
	experimentFeatureMatrix?: ExperimentFeatureMatrix | null;
}

export interface CompileExperimentFeatureMatrixInput {
	requestId?: string;
	packetKey?: string | null;
	sourceRef: string;
	sourceRevision: string;
	featureRevision?: string;
	graphRevision?: string | null;
	representationRevision?: string | null;
	passResults: AnalysisPassResult[];
}

function latestPass(
	passResults: AnalysisPassResult[],
	family: AnalysisPassFamily,
	passName?: string,
): AnalysisPassResult | undefined {
	return canonicalPassResults(passResults)
		.reverse()
		.find((passResult) => passResult.family === family && (passName ? passResult.passName === passName : true));
}

function numericFeature(passResult: AnalysisPassResult | undefined, key: string): number | null {
	const value = passResult?.features[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanFeature(passResult: AnalysisPassResult | undefined, key: string): number | null {
	const value = passResult?.features[key];
	return typeof value === 'boolean' ? (value ? 1 : 0) : null;
}

function deriveControl5(passResults: AnalysisPassResult[]): Control5 {
	const structural = latestPass(passResults, 'structural');
	const lexical = latestPass(passResults, 'lexical');
	const semantic = latestPass(passResults, 'semantic');
	const sequence = latestPass(passResults, 'sequence');
	const rerank = latestPass(passResults, 'rerank');

	return Control5Schema.parse({
		lexical_confidence:
			numericFeature(lexical, 'lexical_confidence') ??
			numericFeature(lexical, 'bm25') ??
			numericFeature(rerank, 'cross_encoder_score'),
		semantic_confidence:
			numericFeature(semantic, 'semantic_confidence') ??
			numericFeature(semantic, 'dense_cosine') ??
			numericFeature(rerank, 'mixedbread_score'),
		structural_confidence:
			numericFeature(structural, 'structural_confidence') ??
			numericFeature(structural, 'ast_match'),
		topological_confidence:
			numericFeature(sequence, 'topological_confidence') ??
			numericFeature(sequence, 'hop_distance'),
		execution_confidence:
			numericFeature(sequence, 'execution_confidence') ??
			numericFeature(sequence, 'historical_execution_success') ??
			booleanFeature(sequence, 'patch_success'),
	});
}

export function compileExperimentFeatureMatrix(
	input: CompileExperimentFeatureMatrixInput,
): { matrix: ExperimentFeatureMatrix; control5: Control5 } {
	const requestId = input.requestId ?? randomUUID();
	const canonicalPassResultsSet = canonicalPassResults(input.passResults);
	const structural = latestPass(canonicalPassResultsSet, 'structural');
	const lexical = latestPass(canonicalPassResultsSet, 'lexical');
	const semantic = latestPass(canonicalPassResultsSet, 'semantic');
	const sequence = latestPass(canonicalPassResultsSet, 'sequence');
	const rerank = latestPass(canonicalPassResultsSet, 'rerank');
	const grounded = latestPass(canonicalPassResultsSet, 'grounded');

	const control5 = deriveControl5(input.passResults);
	const sourceRef = input.sourceRef;
	const sourceRevision = input.sourceRevision;
	const featureRevision = input.featureRevision ?? 'nlp-feature-compiler-v1';
	const packetKey = input.packetKey ?? null;

	const matrix = ExperimentFeatureMatrixSchema.parse({
		requestId,
		candidateId: packetKey ?? sourceRef,
		packetKey,
		sourceRef,
		sourceRevision,
		featureRevision,
		graphRevision: input.graphRevision ?? null,
		representationRevision: input.representationRevision ?? null,
		dense_cosine: numericFeature(semantic, 'dense_cosine') ?? numericFeature(semantic, 'semantic_confidence'),
		bm25: numericFeature(lexical, 'bm25') ?? numericFeature(lexical, 'lexical_confidence'),
		rrf: numericFeature(rerank, 'rrf') ?? numericFeature(rerank, 'reranker_score'),
		ast_match: numericFeature(structural, 'ast_match') ?? numericFeature(structural, 'structural_confidence'),
		pagerank: numericFeature(sequence, 'pagerank'),
		cheirank: numericFeature(sequence, 'cheirank'),
		community_affinity: numericFeature(sequence, 'community_affinity'),
		hop_distance: numericFeature(sequence, 'hop_distance'),
		kmeans_distance: numericFeature(semantic, 'kmeans_distance'),
		som_distance: numericFeature(semantic, 'som_distance'),
		manifold_distance: numericFeature(semantic, 'manifold_distance'),
		cross_encoder_score: numericFeature(rerank, 'cross_encoder_score'),
		mixedbread_score: numericFeature(rerank, 'mixedbread_score'),
		historical_execution_success: numericFeature(sequence, 'historical_execution_success'),
		test_impact: numericFeature(structural, 'test_impact'),
		reranker_score: numericFeature(rerank, 'reranker_score'),
		control5,
		features: {
			...(structural?.features ?? {}),
			...(lexical?.features ?? {}),
			...(semantic?.features ?? {}),
			...(sequence?.features ?? {}),
			...(rerank?.features ?? {}),
			...(grounded?.features ?? {}),
		},
		passCount: canonicalPassResultsSet.length,
		inputHash: canonicalPassResultsSet.map((passResult) => passResult.inputHash).join(':'),
		outputHash: canonicalPassResultsSet.map((passResult) => passResult.outputHash).join(':'),
	});

	return { matrix, control5 };
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
	for (const value of values) {
		const text = String(value ?? '').trim();
		if (text) return text;
	}
	return 'unknown';
}

export function compileEventHypergraphBundle(input: CompileEventHypergraphBundleInput): EventHypergraphBundle {
	const packetKey = input.packetKey ?? input.requestId;
	const sourceRevision = input.sourceRevision;
	const workspaceRevision = input.workspaceRevision ?? sourceRevision;
	const observedAt = new Date().toISOString();
	const events: AtlasEvent[] = [];

	for (const [index, passResult] of input.passResults.entries()) {
		const passArtifacts = asRecord(passResult.artifacts);
		const astUnits = asStringArray(passArtifacts?.ast_units as unknown);
		const semanticCards = asStringArray(passArtifacts?.semantic_cards as unknown);
		const observations = asStringArray(passArtifacts?.observations as unknown);
		const eventType =
			passResult.family === 'structural' ? 'call_execution'
			: passResult.family === 'semantic' ? 'semantic_annotation'
			: passResult.family === 'sequence' ? 'workflow_transition'
			: passResult.family === 'rerank' ? 'rerank_decision'
			: passResult.family === 'grounded' ? 'ontology_link'
			: 'reference_link';

		const primaryEntity = firstNonEmpty(
			passResult.packetKey,
			passArtifacts?.tree_node_id as string | undefined,
			passArtifacts?.symbol as string | undefined,
			passResult.sourceRef,
		);
		const participants: AtlasEventParticipant[] = [
			{ entityId: firstNonEmpty(passResult.sourceRef), entityKind: 'source_ref', role: 'actor' as const },
			{ entityId: packetKey, entityKind: 'packet', role: 'packet' as const },
			{ entityId: passResult.passName, entityKind: 'pass', role: 'tool' as const },
			{ entityId: primaryEntity, entityKind: passResult.family === 'semantic' ? 'symbol' : 'artifact', role: 'target' as const },
		];
		if (astUnits.length > 0) {
			participants.push({ entityId: astUnits[0]!, entityKind: 'ast_unit', role: 'evidence' as const });
		}
		if (semanticCards.length > 0) {
			participants.push({ entityId: semanticCards[0]!, entityKind: 'semantic_card', role: 'context' as const });
		}
		if (observations.length > 0) {
			participants.push({ entityId: observations[0]!, entityKind: 'observation', role: 'trigger' as const });
		}

		events.push(
			buildAtlasEvent({
				schemaVersion: 'atlas.event.hypergraph.v1',
				eventType,
				sourceRef: passResult.sourceRef,
				packetKey: passResult.packetKey ?? packetKey,
				treeNodeId: (passArtifacts?.tree_node_id as string | undefined) ?? null,
				workspaceRevision,
				sourceRevision,
				representationRevision: input.experimentFeatureMatrix?.representationRevision ?? sourceRevision,
				producerId: 'nlp-feature-compiler',
				producerRevision: 'event-hypergraph-v1',
				canonicalizerRevision: 'event-canonicalizer-v1',
				compilerRevision: 'nlp-feature-compiler-v1',
				observedAt,
				evidenceRefs: [passResult.inputHash, passResult.outputHash].filter(Boolean),
				participants,
				metadata: {
					passName: passResult.passName,
					passRevision: passResult.passRevision,
					passFamily: passResult.family,
					passIndex: index,
					featureKeys: Object.keys(passResult.features ?? {}),
				},
			}),
		);
	}

	if (events.length === 0) {
		events.push(
			buildAtlasEvent({
				schemaVersion: 'atlas.event.hypergraph.v1',
				eventType: 'semantic_annotation',
				sourceRef: input.sourceRef,
				packetKey,
				treeNodeId: null,
				workspaceRevision,
				sourceRevision,
				representationRevision: input.experimentFeatureMatrix?.representationRevision ?? sourceRevision,
				producerId: 'nlp-feature-compiler',
				producerRevision: 'event-hypergraph-v1',
				canonicalizerRevision: 'event-canonicalizer-v1',
				compilerRevision: 'nlp-feature-compiler-v1',
				observedAt,
				evidenceRefs: [input.requestId],
				participants: [
					{ entityId: input.sourceRef, entityKind: 'source_ref', role: 'actor' },
					{ entityId: packetKey, entityKind: 'packet', role: 'packet' },
				],
				metadata: { fallback: true },
			}),
		);
	}

	const ontologyEventTuples = events.flatMap((event) => compileOntologyEventTuples(event));
	const passNames = input.passResults.map((result) => result.passName);
	const eventTypes = events.map((event) => event.eventType);
	const eventBreadthFeatures = buildEventBreadthFeatures({
		packetKey,
		workflowIds: [packetKey, input.sourceRef, workspaceRevision, ...passNames],
		taskIds: passNames,
		symbolIds: input.passResults.flatMap((result) =>
			Object.values(asRecord(result.artifacts) ?? {}).flatMap((artifact) => asStringArray(artifact as unknown)),
		),
		eventTypes,
		neighborhoodIds: events.flatMap((event) => event.participants.map((participant) => participant.entityId)),
		telemetryRevision: 'event-breadth-v1',
	});

	const semanticScore = input.experimentFeatureMatrix?.dense_cosine ?? input.control5?.semantic_confidence ?? 0.5;
	const structuralScore = input.experimentFeatureMatrix?.ast_match ?? input.control5?.structural_confidence ?? 0.5;
	const graphScore =
		input.experimentFeatureMatrix?.pagerank ??
		input.experimentFeatureMatrix?.cheirank ??
		input.experimentFeatureMatrix?.community_affinity ??
		0;
	const workflowScore = Math.min(1, eventBreadthFeatures.workflowBreadth / Math.max(1, events.length));
	const breadthScore = Math.min(1, eventBreadthFeatures.eventTypeBreadth / 10);
	const eventRevision = input.experimentFeatureMatrix?.representationRevision ?? sourceRevision;

	const recommendationFeatureRows = events.slice(0, 8).map((event) =>
		buildEventRecommendationFeatureRow({
			eventId: event.eventId,
			candidateKey: event.eventId,
			packetKey,
			semanticScore,
			structuralScore,
			graphScore,
			workflowScore,
			breadthScore,
			approximationScore: 0,
			utilityBias: 0,
			tokenCost: Math.min(1000, input.requestId.length + input.sourceRef.length),
			latencyMs: 0,
			evidenceCoverage: Math.min(1, event.evidenceRefs.length / 3),
			freshnessScore: 1,
			featureRevision: input.experimentFeatureMatrix?.featureRevision ?? 'event-recommendation-v1',
			graphRevision: input.experimentFeatureMatrix?.graphRevision ?? null,
			eventRevision,
		}),
	);

	const recommendationJudgment = recommendationFeatureRows[0]
		? judgeRecommendation({
				...recommendationFeatureRows[0],
				policyRevision: 'recommendation-policy-v1',
			})
		: null;

	const recommendationPolicyResults = recommendationFeatureRows.length
		? buildRecommendationPolicyResults({
				policyRevision: 'recommendation-policy-v1',
				eventRevision,
				featureRevision: recommendationFeatureRows[0]?.featureRevision ?? 'event-recommendation-v1',
				generatedAt: recommendationJudgment?.generatedAt,
				traceId: input.requestId,
				sourceRef: input.sourceRef,
				maxResults: Math.min(8, recommendationFeatureRows.length),
				candidates: recommendationFeatureRows,
			})
		: [];

	return {
		events,
		ontologyEventTuples,
		eventBreadthFeatures,
		recommendationFeatureRows,
		recommendationJudgment,
		recommendationPolicyResults,
	};
}
