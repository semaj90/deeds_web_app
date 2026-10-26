import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { atlasFeatureConcepts } from './atlas-feature-identity.js';

/**
 * Versioned feature label registry. Mirrors drizzle/manual/20261021_feature_identity_v2.sql.
 *
 * DRAFT: the SQL is not applied. This file is not exported from any schema index, so drizzle-kit
 * does not see it until the migration is approved and this file is wired in.
 *
 * - canonical_feature_id references the proposed atlas_feature_concepts owner.
 * - Rows are append-only revisions. The current approved label is the view atlas_feature_labels_current
 *   (latest REVIEWED-or-WITHDRAWN decision per canonical concept), not a column here.
 * - domain_class, capability and concept_id are three different vocabularies.
 * - label_status defaults to PROPOSED; REVIEWED requires reviewed_by and reviewed_at (CHECK in SQL).
 */
export const atlasFeatureLabels = pgTable(
  'atlas_feature_labels',
  {
    canonicalFeatureId: text('canonical_feature_id').notNull().references(() => atlasFeatureConcepts.canonicalFeatureId, { onDelete: 'restrict' }),
    labelRevision: integer('label_revision').notNull().default(1),
    featureLabel: text('feature_label').notNull(),
    communityId: integer('community_id'),
    domainClass: text('domain_class'),
    capability: text('capability'),
    conceptId: text('concept_id'),
    labelSource: text('label_source').notNull(),
    labelStatus: text('label_status').notNull().default('PROPOSED'),
    evidenceRefs: jsonb('evidence_refs').notNull().default(sql`'[]'::jsonb`),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.canonicalFeatureId, table.labelRevision], name: 'atlas_feature_labels_pk' }),
    check('atlas_feature_labels_revision_positive', sql`${table.labelRevision} >= 1`),
    check('atlas_feature_labels_label_nonblank', sql`btrim(${table.featureLabel}) <> ''`),
    check('atlas_feature_labels_status_valid', sql`${table.labelStatus} IN ('PROPOSED', 'REVIEWED', 'WITHDRAWN', 'SUPERSEDED')`),
    check('atlas_feature_labels_reviewed_consistent', sql`${table.labelStatus} NOT IN ('REVIEWED', 'WITHDRAWN') OR (${table.reviewedBy} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL)`),
    check('atlas_feature_labels_evidence_is_array', sql`jsonb_typeof(${table.evidenceRefs}) = 'array'`),
    index('atlas_feature_labels_current_idx').on(table.canonicalFeatureId, table.labelRevision.desc()).where(sql`${table.labelStatus} IN ('REVIEWED', 'WITHDRAWN')`),
  ]
);

export type AtlasFeatureLabel = typeof atlasFeatureLabels.$inferSelect;
export type NewAtlasFeatureLabel = typeof atlasFeatureLabels.$inferInsert;
