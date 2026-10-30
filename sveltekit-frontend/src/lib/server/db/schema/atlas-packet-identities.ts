import { bigint, check, foreignKey, index, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { atlasPackets } from './atlas-packets.js';

/**
 * Read-side mirror of the LIVE `atlas_repository_identity` table, declared only so the registry can
 * carry a typed foreign key. The table already exists in PostgreSQL: do not generate or migrate it
 * from this definition, and do not add writers here (minting is owned by mint-stable-file-identity).
 */
export const atlasRepositoryIdentity = pgTable('atlas_repository_identity', {
	repositoryId: uuid('repository_id').primaryKey(),
	sourceAuthorityRepoId: text('source_authority_repo_id').notNull(),
	repositoryName: text('repository_name').notNull(),
	repositoryPath: text('repository_path').notNull(),
	repositoryKind: text('repository_kind').notNull(),
	gitmoduleName: text('gitmodule_name'),
	originUrl: text('origin_url'),
	parentRepositoryId: uuid('parent_repository_id'),
	knownCommitOids: text('known_commit_oids').array().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
	repositoryAuthorityUnique: unique('atlas_repository_identity_repository_id_source_authority_re_key').on(
		table.repositoryId,
		table.sourceAuthorityRepoId,
	),
}));

export const atlasStableFileIdentity = pgTable('atlas_stable_file_identity', {
	stableFileId: uuid('stable_file_id').primaryKey(),
	repositoryId: uuid('repository_id').notNull(),
	lifecycleState: text('lifecycle_state').notNull().default('ACTIVE'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	tombstonedAt: timestamp('tombstoned_at', { withTimezone: true }),
}, (table) => ({
	repositoryFk: foreignKey({ name: 'atlas_stable_file_identity_repository_id_fkey', columns: [table.repositoryId], foreignColumns: [atlasRepositoryIdentity.repositoryId] }),
	repositoryStateIndex: index('idx_atlas_stable_file_identity_repo_state').on(table.repositoryId, table.lifecycleState),
	lifecycleStateCheck: check('atlas_stable_file_identity_lifecycle_state_check', sql`${table.lifecycleState} IN ('ACTIVE', 'TOMBSTONED')`),
}));

export const atlasWorkspaceSourceBindingsReadonly = pgTable('atlas_workspace_source_bindings', {
	repoId: text('repo_id').notNull(),
	canonicalSourceRef: text('canonical_source_ref').notNull(),
	sourceRevision: text('source_revision').notNull(),
	workspaceRevision: text('workspace_revision').notNull(),
}, (table) => ({
	sourceWorkspaceUnique: unique('atlas_workspace_source_bindin_repo_id_canonical_source_ref__key').on(
		table.repoId,
		table.canonicalSourceRef,
		table.sourceRevision,
		table.workspaceRevision,
	),
}));

export const atlasStableFileRevisionBinding = pgTable('atlas_stable_file_revision_binding', {
	stableFileId: uuid('stable_file_id').notNull(),
	repositoryId: uuid('repository_id').notNull(),
	sourceAuthorityRepoId: text('source_authority_repo_id').notNull(),
	canonicalSourceRef: text('canonical_source_ref').notNull(),
	workspaceRevision: text('workspace_revision').notNull(),
	sourceRevision: text('source_revision').notNull(),
	contentDigest: text('content_digest').notNull(),
	byteLength: bigint('byte_length', { mode: 'number' }).notNull(),
	sourceIdentityKey: text('source_identity_key').notNull(),
	observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
	provenance: text('provenance').notNull(),
}, (table) => ({
	primaryKey: primaryKey({ name: 'atlas_stable_file_revision_bi_stable_file_id_workspace_revi_key', columns: [table.stableFileId, table.workspaceRevision] }),
	stableFileFk: foreignKey({ name: 'atlas_stable_file_revision_binding_stable_file_id_fkey', columns: [table.stableFileId], foreignColumns: [atlasStableFileIdentity.stableFileId] }),
	repositoryAuthorityFk: foreignKey({
		name: 'atlas_stable_file_revision_bi_repository_id_source_authori_fkey',
		columns: [table.repositoryId, table.sourceAuthorityRepoId],
		foreignColumns: [atlasRepositoryIdentity.repositoryId, atlasRepositoryIdentity.sourceAuthorityRepoId],
	}),
	sourceBindingFk: foreignKey({
		name: 'atlas_stable_file_revision_bi_source_authority_repo_id_can_fkey',
		columns: [table.sourceAuthorityRepoId, table.canonicalSourceRef, table.sourceRevision, table.workspaceRevision],
		foreignColumns: [atlasWorkspaceSourceBindingsReadonly.repoId, atlasWorkspaceSourceBindingsReadonly.canonicalSourceRef, atlasWorkspaceSourceBindingsReadonly.sourceRevision, atlasWorkspaceSourceBindingsReadonly.workspaceRevision],
	}),
	scopedPathIndex: index('idx_atlas_stable_file_revision_binding_scoped_path').on(table.repositoryId, table.canonicalSourceRef, table.workspaceRevision),
	identityKeyIndex: index('idx_atlas_stable_file_revision_binding_identity_key').on(table.sourceIdentityKey),
	workspaceRevisionCheck: check('atlas_stable_file_revision_binding_workspace_revision_check', sql`${table.workspaceRevision} ~ '^sha256:[0-9a-f]{64}$'`),
	sourceRevisionCheck: check('atlas_stable_file_revision_binding_source_revision_check', sql`${table.sourceRevision} ~ '^sha256:[0-9a-f]{64}$'`),
	contentDigestCheck: check('atlas_stable_file_revision_binding_content_digest_check', sql`${table.contentDigest} ~ '^[0-9a-f]{64}$'`),
	byteLengthCheck: check('atlas_stable_file_revision_binding_byte_length_check', sql`${table.byteLength} >= 0`),
	sourceDigestCheck: check('atlas_stable_file_revision_binding_check', sql`${table.sourceRevision} = 'sha256:' || ${table.contentDigest}`),
}));

export const atlasStableFileAlias = pgTable('atlas_stable_file_alias', {
	stableFileId: uuid('stable_file_id').notNull(),
	repositoryId: uuid('repository_id').notNull(),
	aliasPath: text('alias_path').notNull(),
	introducedInWorkspaceRevision: text('introduced_in_workspace_revision').notNull(),
	supersededInWorkspaceRevision: text('superseded_in_workspace_revision'),
	evidence: jsonb('evidence').notNull().default({}),
}, (table) => ({
	primaryKey: primaryKey({ name: 'atlas_stable_file_alias_stable_file_id_alias_path_introduce_key', columns: [table.stableFileId, table.aliasPath, table.introducedInWorkspaceRevision] }),
	stableFileFk: foreignKey({ name: 'atlas_stable_file_alias_stable_file_id_fkey', columns: [table.stableFileId], foreignColumns: [atlasStableFileIdentity.stableFileId] }),
	repositoryFk: foreignKey({ name: 'atlas_stable_file_alias_repository_id_fkey', columns: [table.repositoryId], foreignColumns: [atlasRepositoryIdentity.repositoryId] }),
	pathIndex: index('idx_atlas_stable_file_alias_path').on(table.aliasPath),
	introducedRevisionCheck: check('atlas_stable_file_alias_introduced_in_workspace_revision_check', sql`${table.introducedInWorkspaceRevision} ~ '^sha256:[0-9a-f]{64}$'`),
	supersededRevisionCheck: check('atlas_stable_file_alias_superseded_in_workspace_revision_check', sql`${table.supersededInWorkspaceRevision} IS NULL OR ${table.supersededInWorkspaceRevision} ~ '^sha256:[0-9a-f]{64}$'`),
}));

export const atlasGraphifyScopeRepositoryMapV1 = pgTable(
	'atlas_graphify_scope_repository_map_v1',
	{
		membershipRepositoryScope: text('membership_repository_scope').primaryKey(),
		repositoryId: uuid('repository_id').notNull().references(() => atlasRepositoryIdentity.repositoryId, { onDelete: 'restrict' }),
		sourceAuthorityRepoId: text('source_authority_repo_id').notNull(),
		mappingKind: text('mapping_kind').notNull(),
		evidenceRef: text('evidence_ref').notNull(),
		evidenceDigest: text('evidence_digest').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		scopeRepositoryUnique: unique('atlas_graphify_scope_repository_map_v1_scope_repository_key').on(table.membershipRepositoryScope, table.repositoryId),
		scopeCanonical: check('atlas_graphify_scope_repository_map_v1_scope_check', sql`${table.membershipRepositoryScope} <> '' AND ${table.membershipRepositoryScope} = btrim(${table.membershipRepositoryScope}) AND ${table.membershipRepositoryScope} !~ '[[:cntrl:]]'`),
		mappingKindSupported: check('atlas_graphify_scope_repository_map_v1_kind_check', sql`${table.mappingKind} IN ('ROOT_SCOPE', 'NESTED_REPOSITORY', 'LOGICAL_SUBSCOPE')`),
		evidenceRefRequired: check('atlas_graphify_scope_repository_map_v1_evidence_ref_check', sql`${table.evidenceRef} <> '' AND ${table.evidenceRef} = btrim(${table.evidenceRef})`),
		evidenceDigestFormat: check('atlas_graphify_scope_repository_map_v1_evidence_digest_check', sql`${table.evidenceDigest} ~ '^sha256:[0-9a-f]{64}$'`),
		rootKindAgreement: check('atlas_graphify_scope_repository_map_v1_root_scope_kind_check', sql`(${table.membershipRepositoryScope} = 'repo:root') = (${table.mappingKind} = 'ROOT_SCOPE')`),
	}),
);

export const atlasPacketIdentityRegistryV1 = pgTable(
	'atlas_packet_identity_registry_v1',
	{
		packetKey: text('packet_key').primaryKey(),
		repositoryId: uuid('repository_id')
			.notNull()
			.references(() => atlasRepositoryIdentity.repositoryId, { onDelete: 'restrict' }),
		membershipRepositoryScope: text('membership_repository_scope').notNull(),
		sourceRef: text('source_ref').notNull(),
		packetKind: text('packet_kind').notNull(),
		keyRecipeRevision: text('key_recipe_revision').notNull().default('PacketKeyV2@1'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		repositorySourceKindUnique: unique('atlas_packet_identity_registry_v1_repository_source_kind_key').on(
			table.repositoryId,
			table.sourceRef,
			table.packetKind,
		),
		scopeSourceKindUnique: unique('atlas_packet_identity_registry_v1_scope_source_kind_key').on(
			table.membershipRepositoryScope,
			table.sourceRef,
			table.packetKind,
		),
		sourceRefIdx: index('idx_atlas_packet_identity_registry_v1_source_ref').on(table.sourceRef),
		packetKeyFormat: check('atlas_packet_identity_registry_v1_packet_key_check', sql`${table.packetKey} ~ '^packet:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`),
		scopeRepositoryMappingFk: foreignKey({
			name: 'atlas_packet_identity_registry_v1_scope_repository_fk',
			columns: [table.membershipRepositoryScope, table.repositoryId],
			foreignColumns: [atlasGraphifyScopeRepositoryMapV1.membershipRepositoryScope, atlasGraphifyScopeRepositoryMapV1.repositoryId],
		}).onDelete('restrict'),
		rootMembershipScope: check('atlas_packet_identity_registry_v1_root_repository_check', sql`${table.membershipRepositoryScope} = 'repo:root'`),
		sourceRefCanonical: check('atlas_packet_identity_registry_v1_source_ref_check', sql`${table.sourceRef} <> '' AND ${table.sourceRef} = btrim(${table.sourceRef}) AND ${table.sourceRef} !~ E'(^/|\\\\|(^|/)\\.\\.?(/|$)|//)'`),
		packetKindSupported: check('atlas_packet_identity_registry_v1_packet_kind_check', sql`${table.packetKind} = 'SOURCE_FILE'`),
		keyRecipeSupported: check('atlas_packet_identity_registry_v1_key_recipe_revision_check', sql`${table.keyRecipeRevision} = 'PacketKeyV2@1'`),
	}),
);

export const atlasPacketIdentityAliasesV1 = pgTable(
	'atlas_packet_identity_aliases_v1',
	{
		aliasKey: text('alias_key').primaryKey(),
		canonicalPacketKey: text('canonical_packet_key')
			.notNull()
			.references(() => atlasPacketIdentityRegistryV1.packetKey, { onDelete: 'restrict' }),
		storagePacketKey: text('storage_packet_key')
			.notNull()
			.references(() => atlasPackets.packetKey, { onDelete: 'restrict' }),
		aliasKind: text('alias_kind').notNull(),
		evidenceRef: text('evidence_ref').notNull(),
		evidenceDigest: text('evidence_digest').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		// One canonical key owns exactly one storage locator (reverse mapping is unambiguous).
		canonicalKeyUnique: unique('atlas_packet_identity_aliases_v1_canonical_key').on(table.canonicalPacketKey),
		aliasKindSupported: check('atlas_packet_identity_aliases_v1_alias_kind_check', sql`${table.aliasKind} = 'PACKET_KEY_V1_STORAGE_TO_V2'`),
		evidenceRefNonempty: check('atlas_packet_identity_aliases_v1_evidence_ref_check', sql`${table.evidenceRef} <> '' AND ${table.evidenceRef} = btrim(${table.evidenceRef})`),
		evidenceDigestFormat: check('atlas_packet_identity_aliases_v1_evidence_digest_check', sql`${table.evidenceDigest} ~ '^sha256:[0-9a-f]{64}$'`),
		noSelfAlias: check('atlas_packet_identity_aliases_v1_no_self_check', sql`${table.aliasKey} <> ${table.canonicalPacketKey}`),
		aliasMatchesStorageLocator: check('atlas_packet_identity_aliases_v1_storage_locator_check', sql`${table.aliasKey} = ${table.storagePacketKey}`),
	}),
);

export type AtlasPacketIdentityRegistryV1 = typeof atlasPacketIdentityRegistryV1.$inferSelect;
export type AtlasPacketIdentityAliasV1 = typeof atlasPacketIdentityAliasesV1.$inferSelect;
