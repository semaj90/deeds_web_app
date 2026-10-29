// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
		sourceRef: { __col: 'source_ref' },
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

beforeEach(() => {
	mockSelect.mockReset();
	mockExecute.mockReset();
});

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

	it('rejects an ambiguous sourceRef instead of selecting the first packet row', async () => {
		mockDirectLookup([]);
		mockExecute.mockResolvedValueOnce({ rows: [] });
		const sourceRows = mockDirectLookup([
			{ packetKey: 'packet:canonical:first' },
			{ packetKey: 'packet:canonical:second' },
		]);

		const { PacketIdentityAmbiguousError, resolvePacketKeyForWrite } = await import('./packet-identity-resolver.js');
		await expect(resolvePacketKeyForWrite('unresolved_key', 'src/ambiguous.ts')).rejects.toBeInstanceOf(PacketIdentityAmbiguousError);
		expect(sourceRows.limit).toHaveBeenCalledWith(2);
	});
});

describe('resolveCanonicalPacketKeyForWrite', () => {
	const canonicalKey = 'packet:01234567-89ab-5cde-8fab-0123456789ab';

	it('returns only a stored PacketKeyV2 for an explicit identity', async () => {
		mockDirectLookup([{ packetKey: canonicalKey }]);
		const { resolveCanonicalPacketKeyForWrite } = await import('./packet-identity-resolver.js');
		await expect(resolveCanonicalPacketKeyForWrite(canonicalKey)).resolves.toBe(canonicalKey);
	});

	it('resolves an exact source reference through a stored PacketKeyV2', async () => {
		mockDirectLookup([{ packetKey: canonicalKey }]);
		mockDirectLookup([{ packetKey: canonicalKey }]);
		const { resolveCanonicalPacketKeyForWrite } = await import('./packet-identity-resolver.js');
		await expect(resolveCanonicalPacketKeyForWrite(undefined, 'src/routes/example.ts')).resolves.toBe(canonicalKey);
	});

	it('rejects a missing source binding instead of deriving identity', async () => {
		mockDirectLookup([]);
		const { PacketIdentityUnresolvedError, resolveCanonicalPacketKeyForWrite } = await import('./packet-identity-resolver.js');
		await expect(resolveCanonicalPacketKeyForWrite(undefined, 'src/routes/unbound.ts')).rejects.toBeInstanceOf(PacketIdentityUnresolvedError);
	});

	it('rejects ambiguous source bindings', async () => {
		mockDirectLookup([{ packetKey: canonicalKey }, { packetKey: 'packet:89abcdef-0123-5abc-8def-0123456789ab' }]);
		const { PacketIdentityAmbiguousError, resolveCanonicalPacketKeyForWrite } = await import('./packet-identity-resolver.js');
		await expect(resolveCanonicalPacketKeyForWrite(undefined, 'src/routes/ambiguous.ts')).rejects.toBeInstanceOf(PacketIdentityAmbiguousError);
	});

	it('rejects an explicit key that resolves to a different exact source binding', async () => {
		mockDirectLookup([{ packetKey: canonicalKey }]);
		mockDirectLookup([{ packetKey: 'packet:89abcdef-0123-5abc-8def-0123456789ab' }]);
		mockDirectLookup([{ packetKey: 'packet:89abcdef-0123-5abc-8def-0123456789ab' }]);
		const { PacketIdentitySourceMismatchError, resolveCanonicalPacketKeyForWrite } = await import('./packet-identity-resolver.js');
		await expect(resolveCanonicalPacketKeyForWrite(canonicalKey, 'src/routes/different.ts')).rejects.toBeInstanceOf(PacketIdentitySourceMismatchError);
	});

	it('does not fall back from an invalid explicit identity to a source reference', async () => {
		mockExecute.mockResolvedValueOnce({ rows: [] });
		const { PacketKeyResolutionError } = await import('./packet-key-resolution-v2.js');
		const { resolveCanonicalPacketKeyForWrite } = await import('./packet-identity-resolver.js');
		await expect(resolveCanonicalPacketKeyForWrite('packet:0123456789ab', 'src/routes/example.ts')).rejects.toBeInstanceOf(PacketKeyResolutionError);
		expect(mockSelect).not.toHaveBeenCalled();
	});
});
