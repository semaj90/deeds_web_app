// Phase 109A: Semantic Signal and Domain Routing Schema
// Canonical contracts for signal provenance, domain classification, and recommendation lifecycle
import { sql } from 'drizzle-orm';
import {
  uuid,
  text,
  timestamp,
  integer,
  real,
  varchar,
  boolean,
  pgTable,
  pgEnum,
  index,
  foreignKey,
  jsonb,
} from 'drizzle-orm/pg-core';

// ===== ENUMS =====

export const signalTypeEnum = pgEnum('signal_type', [
  'DOMAIN_CLASS',
  'INTENT_TAG',
  'RETRIEVAL_LANE',
  'GRAPH_FACT',
  'CLASSIFICATION',
  'RECOMMENDATION',
  'LEARNED_POS',
  'LEARNED_ENTITY',
  'AST_SYMBOL',
  'EVIDENCE_REFERENCE',
]);

export const classificationStatusEnum = pgEnum('classification_status', [
  'PENDING',
  'CLASSIFYING',
  'COMPLETE',
  'CONFLICT_DETECTED',
  'FAILED',
  'DEFERRED',
]);

export const recommendationStatusEnum = pgEnum('recommendation_status', [
  'PROPOSED',
  'EVIDENCE_GATHERING',
  'READY_FOR_REVIEW',
  'APPROVED',
  'IMPLEMENTED',
  'VALIDATED',
  'REJECTED',
  'SUPERSEDED',
]);

// ===== SIGNAL REGISTRY =====

export const semanticSignals = pgTable(
  'semantic_signals',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
    workspaceId: varchar('workspace_id', { length: 255 }).notNull(),
    revisionId: varchar('revision_id', { length: 255 }).notNull(), // Immutable; points to snapshot state

    // Identity
    subjectId: varchar('subject_id', { length: 255 }).notNull(), // packet_key or entity_id
    signalType: signalTypeEnum('signal_type').notNull(),

    // Provenance
    producer: varchar('producer', { length: 255 }).notNull(), // e.g., "domain_classifier_v1", "intent_analyzer"
    producerModelRevision: varchar('producer_model_revision', { length: 255 }), // If learned: model SHA-256
    producerSchemaVersion: varchar('producer_schema_version', { length: 255 }), // If deterministic: schema version

    // Evidence
    evidenceIds: text('evidence_ids').array().notNull().default(sql`'{}'`), // References: "postgres:packet:{id}", "ast_node:{id}"
    evidenceConfidence: real('evidence_confidence'), // 0.0–1.0, optional for learned signals

    // Metadata
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: varchar('created_by', { length: 255 }), // User ID or system component

    // Soft-delete safeguard
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: varchar('deleted_by', { length: 255 }),
  },
  (table) => ({
    idxWorkspaceRevision: index('idx_semantic_signals_workspace_revision').on(
      table.workspaceId,
      table.revisionId
    ),
    idxSubjectSignalType: index('idx_semantic_signals_subject_type').on(
      table.subjectId,
      table.signalType
    ),
    idxProducerType: index('idx_semantic_signals_producer').on(table.producer),
    idxEvidenceIds: index('idx_semantic_signals_evidence_ids').using(
      'gin',
      table.evidenceIds
    ),
  })
);

// ===== DOMAIN TAXONOMY =====

export const domainTaxonomy = pgTable(
  'domain_taxonomy_v1',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
    label: varchar('label', { length: 255 }).notNull(), // e.g., "retrieval", "auth", "api_routes"
    domainId: varchar('domain_id', { length: 255 }).notNull(), // Unique identifier
    version: integer('version').notNull().default(1),
    active: boolean('is_active').notNull().default(true),
    description: text('description'),
    parentDomainId: varchar('parent_domain_id', { length: 255 }), // For hierarchy

    // Deprecation tracking
    deprecatedAt: timestamp('deprecated_at', { withTimezone: true }),
    deprecationReason: text('deprecation_reason'),
    replacedBy: varchar('replaced_by', { length: 255 }), // New label if deprecated

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxDomainId: index('idx_domain_taxonomy_domain_id').on(table.domainId),
    idxActive: index('idx_domain_taxonomy_active').on(table.active),
    idxLabel: index('idx_domain_taxonomy_label').on(table.label),
    uqDomainLabel: index('uq_domain_taxonomy_label_version').on(table.label, table.version),
  })
);

// ===== CLASSIFICATION ENVELOPE =====

export const classificationEnvelope = pgTable(
  'classification_envelope',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
    signalId: uuid('signal_id').notNull(), // FK to semantic_signals
    subjectId: varchar('subject_id', { length: 255 }).notNull(), // Denormalized for query speed
    workspaceId: varchar('workspace_id', { length: 255 }).notNull(),

    // Classification state
    status: classificationStatusEnum('status').notNull().default('PENDING'),
    version: integer('version').notNull().default(1),

    // Classification payload
    domainLabels: jsonb('domain_labels'), // Array of { label, confidence, source }
    conflictFlag: boolean('conflict_flag').notNull().default(false), // AST vs learned disagreement
    conflictDetails: jsonb('conflict_details'), // { ast_fact, learned_value, confidence }

    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: varchar('created_by', { length: 255 }),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    validatedBy: varchar('validated_by', { length: 255 }),
    failureReason: text('failure_reason'),

    // Soft-delete safeguard
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: varchar('deleted_by', { length: 255 }),
  },
  (table) => ({
    idxSignalStatus: index('idx_classification_envelope_signal_status').on(table.signalId, table.status),
    idxSubjectWorkspace: index('idx_classification_envelope_subject_workspace').on(
      table.subjectId,
      table.workspaceId
    ),
    idxConflictFlag: index('idx_classification_envelope_conflict').on(table.conflictFlag),
    fkSignalId: foreignKey({
      columns: [table.signalId],
      foreignColumns: [semanticSignals.id],
      name: 'fk_classification_envelope_signal_id',
    }).onDelete('cascade'),
  })
);

// ===== RECOMMENDATION LOG =====

export const recommendationLog = pgTable(
  'recommendation_log',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
    workspaceId: varchar('workspace_id', { length: 255 }).notNull(),
    revisionId: varchar('revision_id', { length: 255 }).notNull(),

    // Identity
    subjectId: varchar('subject_id', { length: 255 }).notNull(), // What to change (packet_id, label_id)

    // Recommendation
    proposedAction: text('proposed_action').notNull(), // Human-readable action
    inferenceExplanation: text('inference_explanation').notNull(), // Why the agent recommends this

    // Evidence
    evidenceIds: text('evidence_ids').array().notNull().default(sql`'{}'`), // Postgres/Qdrant/Neo4j references
    evidenceConfidence: real('evidence_confidence').notNull().default(0.5), // 0.0–1.0 aggregate

    // Validation
    validationCriteria: text('validation_criteria').notNull(), // How to verify success
    expectedImpact: text('expected_impact').notNull(), // Predicted outcome

    // Safety
    rollbackPlan: text('rollback_plan').notNull(), // How to undo if validation fails
    rollbackVerification: text('rollback_verification').notNull(), // How to prove rollback succeeded

    // Lifecycle
    status: recommendationStatusEnum('status').notNull().default('PROPOSED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: varchar('created_by', { length: 255 }).notNull(),

    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: varchar('approved_by', { length: 255 }), // User or system approver

    implementedAt: timestamp('implemented_at', { withTimezone: true }),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    validationError: text('validation_error'), // If REJECTED, why?

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    // Soft-delete safeguard
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: varchar('deleted_by', { length: 255 }),
  },
  (table) => ({
    idxSubjectWorkspace: index('idx_recommendation_log_subject_workspace').on(
      table.subjectId,
      table.workspaceId
    ),
    idxStatus: index('idx_recommendation_log_status').on(table.status),
    idxEvidenceIds: index('idx_recommendation_log_evidence').using('gin', table.evidenceIds),
    idxCreatedBy: index('idx_recommendation_log_created_by').on(table.createdBy),
  })
);

// ===== TYPES =====

export type SemanticSignal = typeof semanticSignals.$inferSelect;
export type NewSemanticSignal = typeof semanticSignals.$inferInsert;

export type DomainTaxonomy = typeof domainTaxonomy.$inferSelect;
export type NewDomainTaxonomy = typeof domainTaxonomy.$inferInsert;

export type ClassificationEnvelope = typeof classificationEnvelope.$inferSelect;
export type NewClassificationEnvelope = typeof classificationEnvelope.$inferInsert;

export type RecommendationLog = typeof recommendationLog.$inferSelect;
export type NewRecommendationLog = typeof recommendationLog.$inferInsert;
