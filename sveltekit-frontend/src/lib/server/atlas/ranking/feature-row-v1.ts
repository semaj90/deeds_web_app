import { z } from 'zod';
import {
	resolvePromotedPageRankFeature,
	type PromotedPageRankEvidenceV1,
} from '../../topology/pagerank-authority.js';
import type { EvidenceLocatorV1 } from '../contracts/evidence-locator-v1.js';

const probability = z.number().finite().min(0).max(1);
const nonNegativeFinite = z.number().finite().nonnegative();

/**
 * Daily/materialized candidate state. No query-specific similarity and no
 * operational residency/cache fields belong here.
 */
export const CandidateStaticFeaturesV1Schema = z.object({
	schema: z.literal('atlas.candidate-static-features.v1'),
	canonicalId: z.string().min(1),
	packetKey: z.string().min(1),
	sourceRef: z.string().min(1),
	workspaceRevision: z.string().min(1),
	sourceRevision: z.string().min(1),
	graphRevision: z.string().min(1),
	semanticRevision: z.string().min(1),
	featureRevision: z.string().min(1),
	pagerankAuthority: probability,
	pagerankRunId: z.string().min(1),
	pagerankReceiptRef: z.string().min(1),
	communitySnapshotId: z.string().min(1).nullable(),
	communityFingerprint: z.string().min(1).nullable(),
	domainClass: z.array(z.string().min(1)),
	historicalSuccess: probability,
	failureFrequency: probability,
	freshness: probability,
	structuralDegree: nonNegativeFinite,
	estimatedTokenCost: z.number().int().nonnegative(),
	evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();

/** Query -> candidate features. These are never persisted as packet truth. */
export const QueryCandidateFeaturesV1Schema = z.object({
	schema: z.literal('atlas.query-candidate-features.v1'),
	queryId: z.string().min(1),
	queryRevision: z.string().min(1),
	candidateId: z.string().min(1),
	packetKey: z.string().min(1),
	dense: probability,
	sparse: probability,
	rrf: probability,
	astAffinity: probability,
	pprAffinity: probability.nullable(),
	domainMatch: probability,
	crossEncoder: probability.nullable(),
	crossEncoderRawScore: z.number().finite().nullable(),
	crossEncoderCalibrationRevision: z.string().min(1).nullable(),
	evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();

/** Scheduler/runtime state. Never include these values in semantic truth. */
export const OperationalFeaturesV1Schema = z.object({
	schema: z.literal('atlas.operational-features.v1'),
	candidateId: z.string().min(1),
	cacheHotness: probability,
	vramResidency: z.enum(['resident', 'staged', 'host', 'cold', 'unknown']),
	estimatedLoadMs: nonNegativeFinite,
	estimatedExecutionMs: nonNegativeFinite,
	executorAvailable: z.boolean(),
	observedAt: z.string().datetime(),
}).strict();

export type CandidateStaticFeaturesV1 = z.infer<typeof CandidateStaticFeaturesV1Schema>;
export type QueryCandidateFeaturesV1 = z.infer<typeof QueryCandidateFeaturesV1Schema>;
export type OperationalFeaturesV1 = z.infer<typeof OperationalFeaturesV1Schema>;

/**
 * Numerical row consumed by rankers/GEMM/SVD. Named contracts own semantics;
 * ordinal position only owns physical layout.
 */
export const RankingFeatureVectorV1Schema = z.object({
	schema: z.literal('atlas.ranking-feature-vector.v1'),
	queryId: z.string().min(1),
	candidateId: z.string().min(1),
	packetKey: z.string().min(1),
	featureSchemaRevision: z.literal('atlas.ranking-feature-vector.v1'),
	values: z.array(z.number().finite()),
	evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();

export type RankingFeatureVectorV1 = z.infer<typeof RankingFeatureVectorV1Schema>;

/** Stable physical column order. Operational fields are intentionally excluded. */
export const RANKING_FEATURE_VECTOR_V1_FIELDS = [
	'pagerankAuthority',
	'historicalSuccess',
	'failureFrequency',
	'freshness',
	'structuralDegree',
	'estimatedTokenCost',
	'dense',
	'sparse',
	'rrf',
	'astAffinity',
	'pprAffinity',
	'domainMatch',
	'crossEncoder',
] as const;

function clamp01(value: number | null | undefined): number {
	if (!Number.isFinite(Number(value))) return 0;
	return Math.max(0, Math.min(1, Number(value)));
}

export function buildCandidateStaticFeaturesV1(input: {
	locator: EvidenceLocatorV1;
	featureRevision: string;
	graphRevision: string;
	semanticRevision: string;
	pagerank: PromotedPageRankEvidenceV1;
	communitySnapshotId?: string | null;
	communityFingerprint?: string | null;
	domainClass?: readonly string[];
	historicalSuccess: number;
	failureFrequency: number;
	freshness: number;
	structuralDegree: number;
	estimatedTokenCost: number;
	evidenceRefs: readonly string[];
}): CandidateStaticFeaturesV1 {
	if (!input.locator.packetKey) throw new Error('CandidateStaticFeaturesV1 requires packetKey');
	if (input.pagerank.graphRevision !== input.graphRevision) {
		throw new Error('PageRank graphRevision must match static feature graphRevision');
	}
	const promoted = resolvePromotedPageRankFeature(input.pagerank);

	return CandidateStaticFeaturesV1Schema.parse({
		schema: 'atlas.candidate-static-features.v1',
		canonicalId: input.locator.canonicalId,
		packetKey: input.locator.packetKey,
		sourceRef: input.locator.sourceRef,
		workspaceRevision: input.locator.workspaceRevision,
		sourceRevision: input.locator.sourceRevision,
		graphRevision: input.graphRevision,
		semanticRevision: input.semanticRevision,
		featureRevision: input.featureRevision,
		pagerankAuthority: promoted.pagerankAuthority,
		pagerankRunId: promoted.evidence.runId,
		pagerankReceiptRef: promoted.evidence.receiptRef,
		communitySnapshotId: input.communitySnapshotId ?? null,
		communityFingerprint: input.communityFingerprint ?? null,
		domainClass: [...new Set(input.domainClass ?? input.locator.domain?.labels ?? [])].sort(),
		historicalSuccess: clamp01(input.historicalSuccess),
		failureFrequency: clamp01(input.failureFrequency),
		freshness: clamp01(input.freshness),
		structuralDegree: Math.max(0, Number(input.structuralDegree) || 0),
		estimatedTokenCost: Math.max(0, Math.round(Number(input.estimatedTokenCost) || 0)),
		evidenceRefs: [...new Set([...input.evidenceRefs, promoted.evidence.receiptRef])].sort(),
	});
}

export function buildQueryCandidateFeaturesV1(input: Omit<QueryCandidateFeaturesV1, 'schema'>): QueryCandidateFeaturesV1 {
	return QueryCandidateFeaturesV1Schema.parse({
		schema: 'atlas.query-candidate-features.v1',
		...input,
		evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
	});
}

/**
 * Assemble the live ranking row. Static and query overlays must identify the
 * same packet/candidate. CrossEncoder raw score is retained in the query
 * contract for audit/cache, while only calibrated probability enters the row.
 */
export function assembleRankingFeatureVectorV1(input: {
	staticFeatures: CandidateStaticFeaturesV1;
	queryFeatures: QueryCandidateFeaturesV1;
}): RankingFeatureVectorV1 {
	const staticFeatures = CandidateStaticFeaturesV1Schema.parse(input.staticFeatures);
	const queryFeatures = QueryCandidateFeaturesV1Schema.parse(input.queryFeatures);
	if (staticFeatures.packetKey !== queryFeatures.packetKey) {
		throw new Error('static/query feature packetKey mismatch');
	}

	const values = [
		staticFeatures.pagerankAuthority,
		staticFeatures.historicalSuccess,
		staticFeatures.failureFrequency,
		staticFeatures.freshness,
		staticFeatures.structuralDegree,
		staticFeatures.estimatedTokenCost,
		queryFeatures.dense,
		queryFeatures.sparse,
		queryFeatures.rrf,
		queryFeatures.astAffinity,
		queryFeatures.pprAffinity ?? 0,
		queryFeatures.domainMatch,
		queryFeatures.crossEncoder ?? 0,
	];

	return RankingFeatureVectorV1Schema.parse({
		schema: 'atlas.ranking-feature-vector.v1',
		queryId: queryFeatures.queryId,
		candidateId: queryFeatures.candidateId,
		packetKey: staticFeatures.packetKey,
		featureSchemaRevision: 'atlas.ranking-feature-vector.v1',
		values,
		evidenceRefs: [...new Set([...staticFeatures.evidenceRefs, ...queryFeatures.evidenceRefs])].sort(),
	});
}

export function rankingFeatureVectorV1ToFloat32(row: RankingFeatureVectorV1): Float32Array {
	return new Float32Array(RankingFeatureVectorV1Schema.parse(row).values);
}
