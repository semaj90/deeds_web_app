import { sql } from 'drizzle-orm';
import { bigint, index, jsonb, pgTable, primaryKey, real, text, timestamp, unique } from 'drizzle-orm/pg-core';

/**
 * Canonical cross-revision symbol registry. Consiliency/treesitter-chunker IDs
 * remain upstream provenance and are stored in atlasSymbolVersions/aliases.
 * Manual migration: drizzle/manual/20260818_atlas_symbol_registry_v1.sql
 */
export const atlasSymbolRegistry = pgTable('atlas_symbol_registry', {
  stableSymbolId: text('stable_symbol_id').primaryKey(),
  canonicalKey: text('canonical_key').notNull(),
  language: text('language').notNull(),
  symbolKind: text('symbol_kind').notNull(),
  canonicalName: text('canonical_name').notNull(),
  canonicalQualifiedName: text('canonical_qualified_name').notNull(),
  createdFromNominationId: text('created_from_nomination_id').notNull(),
  createdFromSourceRef: text('created_from_source_ref').notNull(),
  createdFromSourceRevision: text('created_from_source_revision').notNull(),
  registryRevision: text('registry_revision').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  canonicalKeyUnique: unique('atlas_symbol_registry_canonical_key_key').on(t.canonicalKey),
  kindIdx: index('idx_atlas_symbol_registry_kind').on(t.language, t.symbolKind),
  nameIdx: index('idx_atlas_symbol_registry_name').on(t.canonicalName),
}));

export const atlasSymbolAliases = pgTable('atlas_symbol_aliases', {
  aliasKey: text('alias_key').notNull(),
  stableSymbolId: text('stable_symbol_id').notNull(),
  aliasKind: text('alias_kind').notNull(),
  sourceRef: text('source_ref'),
  sourceRevision: text('source_revision'),
  evidenceRefs: jsonb('evidence_refs').notNull().default(sql`'[]'::jsonb`),
  registryRevision: text('registry_revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.aliasKey, t.stableSymbolId] }),
  symbolIdx: index('idx_atlas_symbol_aliases_symbol').on(t.stableSymbolId),
  aliasIdx: index('idx_atlas_symbol_aliases_alias').on(t.aliasKey),
}));

export const atlasSymbolVersions = pgTable('atlas_symbol_versions', {
  symbolVersionId: text('symbol_version_id').primaryKey(),
  stableSymbolId: text('stable_symbol_id').notNull(),
  sourceRef: text('source_ref').notNull(),
  sourceRevision: text('source_revision').notNull(),
  workspaceRevision: text('workspace_revision').notNull(),
  upstreamNodeId: text('upstream_node_id').notNull(),
  upstreamFileId: text('upstream_file_id'),
  upstreamSymbolId: text('upstream_symbol_id'),
  upstreamChunkId: text('upstream_chunk_id').notNull(),
  qualifiedName: text('qualified_name').notNull(),
  declarationHash: text('declaration_hash').notNull(),
  signatureNormalized: text('signature_normalized'),
  byteStart: bigint('byte_start', { mode: 'number' }).notNull(),
  byteEnd: bigint('byte_end', { mode: 'number' }).notNull(),
  parentRoute: jsonb('parent_route').notNull().default(sql`'[]'::jsonb`),
  producerRevision: text('producer_revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  versionUnique: unique('atlas_symbol_versions_stable_symbol_id_source_revision_declaration_hash_upstream_node_id_key')
    .on(t.stableSymbolId, t.sourceRevision, t.declarationHash, t.upstreamNodeId),
  symbolRevisionIdx: index('idx_atlas_symbol_versions_symbol_revision').on(t.stableSymbolId, t.sourceRevision),
  upstreamNodeIdx: index('idx_atlas_symbol_versions_upstream_node').on(t.upstreamNodeId),
  upstreamSymbolIdx: index('idx_atlas_symbol_versions_upstream_symbol').on(t.upstreamSymbolId),
  sourceIdx: index('idx_atlas_symbol_versions_source').on(t.sourceRef, t.sourceRevision),
}));

export const atlasStructuralReferenceResolutions = pgTable('atlas_structural_reference_resolutions', {
  referenceId: text('reference_id').primaryKey(),
  sourceStableSymbolId: text('source_stable_symbol_id'),
  targetStableSymbolId: text('target_stable_symbol_id'),
  referenceKind: text('reference_kind').notNull(),
  targetText: text('target_text').notNull(),
  resolutionStatus: text('resolution_status').notNull(),
  resolutionBasis: text('resolution_basis').notNull(),
  sourceRevision: text('source_revision').notNull(),
  evidenceRefs: jsonb('evidence_refs').notNull().default(sql`'[]'::jsonb`),
  producerRevision: text('producer_revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  sourceIdx: index('idx_atlas_reference_resolution_source').on(t.sourceStableSymbolId),
  targetIdx: index('idx_atlas_reference_resolution_target').on(t.targetStableSymbolId),
}));

/**
 * Canonical schema-object registry. PostgreSQL catalog OIDs are stored only on
 * revision-qualified versions and never serve as Atlas identity.
 * Manual migration: drizzle/manual/20260818_atlas_schema_object_registry_v1.sql
 */
export const atlasSchemaObjectRegistry = pgTable('atlas_schema_object_registry', {
  stableSchemaObjectId: text('stable_schema_object_id').primaryKey(),
  canonicalKey: text('canonical_key').notNull(),
  objectKind: text('object_kind').notNull(),
  databaseKey: text('database_key').notNull(),
  schemaName: text('schema_name').notNull(),
  canonicalName: text('canonical_name').notNull(),
  canonicalQualifiedName: text('canonical_qualified_name').notNull(),
  createdFromNominationId: text('created_from_nomination_id').notNull(),
  createdFromSourceRef: text('created_from_source_ref').notNull(),
  createdFromSourceRevision: text('created_from_source_revision').notNull(),
  registryRevision: text('registry_revision').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  canonicalKeyUnique: unique('atlas_schema_object_registry_canonical_key_key').on(t.canonicalKey),
  kindIdx: index('idx_atlas_schema_object_registry_kind').on(t.databaseKey, t.schemaName, t.objectKind),
  nameIdx: index('idx_atlas_schema_object_registry_name').on(t.canonicalQualifiedName),
}));

export const atlasSchemaObjectAliases = pgTable('atlas_schema_object_aliases', {
  aliasKey: text('alias_key').notNull(),
  stableSchemaObjectId: text('stable_schema_object_id').notNull(),
  aliasKind: text('alias_kind').notNull(),
  sourceRef: text('source_ref'),
  sourceRevision: text('source_revision'),
  evidenceRefs: jsonb('evidence_refs').notNull().default(sql`'[]'::jsonb`),
  registryRevision: text('registry_revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.aliasKey, t.stableSchemaObjectId] }),
  objectIdx: index('idx_atlas_schema_object_aliases_object').on(t.stableSchemaObjectId),
  aliasIdx: index('idx_atlas_schema_object_aliases_alias').on(t.aliasKey),
}));

export const atlasSchemaObjectVersions = pgTable('atlas_schema_object_versions', {
  schemaObjectVersionId: text('schema_object_version_id').primaryKey(),
  stableSchemaObjectId: text('stable_schema_object_id').notNull(),
  objectKey: text('object_key').notNull(),
  objectKind: text('object_kind').notNull(),
  qualifiedName: text('qualified_name').notNull(),
  sourceRef: text('source_ref').notNull(),
  sourceRevision: text('source_revision').notNull(),
  schemaRevision: text('schema_revision').notNull(),
  parentStableSchemaObjectId: text('parent_stable_schema_object_id'),
  catalogOid: bigint('catalog_oid', { mode: 'number' }),
  definitionHash: text('definition_hash').notNull(),
  producerRevision: text('producer_revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  versionUnique: unique('atlas_schema_object_versions_stable_schema_object_id_schema_revision_definition_hash_key')
    .on(t.stableSchemaObjectId, t.schemaRevision, t.definitionHash),
  objectRevisionIdx: index('idx_atlas_schema_object_versions_object_revision').on(t.stableSchemaObjectId, t.schemaRevision),
  catalogOidIdx: index('idx_atlas_schema_object_versions_catalog_oid').on(t.catalogOid),
  sourceIdx: index('idx_atlas_schema_object_versions_source').on(t.sourceRef, t.sourceRevision),
}));

/**
 * Query-time shared-entity index used by dynamic hyperedge discovery.
 * Manual migration: drizzle/manual/20260818_atlas_dynamic_hyperedge_entities_v1.sql
 */
export const atlasEvidenceEntities = pgTable('atlas_evidence_entities', {
  evidenceId: text('evidence_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  role: text('role').notNull().default('mentions'),
  sourceRef: text('source_ref'),
  sourceRevision: text('source_revision'),
  extractionRevision: text('extraction_revision').notNull(),
  confidence: real('confidence').notNull().default(1),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
}, (t) => ({
  pk: primaryKey({ columns: [t.evidenceId, t.entityType, t.entityId, t.role] }),
  entityIdx: index('atlas_evidence_entities_entity_idx').on(t.entityType, t.entityId, t.evidenceId),
  evidenceIdx: index('atlas_evidence_entities_evidence_idx').on(t.evidenceId, t.entityType, t.entityId),
  sourceRevisionIdx: index('atlas_evidence_entities_source_revision_idx').on(t.sourceRef, t.sourceRevision),
}));

export type AtlasSymbolRegistryRow = typeof atlasSymbolRegistry.$inferSelect;
export type AtlasSymbolAliasRow = typeof atlasSymbolAliases.$inferSelect;
export type AtlasSymbolVersionRow = typeof atlasSymbolVersions.$inferSelect;
export type AtlasStructuralReferenceResolutionRow = typeof atlasStructuralReferenceResolutions.$inferSelect;
export type AtlasSchemaObjectRegistryRow = typeof atlasSchemaObjectRegistry.$inferSelect;
export type AtlasSchemaObjectAliasRow = typeof atlasSchemaObjectAliases.$inferSelect;
export type AtlasSchemaObjectVersionRow = typeof atlasSchemaObjectVersions.$inferSelect;
export type AtlasEvidenceEntityRow = typeof atlasEvidenceEntities.$inferSelect;
