import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { RankedPacket } from '../ranking/packet-rtx-ranker.js';

export const packetAssemblySectionSchema = z.object({
	kind: z.literal('packet'),
	packetKey: z.string().min(1),
	sourceRef: z.string().min(1),
	tokenCount: z.number().int().nonnegative(),
	score: z.number().finite(),
	content: z.string(),
	rank: z.number().int().positive(),
	supportingPacketKeys: z.array(z.string().min(1)).default([]),
}).strict();

export const packetAssemblyManifestSchema = z.object({
	schemaVersion: z.literal('ace.packet.assembly.v1'),
	requestId: z.string().min(1),
	assemblyPolicyVersion: z.string().min(1),
	rankingPolicyVersion: z.string().min(1),
	tokenBudget: z.number().int().positive(),
	reservedTokens: z.number().int().nonnegative(),
	usableTokenBudget: z.number().int().nonnegative(),
	maxPackets: z.number().int().positive(),
	selectedPacketKeys: z.array(z.string().min(1)),
	rejectedPacketKeys: z.array(z.string().min(1)),
	selectedTokens: z.number().int().nonnegative(),
	sections: z.array(packetAssemblySectionSchema),
	manifestHash: z.string().min(1),
	createdAt: z.string().datetime(),
}).strict();

export type PacketAssemblySectionV1 = z.infer<typeof packetAssemblySectionSchema>;
export type PacketAssemblyManifestV1 = z.infer<typeof packetAssemblyManifestSchema>;

export interface PacketAssemblyInput {
	requestId: string;
	rankedPackets: RankedPacket[];
	tokenBudget: number;
	maxPackets: number;
	reservedTokens?: number;
	minScore?: number;
	rankingPolicyVersion: string;
	assemblyPolicyVersion: string;
	now?: Date;
}

export interface PacketAssemblyResult {
	manifest: PacketAssemblyManifestV1;
	selectedPackets: RankedPacket[];
	rejectedPackets: RankedPacket[];
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
	}
	if (value && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function sha256(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}

export function assemblePackets(input: PacketAssemblyInput): PacketAssemblyResult {
	if (!input.requestId) throw new Error('assemblePackets requires requestId');
	if (!Number.isFinite(input.tokenBudget) || input.tokenBudget <= 0) throw new Error('assemblePackets requires tokenBudget > 0');
	if (!Number.isFinite(input.maxPackets) || input.maxPackets <= 0) throw new Error('assemblePackets requires maxPackets > 0');

	const reservedTokens = Math.max(0, Math.trunc(input.reservedTokens ?? 0));
	const usableTokenBudget = Math.max(0, Math.trunc(input.tokenBudget) - reservedTokens);
	const selectedPackets: RankedPacket[] = [];
	const rejectedPackets: RankedPacket[] = [];
	let selectedTokens = 0;

	for (const packet of [...input.rankedPackets].sort((a, b) => {
		if (a.rank !== b.rank) return a.rank - b.rank;
		if (a.score !== b.score) return b.score - a.score;
		return a.packetKey.localeCompare(b.packetKey);
	})) {
		if (selectedPackets.length >= Math.trunc(input.maxPackets)) {
			rejectedPackets.push(packet);
			continue;
		}
		if (packet.score < (input.minScore ?? 0)) {
			rejectedPackets.push(packet);
			continue;
		}
		if (selectedTokens + packet.tokenCount > usableTokenBudget) {
			rejectedPackets.push(packet);
			continue;
		}
		selectedPackets.push(packet);
		selectedTokens += packet.tokenCount;
	}

	const selectedPacketKeys = selectedPackets.map((packet) => packet.packetKey);
	const rejectedPacketKeys = [...new Set(rejectedPackets.map((packet) => packet.packetKey))];
	const sections: PacketAssemblySectionV1[] = selectedPackets.map((packet) => ({
		kind: 'packet',
		packetKey: packet.packetKey,
		sourceRef: packet.sourceRef,
		tokenCount: packet.tokenCount,
		score: packet.score,
		content: packet.content,
		rank: packet.rank,
		supportingPacketKeys: [...new Set(packet.supportingPacketKeys ?? [])].sort((a, b) => a.localeCompare(b)),
	}));

	const manifestBase = {
		schemaVersion: 'ace.packet.assembly.v1' as const,
		requestId: input.requestId,
		assemblyPolicyVersion: input.assemblyPolicyVersion,
		rankingPolicyVersion: input.rankingPolicyVersion,
		tokenBudget: Math.trunc(input.tokenBudget),
		reservedTokens,
		usableTokenBudget,
		maxPackets: Math.trunc(input.maxPackets),
		selectedPacketKeys,
		rejectedPacketKeys,
		selectedTokens,
		sections,
		createdAt: (input.now ?? new Date()).toISOString(),
	};

	const manifestHash = `sha256:${sha256(stableStringify({
		requestId: manifestBase.requestId,
		assemblyPolicyVersion: manifestBase.assemblyPolicyVersion,
		rankingPolicyVersion: manifestBase.rankingPolicyVersion,
		tokenBudget: manifestBase.tokenBudget,
		reservedTokens: manifestBase.reservedTokens,
		usableTokenBudget: manifestBase.usableTokenBudget,
		maxPackets: manifestBase.maxPackets,
		selectedPacketKeys: manifestBase.selectedPacketKeys,
		rejectedPacketKeys: manifestBase.rejectedPacketKeys,
		selectedTokens: manifestBase.selectedTokens,
		sections: manifestBase.sections.map((section) => ({
			kind: section.kind,
			packetKey: section.packetKey,
			sourceRef: section.sourceRef,
			tokenCount: section.tokenCount,
			score: section.score,
			rank: section.rank,
			supportingPacketKeys: section.supportingPacketKeys,
			contentHash: sha256(section.content),
		})),
	})).slice(0, 24)}`;

	const manifest: PacketAssemblyManifestV1 = packetAssemblyManifestSchema.parse({
		...manifestBase,
		manifestHash,
	});

	return {
		manifest,
		selectedPackets,
		rejectedPackets,
	};
}
