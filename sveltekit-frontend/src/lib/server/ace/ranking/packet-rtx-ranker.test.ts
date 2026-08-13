import { describe, expect, it } from 'vitest';

import { rankPackets, scorePacketFeatures, type PacketRankInput } from './packet-rtx-ranker.js';

function packet(packetKey: string, overrides: Partial<PacketRankInput> = {}): PacketRankInput {
	return {
		packetKey,
		sourceRef: `${packetKey}.ts`,
		content: `${packetKey} content`,
		tokenCount: 10,
		vector: [0.4, 0.5, 0.3, 0.7, 0.2, 0.8, 0.1, 0.1, 0.2],
		...overrides,
	};
}

describe('packet-rtx-ranker', () => {
	it('scores vectors deterministically', () => {
		const score = scorePacketFeatures([1, 0, 0, 1, 0, 0, 0, 0, 0]);
		expect(score).toBeGreaterThan(0);
		expect(score).toBe(scorePacketFeatures([1, 0, 0, 1, 0, 0, 0, 0, 0]));
	});

	it('orders by score then graph authority then packetKey', () => {
		const ranked = rankPackets([
			packet('b', { vector: [0.5, 0.5, 0.5, 0.4, 0, 0, 0, 0, 0] }),
			packet('a', { vector: [0.5, 0.5, 0.5, 0.4, 0, 0, 0, 0, 0] }),
			packet('c', { vector: [0.5, 0.5, 0.5, 0.8, 0, 0, 0, 0, 0] }),
		]);

		expect(ranked[0]?.packetKey).toBe('c');
		expect(ranked[1]?.packetKey).toBe('a');
		expect(ranked[2]?.packetKey).toBe('b');
		expect(ranked[0]?.rank).toBe(1);
		expect(ranked[1]?.rank).toBe(2);
		expect(ranked[2]?.rank).toBe(3);
	});
});
