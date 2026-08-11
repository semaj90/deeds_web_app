// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { computePacketKey as computePacketKeyV1 } from './compute-packet-key.js';
import { computePacketKey as computePacketKeyV2 } from './packet-key-builder.js';
import {
	StructuralScopedAddressExperimentError,
	resolveCanonicalPacketKey,
} from './packet-identity-resolver.js';

vi.mock('$lib/server/db/client.js', () => ({
	db: {
		select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
		execute: vi.fn(async () => ({ rows: [] })),
	},
}));

vi.mock('$lib/server/db/schema/atlas-packets.js', () => ({
	atlasPackets: {
		packetKey: { __col: 'packet_key' },
		sourceRef: { __col: 'source_ref' },
	},
}));

describe('computePacketKey Containment & Write Authority Guard', () => {
	it('proves computePacketKey (scoped v1 format pkt:*) is rejected as StructuralScopedAddressExperimentError', async () => {
		const rawKey = computePacketKeyV1({
			workspaceId: 'default',
			sourceRef: 'src/lib/server/auth.ts',
			semanticAnchor: 'validateSession',
		});

		expect(rawKey).toMatch(/^pkt:default:[0-9a-f]{32}$/);

		await expect(resolveCanonicalPacketKey(rawKey)).rejects.toBeInstanceOf(
			StructuralScopedAddressExperimentError
		);
	});

	it('proves computePacketKey (v2 raw 64-hex format) is rejected as StructuralScopedAddressExperimentError', async () => {
		const rawKey = computePacketKeyV2(
			'src/lib/server/auth.ts',
			'node_123',
			'title_456'
		);

		expect(rawKey).toMatch(/^[0-9a-f]{64}$/);

		await expect(resolveCanonicalPacketKey(rawKey)).rejects.toBeInstanceOf(
			StructuralScopedAddressExperimentError
		);
	});
});
