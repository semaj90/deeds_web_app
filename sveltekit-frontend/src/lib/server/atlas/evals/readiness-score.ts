export type ReadinessStatus = 'proven' | 'partial' | 'blocked' | 'not_started';

export interface ReadinessGateV1 {
	id: string;
	label: string;
	weight: number;
	status: ReadinessStatus;
	evidenceRefs?: readonly string[];
}

export interface ReadinessScoreV1 {
	percent: number;
	weightedEarned: number;
	weightedPossible: number;
	counts: Record<ReadinessStatus, number>;
}

const STATUS_FACTOR: Record<ReadinessStatus, number> = {
	proven: 1,
	partial: 0.5,
	blocked: 0,
	not_started: 0,
};

/**
 * Compute a transparent 0-100 engineering-readiness score.
 *
 * This is NOT a claim to implement or reproduce any external benchmark named
 * REAP. It is an internal Parent Atlas gate score so progress cannot be
 * inflated by counting plans as completed work.
 */
export function scoreReadiness(gates: readonly ReadinessGateV1[]): ReadinessScoreV1 {
	if (gates.length === 0) {
		return {
			percent: 0,
			weightedEarned: 0,
			weightedPossible: 0,
			counts: { proven: 0, partial: 0, blocked: 0, not_started: 0 },
		};
	}

	let weightedPossible = 0;
	let weightedEarned = 0;
	const counts: Record<ReadinessStatus, number> = {
		proven: 0,
		partial: 0,
		blocked: 0,
		not_started: 0,
	};

	for (const gate of gates) {
		if (!gate.id.trim() || !gate.label.trim()) throw new Error('gate id and label are required');
		if (!Number.isFinite(gate.weight) || gate.weight <= 0) throw new Error(`invalid gate weight: ${gate.id}`);
		weightedPossible += gate.weight;
		weightedEarned += gate.weight * STATUS_FACTOR[gate.status];
		counts[gate.status] += 1;
	}

	return {
		percent: Number(((weightedEarned / weightedPossible) * 100).toFixed(2)),
		weightedEarned,
		weightedPossible,
		counts,
	};
}

/**
 * Alignment template for the current roadmap. Callers must attach evidence and
 * set statuses from observed receipts; this function intentionally does not
 * hard-code a claimed completion percentage.
 */
export function parentAtlasReadinessTemplate(): ReadinessGateV1[] {
	return [
		{ id: 'graph.pagerank.reference', label: 'PageRank mathematical/reference oracle parity', weight: 10, status: 'not_started' },
		{ id: 'graph.nary.projection', label: 'N-ary relation projection preserves identity and roles', weight: 8, status: 'not_started' },
		{ id: 'alignment.canonical', label: 'AST/POS/embedding/graph evidence shares canonical alignment', weight: 12, status: 'not_started' },
		{ id: 'features.revisioned', label: 'Revision-qualified feature matrix and ordinal map', weight: 10, status: 'not_started' },
		{ id: 'retrieval.exact-promotion', label: 'Sample/rank then exact-evidence promotion', weight: 10, status: 'not_started' },
		{ id: 'workflow.receipts', label: 'Agentic DAG emits typed execution/test receipts', weight: 12, status: 'not_started' },
		{ id: 'cache.content-addressed', label: 'Computed workflow/cache artifacts are content addressed and invalidated by revision', weight: 8, status: 'not_started' },
		{ id: 'gpu.parity', label: 'CPU/PyTorch/GPU numerical parity gates', weight: 10, status: 'not_started' },
		{ id: 'eval.environment', label: 'Gym-style deterministic task/evaluation environment', weight: 6, status: 'not_started' },
		{ id: 'training.dataset', label: 'Only verified receipts become adapter training examples', weight: 6, status: 'not_started' },
		{ id: 'training.checkpointing', label: 'QLoRA/Unsloth checkpoint and resume path proven', weight: 4, status: 'not_started' },
		{ id: 'training.adapter-eval', label: 'Adapter beats unchanged-base oracle on held-out evals', weight: 4, status: 'not_started' },
	];
}
