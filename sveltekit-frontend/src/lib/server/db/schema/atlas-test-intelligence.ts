import { sql } from 'drizzle-orm';
import { bigint, doublePrecision, index, jsonb, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

/**
 * Parent Atlas canonical test registry.
 * Manual DDL owner: drizzle/manual/20260818_atlas_test_registry_v1.sql
 */
export const atlasTestRegistry = pgTable('atlas_test_registry', {
  stableTestId: text('stable_test_id').primaryKey(),
  canonicalKey: text('canonical_key').notNull(),
  framework: text('framework').notNull(),
  canonicalSourceRef: text('canonical_source_ref').notNull(),
  canonicalFullName: text('canonical_full_name').notNull(),
  createdFromNominationId: text('created_from_nomination_id').notNull(),
  createdFromSourceRevision: text('created_from_source_revision').notNull(),
  registryRevision: text('registry_revision').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  canonicalKeyUnique: unique('atlas_test_registry_canonical_key_key').on(t.canonicalKey),
  frameworkSourceIdx: index('idx_atlas_test_registry_framework_source').on(t.framework, t.canonicalSourceRef),
  fullNameIdx: index('idx_atlas_test_registry_full_name').on(t.canonicalFullName),
}));

export const atlasTestAliases = pgTable('atlas_test_aliases', {
  aliasKey: text('alias_key').notNull(),
  stableTestId: text('stable_test_id').notNull(),
  aliasKind: text('alias_kind').notNull(),
  sourceRef: text('source_ref'),
  sourceRevision: text('source_revision'),
  evidenceRefs: jsonb('evidence_refs').notNull().default(sql`'[]'::jsonb`),
  registryRevision: text('registry_revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.aliasKey, t.stableTestId] }),
  testIdx: index('idx_atlas_test_aliases_test').on(t.stableTestId),
  aliasIdx: index('idx_atlas_test_aliases_alias').on(t.aliasKey),
}));

export const atlasTestVersions = pgTable('atlas_test_versions', {
  testVersionId: text('test_version_id').primaryKey(),
  stableTestId: text('stable_test_id').notNull(),
  testKey: text('test_key').notNull(),
  framework: text('framework').notNull(),
  sourceRef: text('source_ref').notNull(),
  sourceRevision: text('source_revision').notNull(),
  suitePath: jsonb('suite_path').notNull().default(sql`'[]'::jsonb`),
  title: text('title').notNull(),
  fullName: text('full_name').notNull(),
  line: bigint('line', { mode: 'number' }),
  column: bigint('column_no', { mode: 'number' }),
  definitionHash: text('definition_hash').notNull(),
  producerRevision: text('producer_revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  versionUnique: unique('atlas_test_versions_stable_test_id_source_revision_definition_hash_key')
    .on(t.stableTestId, t.sourceRevision, t.definitionHash),
  testRevisionIdx: index('idx_atlas_test_versions_test_revision').on(t.stableTestId, t.sourceRevision),
  sourceIdx: index('idx_atlas_test_versions_source').on(t.sourceRef, t.sourceRevision),
  keyIdx: index('idx_atlas_test_versions_key').on(t.testKey),
}));

export const atlasTestExecutionReceipts = pgTable('atlas_test_execution_receipts', {
  executionReceiptId: text('execution_receipt_id').primaryKey(),
  stableTestId: text('stable_test_id'),
  testKey: text('test_key').notNull(),
  runRevision: text('run_revision').notNull(),
  sourceRef: text('source_ref').notNull(),
  sourceRevision: text('source_revision').notNull(),
  framework: text('framework').notNull(),
  status: text('status').notNull(),
  durationMs: doublePrecision('duration_ms'),
  failureMessages: jsonb('failure_messages').notNull().default(sql`'[]'::jsonb`),
  reportChecksum: text('report_checksum').notNull(),
  observedAtMs: bigint('observed_at_ms', { mode: 'number' }),
  producerRevision: text('producer_revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  testRunIdx: index('idx_atlas_test_execution_test_run').on(t.stableTestId, t.runRevision),
  keyRunIdx: index('idx_atlas_test_execution_key_run').on(t.testKey, t.runRevision),
  statusIdx: index('idx_atlas_test_execution_status').on(t.status, t.runRevision),
}));

export type AtlasTestRegistryRow = typeof atlasTestRegistry.$inferSelect;
export type AtlasTestAliasRow = typeof atlasTestAliases.$inferSelect;
export type AtlasTestVersionRow = typeof atlasTestVersions.$inferSelect;
export type AtlasTestExecutionReceiptRow = typeof atlasTestExecutionReceipts.$inferSelect;
