import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, foreignKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Feature identity V2. Mirrors drizzle/manual/20261021_feature_identity_v2.sql, which is NOT applied.
 * Not exported from a schema index yet, so drizzle-kit does not see it until approved.
 *
 * atlasFeatureConcepts: canonical concept identity (minted only by approval).
 * atlasFeatureSourceIdentities: namespace-qualified source-local identity (no revision in the key).
 * atlasFeatureConceptCrosswalk: reviewed, revisioned source identity -> concept mapping with evidence.
 * atlas_features and atlas_fi_features are different tables and are not referenced here.
 */
export const atlasFeatureConcepts = pgTable('atlas_feature_concepts', {
  canonicalFeatureId: text('canonical_feature_id').primaryKey(),
  conceptStatus: text('concept_status').notNull().default('PROPOSED'),
  mintedBy: text('minted_by'),
  mintedAt: timestamp('minted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('atlas_feature_concepts_id_nonblank', sql`btrim(${table.canonicalFeatureId}) <> ''`),
  check('atlas_feature_concepts_status_valid', sql`${table.conceptStatus} IN ('PROPOSED', 'APPROVED', 'RETIRED')`),
  check('atlas_feature_concepts_approved_consistent', sql`${table.conceptStatus} <> 'APPROVED' OR (${table.mintedBy} IS NOT NULL AND ${table.mintedAt} IS NOT NULL)`),
]);

export const atlasFeatureSourceIdentities = pgTable(
  'atlas_feature_source_identities',
  {
    sourceNamespace: text('source_namespace').notNull(),
    localFeatureId: text('local_feature_id').notNull(),
    identityStatus: text('identity_status').notNull().default('OBSERVED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceNamespace, table.localFeatureId], name: 'atlas_feature_source_identities_pk' }),
    check('atlas_feature_source_identities_nonblank', sql`btrim(${table.sourceNamespace}) <> '' AND btrim(${table.localFeatureId}) <> ''`),
    check('atlas_feature_source_identities_status_valid', sql`${table.identityStatus} IN ('OBSERVED', 'UNRESOLVED_LEGACY')`),
  ]
);

export const atlasFeatureConceptCrosswalk = pgTable(
  'atlas_feature_concept_crosswalk',
  {
    sourceNamespace: text('source_namespace').notNull(),
    localFeatureId: text('local_feature_id').notNull(),
    crosswalkRevision: integer('crosswalk_revision').notNull().default(1),
    canonicalFeatureId: text('canonical_feature_id'),
    crosswalkStatus: text('crosswalk_status').notNull().default('PROPOSED'),
    evidenceRefs: jsonb('evidence_refs').notNull().default(sql`'[]'::jsonb`),
    sourceRef: text('source_ref'),
    sourceRevision: text('source_revision'),
    workspaceRevision: text('workspace_revision'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceNamespace, table.localFeatureId, table.crosswalkRevision], name: 'atlas_feature_concept_crosswalk_pk' }),
    foreignKey({ columns: [table.sourceNamespace, table.localFeatureId], foreignColumns: [atlasFeatureSourceIdentities.sourceNamespace, atlasFeatureSourceIdentities.localFeatureId], name: 'atlas_feature_concept_crosswalk_identity_fk' }).onDelete('restrict'),
    foreignKey({ columns: [table.canonicalFeatureId], foreignColumns: [atlasFeatureConcepts.canonicalFeatureId], name: 'atlas_feature_concept_crosswalk_target_fk' }).onDelete('restrict'),
    index('atlas_feature_concept_crosswalk_target_idx').on(table.canonicalFeatureId),
    index('atlas_feature_concept_crosswalk_current_idx').on(table.sourceNamespace, table.localFeatureId, table.crosswalkRevision.desc()).where(sql`${table.crosswalkStatus} IN ('REVIEWED', 'WITHDRAWN')`),
    check('atlas_feature_concept_crosswalk_revision_positive', sql`${table.crosswalkRevision} >= 1`),
    check('atlas_feature_concept_crosswalk_status_valid', sql`${table.crosswalkStatus} IN ('PROPOSED', 'REVIEWED', 'WITHDRAWN', 'SUPERSEDED')`),
    check('atlas_feature_concept_crosswalk_target_required', sql`${table.crosswalkStatus} <> 'REVIEWED' OR ${table.canonicalFeatureId} IS NOT NULL`),
    check('atlas_feature_concept_crosswalk_reviewed_consistent', sql`${table.crosswalkStatus} NOT IN ('REVIEWED', 'WITHDRAWN') OR (${table.reviewedBy} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL)`),
    check('atlas_feature_concept_crosswalk_evidence_is_array', sql`jsonb_typeof(${table.evidenceRefs}) = 'array'`),
    check('atlas_feature_concept_crosswalk_source_qualified', sql`${table.crosswalkStatus} = 'PROPOSED' OR (${table.sourceRef} IS NOT NULL AND ${table.sourceRevision} IS NOT NULL)`),
  ]
);
