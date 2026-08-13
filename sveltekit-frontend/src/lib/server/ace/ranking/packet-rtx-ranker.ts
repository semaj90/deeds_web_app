import { z } from 'zod';

export type PacketScoreVector = readonly [
	lexical: number,
	dense: number,
	ast: number,
	graphAuthority: number,
	centroidAffinity: number,
	recency: number,
	executionUtility: number,
	cacheHotness: number,
	normalizedCost: number,
];

export const packetScoreVectorSchema = z.tuple([
	z.number().finite(),
	z.number().finite(),
	z.number().finite(),
	z.number().finite(),
	z.number().finite(),
	z.number().finite(),
	z.number().finite(),
	z.number().finite(),
	z.number().finite(),
]);

export interface PacketRankInput {
	packetKey: string;
	sourceRef: string;
	content: string;
	tokenCount: number;
	vector: PacketScoreVector;
	supportingPacketKeys?: string[];
	packetKind?: string;
}

export interface RankedPacket extends PacketRankInput {
	score: number;
	rank: number;
}

export interface PacketRankPolicy {
	weights: PacketScoreVector;
}

export const DEFAULT_PACKET_RANK_POLICY: PacketRankPolicy = {
	weights: [
		0.16,
		0.21,
		0.17,
		0.14,
		0.10,
		0.09,
		0.08,
		0.03,
		-0.02,
	],
};

const PacketRankInputSchema = z.object({
	packetKey: z.string().min(1),
	sourceRef: z.string().min(1),
	content: z.string(),
	tokenCount: z.number().finite().nonnegative(),
	vector: packetScoreVectorSchema,
	supportingPacketKeys: z.array(z.string().min(1)).default([]),
	packetKind: z.string().optional(),
}).strict();

function clampScore(score: number): number {
	if (!Number.isFinite(score)) return 0;
	return Number(score.toFixed(6));
}

export function scorePacketFeatures(
	vector: PacketScoreVector,
	weights: PacketScoreVector = DEFAULT_PACKET_RANK_POLICY.weights
): number {
	let score = 0;
	for (let i = 0; i < vector.length; i++) {
		score += Number(vector[i] ?? 0) * Number(weights[i] ?? 0);
	}
	return clampScore(score);
}

export function rankPackets(
	inputs: PacketRankInput[],
	policy: Partial<PacketRankPolicy> = {}
): RankedPacket[] {
	const weights = policy.weights ?? DEFAULT_PACKET_RANK_POLICY.weights;
	const validated = inputs.map((input) => PacketRankInputSchema.parse(input));
	const scored = validated.map((input) => ({
		...input,
		score: scorePacketFeatures(input.vector, weights),
	}));

	scored.sort((a, b) => {
		if (a.score !== b.score) return b.score - a.score;
		if (a.vector[3] !== b.vector[3]) return b.vector[3] - a.vector[3];
		return a.packetKey.localeCompare(b.packetKey);
	});

	return scored.map((row, index) => ({
		...row,
		rank: index + 1,
	}));
}

export function selectTopKPackets(
	ranked: RankedPacket[],
	options: {
		maxPackets: number;
		tokenBudget: number;
		reservedTokens?: number;
		minScore?: number;
	}
): { selected: RankedPacket[]; rejected: RankedPacket[]; selectedTokens: number } {
	const maxPackets = Math.max(1, Math.trunc(options.maxPackets));
	const reservedTokens = Math.max(0, Math.trunc(options.reservedTokens ?? 0));
	const usableBudget = Math.max(0, Math.trunc(options.tokenBudget) - reservedTokens);
	const minScore = options.minScore ?? 0;

	const selected: RankedPacket[] = [];
	const rejected: RankedPacket[] = [];
	let selectedTokens = 0;

	for (const row of ranked) {
		if (selected.length >= maxPackets) {
			rejected.push(row);
			continue;
		}
		if (row.score < minScore) {
			rejected.push(row);
			continue;
		}
		if (selectedTokens + row.tokenCount > usableBudget) {
			rejected.push(row);
			continue;
		}
		selected.push(row);
		selectedTokens += row.tokenCount;
	}

	return { selected, rejected, selectedTokens };
}
