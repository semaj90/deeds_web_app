import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Canonical registry of installed library/package identities (npm + pip),
 * addressed as "npm:ts-morph@27.0.2" / "pip:torch@2.8.0+cu128".
 *
 * Tier 1 (name/version/exports/types) and Tier 2 (declaration file paths,
 * no content) are populated by the bulk scan. Tier 3/4 (implementation
 * content) are never stored here — resolved live from installationPath
 * on explicit request via fetch-tier-content.ts.
 */
export const libraryIdentities = pgTable(
  'library_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    address: text('address').notNull().unique(),
    packageManager: text('package_manager').notNull(),
    packageName: text('package_name').notNull(),
    packageVersion: text('package_version').notNull(),
    lockfileDigest: text('lockfile_digest'),
    packageJsonDigest: text('package_json_digest'),
    installationPath: text('installation_path').notNull(),
    sourceType: text('source_type').notNull(),
    workspaceRoot: text('workspace_root').notNull(),
    tier1: jsonb('tier1').$type<{
      exports?: unknown;
      types?: string;
      main?: string;
      description?: string;
    }>(),
    tier2Paths: jsonb('tier2_paths').$type<string[]>(),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    packageNameIdx: index('idx_library_identities_package_name').on(t.packageName),
    packageManagerIdx: index('idx_library_identities_package_manager').on(t.packageManager),
    sourceTypeIdx: index('idx_library_identities_source_type').on(t.sourceType),
  })
);

export type LibraryIdentityRow = typeof libraryIdentities.$inferSelect;
export type NewLibraryIdentityRow = typeof libraryIdentities.$inferInsert;
