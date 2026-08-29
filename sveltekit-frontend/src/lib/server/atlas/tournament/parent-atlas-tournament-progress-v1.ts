export type TournamentGateState =
	| 'UNPROVEN'
	| 'CREATED'
	| 'WIRED'
	| 'PARTIAL'
	| 'PROVEN'
	| 'DONE'
	| 'BLOCKED';

export type TournamentGateId =
	| 'source_identity'
	| 'treesitter_ast'
	| 'ast_grep_structural'
	| 'ts_morph_semantics'
	| 'custom_dsl_validation'
	| 'semantic_768'
	| 'candidate_ordinal'
	| 'candidate_feature_matrix'
	| 'svd_pca_reference'
	| 'ewin_tang_nomination'
	| 'gpu_exact_oracle'
	| 'cagra_challenger'
	| 'ace_prefill'
	| 'bitfrost_cache'
	| 'valkey_cache'
	| 'kv_cache_identity'
	| 'rlm_context_loop'
	| 'hypergraph_rag'
	| 'inverse_synthesis'
	| 'dag_execution'
	| 'output_concatenation'
	| 'postgres18_canonical'
	| 'postgres_bitmap_eligibility'
	| 'drizzle_node_pg_parity'
	| 'qdrant_revisioned_fanout'
	| 'go_retrieval_indexed_readback'
	| 'turbovec_challenger'
	| 'multi_agent_receipt'
	| 'held_out_tournament';

export type TournamentGateV1 = {
	id: TournamentGateId;
	phase: string;
	label: string;
	weight: number;
	state: TournamentGateState;
	/** Optional measured completion for PARTIAL gates, 0..1. */
	completion?: number;
	receiptRef?: string;
	filesEdited?: string[];
	blockedBy?: TournamentGateId[];
};

export type TournamentRunEfficiencyV1 = {
	agentTurns?: number;
	inputTokens?: number;
	outputTokens?: number;
	baselineInputTokens?: number;
	baselineOutputTokens?: number;
	kvCacheReadTokens?: number;
	kvCacheWriteTokens?: number;
	prefillTokensAvoided?: number;
	wallTimeMs?: number;
	baselineWallTimeMs?: number;
	filesEdited?: number;
	filesReused?: number;
	valkeyHits?: number;
	valkeyMisses?: number;
	bitfrostHits?: number;
	bitfrostMisses?: number;
};

export type TournamentProgressV1 = {
	schema: 'atlas.tournament-progress.v1';
	proofProgressPct: number;
	provenWeight: number;
	totalWeight: number;
	currentPhase: string | null;
	currentGate: TournamentGateId | null;
	blockedGates: TournamentGateId[];
	remainingGates: TournamentGateId[];
	phases: Array<{
		phase: string;
		progressPct: number;
		provenWeight: number;
		totalWeight: number;
	}>;
	efficiency: {
		tokenSavingsPct: number | null;
		wallTimeSavingsPct: number | null;
		kvReusePct: number | null;
		cacheHitPct: number | null;
		filesReusePct: number | null;
	};
};

const STATE_FACTOR: Record<TournamentGateState, number> = {
	UNPROVEN: 0,
	CREATED: 0.25,
	WIRED: 0.5,
	PARTIAL: 0.5,
	PROVEN: 1,
	DONE: 1,
	BLOCKED: 0
};

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function ratioPct(numerator: number | undefined, denominator: number | undefined): number | null {
	if (numerator === undefined || denominator === undefined || denominator <= 0) return null;
	return Number((100 * clamp01(numerator / denominator)).toFixed(2));
}

function savingsPct(actual: number | undefined, baseline: number | undefined): number | null {
	if (actual === undefined || baseline === undefined || baseline <= 0) return null;
	return Number((100 * clamp01(1 - actual / baseline)).toFixed(2));
}

function gateFactor(gate: TournamentGateV1): number {
	if (gate.state === 'PARTIAL' && gate.completion !== undefined) return clamp01(gate.completion);
	return STATE_FACTOR[gate.state];
}

/**
 * Progress is proof weighted, not elapsed-time weighted.
 * Token/cache/time savings are telemetry only and MUST NOT raise proofProgressPct.
 */
export function calculateTournamentProgressV1(
	gates: TournamentGateV1[],
	efficiency: TournamentRunEfficiencyV1 = {}
): TournamentProgressV1 {
	const normalized = gates.map((gate) => ({ ...gate, weight: Math.max(0, gate.weight) }));
	const totalWeight = normalized.reduce((sum, gate) => sum + gate.weight, 0);
	const provenWeight = normalized.reduce((sum, gate) => sum + gate.weight * gateFactor(gate), 0);

	const phaseNames = [...new Set(normalized.map((gate) => gate.phase))];
	const phases = phaseNames.map((phase) => {
		const phaseGates = normalized.filter((gate) => gate.phase === phase);
		const phaseTotal = phaseGates.reduce((sum, gate) => sum + gate.weight, 0);
		const phaseProven = phaseGates.reduce((sum, gate) => sum + gate.weight * gateFactor(gate), 0);
		return {
			phase,
			progressPct: phaseTotal > 0 ? Number(((phaseProven / phaseTotal) * 100).toFixed(2)) : 0,
			provenWeight: Number(phaseProven.toFixed(4)),
			totalWeight: Number(phaseTotal.toFixed(4))
		};
	});

	const firstIncomplete = normalized.find((gate) => gateFactor(gate) < 1) ?? null;
	const actualTokens = (efficiency.inputTokens ?? 0) + (efficiency.outputTokens ?? 0);
	const baselineTokens = (efficiency.baselineInputTokens ?? 0) + (efficiency.baselineOutputTokens ?? 0);
	const cacheHits = (efficiency.valkeyHits ?? 0) + (efficiency.bitfrostHits ?? 0);
	const cacheTotal = cacheHits + (efficiency.valkeyMisses ?? 0) + (efficiency.bitfrostMisses ?? 0);
	const kvRead = efficiency.kvCacheReadTokens ?? 0;
	const kvWrite = efficiency.kvCacheWriteTokens ?? 0;
	const fileTotal = (efficiency.filesEdited ?? 0) + (efficiency.filesReused ?? 0);

	return {
		schema: 'atlas.tournament-progress.v1',
		proofProgressPct: totalWeight > 0 ? Number(((provenWeight / totalWeight) * 100).toFixed(2)) : 0,
		provenWeight: Number(provenWeight.toFixed(4)),
		totalWeight: Number(totalWeight.toFixed(4)),
		currentPhase: firstIncomplete?.phase ?? null,
		currentGate: firstIncomplete?.id ?? null,
		blockedGates: normalized.filter((gate) => gate.state === 'BLOCKED').map((gate) => gate.id),
		remainingGates: normalized.filter((gate) => gateFactor(gate) < 1).map((gate) => gate.id),
		phases,
		efficiency: {
			tokenSavingsPct: baselineTokens > 0 ? savingsPct(actualTokens, baselineTokens) : null,
			wallTimeSavingsPct: savingsPct(efficiency.wallTimeMs, efficiency.baselineWallTimeMs),
			kvReusePct: kvRead + kvWrite > 0 ? ratioPct(kvRead, kvRead + kvWrite) : null,
			cacheHitPct: cacheTotal > 0 ? ratioPct(cacheHits, cacheTotal) : null,
			filesReusePct: fileTotal > 0 ? ratioPct(efficiency.filesReused, fileTotal) : null
		}
	};
}

/**
 * Canonical denominator for the admin EXP bar. Callers replace states and
 * attach receipts; they do not add ad-hoc weights per run.
 */
export const PARENT_ATLAS_TOURNAMENT_GATES_V1: ReadonlyArray<Omit<TournamentGateV1, 'state'>> = [
	{ id: 'source_identity', phase: '01 Identity', label: 'Canonical source / packet / revision identity', weight: 8 },
	{ id: 'treesitter_ast', phase: '02 Structural', label: 'Tree-sitter AST/CST evidence + incremental byte parity', weight: 5 },
	{ id: 'ast_grep_structural', phase: '02 Structural', label: 'AST-grep structural extraction', weight: 4 },
	{ id: 'ts_morph_semantics', phase: '02 Structural', label: 'ts-morph/compiler semantic evidence', weight: 2 },
	{ id: 'custom_dsl_validation', phase: '02 Structural', label: 'Custom DSL / .okf schema validation', weight: 2 },
	{ id: 'semantic_768', phase: '03 Representations', label: 'Canonical semantic_768 coverage + revision', weight: 7 },
	{ id: 'candidate_ordinal', phase: '03 Representations', label: 'CandidateOrdinal snapshot parity', weight: 6 },
	{ id: 'candidate_feature_matrix', phase: '03 Representations', label: 'CandidateFeatureMatrix identity parity', weight: 5 },
	{ id: 'svd_pca_reference', phase: '04 Tournament', label: 'SVD/PCA bounded reference shortlist', weight: 2 },
	{ id: 'ewin_tang_nomination', phase: '04 Tournament', label: 'Tang-inspired sampled nomination challenger', weight: 2 },
	{ id: 'gpu_exact_oracle', phase: '04 Tournament', label: 'GPU exact oracle parity', weight: 3 },
	{ id: 'cagra_challenger', phase: '04 Tournament', label: 'CAGRA challenger parity', weight: 2 },
	{ id: 'ace_prefill', phase: '05 Memory', label: 'ACE prefill manifest', weight: 4 },
	{ id: 'bitfrost_cache', phase: '05 Memory', label: 'BitFrost deterministic readback/invalidation', weight: 3 },
	{ id: 'valkey_cache', phase: '05 Memory', label: 'Valkey MISS→COMPUTE→HIT replay', weight: 3 },
	{ id: 'kv_cache_identity', phase: '05 Memory', label: 'KV/prefill cache identity + revision binding', weight: 2 },
	{ id: 'rlm_context_loop', phase: '06 Synthesis', label: 'RLM bounded context loop', weight: 2 },
	{ id: 'hypergraph_rag', phase: '06 Synthesis', label: 'Hypergraph RAG evidence projection', weight: 3 },
	{ id: 'inverse_synthesis', phase: '06 Synthesis', label: 'Inverse synthesis / evidence reconstruction', weight: 2 },
	{ id: 'dag_execution', phase: '06 Synthesis', label: 'Frozen DAG execution receipt', weight: 5 },
	{ id: 'output_concatenation', phase: '06 Synthesis', label: 'Deterministic output concatenation/token budget', weight: 3 },
	{ id: 'postgres18_canonical', phase: '07 Persistence', label: 'PostgreSQL 18 canonical read/write/readback', weight: 4 },
	{ id: 'postgres_bitmap_eligibility', phase: '07 Persistence', label: 'PostgreSQL eligibility bitmap/index filter', weight: 2 },
	{ id: 'drizzle_node_pg_parity', phase: '07 Persistence', label: 'Drizzle ORM ↔ node-postgres schema parity', weight: 2 },
	{ id: 'qdrant_revisioned_fanout', phase: '07 Persistence', label: 'Qdrant revision-qualified fan-out/readback', weight: 4 },
	{ id: 'go_retrieval_indexed_readback', phase: '07 Persistence', label: 'Go Retrieval indexed readback + identity', weight: 4 },
	{ id: 'turbovec_challenger', phase: '07 Persistence', label: 'TurboVec challenger after indexed baseline', weight: 1 },
	{ id: 'multi_agent_receipt', phase: '08 Agentic', label: 'ACP/A2A multi-agent execution receipt', weight: 4 },
	{ id: 'held_out_tournament', phase: '08 Agentic', label: 'Held-out tournament quality/latency/memory promotion', weight: 6 }
] as const;
