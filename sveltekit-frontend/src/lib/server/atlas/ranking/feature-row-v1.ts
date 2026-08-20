import { z } from 'zod';
import { pickPageRankAuthorityScore, type PageRankAuthorityLike } from '../../topology/pagerank-authority.js';
import type { EvidenceLocatorV1 } from '../contracts/evidence-locator-v1.js';

const probability = z.number().finite().min(0).max(1);

export const FeatureRowV1Schema = z.object({
	schema: z.literal('atlas.feature-row.v1'),
	packetKey: z.string().min(1),
	canonicalId: z.string().min(1),
	sourceRef: z.string().min(1),
	featureRevision: z.string().min(1),
	workspaceRevision: z.string().min(1),
	sourceRevision: z.string().min(1),
	graphRevision: z.string().min(1),
	semanticRevision: z.string().min(1),
	dense: probability,
	sparse: probability,
	rrf: probability,
	ast: probability,
	pagerankAuthority: probability,
	pprAffinity: probability.nullable(),
	domainAffinity: probability,
	freshness: probability,
	crossEncoder: probability.nullable(),
	executionUtility: probability,
	evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();

export type FeatureRowV1 = z.infer<typeof FeatureRowV1Schema>;

export interface BuildFeatureRowV1Input {
	locator: EvidenceLocatorV1;
	featureRevision: string;
	graphRevision: string;
	semanticRevision: string;
	dense: number;
	sparse: number;
	rrf: number;
	ast: number;
	pagerank: PageRankAuthorityLike | null | undefined;
	pprAffinity?: number | null;
	domainAffinity: number;
	freshness: number;
	crossEncoder?: number | null;
	executionUtility: number;
	evidenceRefs: readonly string[];
}

function clamp01(value: number | null | undefined): number {
	if (!Number.isFinite(Number(value))) return 0;
	return Math.max(0, Math.min(1, Number(value)));
}

export function buildFeatureRowV1(input: BuildFeatureRowV1Input): FeatureRowV1 {
	if (!input.locator.packetKey) throw new Error('FeatureRowV1 requires packetKey');
	const pagerankScore = pickPageRankAuthorityScore(input.pagerank);
	if (pagerankScore === null) throw new Error('FeatureRowV1 requires provenance-qualified PageRank authority');

	return FeatureRowV1Schema.parse({
		schema: 'atlas.feature-row.v1',
		packetKey: input.locator.packetKey,
		canonicalId: input.locator.canonicalId,
		sourceRef: input.locator.sourceRef,
		featureRevision: input.featureRevision,
		workspaceRevision: input.locator.workspaceRevision,
		sourceRevision: input.locator.sourceRevision,
		graphRevision: input.graphRevision,
		semanticRevision: input.semanticRevision,
		dense: clamp01(input.dense),
		sparse: clamp01(input.sparse),
		rrf: clamp01(input.rrf),
		ast: clamp01(input.ast),
		pagerankAuthority: clamp01(pagerankScore),
		pprAffinity: input.pprAffinity == null ? null : clamp01(input.pprAffinity),
		domainAffinity: clamp01(input.domainAffinity),
		freshness: clamp01(input.freshness),
		crossEncoder: input.crossEncoder == null ? null : clamp01(input.crossEncoder),
		executionUtility: clamp01(input.executionUtility),
		evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
	});
}

export const FEATURE_ROW_V1_NUMERIC_FIELDS = [
	'dense',
	'sparse',
	'rrf',
	'ast',
	'pagerankAuthority',
	'pprAffinity',
	'domainAffinity',
	'freshness',
	'crossEncoder',
	'executionUtility',
] as const;

export function featureRowV1ToFloat32(row: FeatureRowV1): Float32Array {
	return new Float32Array(
		FEATURE_ROW_V1_NUMERIC_FIELDS.map((name) => row[name] ?? 0),
	);
}
