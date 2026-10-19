import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const atlasProceduralSequences = pgTable('atlas_procedural_sequences_v1', {
  sequenceId: text('sequence_id').notNull(),
  sequenceRevision: text('sequence_revision').notNull(),
  featureId: text('feature_id').notNull(),
  featureLabel: text('feature_label').notNull(),
  sequenceKind: text('sequence_kind').notNull(),
  admissionStatus: text('admission_status').notNull().default('PROPOSED'),
  sourceRef: text('source_ref').notNull(),
  sourceRevision: text('source_revision'),
  workspaceRevision: text('workspace_revision'),
  evidenceRefs: text('evidence_refs').array().notNull().default(sql`'{}'::text[]`),
  steps: jsonb('steps').$type<readonly Record<string, unknown>[]>().notNull(),
  sequenceChecksum: text('sequence_checksum').notNull(),
  canonicalAuthority: boolean('canonical_authority').notNull().default(false),
  executionAllowed: boolean('execution_allowed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.sequenceId, table.sequenceRevision], name: 'atlas_procedural_sequences_v1_pkey' }),
  identityCheck: check('atlas_procedural_sequences_v1_identity_check', sql`${table.sequenceId} <> '' AND ${table.sequenceRevision} <> ''`),
  requiredTextCheck: check(
    'atlas_procedural_sequences_v1_required_text_check',
    sql`length(btrim(${table.featureId})) > 0 AND length(btrim(${table.featureLabel})) > 0 AND length(btrim(${table.sequenceKind})) > 0 AND length(btrim(${table.sourceRef})) > 0`,
  ),
  statusCheck: check(
    'atlas_procedural_sequences_v1_status_check',
    sql`${table.admissionStatus} IN ('PROPOSED', 'REVIEWED', 'ADMITTED', 'REJECTED', 'RETIRED')`,
  ),
  admittedEvidenceCheck: check(
    'atlas_procedural_sequences_v1_admitted_evidence_check',
    sql`${table.admissionStatus} <> 'ADMITTED' OR (${table.sourceRevision} IS NOT NULL AND ${table.workspaceRevision} IS NOT NULL AND cardinality(${table.evidenceRefs}) > 0)`,
  ),
  stepsArrayCheck: check(
    'atlas_procedural_sequences_v1_steps_array_check',
    sql`jsonb_typeof(${table.steps}) = 'array'`,
  ),
  checksumCheck: check(
    'atlas_procedural_sequences_v1_checksum_check',
    sql`${table.sequenceChecksum} ~ '^sha256:[0-9a-f]{64}$'`,
  ),
  notExecutableCheck: check(
    'atlas_procedural_sequences_v1_non_executable_check',
    sql`${table.canonicalAuthority} = false AND ${table.executionAllowed} = false`,
  ),
  featureAdmissionIdx: index('atlas_procedural_sequences_v1_feature_admission_idx')
    .on(table.featureId, table.admissionStatus, table.sequenceId),
  labelAdmissionIdx: index('atlas_procedural_sequences_v1_label_admission_idx')
    .on(sql`lower(${table.featureLabel})`, table.admissionStatus, table.sequenceId),
}));

export type AtlasProceduralSequence = typeof atlasProceduralSequences.$inferSelect;
export type NewAtlasProceduralSequence = typeof atlasProceduralSequences.$inferInsert;
