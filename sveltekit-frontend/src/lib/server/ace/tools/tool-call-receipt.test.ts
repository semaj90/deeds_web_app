import { describe, expect, it } from 'vitest';

import { assemblePackets } from '../context/packet-assembler.js';
import { rankPackets, type PacketRankInput } from '../ranking/packet-rtx-ranker.js';
import { buildToolCallReceipt, validateToolDecision, type ToolDecisionV1 } from './tool-call-receipt.js';

function packet(packetKey: string): PacketRankInput {
	return {
		packetKey,
		sourceRef: `${packetKey}.ts`,
		content: `${packetKey} content`,
		tokenCount: 10,
		vector: [0.7, 0.6, 0.4, 0.8, 0.2, 0.4, 0.1, 0.0, 0.1],
	};
}

describe('tool-call-receipt', () => {
	it('rejects a decision that references an unselected packet key', () => {
		const ranked = rankPackets([packet('selected')]);
		const manifest = assemblePackets({
			requestId: 'req-1',
			rankedPackets: ranked,
			tokenBudget: 30,
			maxPackets: 1,
			rankingPolicyVersion: 'rank.v1',
			assemblyPolicyVersion: 'assemble.v1',
			now: new Date('2026-08-13T00:00:00.000Z'),
		}).manifest;

		const decision: ToolDecisionV1 = {
			toolName: 'atlas.tools.inspect',
			toolArguments: {},
			supportingPacketKeys: ['missing'],
			policyVersion: 'policy.v1',
			reasons: ['test'],
		};

		expect(() => validateToolDecision(decision, manifest, ['atlas.tools.inspect'])).toThrow(/unselected packet key/);
	});

	it('builds a stable receipt for the same manifest, decision, and execution', () => {
		const ranked = rankPackets([packet('selected')]);
		const manifest = assemblePackets({
			requestId: 'req-2',
			rankedPackets: ranked,
			tokenBudget: 30,
			maxPackets: 1,
			rankingPolicyVersion: 'rank.v1',
			assemblyPolicyVersion: 'assemble.v1',
			now: new Date('2026-08-13T00:00:00.000Z'),
		}).manifest;

		const decision: ToolDecisionV1 = {
			toolName: 'atlas.tools.inspect',
			toolArguments: { requestId: 'req-2' },
			supportingPacketKeys: ['selected'],
			policyVersion: 'policy.v1',
			reasons: ['test'],
		};

		const execution = {
			executionId: 'exec-1',
			status: 'SUCCESS' as const,
			output: { ok: true },
		};

		const a = buildToolCallReceipt('req-2', manifest, decision, execution, { now: new Date('2026-08-13T00:00:00.000Z') });
		const b = buildToolCallReceipt('req-2', manifest, decision, execution, { now: new Date('2026-08-13T00:00:00.000Z') });
		expect(a.receiptId).toBe(b.receiptId);
		expect(a.toolArgumentsHash).toBe(b.toolArgumentsHash);
		expect(a.selectedPacketKeys).toEqual(['selected']);
		expect(a.rejectedPacketKeys).toEqual([]);
	});
});
