import type { ACEContext } from '../ace/types.js';
import type { PacketRankInput, PacketScoreVector } from '../ace/ranking/packet-rtx-ranker.js';

function clamp01(value: number | null | undefined, fallback = 0): number {
	if (value == null || !Number.isFinite(value)) return fallback;
	return Math.min(1, Math.max(0, value));
}

function estimateTokens(text: string): number {
	const normalized = text.trim();
	if (!normalized) return 0;
	return Math.max(1, Math.ceil(normalized.length / 4));
}

function roundScore(value: number): number {
	return Number(value.toFixed(6));
}

function normalizeCount(value: number | null | undefined, scale: number): number {
	return clamp01(Math.max(0, Number(value) || 0) / Math.max(1, scale));
}

function normalizeStringCount(values: readonly string[] | null | undefined, scale: number): number {
	return clamp01((values?.length ?? 0) / Math.max(1, scale));
}

function deriveGraphAuthoritySignal(item: NonNullable<ACEContext['codebaseContext']>[number]): number {
	const baseAuthority = clamp01(
		item.graphAuthorityScore ?? item.pageRankScore ?? item.clusterPagerank ?? item.score
	);
	const graphStructure = (
		normalizeCount(item.graphDegree, 10) * 0.55
		) + (
		normalizeCount(item.dependencyBreadth, 10) * 0.45
	);
	return roundScore(clamp01(Math.max(baseAuthority, graphStructure)));
}

function deriveExecutionUtilitySignal(item: NonNullable<ACEContext['codebaseContext']>[number]): number {
	const processAffinity = normalizeStringCount(item.processIds, 6);
	const endpointAffinity = clamp01(
		item.endpointAffinity ?? (item.routeType ? 0.6 : 0)
	);
	const graphExecution = (endpointAffinity * 0.55) + (processAffinity * 0.45);
	const baseline = clamp01(item.cachedLlmOutput ? 0.76 : item.hasAuthGuard ? 0.6 : 0.3);
	return roundScore(clamp01(Math.max(baseline, graphExecution)));
}

function deriveCacheHotnessSignal(item: NonNullable<ACEContext['codebaseContext']>[number]): number {
	const graphCache = clamp01(item.cacheAffinity ?? 0);
	const baseline = clamp01(
		item.hotnessBucket ? 0.88 : item.cachedLlmOutput ? 0.7 : 0.18
	);
	return roundScore(clamp01(Math.max(baseline, graphCache)));
}

function buildScoreVector(item: NonNullable<ACEContext['codebaseContext']>[number]): PacketScoreVector {
	const lexical = clamp01(item.score);
	const dense = clamp01(item.encoded64Score ?? item.pageRankScore ?? item.clusterPagerank ?? item.score);
	const ast = clamp01(item.topoClass ? 0.72 : item.featureFamily ? 0.58 : 0.34);
	const graphAuthority = deriveGraphAuthoritySignal(item);
	const centroidAffinity = clamp01(item.encoded64Score ?? item.karpathyBlend ?? item.score);
	const recency = clamp01(item.cachedLlmOutput ? 0.82 : item.cachedLlmSource ? 0.7 : 0.35);
	const executionUtility = deriveExecutionUtilitySignal(item);
	const cacheHotness = deriveCacheHotnessSignal(item);
	const normalizedCost = clamp01(1 - Math.min(1, estimateTokens(item.content) / 4000));

	return [
		lexical,
		dense,
		ast,
		graphAuthority,
		centroidAffinity,
		recency,
		executionUtility,
		cacheHotness,
		normalizedCost,
	];
}

export function derivePacketInputsFromAceContext(context: Pick<ACEContext, 'codebaseContext'>): PacketRankInput[] {
	return (context.codebaseContext ?? []).map((item, index) => {
		const packetKey = item.stableKey?.trim() || item.filePath?.trim() || `atlas-packet:${index}`;
		const content = item.content ?? item.cachedLlmOutput ?? '';
		const sourceRef = item.filePath?.trim() || packetKey;

		return {
			packetKey,
			sourceRef,
			content,
			tokenCount: Math.max(1, estimateTokens(content)),
			vector: buildScoreVector(item),
			supportingPacketKeys: item.clusterKey ? [item.clusterKey] : [],
			packetKind: item.topoClass ?? item.featureFamily ?? item.routeType ?? undefined,
		};
	});
}
