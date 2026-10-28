import {
	assertCanonicalSourceRefV2,
	computePacketKeyV2,
	PACKET_KEY_V2_PATTERN,
	type PacketKindV2,
} from './packet-key-v2.js';

export const PACKET_IDENTITY_KEY_RECIPE_V1 = 'PacketKeyV2@1' as const;
export const PACKET_IDENTITY_ALIAS_KIND_V1 = 'PACKET_KEY_V1_STORAGE_TO_V2' as const;

export interface PacketIdentityRegistryRowV1 {
	packetKey: string;
	repositoryId: string;
	membershipRepositoryScope: string;
	sourceRef: string;
	packetKind: PacketKindV2;
	keyRecipeRevision: typeof PACKET_IDENTITY_KEY_RECIPE_V1;
}

export interface PacketIdentityAliasRowV1 {
	aliasKey: string;
	canonicalPacketKey: string;
	storagePacketKey: string;
	aliasKind: typeof PACKET_IDENTITY_ALIAS_KIND_V1;
	evidenceRef: string;
	evidenceDigest: string;
}

export interface PacketIdentityRegistryLookupsV1 {
	identityByKey(packetKey: string): Promise<PacketIdentityRegistryRowV1 | null>;
	repositoryScopeMappingByScope(scope: string): Promise<{
		membershipRepositoryScope: string;
		repositoryId: string;
		sourceAuthorityRepoId?: string;
		mappingKind: 'ROOT_SCOPE' | 'NESTED_REPOSITORY' | 'LOGICAL_SUBSCOPE';
	} | null>;
	repositoryAuthorityById(repositoryId: string): Promise<{
		repositoryId: string;
		sourceAuthorityRepoId: string;
		repositoryKind: string;
	} | null>;
	aliasByKey(aliasKey: string): Promise<PacketIdentityAliasRowV1 | null>;
	storageKeysByCanonical(canonicalPacketKey: string): Promise<string[]>;
}

export interface ResolvedPacketIdentityV1 {
	canonicalPacketKey: string;
	storagePacketKey: string | null;
	repositoryId: string;
	sourceRef: string;
	packetKind: PacketKindV2;
	resolution: 'REGISTERED_IDENTITY' | 'EXPLICIT_ALIAS';
	identityRevisionQualified: false;
}

export class PacketIdentityRegistryErrorV1 extends Error {
	constructor(
		public readonly code:
			| 'MALFORMED_KEY'
			| 'UNSUPPORTED_KEY_SHAPE'
			| 'IDENTITY_NOT_REGISTERED'
			| 'ALIAS_NOT_REGISTERED'
			| 'ALIAS_TARGET_INVALID'
			| 'IDENTITY_ROW_INVALID'
			| 'REPOSITORY_MAPPING_INVALID'
			| 'STORAGE_KEY_AMBIGUOUS'
			| 'REGISTRY_DDL_NOT_APPLIED',
		public readonly inputKey: string,
	) {
		super(`PACKET_IDENTITY_REGISTRY_${code}: ${inputKey}`);
		this.name = 'PacketIdentityRegistryErrorV1';
	}
}

const LEGACY_PACKET_KEY_PATTERN = /^(?:ace:)?packet:[0-9a-f]{12}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOT_REPOSITORY_SCOPE = 'repo:root';

function validateIdentityRow(row: PacketIdentityRegistryRowV1, inputKey: string): void {
	if (
		!PACKET_KEY_V2_PATTERN.test(row.packetKey) ||
		!UUID_PATTERN.test(row.repositoryId) ||
		!/^repo:[^\u0000-\u001f\u007f]+$/.test(row.membershipRepositoryScope) ||
		row.keyRecipeRevision !== PACKET_IDENTITY_KEY_RECIPE_V1 ||
		row.packetKind !== 'SOURCE_FILE'
	) {
		throw new PacketIdentityRegistryErrorV1('IDENTITY_ROW_INVALID', inputKey);
	}

	try {
		assertCanonicalSourceRefV2(row.sourceRef);
		if (
			computePacketKeyV2({
				repositoryScope: row.membershipRepositoryScope,
				sourceRef: row.sourceRef,
				packetKind: row.packetKind,
			}) !== row.packetKey
		) {
			throw new PacketIdentityRegistryErrorV1('IDENTITY_ROW_INVALID', inputKey);
		}
	} catch (error) {
		if (error instanceof PacketIdentityRegistryErrorV1) throw error;
		throw new PacketIdentityRegistryErrorV1('IDENTITY_ROW_INVALID', inputKey);
	}
}

function validateInputKey(key: string): string {
	const normalized = key.trim();
	if (!normalized || normalized.includes('\u0000')) throw new PacketIdentityRegistryErrorV1('MALFORMED_KEY', key);
	if (!PACKET_KEY_V2_PATTERN.test(normalized) && !LEGACY_PACKET_KEY_PATTERN.test(normalized)) {
		throw new PacketIdentityRegistryErrorV1('UNSUPPORTED_KEY_SHAPE', key);
	}
	return normalized;
}

export async function resolvePacketIdentityRegistryCoreV1(
	inputKey: string,
	lookups: PacketIdentityRegistryLookupsV1,
): Promise<ResolvedPacketIdentityV1> {
	const key = validateInputKey(inputKey);
	const isCanonicalKey = PACKET_KEY_V2_PATTERN.test(key);
	const alias = isCanonicalKey ? null : await lookups.aliasByKey(key);
	if (!isCanonicalKey && !alias) throw new PacketIdentityRegistryErrorV1('ALIAS_NOT_REGISTERED', inputKey);
	if (
		alias &&
		(alias.aliasKind !== PACKET_IDENTITY_ALIAS_KIND_V1 ||
			alias.aliasKey !== key ||
			alias.storagePacketKey !== alias.aliasKey ||
			!PACKET_KEY_V2_PATTERN.test(alias.canonicalPacketKey) ||
			!alias.storagePacketKey.trim() ||
			!alias.evidenceRef.trim() ||
			!/^sha256:[0-9a-f]{64}$/.test(alias.evidenceDigest))
	) {
		throw new PacketIdentityRegistryErrorV1('ALIAS_TARGET_INVALID', inputKey);
	}

	const canonicalPacketKey = alias?.canonicalPacketKey ?? key;
	const row = await lookups.identityByKey(canonicalPacketKey);
	if (!row) throw new PacketIdentityRegistryErrorV1('IDENTITY_NOT_REGISTERED', inputKey);
	validateIdentityRow(row, inputKey);
	const scopeMapping = await lookups.repositoryScopeMappingByScope(row.membershipRepositoryScope);
	const repositoryAuthority = await lookups.repositoryAuthorityById(row.repositoryId);
	if (
		!scopeMapping ||
		scopeMapping.membershipRepositoryScope !== row.membershipRepositoryScope ||
		scopeMapping.repositoryId !== row.repositoryId ||
		(scopeMapping.membershipRepositoryScope === ROOT_REPOSITORY_SCOPE && scopeMapping.mappingKind !== 'ROOT_SCOPE') ||
		!repositoryAuthority ||
		repositoryAuthority.repositoryId !== row.repositoryId ||
		(scopeMapping.sourceAuthorityRepoId !== undefined && repositoryAuthority.sourceAuthorityRepoId !== scopeMapping.sourceAuthorityRepoId) ||
		(scopeMapping.mappingKind === 'ROOT_SCOPE' && repositoryAuthority.repositoryKind !== 'ROOT') ||
		(scopeMapping.mappingKind === 'NESTED_REPOSITORY' && repositoryAuthority.repositoryKind !== 'NESTED_GIT_REPOSITORY') ||
		(scopeMapping.mappingKind === 'LOGICAL_SUBSCOPE' && repositoryAuthority.repositoryKind !== 'ROOT')
	) {
		throw new PacketIdentityRegistryErrorV1('REPOSITORY_MAPPING_INVALID', inputKey);
	}

	const storageKeys = alias
		? [alias.storagePacketKey]
		: await lookups.storageKeysByCanonical(canonicalPacketKey);
	if (storageKeys.length > 1) throw new PacketIdentityRegistryErrorV1('STORAGE_KEY_AMBIGUOUS', inputKey);

	return {
		canonicalPacketKey,
		storagePacketKey: storageKeys[0] ?? null,
		repositoryId: row.repositoryId,
		sourceRef: row.sourceRef,
		packetKind: row.packetKind,
		resolution: alias ? 'EXPLICIT_ALIAS' : 'REGISTERED_IDENTITY',
		identityRevisionQualified: false,
	};
}

