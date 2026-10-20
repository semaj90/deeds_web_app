import { check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { atlasPackets } from './atlas-packets.js';

export const atlasPacketIdentityRegistryV1 = pgTable(
	'atlas_packet_identity_registry_v1',
	{
		packetKey: text('packet_key').primaryKey(),
		repositoryId: uuid('repository_id').notNull(),
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
		scopeFormat: check('atlas_packet_identity_registry_v1_scope_check', sql`${table.membershipRepositoryScope} ~ '^repo:[^[:cntrl:]]+$'`),
		sourceRefCanonical: check('atlas_packet_identity_registry_v1_source_ref_check', sql`${table.sourceRef} <> '' AND ${table.sourceRef} = btrim(${table.sourceRef}) AND ${table.sourceRef} !~ E'(^/|\\\\|(^|/)\\.\\.?(/|$)|//)'`),
		packetKindSupported: check('atlas_packet_identity_registry_v1_packet_kind_check', sql`${table.packetKind} = 'SOURCE_FILE'`),
		keyRecipeSupported: check('atlas_packet_identity_registry_v1_key_recipe_check', sql`${table.keyRecipeRevision} = 'PacketKeyV2@1'`),
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
		canonicalIdx: index('idx_atlas_packet_identity_aliases_v1_canonical').on(table.canonicalPacketKey),
		aliasKindSupported: check('atlas_packet_identity_aliases_v1_kind_check', sql`${table.aliasKind} = 'PACKET_KEY_V1_STORAGE_TO_V2'`),
		evidenceRefNonempty: check('atlas_packet_identity_aliases_v1_evidence_ref_check', sql`${table.evidenceRef} <> '' AND ${table.evidenceRef} = btrim(${table.evidenceRef})`),
		evidenceDigestFormat: check('atlas_packet_identity_aliases_v1_evidence_digest_check', sql`${table.evidenceDigest} ~ '^sha256:[0-9a-f]{64}$'`),
		noSelfAlias: check('atlas_packet_identity_aliases_v1_no_self_check', sql`${table.aliasKey} <> ${table.canonicalPacketKey}`),
	}),
);

export type AtlasPacketIdentityRegistryV1 = typeof atlasPacketIdentityRegistryV1.$inferSelect;
export type AtlasPacketIdentityAliasV1 = typeof atlasPacketIdentityAliasesV1.$inferSelect;
