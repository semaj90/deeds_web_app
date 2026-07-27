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

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3 Step 7: Evidence Ledger Tables
// ═══════════════════════════════════════════════════════════════════════════
// Immutable proof matrix for evidence observation ledgers.

export const observationTypeEnum = pgEnum('observation_type_enum', [
  'semantic_embedding',
  'lexical_bm25',
  'structural_ast',
  'domain_membership',
  'identity_resolution',
  'embedding_vector',
  'bm25_ranking',
  'ast_distance',
]);

export const evidenceLaneEnum = pgEnum('evidence_lane_enum', [
  'semantic_embedding_qdrant',
  'lexical_bm25_search',
  'structural_ast_distance',
  'domain_membership',
  'identity_resolution',
]);

export const observationSourceEnum = pgEnum('observation_source_enum', [
  'qdrant_dense_index',
  'postgres_fts',
  'tree_sitter_heuristic',
  'postgres_classification',
  'postgres_canonical',
]);

export const atlasEvidenceObservations = pgTable(
  'atlas_evidence_observations',
  {
    observationId: varchar('observation_id', { length: 100 }).primaryKey().notNull(),
    packetKey: varchar('packet_key', { length: 100 }).notNull(),
    observationType: observationTypeEnum('observation_type').notNull(),
    evidenceLane: evidenceLaneEnum('evidence_lane').notNull(),
    value: jsonb().notNull(),
    confidence: numeric({ precision: 3, scale: 2 }).notNull(),
    source: observationSourceEnum().notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true, mode: 'string' }).notNull(),
    metadata: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.packetKey],
      foreignColumns: [atlasPackets.packetKey],
      name: 'fk_evidence_observations_packet',
    }).onDelete('restrict'),
    index('idx_evidence_observations_packet_type').on(table.packetKey, table.observationType),
    index('idx_evidence_observations_lane').on(table.evidenceLane),
    index('idx_evidence_observations_observed_at').on(table.observedAt.desc()),
  ]
);

export const observationRelationshipTypeEnum = pgEnum('observation_relationship_type_enum', [
  'corroborates',
  'contradicts',
  'refines',
  'supersedes',
]);

export const atlasObservationRelationships = pgTable(
  'atlas_observation_relationships',
  {
    id: serial().primaryKey().notNull(),
    sourceObsId: varchar('source_obs_id', { length: 100 }).notNull(),
    targetObsId: varchar('target_obs_id', { length: 100 }).notNull(),
    relationshipType: observationRelationshipTypeEnum('relationship_type').notNull(),
    confidence: numeric({ precision: 3, scale: 2 }),
    evidenceText: text('evidence_text'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sourceObsId],
      foreignColumns: [atlasEvidenceObservations.observationId],
      name: 'fk_obs_rel_source',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.targetObsId],
      foreignColumns: [atlasEvidenceObservations.observationId],
      name: 'fk_obs_rel_target',
    }).onDelete('cascade'),
    index('idx_observation_relationships_type').on(table.relationshipType),
    index('idx_observation_relationships_created_at').on(table.createdAt.desc()),
  ]
);

export const domainMembershipSourceEnum = pgEnum('domain_membership_source_enum', [
  'feature_extraction',
  'manual',
  'classification',
  'agent_labeled',
]);

export const atlasPacketDomainMemberships = pgTable(
  'atlas_packet_domain_memberships',
  {
    id: serial().primaryKey().notNull(),
    packetKey: varchar('packet_key', { length: 100 }).notNull(),
    domainClass: varchar('domain_class', { length: 100 }).notNull(),
    probability: numeric({ precision: 3, scale: 2 }).notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true, mode: 'string' }).notNull(),
    source: domainMembershipSourceEnum().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.packetKey],
      foreignColumns: [atlasPackets.packetKey],
      name: 'fk_packet_domains_packet',
    }).onDelete('cascade'),
    index('idx_packet_domains_domain_class').on(table.domainClass),
    index('idx_packet_domains_probability_desc').on(table.probability.desc()),
    index('idx_packet_domains_observed_at').on(table.observedAt.desc()),
    unique('uq_packet_domain_observed').on(table.packetKey, table.domainClass, table.observedAt),
  ]
);

export const mutationTypeEnum = pgEnum('mutation_type_enum', [
  'domain_membership_update',
  'feature_id_correction',
  'source_ref_normalization',
  'ontology_version_update',
  'tree_node_id_assignment',
  'identity_merge',
]);

export const mutationStatusEnum = pgEnum('mutation_status_enum', [
  'proposed',
  'under_review',
  'approved',
  'applied',
  'rejected',
]);

export const atlasMutationProposals = pgTable(
  'atlas_mutation_proposals',
  {
    proposalId: varchar('proposal_id', { length: 100 }).primaryKey().notNull(),
    packetKey: varchar('packet_key', { length: 100 }).notNull(),
    mutationType: mutationTypeEnum('mutation_type').notNull(),
    changes: jsonb().notNull(),
    justification: text().notNull(),
    observationsSupporting: varchar('observations_supporting', { length: 100 }).array().notNull(),
    status: mutationStatusEnum().default('proposed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    createdBy: varchar('created_by', { length: 100 }),
    appliedAt: timestamp('applied_at', { withTimezone: true, mode: 'string' }),
    appliedBy: varchar('applied_by', { length: 100 }),
    metadata: jsonb(),
  },
  (table) => [
    foreignKey({
      columns: [table.packetKey],
      foreignColumns: [atlasPackets.packetKey],
      name: 'fk_mutations_packet',
    }).onDelete('restrict'),
    index('idx_mutations_packet_status').on(table.packetKey, table.status),
    index('idx_mutations_created_at_desc').on(table.createdAt.desc()),
    index('idx_mutations_status').on(table.status),
  ]
);

export const humanFeedbackTypeEnum = pgEnum('human_feedback_type_enum', [
  'domain_correction',
  'feature_label_fix',
  'identity_fix',
  'observation_quality',
  'general_note',
]);

export const atlasHumanFeedback = pgTable(
  'atlas_human_feedback',
  {
    id: serial().primaryKey().notNull(),
    packetKey: varchar('packet_key', { length: 100 }).notNull(),
    feedbackType: humanFeedbackTypeEnum('feedback_type').notNull(),
    feedbackText: text('feedback_text').notNull(),
    reviewerId: varchar('reviewer_id', { length: 100 }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    approved: boolean().default(false).notNull(),
    correspondingProposalId: varchar('corresponding_proposal_id', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.packetKey],
      foreignColumns: [atlasPackets.packetKey],
      name: 'fk_feedback_packet',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.correspondingProposalId],
      foreignColumns: [atlasMutationProposals.proposalId],
      name: 'fk_feedback_proposal',
    }).onDelete('setNull'),
    index('idx_human_feedback_type').on(table.feedbackType),
    index('idx_human_feedback_approved_created').on(table.approved, table.createdAt.desc()),
    index('idx_human_feedback_packet').on(table.packetKey),
  ]
);
