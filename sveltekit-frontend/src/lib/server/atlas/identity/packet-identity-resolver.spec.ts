// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

const { mockSelect, mockExecute } = vi.hoisted(() => ({
	mockSelect: vi.fn(),
	mockExecute: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({
	db: {
		select: mockSelect,
		execute: mockExecute,
	},
}));

vi.mock('$lib/server/db/schema/atlas-packets.js', () => ({
	atlasPackets: {
		packetKey: { __col: 'packet_key' },
	},
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
	sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

function mockDirectLookup(rows: Array<{ packetKey: string }>) {
	const limit = vi.fn(async () => rows);
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	mockSelect.mockReturnValueOnce({ from });
	return { from, where, limit };
}

describe('resolveCanonicalPacketKey', () => {
	it('returns a direct atlas_packets key without consulting aliases', async () => {
		mockDirectLookup([{ packetKey: 'packet:canonical:1' }]);

		const { resolveCanonicalPacketKey } = await import('./packet-identity-resolver.js');
		const result = await resolveCanonicalPacketKey('packet:canonical:1');

		expect(result).toBe('packet:canonical:1');
		expect(mockExecute).not.toHaveBeenCalled();
	});

	it('resolves a legacy alias key to the canonical atlas_packets key', async () => {
		mockDirectLookup([]);
		mockExecute.mockResolvedValueOnce({
			rows: [{ canonical_packet_key: 'packet:canonical:2' }],
		});

		const { resolveCanonicalPacketKey } = await import('./packet-identity-resolver.js');
		const result = await resolveCanonicalPacketKey('ace:packet:legacy:2');

		expect(result).toBe('packet:canonical:2');
		expect(mockExecute).toHaveBeenCalledTimes(1);
	});

	it('fails closed when neither the direct row nor alias exists', async () => {
		mockDirectLookup([]);
		mockExecute.mockResolvedValueOnce({ rows: [] });

		const { PacketIdentityUnresolvedError, resolveCanonicalPacketKey } = await import('./packet-identity-resolver.js');

		await expect(resolveCanonicalPacketKey('ace:packet:missing')).rejects.toBeInstanceOf(PacketIdentityUnresolvedError);
	});

	it('rejects blank identities as malformed', async () => {
		mockDirectLookup([]);
		mockExecute.mockResolvedValueOnce({ rows: [] });

		const { PacketIdentityMalformedError, resolveCanonicalPacketKey } = await import('./packet-identity-resolver.js');

		await expect(resolveCanonicalPacketKey('   ')).rejects.toBeInstanceOf(PacketIdentityMalformedError);
	});

	it('rejects structural scoped-address experiment keys', async () => {
		mockDirectLookup([]);
		mockExecute.mockResolvedValueOnce({ rows: [] });

		const { StructuralScopedAddressExperimentError, resolveCanonicalPacketKey } = await import('./packet-identity-resolver.js');

		await expect(resolveCanonicalPacketKey('pkt:default:7ebdc697c4f8e3d2a1b5f9e8c7d6a5b4')).rejects.toBeInstanceOf(
			StructuralScopedAddressExperimentError
		);
		await expect(
			resolveCanonicalPacketKey('7ebdc697c4f8e3d2a1b5f9e8c7d6a5b4d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5')
		).rejects.toBeInstanceOf(StructuralScopedAddressExperimentError);
	});
});

describe('resolvePacketKeyForWrite', () => {
	it('resolves valid supplied key candidate', async () => {
		mockDirectLookup([{ packetKey: 'packet:canonical:write1' }]);
		const { resolvePacketKeyForWrite } = await import('./packet-identity-resolver.js');
		const result = await resolvePacketKeyForWrite('packet:canonical:write1');
		expect(result).toBe('packet:canonical:write1');
	});

	it('resolves by sourceRef when supplied key fails or is missing', async () => {
		mockDirectLookup([]); // direct key lookup returns empty
		mockExecute.mockResolvedValueOnce({ rows: [] }); // alias lookup returns empty
		mockDirectLookup([{ packetKey: 'packet:canonical:from_ref' }]); // lookup by sourceRef returns canonical key

		const { resolvePacketKeyForWrite } = await import('./packet-identity-resolver.js');
		const result = await resolvePacketKeyForWrite('unresolved_key', 'src/lib/server/test.ts');
		expect(result).toBe('packet:canonical:from_ref');
	});

	it('fails closed when key cannot be resolved from suppliedKey or sourceRef', async () => {
		mockDirectLookup([]);
		mockExecute.mockResolvedValueOnce({ rows: [] });
		mockDirectLookup([]);

		const { PacketIdentityUnresolvedError, resolvePacketKeyForWrite } = await import('./packet-identity-resolver.js');
		await expect(resolvePacketKeyForWrite('invalid_key', 'unknown/file.ts')).rejects.toBeInstanceOf(PacketIdentityUnresolvedError);
	});
});

