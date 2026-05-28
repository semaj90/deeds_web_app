import fs from 'node:fs';
import path from 'node:path';

export interface BifrostTraceInput {
	query: string;
	qdrantHits: Array<{ id: string | number; score: number; sourceRef?: string; [key: string]: any }>;
	turbovecDiff: { before: string[]; after: string[]; moved: string[] };
	sourceRefs: string[];
	aeCentroidIds?: Array<string | number>;
	neo4jAuthorityScores?: Record<string, number>;
	bifrostModel: string;
	bifrostLane: string;
	tokenSpend: number;
	latencyBreakdown: {
		retrieval?: number;
		rerank?: number;
		synthesis?: number;
		[key: string]: number | undefined;
	};
	fallbackReason?: string;
}

export interface BifrostTraceRecord {
	timestamp: string;
	query: string;
	transition_score: number;
	selected_sourceRefs: string[];
	dropped_sourceRefs: string[];
	latency_breakdown: Record<string, number>;
	fallback_reason: string;
	token_spend: number;
	model_lane: string;
	metadata: {
		qdrant_count: number;
		turbovec_diff: { before: string[]; after: string[]; moved: string[] };
		ae_centroid_ids: Array<string | number>;
		neo4j_authority_scores: Record<string, number>;
	};
}

export async function recordBifrostTrace(input: BifrostTraceInput): Promise<BifrostTraceRecord> {
	// Compute transition_score
	// We'll calculate it based on the average score of selected (top-10 or after reranking top-N) hits
	const topHits = input.qdrantHits.slice(0, 10);
	const totalScore = topHits.reduce((sum, h) => sum + (h.score || 0), 0);
	const transition_score = topHits.length > 0 ? (totalScore / topHits.length) : 0.0;

	// selected vs dropped sourceRefs
	const selected_sourceRefs = input.sourceRefs.slice(0, 10);
	const dropped_sourceRefs = input.sourceRefs.slice(10);

	const record: BifrostTraceRecord = {
		timestamp: new Date().toISOString(),
		query: input.query,
		transition_score,
		selected_sourceRefs,
		dropped_sourceRefs,
		latency_breakdown: {
			retrieval: input.latencyBreakdown.retrieval ?? 0,
			rerank: input.latencyBreakdown.rerank ?? 0,
			synthesis: input.latencyBreakdown.synthesis ?? 0,
			...input.latencyBreakdown,
		} as Record<string, number>,
		fallback_reason: input.fallbackReason ?? '',
		token_spend: input.tokenSpend,
		model_lane: `${input.bifrostModel}:${input.bifrostLane}`,
		metadata: {
			qdrant_count: input.qdrantHits.length,
			turbovec_diff: input.turbovecDiff,
			ae_centroid_ids: input.aeCentroidIds ?? [],
			neo4j_authority_scores: input.neo4jAuthorityScores ?? {},
		},
	};

	// Append to .tmp/bifrost-trace.jsonl
	const tmpDir = path.resolve(process.cwd(), '.tmp');
	if (!fs.existsSync(tmpDir)) {
		fs.mkdirSync(tmpDir, { recursive: true });
	}

	const traceFile = path.join(tmpDir, 'bifrost-trace.jsonl');
	fs.appendFileSync(traceFile, JSON.stringify(record) + '\n', 'utf8');

	return record;
}
