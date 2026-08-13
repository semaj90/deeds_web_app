import { createHash } from 'node:crypto';
import type { PacketAssemblyManifestV1 } from '../ace/context/packet-assembler.js';
import { assemblePackets } from '../ace/context/packet-assembler.js';
import { rankPackets, selectTopKPackets, type PacketRankInput, type PacketRankPolicy } from '../ace/ranking/packet-rtx-ranker.js';
import { buildPacketFeatureMatrixFromPackets, type PacketFeatureMatrix } from './ranking/packet-feature-matrix.js';
import {
	buildToolCallReceipt,
	validateToolDecision,
	type ToolCallReceiptV1,
	type ToolDecisionV1,
	type ToolExecutionResultV1,
} from '../ace/tools/tool-call-receipt.js';

export interface PacketConsumerPipelineResult<TToolOutput = unknown, TSynthesis = unknown> {
	rankedPackets: ReturnType<typeof rankPackets>;
	featureMatrix: PacketFeatureMatrix;
	manifest: PacketAssemblyManifestV1;
	toolDecision: ToolDecisionV1;
	toolExecution: ToolExecutionResultV1;
	toolReceipt: ToolCallReceiptV1;
	synthesis: TSynthesis;
}

export interface PacketConsumerPipelineInput<TToolOutput = unknown, TSynthesis = unknown> {
	requestId: string;
	packets: PacketRankInput[];
	tokenBudget: number;
	maxPackets: number;
	rankingPolicyVersion: string;
	assemblyPolicyVersion: string;
	availableTools: readonly string[];
	toolPolicyVersion: string;
	rankerPolicy?: Partial<PacketRankPolicy>;
	minScore?: number;
	toolSelector?: (manifest: PacketAssemblyManifestV1, availableTools: readonly string[], policyVersion: string) => ToolDecisionV1;
	executeMcp: (decision: ToolDecisionV1, manifest: PacketAssemblyManifestV1) => Promise<TToolOutput>;
	synthesize: (
		manifest: PacketAssemblyManifestV1,
		receipt: ToolCallReceiptV1,
		toolResult: TToolOutput
	) => Promise<TSynthesis>;
	now?: Date;
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

function getSelectedPacketKeys(manifest: PacketAssemblyManifestV1): string[] {
	const selectedPacketKeys = (manifest as { selectedPacketKeys?: unknown }).selectedPacketKeys;
	return Array.isArray(selectedPacketKeys) ? [...selectedPacketKeys] : [];
}

function defaultToolSelector(
	manifest: PacketAssemblyManifestV1,
	availableTools: readonly string[],
	policyVersion: string
): ToolDecisionV1 {
	const toolName = [...availableTools].sort((a, b) => a.localeCompare(b))[0];
	if (!toolName) {
		throw new Error('No available tools provided to packet consumer pipeline');
	}
	const selectedPacketKeys = getSelectedPacketKeys(manifest);
	return {
		toolName,
		toolArguments: {
			requestId: manifest.requestId,
			selectedPacketKeys,
			manifestHash: manifest.manifestHash,
		},
		supportingPacketKeys: selectedPacketKeys,
		policyVersion,
		reasons: ['deterministic-default-tool-selector'],
	};
}

export async function runPacketConsumerPipeline<TToolOutput = unknown, TSynthesis = unknown>(
	input: PacketConsumerPipelineInput<TToolOutput, TSynthesis>
): Promise<PacketConsumerPipelineResult<TToolOutput, TSynthesis>> {
	const rankedPackets = rankPackets(input.packets, input.rankerPolicy);
	const featureMatrix = buildPacketFeatureMatrixFromPackets(rankedPackets);
	const selected = selectTopKPackets(rankedPackets, {
		maxPackets: input.maxPackets,
		tokenBudget: input.tokenBudget,
		minScore: input.minScore ?? 0,
	});
	const { manifest } = assemblePackets({
		requestId: input.requestId,
		rankedPackets: selected.selected,
		tokenBudget: input.tokenBudget,
		maxPackets: input.maxPackets,
		rankingPolicyVersion: input.rankingPolicyVersion,
		assemblyPolicyVersion: input.assemblyPolicyVersion,
		now: input.now,
	});

	const decision = validateToolDecision(
		(input.toolSelector ?? defaultToolSelector)(manifest, input.availableTools, input.toolPolicyVersion),
		manifest,
		input.availableTools
	);

	const selectedSet = new Set(getSelectedPacketKeys(manifest));
	for (const key of decision.supportingPacketKeys) {
		if (!selectedSet.has(key)) {
			throw new Error(`Tool decision references unselected packet key: ${key}`);
		}
	}

	const toolExecution = await input.executeMcp(decision, manifest);
	const toolReceipt = buildToolCallReceipt(input.requestId, manifest, decision, toolExecution as ToolExecutionResultV1, {
		now: input.now,
		metadata: {
			rankingPolicyVersion: input.rankingPolicyVersion,
			assemblyPolicyVersion: input.assemblyPolicyVersion,
			toolPolicyVersion: input.toolPolicyVersion,
		},
	});
	const synthesis = await input.synthesize(manifest, toolReceipt, toolExecution);

	return {
		rankedPackets,
		featureMatrix,
		manifest,
		toolDecision: decision,
		toolExecution: toolExecution as ToolExecutionResultV1,
		toolReceipt,
		synthesis,
	};
}

export function hashPacketConsumerPipelineInput(input: Pick<PacketConsumerPipelineInput, 'requestId' | 'packets' | 'tokenBudget' | 'maxPackets' | 'rankingPolicyVersion' | 'assemblyPolicyVersion' | 'availableTools' | 'toolPolicyVersion'>): string {
	return `sha256:${sha256(stableStringify({
		requestId: input.requestId,
		packetKeys: input.packets.map((packet) => packet.packetKey),
		tokenBudget: input.tokenBudget,
		maxPackets: input.maxPackets,
		rankingPolicyVersion: input.rankingPolicyVersion,
		assemblyPolicyVersion: input.assemblyPolicyVersion,
		availableTools: [...input.availableTools].sort((a, b) => a.localeCompare(b)),
		toolPolicyVersion: input.toolPolicyVersion,
	})).slice(0, 24)}`;
}
