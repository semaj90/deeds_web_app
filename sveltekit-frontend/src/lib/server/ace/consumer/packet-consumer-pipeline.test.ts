import { describe, expect, it, vi } from 'vitest';

import type { PacketRankInput } from '../ranking/packet-rtx-ranker.js';
import { runPacketConsumerPipeline } from './packet-consumer-pipeline.js';

function packet(packetKey: string, scoreVector: PacketRankInput['vector']): PacketRankInput {
	return {
		packetKey,
		sourceRef: `${packetKey}.ts`,
		content: `${packetKey} content`,
		tokenCount: 10,
		vector: scoreVector,
	};
}

describe('packet-consumer-pipeline', () => {
	it('rejects tool decisions that reference packets not selected by the assembler', async () => {
		const executeMcp = vi.fn(async () => ({ executionId: 'exec-1', status: 'SUCCESS' as const, output: { ok: true } }));
		const synthesize = vi.fn(async () => ({ text: 'synthesized', citations: [] }));

		await expect(runPacketConsumerPipeline({
			requestId: 'req-1',
			packets: [
				packet('selected', [0.9, 0.8, 0.1, 0.8, 0.2, 0.4, 0.1, 0.0, 0.1]),
			],
			tokenBudget: 20,
			maxPackets: 1,
			rankingPolicyVersion: 'rank.v1',
			assemblyPolicyVersion: 'assemble.v1',
			availableTools: ['atlas.tools.inspect'],
			toolPolicyVersion: 'tool.v1',
			toolSelector: () => ({
				toolName: 'atlas.tools.inspect',
				toolArguments: {},
				supportingPacketKeys: ['missing'],
				policyVersion: 'tool.v1',
				reasons: ['test'],
			}),
			executeMcp,
			synthesize,
			now: new Date('2026-08-13T00:00:00.000Z'),
		})).rejects.toThrow(/unselected packet key/);

		expect(executeMcp).not.toHaveBeenCalled();
		expect(synthesize).not.toHaveBeenCalled();
	});

	it('runs the deterministic rank-select-assemble-execute-synthesize chain', async () => {
		const executeMcp = vi.fn(async () => ({ executionId: 'exec-1', status: 'SUCCESS' as const, output: { ok: true } }));
		const synthesize = vi.fn(async (manifest, receipt, toolResult) => ({
			text: `${manifest.manifestHash}:${receipt.receiptId}:${JSON.stringify(toolResult)}`,
			citations: [],
		}));

		const result = await runPacketConsumerPipeline({
			requestId: 'req-2',
			packets: [
				packet('a', [0.9, 0.8, 0.5, 0.8, 0.2, 0.4, 0.2, 0.0, 0.1]),
				packet('b', [0.1, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.0, 0.1]),
			],
			tokenBudget: 50,
			maxPackets: 2,
			rankingPolicyVersion: 'rank.v1',
			assemblyPolicyVersion: 'assemble.v1',
			availableTools: ['atlas.tools.inspect', 'atlas.tools.other'],
			toolPolicyVersion: 'tool.v1',
			executeMcp,
			synthesize,
			now: new Date('2026-08-13T00:00:00.000Z'),
		});

		expect(result.manifest.selectedPacketKeys).toEqual(['a', 'b']);
		expect(result.featureMatrix.packetKeys).toEqual(result.rankedPackets.map((packet) => packet.packetKey));
		expect(result.featureMatrix.rows).toBe(2);
		expect(result.featureMatrix.cols).toBe(9);
		expect(result.toolDecision.toolName).toBe('atlas.tools.inspect');
		expect(result.toolReceipt.manifestHash).toBe(result.manifest.manifestHash);
		expect(result.toolReceipt.selectedPacketKeys).toEqual(result.manifest.selectedPacketKeys);
		expect(result.synthesis).toEqual({
			text: expect.any(String),
			citations: [],
		});
		expect(executeMcp).toHaveBeenCalledOnce();
		expect(synthesize).toHaveBeenCalledOnce();
	});
});
