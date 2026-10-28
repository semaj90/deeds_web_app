import { computePacketKeyV2, type PacketKindV2 } from './packet-key-v2.js';
import {
	PACKET_IDENTITY_ALIAS_KIND_V1,
	type PacketIdentityAliasRowV1,
	type PacketIdentityRegistryRowV1,
} from './packet-identity-registry-v1.js';

/**
 * Insert-or-verify decision contract for the unapplied registry-v1 tables.
 *
 * Pure: it executes no SQL and writes nothing. A caller that is later authorised to write must
 * perform exactly the INSERT it is told to, and must treat every REJECT as final (no
 * overwrite-on-conflict, no upsert). VERIFIED_IDEMPOTENT means an identical row already exists.
 */

const ROOT_REPOSITORY_SCOPE = 'repo:root';
const ROOT_REPOSITORY_ID = '01a13137-1378-7df9-9968-53738dbf0e48';

export type RegistryWriteRejectionV1 =
	| 'UNKNOWN_REPOSITORY'
	| 'ROOT_MAPPING_MISMATCH'
	| 'KEY_RECIPE_MISMATCH'
	| 'CANONICAL_KEY_CONFLICT'
	| 'SOURCE_KIND_CONFLICT'
	| 'STALE_OR_UNQUALIFIED_REVISION'
	| 'CANONICAL_NOT_REGISTERED'
	| 'CROSS_REPOSITORY_ALIAS'
	| 'STORAGE_LOCATOR_OWNED'
	| 'CANONICAL_ALREADY_ALIASED'
	| 'ALIAS_SHAPE_INVALID';

export type RegistryWriteDecisionV1 =
	| { decision: 'INSERT' }
	| { decision: 'VERIFIED_IDEMPOTENT' }
	| { decision: 'REJECT'; reason: RegistryWriteRejectionV1 };

export interface RegistryWriteLookupsV1 {
	repositoryAuthorityById(repositoryId: string): Promise<{ repositoryId: string; sourceAuthorityRepoId: string } | null>;
	identityByKey(packetKey: string): Promise<PacketIdentityRegistryRowV1 | null>;
	identityBySourceKind(repositoryId: string, sourceRef: string, packetKind: PacketKindV2): Promise<PacketIdentityRegistryRowV1 | null>;
	aliasByStorageKey(storagePacketKey: string): Promise<PacketIdentityAliasRowV1 | null>;
	aliasByCanonicalKey(canonicalPacketKey: string): Promise<PacketIdentityAliasRowV1 | null>;
	/** Admitted source revision for the source ref, or null when the source is not admitted. */
	admittedSourceRevision(repositoryId: string, sourceRef: string): Promise<string | null>;
}

export interface RegistryIdentityCandidateV1 {
	identity: PacketIdentityRegistryRowV1;
	/** Source revision the caller observed; must equal the admitted revision at decision time. */
	observedSourceRevision: string;
}

const reject = (reason: RegistryWriteRejectionV1): RegistryWriteDecisionV1 => ({ decision: 'REJECT', reason });

function sameIdentity(a: PacketIdentityRegistryRowV1, b: PacketIdentityRegistryRowV1): boolean {
	return (
		a.packetKey === b.packetKey &&
		a.repositoryId === b.repositoryId &&
		a.membershipRepositoryScope === b.membershipRepositoryScope &&
		a.sourceRef === b.sourceRef &&
		a.packetKind === b.packetKind &&
		a.keyRecipeRevision === b.keyRecipeRevision
	);
}

export async function decideRegistryIdentityWriteV1(
	candidate: RegistryIdentityCandidateV1,
	lookups: RegistryWriteLookupsV1,
): Promise<RegistryWriteDecisionV1> {
	const { identity } = candidate;

	const repository = await lookups.repositoryAuthorityById(identity.repositoryId);
	if (!repository) return reject('UNKNOWN_REPOSITORY');
	if (
		identity.repositoryId !== ROOT_REPOSITORY_ID ||
		identity.membershipRepositoryScope !== ROOT_REPOSITORY_SCOPE ||
		repository.repositoryId !== ROOT_REPOSITORY_ID
	) {
		return reject('ROOT_MAPPING_MISMATCH');
	}

	let recomputed: string;
	try {
		recomputed = computePacketKeyV2({
			repositoryScope: identity.membershipRepositoryScope,
			sourceRef: identity.sourceRef,
			packetKind: identity.packetKind,
		});
	} catch {
		return reject('KEY_RECIPE_MISMATCH');
	}
	if (recomputed !== identity.packetKey) return reject('KEY_RECIPE_MISMATCH');

	const admitted = await lookups.admittedSourceRevision(identity.repositoryId, identity.sourceRef);
	if (!admitted || admitted !== candidate.observedSourceRevision) return reject('STALE_OR_UNQUALIFIED_REVISION');

	const byKey = await lookups.identityByKey(identity.packetKey);
	if (byKey) return sameIdentity(byKey, identity) ? { decision: 'VERIFIED_IDEMPOTENT' } : reject('CANONICAL_KEY_CONFLICT');

	const bySource = await lookups.identityBySourceKind(identity.repositoryId, identity.sourceRef, identity.packetKind);
	if (bySource) return reject('SOURCE_KIND_CONFLICT');

	return { decision: 'INSERT' };
}

export async function decideRegistryAliasWriteV1(
	alias: PacketIdentityAliasRowV1,
	assertedRepositoryId: string,
	lookups: RegistryWriteLookupsV1,
): Promise<RegistryWriteDecisionV1> {
	if (
		alias.aliasKind !== PACKET_IDENTITY_ALIAS_KIND_V1 ||
		alias.aliasKey !== alias.storagePacketKey ||
		alias.aliasKey === alias.canonicalPacketKey
	) {
		return reject('ALIAS_SHAPE_INVALID');
	}

	const canonical = await lookups.identityByKey(alias.canonicalPacketKey);
	if (!canonical) return reject('CANONICAL_NOT_REGISTERED');
	if (canonical.repositoryId !== assertedRepositoryId) return reject('CROSS_REPOSITORY_ALIAS');

	const byStorage = await lookups.aliasByStorageKey(alias.storagePacketKey);
	if (byStorage) {
		return byStorage.canonicalPacketKey === alias.canonicalPacketKey && byStorage.evidenceDigest === alias.evidenceDigest
			? { decision: 'VERIFIED_IDEMPOTENT' }
			: reject('STORAGE_LOCATOR_OWNED');
	}

	const byCanonical = await lookups.aliasByCanonicalKey(alias.canonicalPacketKey);
	if (byCanonical) return reject('CANONICAL_ALREADY_ALIASED');

	return { decision: 'INSERT' };
}
