import { describe, expect, it } from 'vitest';

import { assemblePackets, type PacketAssemblyManifestV1 } from './packet-assembler.js';
import type { PacketRankInput } from '../ranking/packet-rtx-ranker.js';
import { rankPackets } from '../ranking/packet-rtx-ranker.js';

function packet(packetKey: string, tokenCount: number): PacketRankInput {
	return {
		packetKey,
		sourceRef: `${packetKey}.ts`,
		content: `${packetKey} content`,
		tokenCount,
		vector: [0.9, 0.7, 0.4, 0.8, 0.3, 0.2, 0.1, 0.1, 0.1],
	};
}

function assemblyHash(manifest: PacketAssemblyManifestV1): string {
	return manifest.manifestHash;
}

describe('packet-assembler', () => {
	it('deterministically assembles a manifest from ranked packets', () => {
		const ranked = rankPackets([packet('a', 10), packet('b', 15)]);
		const a = assemblePackets({
			requestId: 'req-1',
			rankedPackets: ranked,
			tokenBudget: 40,
			maxPackets: 2,
			rankingPolicyVersion: 'rank.v1',
			assemblyPolicyVersion: 'assemble.v1',
			now: new Date('2026-08-13T00:00:00.000Z'),
		});
		const b = assemblePackets({
			requestId: 'req-1',
			rankedPackets: ranked,
			tokenBudget: 40,
			maxPackets: 2,
			rankingPolicyVersion: 'rank.v1',
			assemblyPolicyVersion: 'assemble.v1',
			now: new Date('2026-08-14T00:00:00.000Z'),
		});

		expect(assemblyHash(a.manifest)).toBe(assemblyHash(b.manifest));
		expect(a.manifest.selectedPacketKeys.length).toBeGreaterThan(0);
		expect(a.manifest.sections.every((section) => section.kind === 'packet')).toBe(true);
	});

	it('enforces token budget and excludes rejected packets', () => {
		const ranked = rankPackets([
			packet('selected', 20),
			packet('rejected', 100),
		]);
		const assembled = assemblePackets({
			requestId: 'req-2',
			rankedPackets: ranked,
			tokenBudget: 30,
			maxPackets: 2,
			rankingPolicyVersion: 'rank.v1',
			assemblyPolicyVersion: 'assemble.v1',
			now: new Date('2026-08-13T00:00:00.000Z'),
		});

		expect(assembled.manifest.selectedPacketKeys).toContain('selected');
		expect(assembled.manifest.rejectedPacketKeys).toContain('rejected');
		expect(assembled.manifest.selectedPacketKeys).not.toContain('rejected');
		expect(assembled.manifest.selectedTokens).toBeLessThanOrEqual(30);
	});
});
