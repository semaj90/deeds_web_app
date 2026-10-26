// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computePacketKeyV2, type PacketKeyV2Input } from './packet-key-v2.js';
import {
	PACKET_IDENTITY_ALIAS_KIND_V1,
	PACKET_IDENTITY_KEY_RECIPE_V1,
	PacketIdentityRegistryErrorV1,
	resolvePacketIdentityRegistryCoreV1,
	type PacketIdentityAliasRowV1,
	type PacketIdentityRegistryLookupsV1,
	type PacketIdentityRegistryRowV1,
} from './packet-identity-registry-v1.js';

const identityInput: PacketKeyV2Input = {
	repositoryScope: 'repo:root',
	sourceRef: 'src/lib/server/auth.ts',
	packetKind: 'SOURCE_FILE',
};
const canonicalKey = computePacketKeyV2(identityInput);
const legacyKey = 'packet:1234567890ab';
const registryRow: PacketIdentityRegistryRowV1 = {
	packetKey: canonicalKey,
	repositoryId: '01a13137-1378-7df9-9968-53738dbf0e48',
	membershipRepositoryScope: identityInput.repositoryScope,
	sourceRef: identityInput.sourceRef,
	packetKind: identityInput.packetKind,
	keyRecipeRevision: PACKET_IDENTITY_KEY_RECIPE_V1,
};

function createLookups(options: {
	identities?: PacketIdentityRegistryRowV1[];
	aliases?: PacketIdentityAliasRowV1[];
	storageKeys?: Record<string, string[]>;
} = {}): PacketIdentityRegistryLookupsV1 {
	return {
		async identityByKey(packetKey) {
			return options.identities?.find((row) => row.packetKey === packetKey) ?? null;
		},
		async aliasByKey(aliasKey) {
			return options.aliases?.find((row) => row.aliasKey === aliasKey) ?? null;
		},
		async storageKeysByCanonical(packetKey) {
			return options.storageKeys?.[packetKey] ?? [];
		},
	};
}

describe('packet identity registry v1', () => {
	it('resolves only a registered logical identity and does not claim revision qualification', async () => {
		await expect(
			resolvePacketIdentityRegistryCoreV1(canonicalKey, createLookups({ identities: [registryRow] })),
		).resolves.toEqual({
			canonicalPacketKey: canonicalKey,
			storagePacketKey: null,
			repositoryId: registryRow.repositoryId,
			sourceRef: registryRow.sourceRef,
			packetKind: 'SOURCE_FILE',
			resolution: 'REGISTERED_IDENTITY',
			identityRevisionQualified: false,
		});
	});

	it('returns the physical storage locator only from an explicit alias', async () => {
		const alias: PacketIdentityAliasRowV1 = {
			aliasKey: legacyKey,
			canonicalPacketKey: canonicalKey,
			storagePacketKey: legacyKey,
			aliasKind: PACKET_IDENTITY_ALIAS_KIND_V1,
			evidenceRef: 'receipt:reviewed-alias-01',
			evidenceDigest: `sha256:${'a'.repeat(64)}`,
		};
		const result = await resolvePacketIdentityRegistryCoreV1(
			legacyKey,
			createLookups({ identities: [registryRow], aliases: [alias] }),
		);
		expect(result).toMatchObject({
			canonicalPacketKey: canonicalKey,
			storagePacketKey: legacyKey,
			resolution: 'EXPLICIT_ALIAS',
			identityRevisionQualified: false,
		});
	});

	it('does not treat a legacy physical row or prefix alias as canonical identity', async () => {
		await expect(
			resolvePacketIdentityRegistryCoreV1(legacyKey, createLookups({ identities: [registryRow] })),
		).rejects.toMatchObject({ code: 'ALIAS_NOT_REGISTERED' });
	});

	it('rejects a registered row whose key does not match its recorded tuple', async () => {
		const badRow = { ...registryRow, sourceRef: 'src/lib/server/other.ts' };
		await expect(
			resolvePacketIdentityRegistryCoreV1(canonicalKey, createLookups({ identities: [badRow] })),
		).rejects.toMatchObject({ code: 'IDENTITY_ROW_INVALID' });
	});

	it('fails closed for unregistered canonical keys, malformed inputs, and ambiguous storage mappings', async () => {
		await expect(resolvePacketIdentityRegistryCoreV1(canonicalKey, createLookups())).rejects.toMatchObject({
			code: 'IDENTITY_NOT_REGISTERED',
		});
		await expect(resolvePacketIdentityRegistryCoreV1('packet:bad', createLookups())).rejects.toMatchObject({
			code: 'UNSUPPORTED_KEY_SHAPE',
		});
		await expect(
			resolvePacketIdentityRegistryCoreV1(
				canonicalKey,
				createLookups({ identities: [registryRow], storageKeys: { [canonicalKey]: ['legacy:a', 'legacy:b'] } }),
			),
		).rejects.toBeInstanceOf(PacketIdentityRegistryErrorV1);
	});
});
