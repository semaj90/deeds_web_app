/**
 * COMPATIBILITY ONLY — legacy packet-key aliases for PacketKeyV2. Separate from packet-key-v2.ts on purpose: the
 * V2 owner has no code path that can emit a source_ref-only key.
 *
 * Direction is always  legacy key -> alias -> exactly one canonical PacketKeyV2.
 * Nothing here reads or writes a datastore. Storage feasibility (atlas_packet_identity_aliases has an FK from
 * canonical_packet_key to atlas_packets.packet_key) is reported by the manifest gate, not assumed here.
 */
import { createHash } from 'node:crypto';
import { PACKET_KEY_V2_PATTERN } from './packet-key-v2';

export const LEGACY_PACKET_KEY_V1_PATTERN = /^packet:[0-9a-f]{12}$/;

/** The dominant legacy formula (previously inline in upsert-whole-codebase-atlas-packets.mjs): 48-bit, source_ref-only. */
export function legacyPacketKeyV1(sourceRef: string): string {
	return `packet:${createHash('sha256').update(sourceRef, 'utf8').digest('hex').slice(0, 12)}`;
}

export type LegacyAliasKindV2 = 'LEGACY_PACKET_V1_12HEX';

export interface LegacyAliasPairV2 {
	aliasKey: string;
	canonicalPacketKey: string;
	aliasKind: LegacyAliasKindV2;
}

export class PacketAliasConflictError extends Error {
	constructor(public readonly code: 'ALIAS_MAPS_TO_DIFFERENT_CANONICAL' | 'ALIAS_TARGET_NOT_V2' | 'ALIAS_KEY_NOT_LEGACY', detail: string) {
		super(`PACKET_ALIAS_CONFLICT:${code}: ${detail}`);
		this.name = 'PacketAliasConflictError';
	}
}

/** Build the alias pair for an already-derived V2 key. The raw stored source_ref feeds the legacy hash. */
export function legacyAliasPairV2(storedSourceRef: string, canonicalPacketKey: string): LegacyAliasPairV2 {
	if (!PACKET_KEY_V2_PATTERN.test(canonicalPacketKey)) throw new PacketAliasConflictError('ALIAS_TARGET_NOT_V2', canonicalPacketKey);
	return { aliasKey: legacyPacketKeyV1(storedSourceRef), canonicalPacketKey, aliasKind: 'LEGACY_PACKET_V1_12HEX' };
}

/**
 * Deterministic, fail-closed assignment against the mappings that already exist. One legacy key resolves to at most one
 * canonical key; a different existing target is a typed rejection, never an overwrite and never a dynamic re-mint.
 */
export function assignLegacyAliasV2(existing: ReadonlyMap<string, string>, pair: LegacyAliasPairV2): 'NEW' | 'ALREADY_ASSIGNED' {
	if (!LEGACY_PACKET_KEY_V1_PATTERN.test(pair.aliasKey)) throw new PacketAliasConflictError('ALIAS_KEY_NOT_LEGACY', pair.aliasKey);
	if (!PACKET_KEY_V2_PATTERN.test(pair.canonicalPacketKey)) throw new PacketAliasConflictError('ALIAS_TARGET_NOT_V2', pair.canonicalPacketKey);
	const current = existing.get(pair.aliasKey);
	if (current === undefined) return 'NEW';
	if (current !== pair.canonicalPacketKey) throw new PacketAliasConflictError('ALIAS_MAPS_TO_DIFFERENT_CANONICAL', `${pair.aliasKey} -> ${current} (attempted ${pair.canonicalPacketKey})`);
	return 'ALREADY_ASSIGNED';
}
