import type { ResourceEnvelopeV1, ResourceUsageV1 } from '../contracts/bounded-resolution.js';

export function emptyResourceUsage(): ResourceUsageV1 {
	return {
		vramBytes: 0,
		contextTokens: 0,
		candidateCount: 0,
		graphHops: 0,
		hyperedges: 0,
		toolCalls: 0,
		wallMs: 0,
	};
}

export function addResourceUsage(
	usage: Readonly<ResourceUsageV1>,
	increment: Partial<ResourceUsageV1>,
): ResourceUsageV1 {
	return {
		vramBytes: usage.vramBytes + Math.max(0, increment.vramBytes ?? 0),
		contextTokens: usage.contextTokens + Math.max(0, increment.contextTokens ?? 0),
		candidateCount: usage.candidateCount + Math.max(0, increment.candidateCount ?? 0),
		graphHops: usage.graphHops + Math.max(0, increment.graphHops ?? 0),
		hyperedges: usage.hyperedges + Math.max(0, increment.hyperedges ?? 0),
		toolCalls: usage.toolCalls + Math.max(0, increment.toolCalls ?? 0),
		wallMs: Math.max(usage.wallMs, Math.max(0, increment.wallMs ?? 0)),
	};
}

export function withWallTime(usage: Readonly<ResourceUsageV1>, wallMs: number): ResourceUsageV1 {
	return { ...usage, wallMs: Math.max(0, wallMs) };
}

/**
 * Reports finite boundaries already reached by this request. These reasons are
 * diagnostic evidence only; callers must not reinterpret them as proof that a
 * candidate, path, or answer does not exist outside the envelope.
 */
export function resourceBoundaryReasons(
	budget: Readonly<ResourceEnvelopeV1>,
	usage: Readonly<ResourceUsageV1>,
): string[] {
	const reasons: string[] = [];

	if (usage.vramBytes >= budget.maxVramBytes) reasons.push('VRAM_BUDGET');
	if (usage.contextTokens >= budget.maxContextTokens) reasons.push('CONTEXT_TOKEN_BUDGET');
	if (usage.candidateCount >= budget.maxCandidates) reasons.push('CANDIDATE_BUDGET');
	if (usage.graphHops >= budget.maxGraphHops) reasons.push('GRAPH_HOP_BUDGET');
	if (usage.hyperedges >= budget.maxHyperedges) reasons.push('HYPEREDGE_BUDGET');
	if (usage.toolCalls >= budget.maxToolCalls) reasons.push('TOOL_CALL_BUDGET');
	if (usage.wallMs >= budget.maxWallMs) reasons.push('WALL_TIME_BUDGET');

	return reasons;
}

export function hasResourceBoundary(
	budget: Readonly<ResourceEnvelopeV1>,
	usage: Readonly<ResourceUsageV1>,
): boolean {
	return resourceBoundaryReasons(budget, usage).length > 0;
}

export function remainingCandidateCapacity(
	budget: Readonly<ResourceEnvelopeV1>,
	usage: Readonly<ResourceUsageV1>,
): number {
	return Math.max(0, budget.maxCandidates - usage.candidateCount);
}
