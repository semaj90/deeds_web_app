import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import {
	PacketIdentityRegistryErrorV1,
	resolvePacketIdentityRegistryCoreV1,
	type PacketIdentityAliasRowV1,
	type PacketIdentityRegistryRowV1,
	type ResolvedPacketIdentityV1,
} from './packet-identity-registry-v1.js';

/** True only when PostgreSQL reports one of the expected registry-v1 relations missing. */
export function isUndefinedTableError(error: unknown): boolean {
	const expectedRelations = new Set(['atlas_packet_identity_registry_v1', 'atlas_packet_identity_aliases_v1', 'atlas_graphify_scope_repository_map_v1']);
	const pending: unknown[] = [error];
	const seen = new Set<unknown>();
	while (pending.length > 0) {
		const current = pending.pop();
		if (!current || typeof current !== 'object' || seen.has(current)) continue;
		seen.add(current);
		const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
		if (candidate.code === '42P01' && typeof candidate.message === 'string') {
			for (const relation of expectedRelations) {
				if (new RegExp(`(?:^|[\\s\"'.])${relation}(?:$|[\\s\"'.])`, 'i').test(candidate.message)) return true;
			}
		}
		if (candidate.cause) pending.push(candidate.cause);
	}
	return false;
}

/**
 * The registry DDL is an unapplied draft. A missing registry or alias table is an expected state, so it
 * surfaces as REGISTRY_DDL_NOT_APPLIED instead of a crash, and never falls back to the older alias table.
 */
async function guardRegistryDdl<T>(inputKey: string, run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (isUndefinedTableError(error)) throw new PacketIdentityRegistryErrorV1('REGISTRY_DDL_NOT_APPLIED', inputKey);
		throw error;
	}
}

export async function resolvePacketIdentityRegistryV1(inputKey: string): Promise<ResolvedPacketIdentityV1> {
	return guardRegistryDdl(inputKey, () => resolveUnguarded(inputKey));
}

async function resolveUnguarded(inputKey: string): Promise<ResolvedPacketIdentityV1> {
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
		async repositoryScopeMappingByScope(scope) {
			const result = await db.execute<{
				membershipRepositoryScope: string;
				repositoryId: string;
				sourceAuthorityRepoId: string;
				mappingKind: 'ROOT_SCOPE' | 'NESTED_REPOSITORY' | 'LOGICAL_SUBSCOPE';
			}>(sql`
				SELECT membership_repository_scope AS "membershipRepositoryScope",
				       repository_id::text AS "repositoryId",
				       source_authority_repo_id AS "sourceAuthorityRepoId",
				       mapping_kind AS "mappingKind"
				FROM public.atlas_graphify_scope_repository_map_v1
				WHERE membership_repository_scope = ${scope}
				LIMIT 1
			`);
			return result.rows?.[0] ?? null;
		},
		async repositoryAuthorityById(repositoryId) {
			const result = await db.execute<{
				repositoryId: string;
				sourceAuthorityRepoId: string;
				repositoryKind: string;
			}>(sql`
				SELECT repository_id::text AS "repositoryId",
				       source_authority_repo_id AS "sourceAuthorityRepoId",
				       repository_kind AS "repositoryKind"
				FROM public.atlas_repository_identity
				WHERE repository_id = ${repositoryId}::uuid
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
