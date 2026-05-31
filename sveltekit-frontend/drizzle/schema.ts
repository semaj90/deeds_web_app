import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
  real,
  boolean,
  text,
  foreignKey,
  numeric,
  integer,
  vector,
  unique,
  serial,
  bigint,
  bigserial,
  date,
  uniqueIndex,
  check,
  char,
  primaryKey,
  pgView,
  pgEnum,
  unknown,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const activityStatus = pgEnum('activity_status', [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
]);
export const caseLinkCategory = pgEnum('case_link_category', [
  'charged_under',
  'cited_authority',
  'defense_authority',
  'court_ruling',
  'related_regulation',
  'constitutional_basis',
  'sentencing_guideline',
  'glossary_concept',
]);
export const caseLinkType = pgEnum('case_link_type', [
  'CHARGED_UNDER',
  'CITED_IN',
  'RELATED_TO',
  'OVERRULED_BY',
  'AFFIRMED_BY',
]);
export const casePriority = pgEnum('case_priority', [
  'low',
  'medium',
  'high',
  'critical',
  'urgent',
]);
export const caseRiskLevel = pgEnum('case_risk_level', ['low', 'medium', 'high', 'critical']);
export const caseStatus = pgEnum('case_status', [
  'open',
  'active',
  'closed',
  'archived',
  'pending',
  'under_review',
  'in_progress',
  'pending_review',
]);
export const chatMessageRole = pgEnum('chat_message_role', ['user', 'assistant', 'system']);
export const citationType = pgEnum('citation_type', [
  'statutory',
  'constitutional',
  'regulatory',
  'judicial',
  'other',
]);
export const corpusType = pgEnum('corpus_type', [
  'constitution',
  'statute',
  'regulation',
  'bill',
  'case',
  'glossary',
  'treatise',
  'other',
]);
export const documentStatus = pgEnum('document_status', [
  'queued',
  'processing',
  'completed',
  'failed',
]);
export const documentType = pgEnum('document_type', [
  'pleading',
  'motion',
  'brief',
  'contract',
  'evidence',
  'correspondence',
  'court_order',
  'transcript',
  'affidavit',
  'other',
]);
export const errorKind = pgEnum('error_kind', ['runtime', 'api', 'other']);
export const errorSeverity = pgEnum('error_severity', ['info', 'warn', 'error', 'critical']);
export const evidenceType = pgEnum('evidence_type', [
  'document',
  'photo',
  'video',
  'audio',
  'physical',
  'digital',
  'witness_statement',
  'forensic',
  'documentary',
  'testimonial',
  'demonstrative',
  'real',
  'circumstantial',
  'hearsay',
  'expert',
  'scientific',
]);
export const legalNodeType = pgEnum('legal_node_type', [
  'document',
  'title',
  'article',
  'amendment',
  'chapter',
  'part',
  'section',
  'subsection',
  'paragraph',
  'clause',
  'definition',
  'appendix',
  'note',
]);
export const patchStatus = pgEnum('patch_status', ['suggested', 'applied', 'rejected']);
export const processingStatus = pgEnum('processing_status', [
  'queued',
  'extracting',
  'ocr',
  'structuring',
  'chunking',
  'embedding',
  'graphing',
  'complete',
  'failed',
]);
export const relationType = pgEnum('relation_type', [
  'supports',
  'contradicts',
  'same_person',
  'timeline',
  'chain_of_custody',
  'corroborates',
  'alibi',
  'motive',
  'opportunity',
  'means',
  'witness_statement',
  'physical_evidence',
  'digital_evidence',
  'circumstantial',
  'direct_evidence',
  'hearsay',
  'privileged',
  'inadmissible',
]);
export const reportStatus = pgEnum('report_status', ['draft', 'pending', 'completed', 'published']);
export const routeHealthState = pgEnum('route_health_state', ['healthy', 'degraded', 'unhealthy']);
export const sourceType = pgEnum('source_type', [
  'upload',
  'govinfo',
  'state_official',
  'openstates',
  'lii_reference',
]);
export const suggestionState = pgEnum('suggestion_state', [
  'pending',
  'applied',
  'dismissed',
  'snoozed',
]);
export const summaryType = pgEnum('summary_type', ['brief', 'detailed', 'executive', 'technical']);
export const threatLevel = pgEnum('threat_level', ['low', 'medium', 'high', 'critical']);
export const userRole = pgEnum('user_role', [
  'admin',
  'investigator',
  'analyst',
  'viewer',
  'user',
  'prosecutor',
  'detective',
  'paralegal',
]);
export const verificationStatus = pgEnum('verification_status', [
  'pending',
  'verified',
  'failed',
  'rejected',
]);

export const auditLog = pgTable('audit_log', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: integer('user_id').notNull(),
  action: varchar({ length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 255 }).notNull(),
  details: jsonb().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const autoTags = pgTable(
  'auto_tags',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    entityId: uuid('entity_id').notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    tag: varchar({ length: 100 }).notNull(),
    confidence: real().notNull(),
    source: varchar({ length: 100 }).notNull(),
    model: varchar({ length: 100 }),
    isConfirmed: boolean('is_confirmed').default(false).notNull(),
    confirmedBy: uuid('confirmed_by'),
    confirmedAt: timestamp('confirmed_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_autotags_entity').using(
      'btree',
      table.entityId.asc().nullsLast().op('text_ops'),
      table.entityType.asc().nullsLast().op('text_ops')
    ),
  ]
);

export const canvasAnnotations = pgTable('canvas_annotations', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  canvasStateId: uuid('canvas_state_id'),
  createdBy: integer('created_by'),
  annotationData: jsonb('annotation_data').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
});

export const canvasAutosaves = pgTable('canvas_autosaves', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  canvasStateId: uuid('canvas_state_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const canvasStates = pgTable('canvas_states', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  caseId: uuid('case_id'),
  userId: integer('user_id'),
  stateData: jsonb('state_data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

// NOTE: Only `user_id` columns were changed to integer where introspection indicated int4.
// Other UUID columns remain unchanged.

// (The rest of the file is intentionally unchanged beyond user_id replacements to minimize diffs.)
