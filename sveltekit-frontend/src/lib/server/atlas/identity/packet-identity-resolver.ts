/**
 * Packet Identity Resolver — PACKET_IDENTITY_ALIAS_AND_WRITER_CONVERGENCE (P0-3)
 *
 * Resolves any caller-supplied packet_key candidate to whichever key format
 * actually has a live row in atlas_packets today. This exists because the
 * P0 identity audit (2026-08-11) found the dominant live scheme
 * (`packet:<12hex>`, sha256(source_ref) truncated) coexists with a divergent
 * prefix (`ace:packet:<12hex>`, same hash, wrong prefix — 3,294 rows written
 * by a since-fixed bug in register-orphaned-chunks.mjs).
 *
 * This resolver does NOT mutate atlas_packets or any of its 12 dependent
 * tables' foreign keys (atlas_summary_layers, packet_features,
 * atlas_feature_envelopes, code_features, atlas_id_hierarchy_metadata,
 * packet_feature_keywords, ontology_edges [source+target], packet_vector_bundles,
 * packet_source_features, evaluation_judgments, feature_records). Historical
 * PK migration (P0-6) is deliberately deferred — see
 * drizzle/manual/atlas_packet_identity_aliases.sql.
 *
 * Resolution order:
 *   1. Exact match against atlas_packets.packet_key (fast path — true for the
 *      overwhelming majority of rows).
 *   2. atlas_packet_identity_aliases.alias_key lookup, returning the real
 *      stored canonical_packet_key.
 *   3. Unresolved → throws PacketIdentityUnresolvedError (typed, no silent
 *      fallback — per this repo's hard-fail-on-missing-identity rule).
 */

import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { eq, sql } from 'drizzle-orm';

export class PacketIdentityUnresolvedError extends Error {
	constructor(public readonly inputKey: string) {
		super(`PACKET_IDENTITY_UNRESOLVED: no atlas_packets row or alias found for "${inputKey}"`);
		this.name = 'PacketIdentityUnresolvedError';
	}
}

export class PacketIdentityMalformedError extends Error {
	constructor(public readonly inputKey: string) {
		super(`PACKET_IDENTITY_MALFORMED: "${inputKey}" is not a usable packet identity`);
		this.name = 'PacketIdentityMalformedError';
	}
}

export class StructuralScopedAddressExperimentError extends Error {
	constructor(public readonly inputKey: string) {
		super(`STRUCTURAL_SCOPED_ADDRESS_EXPERIMENT: "${inputKey}" is not canonical packet identity`);
		this.name = 'StructuralScopedAddressExperimentError';
	}
}

function isHex64(input: string): boolean {
	return /^[0-9a-f]{64}$/i.test(input);
}

/**
 * Resolve any packet_key candidate to the key format that actually joins
 * against atlas_packets today. Throws PacketIdentityUnresolvedError if the
 * key cannot be resolved via a direct row or a known alias.
 */
export async function resolveCanonicalPacketKey(inputKey: string): Promise<string> {
	const trimmed = inputKey.trim();
	if (!trimmed) {
		throw new PacketIdentityMalformedError(inputKey);
	}

	if (trimmed.startsWith('pkt:') || isHex64(trimmed)) {
		throw new StructuralScopedAddressExperimentError(inputKey);
	}

	const direct = await db
		.select({ packetKey: atlasPackets.packetKey })
		.from(atlasPackets)
		.where(eq(atlasPackets.packetKey, trimmed))
		.limit(1);
	if (direct.length > 0) {
		return direct[0].packetKey;
	}

	const aliased = await db.execute<{ canonical_packet_key: string }>(sql`
		SELECT canonical_packet_key
		FROM atlas_packet_identity_aliases
		WHERE alias_key = ${trimmed}
		LIMIT 1
	`);
	const aliasRow = aliased.rows?.[0];
	if (aliasRow?.canonical_packet_key) {
		return aliasRow.canonical_packet_key;
	}

	throw new PacketIdentityUnresolvedError(inputKey);
}

/**
 * Write validation gate for atlas_packets.
 * Resolves a supplied key candidate or sourceRef to a valid canonical packet_key.
 * Fails closed if the key does not resolve to an existing canonical atlas_packets row or alias target.
 */
export async function resolvePacketKeyForWrite(
	suppliedPacketKey?: string | null,
	sourceRef?: string | null
): Promise<string> {
	if (suppliedPacketKey) {
		try {
			return await resolveCanonicalPacketKey(suppliedPacketKey);
		} catch (err) {
			if (!sourceRef) {
				throw err;
			}
		}
	}

	if (sourceRef) {
		const trimmedRef = sourceRef.trim();
		if (trimmedRef) {
			const bySourceRef = await db
				.select({ packetKey: atlasPackets.packetKey })
				.from(atlasPackets)
				.where(eq(atlasPackets.sourceRef, trimmedRef))
				.limit(1);
			if (bySourceRef.length > 0) {
				return bySourceRef[0].packetKey;
			}
		}
	}

	throw new PacketIdentityUnresolvedError(
		suppliedPacketKey || sourceRef || 'UNKNOWN_WRITE_KEY'
	);
}

