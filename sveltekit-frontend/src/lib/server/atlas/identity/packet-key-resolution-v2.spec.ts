// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computePacketKeyV2 } from './packet-key-v2';
import { legacyPacketKeyV1 } from './packet-key-legacy-alias-v1';
import {
	PACKET_KEY_ACE_PREFIX_ALIAS,
	PACKET_KEY_ALIAS_EVIDENCE_VERSION,
	PACKET_KEY_V1_STORAGE_TO_V2,
	PacketKeyResolutionError,
	resolvePacketKeyResolutionCoreV2,
	type PacketKeyResolutionLookups,
} from './packet-key-resolution-v2';

const sourceRef = 'src/lib/server/auth.ts';
const v2 = computePacketKeyV2({ repositoryScope: 'repo:root', sourceRef, packetKind: 'SOURCE_FILE' });
const v1 = legacyPacketKeyV1(sourceRef);

function store(opts: { stored?: string[]; aliases?: Array<[string, string, string]> }): PacketKeyResolutionLookups & { calls: string[] } {
	const stored = new Set(opts.stored ?? []);
	const aliases = opts.aliases ?? [];
	const calls: string[] = [];
	return {
		calls,
		async storedKeyExists(key) { calls.push(`stored:${key}`); return stored.has(key); },
		async aliasByKey(aliasKey) {
			calls.push(`alias:${aliasKey}`);
			const hit = aliases.find(([alias]) => alias === aliasKey);
			return hit ? { canonicalPacketKey: hit[1], aliasKind: hit[2] } : null;
		},
		async aliasesByCanonical(canonical, kind) { return aliases.filter(([, c, k]) => c === canonical && k === kind).map(([a]) => a); },
	};
}

describe('resolvePacketKeyResolutionCoreV2', () => {
	it('V2 input that is physically stored: canonical = storage = input, V2_DIRECT', async () => {
		expect(await resolvePacketKeyResolutionCoreV2(v2, store({ stored: [v2] }))).toEqual({ canonicalPacketKey: v2, storagePacketKey: v2, resolutionSource: 'V2_DIRECT', aliasEvidenceVersion: null });
	});

	it('V2 input for a historical packet: reverse alias locates the legacy storage key', async () => {
		const result = await resolvePacketKeyResolutionCoreV2(v2, store({ stored: [v1], aliases: [[v1, v2, PACKET_KEY_V1_STORAGE_TO_V2]] }));
		expect(result).toEqual({ canonicalPacketKey: v2, storagePacketKey: v1, resolutionSource: 'LEGACY_ALIAS', aliasEvidenceVersion: PACKET_KEY_ALIAS_EVIDENCE_VERSION });
	});

	it('legacy input resolves to exactly one canonical V2 and keeps its storage key distinct', async () => {
		const result = await resolvePacketKeyResolutionCoreV2(v1, store({ stored: [v1], aliases: [[v1, v2, PACKET_KEY_V1_STORAGE_TO_V2]] }));
		expect(result.canonicalPacketKey).toBe(v2);
		expect(result.storagePacketKey).toBe(v1);
		expect(result.canonicalPacketKey).not.toBe(result.storagePacketKey);
	});

	it('ace-prefixed storage key follows the existing ace alias exactly one hop, then the V2 alias', async () => {
		const ace = `ace:${v1}`;
		const result = await resolvePacketKeyResolutionCoreV2(ace, store({ stored: [ace, v1], aliases: [[ace, v1, PACKET_KEY_ACE_PREFIX_ALIAS], [v1, v2, PACKET_KEY_V1_STORAGE_TO_V2]] }));
		expect(result).toMatchObject({ canonicalPacketKey: v2, storagePacketKey: v1 });
	});

	it('a legacy key with no V2 alias fails closed and never re-mints from source_ref', async () => {
		const lookups = store({ stored: [v1] });
		await expect(resolvePacketKeyResolutionCoreV2(v1, lookups)).rejects.toMatchObject({ code: 'NO_CANONICAL_ALIAS' });
		expect(lookups.calls.every((call) => !call.includes(sourceRef))).toBe(true);
	});

	it('a V2 key that is neither stored nor aliased is unresolved', async () => {
		await expect(resolvePacketKeyResolutionCoreV2(v2, store({}))).rejects.toMatchObject({ code: 'V2_KEY_NOT_STORED_OR_ALIASED' });
	});

	it('two storage rows aliased to one V2 key is PACKET_KEY_CANONICAL_COLLISION, never a silent pick', async () => {
		const other = legacyPacketKeyV1('src/other.ts');
		await expect(resolvePacketKeyResolutionCoreV2(v2, store({ stored: [v1, other], aliases: [[v1, v2, PACKET_KEY_V1_STORAGE_TO_V2], [other, v2, PACKET_KEY_V1_STORAGE_TO_V2]] }))).rejects.toMatchObject({ code: 'CANONICAL_COLLISION' });
	});

	it('an alias whose target is not a PacketKeyV2 fails closed', async () => {
		await expect(resolvePacketKeyResolutionCoreV2(v1, store({ aliases: [[v1, 'packet:0123456789ab', PACKET_KEY_V1_STORAGE_TO_V2]] }))).rejects.toMatchObject({ code: 'ALIAS_TARGET_NOT_V2' });
	});

	it('malformed, structural, and unknown-kind inputs are rejected', async () => {
		for (const input of ['', '   ']) await expect(resolvePacketKeyResolutionCoreV2(input, store({}))).rejects.toBeInstanceOf(PacketKeyResolutionError);
		for (const input of ['pkt:x:abc', 'f'.repeat(64), 'packet:zzz']) await expect(resolvePacketKeyResolutionCoreV2(input, store({}))).rejects.toMatchObject({ code: 'UNSUPPORTED_SHAPE' });
		await expect(resolvePacketKeyResolutionCoreV2(v1, store({ aliases: [[v1, v2, 'SOMETHING_ELSE']] }))).rejects.toMatchObject({ code: 'UNSUPPORTED_SHAPE' });
	});
});
