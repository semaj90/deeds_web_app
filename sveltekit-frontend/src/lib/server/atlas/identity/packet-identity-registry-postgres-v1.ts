import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import {
	resolvePacketIdentityRegistryCoreV1,
	type PacketIdentityAliasRowV1,
	type PacketIdentityRegistryRowV1,
	type ResolvedPacketIdentityV1,
} from './packet-identity-registry-v1.js';

export async function resolvePacketIdentityRegistryV1(inputKey: string): Promise<ResolvedPacketIdentityV1> {
	return resolvePacketIdentityRegistryCoreV1(inputKey, {
		async identityByKey(packetKey) {
			const result = await db.execute<PacketIdentityRegistryRowV1>(sql`
				SELECT packet_key AS "packetKey",
				       repository_id::text AS "repositoryId",
				       membership_repository_scope AS "membershipRepositoryScope",
				       source_ref AS "sourceRef",
				       packet_kind AS "packetKind",
				       key_recipe_revision AS "keyRecipeRevision"
				FROM public.atlas_packet_identity_registry_v1
				WHERE packet_key = ${packetKey}
				LIMIT 1
			`);
			return result.rows?.[0] ?? null;
		},
		async aliasByKey(aliasKey) {
			const result = await db.execute<PacketIdentityAliasRowV1>(sql`
				SELECT alias_key AS "aliasKey",
				       canonical_packet_key AS "canonicalPacketKey",
				       storage_packet_key AS "storagePacketKey",
				       alias_kind AS "aliasKind",
				       evidence_ref AS "evidenceRef",
				       evidence_digest AS "evidenceDigest"
				FROM public.atlas_packet_identity_aliases_v1
				WHERE alias_key = ${aliasKey}
				LIMIT 1
			`);
			return result.rows?.[0] ?? null;
		},
		async storageKeysByCanonical(canonicalPacketKey) {
			const result = await db.execute<{ storagePacketKey: string }>(sql`
				SELECT storage_packet_key AS "storagePacketKey"
				FROM public.atlas_packet_identity_aliases_v1
				WHERE canonical_packet_key = ${canonicalPacketKey}
				ORDER BY storage_packet_key
				LIMIT 2
			`);
			return (result.rows ?? []).map((row) => row.storagePacketKey);
		},
	});
}
