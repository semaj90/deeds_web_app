import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PacketAssemblyManifestV1 } from '../context/packet-assembler.js';

export const toolDecisionSchema = z.object({
	toolName: z.string().min(1),
	toolArguments: z.record(z.string(), z.unknown()),
	supportingPacketKeys: z.array(z.string().min(1)).default([]),
	policyVersion: z.string().min(1),
	reasons: z.array(z.string()).default([]),
}).strict();

export const toolExecutionResultSchema = z.object({
	executionId: z.string().min(1),
	status: z.enum(['SUCCESS', 'FAILED', 'UNAVAILABLE', 'TIMEOUT']),
	output: z.unknown().optional(),
	error: z.string().optional(),
	toolRevision: z.string().optional(),
}).strict();

export const toolCallReceiptSchema = z.object({
	receiptId: z.string().min(1),
	requestId: z.string().min(1),
	manifestHash: z.string().min(1),
	toolName: z.string().min(1),
	toolArgumentsHash: z.string().min(1),
	supportingPacketKeys: z.array(z.string().min(1)),
	selectedPacketKeys: z.array(z.string().min(1)),
	rejectedPacketKeys: z.array(z.string().min(1)),
	decisionHash: z.string().min(1),
	executionId: z.string().min(1),
	executionStatus: z.enum(['SUCCESS', 'FAILED', 'UNAVAILABLE', 'TIMEOUT']),
	executionOutputHash: z.string().min(1),
	toolRevision: z.string().optional(),
	createdAt: z.string().datetime(),
	metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type ToolDecisionV1 = z.infer<typeof toolDecisionSchema>;
export type ToolExecutionResultV1 = z.infer<typeof toolExecutionResultSchema>;
export type ToolCallReceiptV1 = z.infer<typeof toolCallReceiptSchema>;

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

function getManifestPacketKeys(manifest: PacketAssemblyManifestV1): {
	selected: string[];
	rejected: string[];
} {
	const selected = (manifest as { selectedPacketKeys?: unknown }).selectedPacketKeys;
	const rejected = (manifest as { rejectedPacketKeys?: unknown }).rejectedPacketKeys;
	return {
		selected: Array.isArray(selected) ? [...selected] : [],
		rejected: Array.isArray(rejected) ? [...rejected] : [],
	};
}

function getManifestHash(manifest: PacketAssemblyManifestV1): string {
	const manifestHash = (manifest as { manifestHash?: unknown }).manifestHash;
	if (typeof manifestHash === 'string' && manifestHash.length > 0) {
		return manifestHash;
	}
	return `sha256:${sha256(stableStringify({
		schemaVersion: (manifest as { schemaVersion?: unknown }).schemaVersion ?? 'ace.packet.assembly.v1',
		requestId: manifest.requestId,
		assemblyPolicyVersion: manifest.assemblyPolicyVersion,
		rankingPolicyVersion: manifest.rankingPolicyVersion,
		tokenBudget: manifest.tokenBudget,
		reservedTokens: manifest.reservedTokens,
		usableTokenBudget: manifest.usableTokenBudget,
		maxPackets: manifest.maxPackets,
		selectedPacketKeys: getManifestPacketKeys(manifest).selected,
		rejectedPacketKeys: getManifestPacketKeys(manifest).rejected,
		selectedTokens: manifest.selectedTokens,
		sections: manifest.sections,
	})).slice(0, 24)}`;
}

export function validateToolDecision(
	decision: ToolDecisionV1,
	manifest: PacketAssemblyManifestV1,
	availableTools: readonly string[]
): ToolDecisionV1 {
	const validated = toolDecisionSchema.parse(decision);
	const selected = new Set(getManifestPacketKeys(manifest).selected);
	for (const key of validated.supportingPacketKeys) {
		if (!selected.has(key)) {
			throw new Error(`Tool decision references unselected packet key: ${key}`);
		}
	}
	if (!availableTools.includes(validated.toolName)) {
		throw new Error(`Tool decision references unavailable tool: ${validated.toolName}`);
	}
	return validated;
}

export function buildToolCallReceipt(
	requestId: string,
	manifest: PacketAssemblyManifestV1,
	decision: ToolDecisionV1,
	execution: ToolExecutionResultV1,
	options: {
		toolRevision?: string;
		now?: Date;
		metadata?: Record<string, unknown>;
	} = {}
): ToolCallReceiptV1 {
	const validatedDecision = toolDecisionSchema.parse(decision);
	const validatedExecution = toolExecutionResultSchema.parse(execution);
	const manifestHash = getManifestHash(manifest);
	const decisionHash = `sha256:${sha256(stableStringify({
		toolName: validatedDecision.toolName,
		toolArguments: validatedDecision.toolArguments,
		supportingPacketKeys: validatedDecision.supportingPacketKeys,
		policyVersion: validatedDecision.policyVersion,
		reasons: validatedDecision.reasons,
	})).slice(0, 24)}`;
	const toolArgumentsHash = `sha256:${sha256(stableStringify(validatedDecision.toolArguments)).slice(0, 24)}`;
	const executionOutputHash = `sha256:${sha256(stableStringify(validatedExecution.output ?? validatedExecution.error ?? null)).slice(0, 24)}`;
	const { selected: selectedPacketKeys, rejected: rejectedPacketKeys } = getManifestPacketKeys(manifest);

	return toolCallReceiptSchema.parse({
		receiptId: `sha256:${sha256(stableStringify({
			requestId,
			manifestHash,
			decisionHash,
			executionId: validatedExecution.executionId,
			executionStatus: validatedExecution.status,
			toolArgumentsHash,
		})).slice(0, 24)}`,
		requestId,
		manifestHash,
		toolName: validatedDecision.toolName,
		toolArgumentsHash,
		supportingPacketKeys: [...new Set(validatedDecision.supportingPacketKeys)].sort((a, b) => a.localeCompare(b)),
		selectedPacketKeys,
		rejectedPacketKeys,
		decisionHash,
		executionId: validatedExecution.executionId,
		executionStatus: validatedExecution.status,
		executionOutputHash,
		toolRevision: options.toolRevision ?? validatedExecution.toolRevision,
		createdAt: (options.now ?? new Date()).toISOString(),
		metadata: options.metadata,
	});
}
