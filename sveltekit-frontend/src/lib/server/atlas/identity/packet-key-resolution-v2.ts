/**
 * Pure resolution kernel for the alias-backed PacketKeyV2 model (no datastore access; lookups are injected).
 *
 *   canonical logical identity = PacketKeyV2                     (always what canonical consumers use)
 *   physical storage key       = atlas_packets.packet_key        (legacy for historical rows, V2 for new rows)
 *   legacy storage key -> alias PACKET_KEY_V1_STORAGE_TO_V2 -> PacketKeyV2
 *
 * Fail closed: a legacy key with no alias has NO canonical identity (never re-minted from source_ref here), and a V2 key
 * with neither a stored row nor a storage alias is unresolved. Ambiguous reverse lookups are collisions, never a pick.
 * Wired to Postgres by packet-identity-resolver.ts::resolvePacketKeyResolutionV2.
 */
import { PACKET_KEY_V2_PATTERN } from './packet-key-v2';
import { LEGACY_PACKET_KEY_V1_PATTERN } from './packet-key-legacy-alias-v1';

export const PACKET_KEY_V1_STORAGE_TO_V2 = 'PACKET_KEY_V1_STORAGE_TO_V2' as const;
export const PACKET_KEY_ACE_PREFIX_ALIAS = 'PREFIX_DIVERGENCE_ACE_PACKET' as const;
export const PACKET_KEY_ALIAS_EVIDENCE_VERSION = `${PACKET_KEY_V1_STORAGE_TO_V2}@1` as const;

export interface PacketKeyResolutionV2 {
	/** Always a PacketKeyV2. The only identity canonical consumers may use. */
	canonicalPacketKey: string;
	/** Physical atlas_packets.packet_key. For SQL/FK compatibility paths only, never an identity authority. */
	storagePacketKey: string;
	resolutionSource: 'V2_DIRECT' | 'LEGACY_ALIAS';
	aliasEvidenceVersion: typeof PACKET_KEY_ALIAS_EVIDENCE_VERSION | null;
}

export interface PacketKeyResolutionLookups {
	storedKeyExists(key: string): Promise<boolean>;
	aliasByKey(aliasKey: string): Promise<{ canonicalPacketKey: string; aliasKind: string } | null>;
	aliasesByCanonical(canonicalPacketKey: string, aliasKind: string): Promise<string[]>;
}

export class PacketKeyResolutionError extends Error {
	constructor(
		public readonly code: 'MALFORMED' | 'NO_CANONICAL_ALIAS' | 'V2_KEY_NOT_STORED_OR_ALIASED' | 'CANONICAL_COLLISION' | 'UNSUPPORTED_SHAPE' | 'ALIAS_TARGET_NOT_V2',
		public readonly inputKey: string,
		detail = '',
	) {
		super(`PACKET_KEY_RESOLUTION_${code}: ${inputKey}${detail ? ` (${detail})` : ''}`);
		this.name = 'PacketKeyResolutionError';
	}
}

export async function resolvePacketKeyResolutionCoreV2(inputKey: string, lookups: PacketKeyResolutionLookups): Promise<PacketKeyResolutionV2> {
	const key = inputKey.trim();
	if (!key) throw new PacketKeyResolutionError('MALFORMED', inputKey);

	if (PACKET_KEY_V2_PATTERN.test(key)) {
		if (await lookups.storedKeyExists(key)) {
			return { canonicalPacketKey: key, storagePacketKey: key, resolutionSource: 'V2_DIRECT', aliasEvidenceVersion: null };
		}
		const storage = await lookups.aliasesByCanonical(key, PACKET_KEY_V1_STORAGE_TO_V2);
		if (storage.length > 1) throw new PacketKeyResolutionError('CANONICAL_COLLISION', key, `${storage.length} storage rows`);
		if (storage.length === 1) {
			return { canonicalPacketKey: key, storagePacketKey: storage[0], resolutionSource: 'LEGACY_ALIAS', aliasEvidenceVersion: PACKET_KEY_ALIAS_EVIDENCE_VERSION };
		}
		throw new PacketKeyResolutionError('V2_KEY_NOT_STORED_OR_ALIASED', key);
	}

	if (!/^(ace:)?packet:[0-9a-f]{12}$/.test(key) && !LEGACY_PACKET_KEY_V1_PATTERN.test(key)) {
		throw new PacketKeyResolutionError('UNSUPPORTED_SHAPE', key);
	}

	const alias = await lookups.aliasByKey(key);
	if (alias === null) throw new PacketKeyResolutionError('NO_CANONICAL_ALIAS', key, 'legacy key has no V2 alias; canonical identity is not minted from source_ref');
	if (alias.aliasKind === PACKET_KEY_V1_STORAGE_TO_V2) {
		if (!PACKET_KEY_V2_PATTERN.test(alias.canonicalPacketKey)) throw new PacketKeyResolutionError('ALIAS_TARGET_NOT_V2', key, alias.canonicalPacketKey);
		return { canonicalPacketKey: alias.canonicalPacketKey, storagePacketKey: key, resolutionSource: 'LEGACY_ALIAS', aliasEvidenceVersion: PACKET_KEY_ALIAS_EVIDENCE_VERSION };
	}
	if (alias.aliasKind === PACKET_KEY_ACE_PREFIX_ALIAS) {
		// ace:packet:<h> -> stored packet:<h>; that stored key must itself carry the V2 alias. Exactly one hop, no loops.
		const stored = alias.canonicalPacketKey;
		const second = await lookups.aliasByKey(stored);
		if (second === null || second.aliasKind !== PACKET_KEY_V1_STORAGE_TO_V2) throw new PacketKeyResolutionError('NO_CANONICAL_ALIAS', key, `${stored} has no V2 alias`);
		if (!PACKET_KEY_V2_PATTERN.test(second.canonicalPacketKey)) throw new PacketKeyResolutionError('ALIAS_TARGET_NOT_V2', key, second.canonicalPacketKey);
		return { canonicalPacketKey: second.canonicalPacketKey, storagePacketKey: stored, resolutionSource: 'LEGACY_ALIAS', aliasEvidenceVersion: PACKET_KEY_ALIAS_EVIDENCE_VERSION };
	}
	throw new PacketKeyResolutionError('UNSUPPORTED_SHAPE', key, `alias kind ${alias.aliasKind}`);
}
