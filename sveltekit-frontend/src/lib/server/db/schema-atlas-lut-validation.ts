import { sql } from 'drizzle-orm';
import { check, customType, index, jsonb, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

export const atlasPacketClassLutValidationReceipts = pgTable(
  'atlas_packet_class_lut_validation_receipts',
  {
    receiptId: uuid('receipt_id').primaryKey().defaultRandom(),
    schemaName: text('schema_name').notNull(),
    lutKind: text('lut_kind').notNull(),
    encodingRevision: text('encoding_revision').notNull(),
    sourceLabelSetChecksum: text('source_label_set_checksum').notNull(),
    validatorRevision: text('validator_revision').notNull(),
    workspaceRevision: text('workspace_revision'),
    sourceRevision: text('source_revision'),
    sourceRef: text('source_ref'),
    inputChecksum: text('input_checksum').notNull(),
    outcome: text('outcome').notNull(),
    entryCount: smallint('entry_count').notNull(),
    analysisText: text('analysis_text').notNull().default(''),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
    searchDocument: tsvector('search_document').generatedAlwaysAs(sql`setweight(to_tsvector('simple'::regconfig, coalesce(lut_kind, '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce(analysis_text, '')), 'B') || setweight(to_tsvector('simple'::regconfig, coalesce(source_ref, '')), 'C')`),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('atlas_packet_class_lut_validation_schema_ck', sql`${table.schemaName} = 'atlas.packet-class-lut.v1'`),
    check('atlas_packet_class_lut_validation_encoding_revision_ck', sql`${table.encodingRevision} ~ '^sha256:[a-f0-9]{64}$'`),
    check('atlas_packet_class_lut_validation_label_checksum_ck', sql`${table.sourceLabelSetChecksum} ~ '^sha256:[a-f0-9]{64}$'`),
    check('atlas_packet_class_lut_validation_input_checksum_ck', sql`${table.inputChecksum} ~ '^[a-f0-9]{64}$'`),
    check('atlas_packet_class_lut_validation_outcome_ck', sql`${table.outcome} IN ('PASS', 'REJECT', 'ERROR')`),
    check('atlas_packet_class_lut_validation_entry_count_ck', sql`${table.entryCount} BETWEEN 1 AND 256`),
    index('atlas_packet_class_lut_validation_revision_idx').on(
      table.workspaceRevision,
      table.sourceRevision,
      table.encodingRevision,
      table.validatorRevision,
      table.recordedAt,
    ),
    index('atlas_packet_class_lut_validation_outcome_idx').on(table.outcome, table.recordedAt),
    index('atlas_packet_class_lut_validation_search_gin').using('gin', table.searchDocument),
    index('atlas_packet_class_lut_validation_evidence_gin').using('gin', table.evidence),
  ],
);
