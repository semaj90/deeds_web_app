/**
 * Warden Legal Evidence Schema
 * Immutable evidence chain-of-custody with approval workflow
 * Single prosecutor, Lucia v3 auth
 */

import { relations } from 'drizzle-orm';
import {
    boolean,
    index,
    integer,
    jsonb,
    pgTable,
    real,
    text,
    timestamp,
    uuid,
    varchar,
    vector,
} from 'drizzle-orm/pg-core';

// Users (Lucia v3)
export const wardenUsers = pgTable('warden_users', {
 id: uuid('id').primaryKey(),
 email: varchar('email', { length: 255 }).notNull().unique(),
 passwordHash: varchar('password_hash', { length: 255 }).notNull(),
 createdAt: timestamp('created_at').defaultNow(),
});

// Cases (auto-created per prosecutor)
export const wardenCases = pgTable('warden_cases', {
 id: uuid('id').primaryKey().defaultRandom(),
 prosecutorId: uuid('prosecutor_id')
 .notNull()
 .references(() => wardenUsers.id),
 title: varchar('title', { length: 512 }).default('Untitled Case'),
 description: text('description'),
 caseNumber: varchar('case_number', { length: 255 }),
 createdAt: timestamp('created_at').defaultNow(),
 updatedAt: timestamp('updated_at').defaultNow(),
});

// Evidence (immutable, SHA-256 locked)
export const wardenEvidence = pgTable(
    'warden_evidence',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        caseId: uuid('case_id')
            .notNull()
            .references(() => wardenCases.id),
        prosecutorId: uuid('prosecutor_id')
            .notNull()
            .references(() => wardenUsers.id),
        fileName: varchar('file_name', { length: 512 }).notNull(),
        sha256: varchar('sha256', { length: 64 }).notNull().unique(), // Chain-of-custody lock
        mimeType: varchar('mime_type', { length: 100 }),
        fileSize: integer('file_size'),
        minioPath: varchar('minio_path', { length: 512 }).notNull(), // warden-*/case_id/sha256
        minioBucket: varchar('minio_bucket', { length: 100 }).notNull(), // warden-evidence, warden-documents, etc
        documentType: varchar('document_type', { length: 100 }), // complaint, motion, evidence, statute
        documentSubtype: varchar('document_subtype', { length: 100 }), // filing, photo, video, etc
        inferenceConfidence: real('inference_confidence'), // 0.0-1.0 from AI classifier
        status: varchar('status', { length: 50 }).default('pending'), // pending, approved, rejected
        reviewedAt: timestamp('reviewed_at'),
        reviewedBy: uuid('reviewed_by').references(() => wardenUsers.id),
        rejectionReason: text('rejection_reason'),
        metadata: jsonb('metadata'), // OCR, page count, extracted text preview
        prevSha256: varchar('prev_sha256', { length: 64 }), // Version lineage
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => ({
        caseIdIdx: index('warden_evidence_case_id_idx').on(table.caseId),
        sha256Idx: index('warden_evidence_sha256_idx').on(table.sha256),
        statusIdx: index('warden_evidence_status_idx').on(table.status),
    })
);

// OCR Extraction (immutable, linked to evidence)
export const wardenOCR = pgTable('warden_ocr', {
 id: uuid('id').primaryKey().defaultRandom(),
 evidenceId: uuid('evidence_id')
 .notNull()
 .references(() => wardenEvidence.id),
 rawText: text('raw_text'),
 cleanedText: text('cleaned_text'),
 confidence: real('confidence'),
 pageCount: integer('page_count'),
 extractedAt: timestamp('extracted_at').defaultNow(),
});

// Chunks (512-token legal chunks for embeddings)
export const wardenChunks = pgTable(
    'warden_chunks',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        evidenceId: uuid('evidence_id')
            .notNull()
            .references(() => wardenEvidence.id),
        caseId: uuid('case_id')
            .notNull()
            .references(() => wardenCases.id),
        seq: integer('seq'),
        section: varchar('section', { length: 100 }), // PARTIES, JURISDICTION, FACTS, CLAIMS, PRAYER, HOLDING
        text: text('text').notNull(),
        tokenLength: integer('token_length'),
        embedding: vector('embedding', { dimensions: 768 }), // Gemma 768d
        latent128: vector('latent128', { dimensions: 128 }), // Autoencoder compressed
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => ({
        evidenceIdIdx: index('warden_chunks_evidence_id_idx').on(table.evidenceId),
        caseIdIdx: index('warden_chunks_case_id_idx').on(table.caseId),
    })
);

// Citations (statute and precedent references)
export const wardenCitations = pgTable(
    'warden_citations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        evidenceId: uuid('evidence_id')
            .notNull()
            .references(() => wardenEvidence.id),
        caseId: uuid('case_id')
            .notNull()
            .references(() => wardenCases.id),
        chunkId: uuid('chunk_id').references(() => wardenChunks.id),
        type: varchar('type', { length: 50 }), // statute, case, regulation, constitutional
        citationText: text('citation_text'), // e.g. "U.S. Const. art. VI"
        citationNormalized: varchar('citation_normalized', { length: 255 }), // Normalized key for KAG
        page: integer('page'),
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => ({
        evidenceIdIdx: index('warden_citations_evidence_id_idx').on(table.evidenceId),
        caseIdIdx: index('warden_citations_case_id_idx').on(table.caseId),
    })
);

// Holdings (extracted legal reasoning)
export const wardenHoldings = pgTable('warden_holdings', {
 id: uuid('id').primaryKey().defaultRandom(),
 caseId: uuid('case_id')
 .notNull()
 .references(() => wardenCases.id),
 evidenceId: uuid('evidence_id')
 .notNull()
 .references(() => wardenEvidence.id),
 chunkId: uuid('chunk_id').references(() => wardenChunks.id),
        issue: text('issue'), // "Is A.B. 32 preempted?"
        holding: text('holding').notNull(),
        reasoning: text('reasoning'),
        references: jsonb('references'), // statute/case IDs
        confidence: real('confidence'), // From reranker
        createdAt: timestamp('created_at').defaultNow(),
    }
);

// HMM Topic Labels (for taxonomy discovery)
export const wardenHMMTopics = pgTable('warden_hmm_topics', {
 id: uuid('id').primaryKey().defaultRandom(),
 chunkId: uuid('chunk_id')
 .notNull()
 .references(() => wardenChunks.id),
 topicLabel: varchar('topic_label', { length: 100 }), // facts, reasoning, holding, etc
 probability: real('probability'), // HMM confidence
 sequence: integer('sequence'), // Position in document
 createdAt: timestamp('created_at').defaultNow(),
});

// Chain-of-Custody Audit Log (immutable events)
export const wardenAuditLog = pgTable(
    'warden_audit_log',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        prosecutorId: uuid('prosecutor_id')
            .notNull()
            .references(() => wardenUsers.id),
        caseId: uuid('case_id').references(() => wardenCases.id),
        evidenceId: uuid('evidence_id').references(() => wardenEvidence.id),
        action: varchar('action', { length: 50 }).notNull(), // UPLOAD, CLASSIFY, APPROVE, REJECT, SEARCH, SUMMARIZE
        details: jsonb('details'), // Action-specific metadata
        sha256: varchar('sha256', { length: 64 }), // Evidence hash for immutability
        timestamp: timestamp('timestamp').defaultNow(),
    },
    (table) => ({
        prosecutorIdIdx: index('warden_audit_log_prosecutor_id_idx').on(table.prosecutorId),
        caseIdIdx: index('warden_audit_log_case_id_idx').on(table.caseId),
        actionIdx: index('warden_audit_log_action_idx').on(table.action),
    })
);

// Evidence Summaries (AI suggested + prosecutor approved)
export const wardenEvidenceSummaries = pgTable('warden_evidence_summaries', {
 id: uuid('id').primaryKey().defaultRandom(),
 evidenceId: uuid('evidence_id')
 .notNull()
 .references(() => wardenEvidence.id),
 holding: text('holding').notNull(),
 reasoning: text('reasoning'),
 citations: jsonb('citations'), // Array of citation objects
 keywords: text('keywords').array(),
 suggestedAt: timestamp('suggested_at').defaultNow(),
 approved: boolean('approved').default(false),
 approvedBy: uuid('approved_by').references(() => wardenUsers.id),
 approvedAt: timestamp('approved_at'),
 createdAt: timestamp('created_at').defaultNow(),
});

// Citation Graph (for Neo4j sync + authority scoring)
export const wardenCitationGraph = pgTable(
    'warden_citation_graph',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        caseId: varchar('case_id', { length: 128 }).notNull(),
        citedCaseId: varchar('cited_case_id', { length: 128 }).notNull(),
        weight: real('weight').default(1.0),
        source: varchar('source', { length: 64 }).default('ai'), // 'ai' or 'manual'
        approved: boolean('approved').default(false),
        approvedBy: uuid('approved_by').references(() => wardenUsers.id),
        approvedAt: timestamp('approved_at'),
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => ({
        caseIdIdx: index('warden_citation_graph_case_id_idx').on(table.caseId),
        citedCaseIdIdx: index('warden_citation_graph_cited_case_id_idx').on(table.citedCaseId),
    })
);

// File Lock (Redis-backed, prevents double-ingest)
export const wardenFileLocks = pgTable('warden_file_locks', {
 id: uuid('id').primaryKey().defaultRandom(),
 sha256: varchar('sha256', { length: 64 }).notNull().unique(),
 lockedAt: timestamp('locked_at').defaultNow(),
 expiresAt: timestamp('expires_at'), // TTL for lock
 lockedBy: uuid('locked_by')
 .notNull()
 .references(() => wardenUsers.id),
});

// Relations
export const wardenUsersRelations = relations(wardenUsers, ({ many }) => ({
 cases: many(wardenCases),
 evidence: many(wardenEvidence),
 auditLogs: many(wardenAuditLog),
}));

export const wardenCasesRelations = relations(wardenCases, ({ one, many }) => ({
 prosecutor: one(wardenUsers, {
 fields: [wardenCases.prosecutorId],
 references: [wardenUsers.id],
 }),
 evidence: many(wardenEvidence),
 chunks: many(wardenChunks),
 citations: many(wardenCitations),
 holdings: many(wardenHoldings),
 auditLogs: many(wardenAuditLog),
}));

export const wardenEvidenceRelations = relations(wardenEvidence, ({ one, many }) => ({
 case: one(wardenCases, {
 fields: [wardenEvidence.caseId],
 references: [wardenCases.id],
 }),
 prosecutor: one(wardenUsers, {
 fields: [wardenEvidence.prosecutorId],
 references: [wardenUsers.id],
 }),
 reviewer: one(wardenUsers, {
 fields: [wardenEvidence.reviewedBy],
 references: [wardenUsers.id],
 }),
 ocr: many(wardenOCR),
 chunks: many(wardenChunks),
 citations: many(wardenCitations),
 holdings: many(wardenHoldings),
 auditLogs: many(wardenAuditLog),
}));

export const wardenChunksRelations = relations(wardenChunks, ({ one, many }) => ({
 evidence: one(wardenEvidence, {
 fields: [wardenChunks.evidenceId],
 references: [wardenEvidence.id],
 }),
 case: one(wardenCases, {
 fields: [wardenChunks.caseId],
 references: [wardenCases.id],
 }),
 citations: many(wardenCitations),
 holdings: many(wardenHoldings),
 topics: many(wardenHMMTopics),
}));

export const wardenCitationsRelations = relations(wardenCitations, ({ one }) => ({
 evidence: one(wardenEvidence, {
 fields: [wardenCitations.evidenceId],
 references: [wardenEvidence.id],
 }),
 case: one(wardenCases, {
 fields: [wardenCitations.caseId],
 references: [wardenCases.id],
 }),
 chunk: one(wardenChunks, {
 fields: [wardenCitations.chunkId],
 references: [wardenChunks.id],
 }),
}));

export const wardenHoldingsRelations = relations(wardenHoldings, ({ one }) => ({
 case: one(wardenCases, {
 fields: [wardenHoldings.caseId],
 references: [wardenCases.id],
 }),
 evidence: one(wardenEvidence, {
 fields: [wardenHoldings.evidenceId],
 references: [wardenEvidence.id],
 }),
 chunk: one(wardenChunks, {
 fields: [wardenHoldings.chunkId],
 references: [wardenChunks.id],
 }),
}));

export const wardenHMMTopicsRelations = relations(wardenHMMTopics, ({ one }) => ({
 chunk: one(wardenChunks, {
 fields: [wardenHMMTopics.chunkId],
 references: [wardenChunks.id],
 }),
}));

export const wardenAuditLogRelations = relations(wardenAuditLog, ({ one }) => ({
 prosecutor: one(wardenUsers, {
 fields: [wardenAuditLog.prosecutorId],
 references: [wardenUsers.id],
 }),
 case: one(wardenCases, {
 fields: [wardenAuditLog.caseId],
 references: [wardenCases.id],
 }),
 evidence: one(wardenEvidence, {
 fields: [wardenAuditLog.evidenceId],
 references: [wardenEvidence.id],
 }),
}));

export const wardenEvidenceSummariesRelations = relations(wardenEvidenceSummaries, ({ one }) => ({
 evidence: one(wardenEvidence, {
 fields: [wardenEvidenceSummaries.evidenceId],
 references: [wardenEvidence.id],
 }),
 approver: one(wardenUsers, {
 fields: [wardenEvidenceSummaries.approvedBy],
 references: [wardenUsers.id],
 }),
}));

export const wardenCitationGraphRelations = relations(wardenCitationGraph, ({ one }) => ({
 approver: one(wardenUsers, {
 fields: [wardenCitationGraph.approvedBy],
 references: [wardenUsers.id],
 }),
}));


