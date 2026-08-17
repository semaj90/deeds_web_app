export const ATLAS_RESOLUTION_STATUSES = [
	'PROVEN',
	'AMBIGUOUS',
	'STABLE_APPROXIMATION',
	'REVISION_CONFLICT',
	'BOUNDARY_EXHAUSTED',
] as const;

export type AtlasResolutionStatus = (typeof ATLAS_RESOLUTION_STATUSES)[number];

export type AtlasLaneName = 'lexical' | 'ast' | 'semantic' | 'graph';
export type AtlasLod = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface AtlasRevisionSet {
	workspace: string;
	source: string;
	graph: string;
	feature: string;
}

/**
 * Hard limits for one bounded Parent Atlas resolution request.
 * Reaching a limit is observable boundary evidence, never negative proof.
 */
export interface ResourceEnvelopeV1 {
	maxVramBytes: number;
	maxContextTokens: number;
	maxCandidates: number;
	maxGraphHops: number;
	maxHyperedges: number;
	maxToolCalls: number;
	maxWallMs: number;
}

export interface ResourceUsageV1 {
	vramBytes: number;
	contextTokens: number;
	candidateCount: number;
	graphHops: number;
	hyperedges: number;
	toolCalls: number;
	wallMs: number;
}

/** PageRank is structural evidence only; it is not identity or execution proof. */
export interface CandidateEvidenceV1 {
	semantic?: number;
	lexical?: number;
	ast?: number;
	hypergraph?: number;
	pageRankPrior?: number;
	execution?: number;
	freshness?: number;
}

export interface CandidateV1 {
	canonicalId: string;
	score: number;
	evidence: CandidateEvidenceV1;
	revisions: AtlasRevisionSet;
	evidenceRefs?: string[];
	sourceRef?: string;
	lane?: AtlasLaneName;
}

export interface CandidateExpansionV1 {
	candidateLimit: number;
	candidateIds: string[];
	deltaFromPrevious?: number;
}

export interface CandidateFiberV1 {
	requestId: string;
	candidates: CandidateV1[];
	multiplicity: number;
	stabilizationDelta?: number;
	stable: boolean;
	status: AtlasResolutionStatus;
	revisions: AtlasRevisionSet;
	expansions: CandidateExpansionV1[];
	unresolvedRevisionCandidateIds: string[];
}

export interface HyperedgeParticipantV1 {
	canonicalId: string;
	role: string;
}

/**
 * Use a hyperedge when the n-ary relation itself is the fact. Ordinary binary
 * AST/graph relations should stay ordinary edges.
 */
export interface HyperedgeV1 {
	hyperedgeId: string;
	predicate: string;
	participants: HyperedgeParticipantV1[];
	evidenceRefs: string[];
	workspaceRevision: string;
	graphRevision: string;
	sourceRevision: string;
	producerRevision: string;
	checksum: string;
}
