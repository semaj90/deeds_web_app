import { describe, expect, it } from 'vitest';
import { computePacketKeyV2 } from './packet-key-v2.js';
import {
	decideRegistryAliasWriteV1,
	decideRegistryIdentityWriteV1,
	type RegistryWriteLookupsV1,
} from './packet-identity-registry-writer-v1.js';
import type { PacketIdentityAliasRowV1, PacketIdentityRegistryRowV1 } from './packet-identity-registry-v1.js';

const ROOT = '01a13137-1378-7df9-9968-53738dbf0e48';
const OTHER_REPO = '01a13137-1378-7df9-9968-000000000001';
const REVISION = `sha256:${'a'.repeat(64)}`;
const STALE = `sha256:${'b'.repeat(64)}`;

function identityFor(sourceRef: string, overrides: Partial<PacketIdentityRegistryRowV1> = {}): PacketIdentityRegistryRowV1 {
	return {
		packetKey: computePacketKeyV2({ repositoryScope: 'repo:root', sourceRef, packetKind: 'SOURCE_FILE' }),
		repositoryId: ROOT,
		membershipRepositoryScope: 'repo:root',
		sourceRef,
		packetKind: 'SOURCE_FILE',
		keyRecipeRevision: 'PacketKeyV2@1',
		...overrides,
	};
}

function lookups(state: {
	repositories?: string[];
	identities?: PacketIdentityRegistryRowV1[];
	aliases?: PacketIdentityAliasRowV1[];
	admitted?: Record<string, string | null>;
} = {}): RegistryWriteLookupsV1 {
	const repositories = state.repositories ?? [ROOT];
	const identities = state.identities ?? [];
	const aliases = state.aliases ?? [];
	return {
		repositoryAuthorityById: async (id) => (repositories.includes(id) ? { repositoryId: id, sourceAuthorityRepoId: 'deeds-web-app' } : null),
		identityByKey: async (key) => identities.find((row) => row.packetKey === key) ?? null,
		identityBySourceKind: async (repo, ref, kind) =>
			identities.find((row) => row.repositoryId === repo && row.sourceRef === ref && row.packetKind === kind) ?? null,
		aliasByStorageKey: async (key) => aliases.find((row) => row.storagePacketKey === key) ?? null,
		aliasByCanonicalKey: async (key) => aliases.find((row) => row.canonicalPacketKey === key) ?? null,
		admittedSourceRevision: async (_repo, ref) => (state.admitted && ref in state.admitted ? state.admitted[ref] : REVISION),
	};
}

function aliasFor(canonical: string, storage: string, digest = `sha256:${'c'.repeat(64)}`): PacketIdentityAliasRowV1 {
	return {
		aliasKey: storage,
		canonicalPacketKey: canonical,
		storagePacketKey: storage,
		aliasKind: 'PACKET_KEY_V1_STORAGE_TO_V2',
		evidenceRef: 'receipt:test',
		evidenceDigest: digest,
	};
}

describe('decideRegistryIdentityWriteV1', () => {
	const identity = identityFor('src/a.ts');
	const candidate = { identity, observedSourceRevision: REVISION };

	it('inserts a new, correctly derived root identity', async () => {
		expect(await decideRegistryIdentityWriteV1(candidate, lookups())).toEqual({ decision: 'INSERT' });
	});

	it('is idempotent on an exact replay', async () => {
		expect(await decideRegistryIdentityWriteV1(candidate, lookups({ identities: [identity] }))).toEqual({ decision: 'VERIFIED_IDEMPOTENT' });
	});

	it('rejects an unknown repository UUID', async () => {
		const unknown = identityFor('src/a.ts', { repositoryId: OTHER_REPO });
		expect(await decideRegistryIdentityWriteV1({ identity: unknown, observedSourceRevision: REVISION }, lookups())).toEqual({
			decision: 'REJECT',
			reason: 'UNKNOWN_REPOSITORY',
		});
	});

	it('rejects a known repository that is not the root mapping', async () => {
		const wrongRoot = identityFor('src/a.ts', { repositoryId: OTHER_REPO });
		const result = await decideRegistryIdentityWriteV1({ identity: wrongRoot, observedSourceRevision: REVISION }, lookups({ repositories: [ROOT, OTHER_REPO] }));
		expect(result).toEqual({ decision: 'REJECT', reason: 'ROOT_MAPPING_MISMATCH' });
	});

	it('rejects a root UUID paired with a different scope string', async () => {
		const wrongScope = identityFor('src/a.ts', { membershipRepositoryScope: 'repo:other' });
		expect(await decideRegistryIdentityWriteV1({ identity: wrongScope, observedSourceRevision: REVISION }, lookups())).toEqual({
			decision: 'REJECT',
			reason: 'ROOT_MAPPING_MISMATCH',
		});
	});

	it('rejects a key that is not the recomputed PacketKeyV2', async () => {
		const tampered = { ...identity, packetKey: identityFor('src/other.ts').packetKey };
		expect(await decideRegistryIdentityWriteV1({ identity: tampered, observedSourceRevision: REVISION }, lookups())).toEqual({
			decision: 'REJECT',
			reason: 'KEY_RECIPE_MISMATCH',
		});
	});

	it('rejects a duplicate canonical key that carries a different tuple', async () => {
		const conflicting = { ...identity, keyRecipeRevision: 'PacketKeyV2@1' as const, packetKind: 'SOURCE_FILE' as const, sourceRef: identity.sourceRef };
		const existing = { ...identity, membershipRepositoryScope: 'repo:root-alt' };
		const result = await decideRegistryIdentityWriteV1({ identity: conflicting, observedSourceRevision: REVISION }, lookups({ identities: [existing] }));
		expect(result).toEqual({ decision: 'REJECT', reason: 'CANONICAL_KEY_CONFLICT' });
	});

	it('rejects a second key for the same repository, source and kind', async () => {
		const rival = { ...identity, packetKey: identityFor('src/rival.ts').packetKey };
		const result = await decideRegistryIdentityWriteV1(candidate, lookups({ identities: [rival].map((row) => ({ ...row, sourceRef: identity.sourceRef })) }));
		expect(result).toEqual({ decision: 'REJECT', reason: 'SOURCE_KIND_CONFLICT' });
	});

	it('rejects stale or unqualified source revisions', async () => {
		expect(await decideRegistryIdentityWriteV1({ identity, observedSourceRevision: STALE }, lookups())).toEqual({
			decision: 'REJECT',
			reason: 'STALE_OR_UNQUALIFIED_REVISION',
		});
		expect(await decideRegistryIdentityWriteV1(candidate, lookups({ admitted: { 'src/a.ts': null } }))).toEqual({
			decision: 'REJECT',
			reason: 'STALE_OR_UNQUALIFIED_REVISION',
		});
	});
});

describe('decideRegistryAliasWriteV1', () => {
	const canonical = identityFor('src/a.ts');
	const storage = 'packet:0123456789ab';

	it('inserts a first alias for a registered canonical identity', async () => {
		const result = await decideRegistryAliasWriteV1(aliasFor(canonical.packetKey, storage), ROOT, lookups({ identities: [canonical] }));
		expect(result).toEqual({ decision: 'INSERT' });
	});

	it('is idempotent on an exact alias replay', async () => {
		const alias = aliasFor(canonical.packetKey, storage);
		expect(await decideRegistryAliasWriteV1(alias, ROOT, lookups({ identities: [canonical], aliases: [alias] }))).toEqual({
			decision: 'VERIFIED_IDEMPOTENT',
		});
	});

	it('rejects an alias to an unregistered canonical key', async () => {
		expect(await decideRegistryAliasWriteV1(aliasFor(canonical.packetKey, storage), ROOT, lookups())).toEqual({
			decision: 'REJECT',
			reason: 'CANONICAL_NOT_REGISTERED',
		});
	});

	it('rejects a cross-repository alias', async () => {
		const result = await decideRegistryAliasWriteV1(aliasFor(canonical.packetKey, storage), OTHER_REPO, lookups({ identities: [canonical] }));
		expect(result).toEqual({ decision: 'REJECT', reason: 'CROSS_REPOSITORY_ALIAS' });
	});

	it('rejects a storage locator already owned by a different canonical key', async () => {
		const other = identityFor('src/b.ts');
		const owned = aliasFor(other.packetKey, storage);
		const result = await decideRegistryAliasWriteV1(aliasFor(canonical.packetKey, storage), ROOT, lookups({ identities: [canonical, other], aliases: [owned] }));
		expect(result).toEqual({ decision: 'REJECT', reason: 'STORAGE_LOCATOR_OWNED' });
	});

	it('rejects a second storage locator for the same canonical key', async () => {
		const first = aliasFor(canonical.packetKey, storage);
		const second = aliasFor(canonical.packetKey, 'packet:ba9876543210');
		const result = await decideRegistryAliasWriteV1(second, ROOT, lookups({ identities: [canonical], aliases: [first] }));
		expect(result).toEqual({ decision: 'REJECT', reason: 'CANONICAL_ALREADY_ALIASED' });
	});

	it('rejects malformed alias shapes', async () => {
		const mismatched = { ...aliasFor(canonical.packetKey, storage), aliasKey: 'packet:ffffffffffff' };
		expect(await decideRegistryAliasWriteV1(mismatched, ROOT, lookups({ identities: [canonical] }))).toEqual({
			decision: 'REJECT',
			reason: 'ALIAS_SHAPE_INVALID',
		});
	});
});
