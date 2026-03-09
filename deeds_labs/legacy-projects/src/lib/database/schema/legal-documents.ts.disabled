import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, vector, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * PostgreSQL + pgvector schema for Legal AI System
 * Optimized for document analysis, case management, and vector search
 */

// Legal Documents table with pgvector support
export const legalDocuments = pgTable('legal_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  documentType: text('document_type').notNull().$type<'contract' | 'motion' | 'evidence' | 'correspondence' | 'brief' | 'regulation' | 'case_law'>(),
  jurisdiction: text('jurisdiction').notNull().default('federal'),
  practiceArea: text('practice_area').$type<'corporate' | 'litigation' | 'intellectual_property' | 'employment' | 'real_estate' | 'criminal' | 'family' | 'tax' | 'immigration' | 'environmental'>(),
  
  // Metadata
  fileHash: text('file_hash').unique(),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  
  // Vector embeddings (384-dimensional for nomic-embed-text)
  contentEmbedding: vector('content_embedding', { dimensions: 384 }),
  titleEmbedding: vector('title_embedding', { dimensions: 384 }),
  
  // Document analysis results
  analysisResults: jsonb('analysis_results').$type<{
    entities: { type: string; value: string; confidence: number }[];
    keyTerms: string[];
    sentimentScore: number;
    complexityScore: number;
    confidenceLevel: number;
    extractedDates: string[];
    extractedAmounts: string[];
    parties: string[];
    obligations: string[];
    risks: { type: string; severity: 'low' | 'medium' | 'high'; description: string }[];
  }>(),
  
  // Legal classification
  legalCategories: text('legal_categories').array(),
  citations: jsonb('citations').$type<{
    caseNumber?: string;
    courtName?: string;
    decisionDate?: string;
    judges?: string[];
    precedentLevel: 'binding' | 'persuasive' | 'informational';
  }[]>(),
  
  // Status tracking
  processingStatus: text('processing_status').notNull().default('pending').$type<'pending' | 'processing' | 'completed' | 'error'>(),
  isConfidential: boolean('is_confidential').notNull().default(false),
  retentionDate: timestamp('retention_date'),
  
  // Audit trail
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  lastModifiedBy: uuid('last_modified_by'),
}, (table) => ({
  // Indexes for performance
  documentTypeIdx: index('legal_documents_document_type_idx').on(table.documentType),
  jurisdictionIdx: index('legal_documents_jurisdiction_idx').on(table.jurisdiction),
  practiceAreaIdx: index('legal_documents_practice_area_idx').on(table.practiceArea),
  statusIdx: index('legal_documents_status_idx').on(table.processingStatus),
  createdAtIdx: index('legal_documents_created_at_idx').on(table.createdAt),
  confidentialIdx: index('legal_documents_confidential_idx').on(table.isConfidential),
  
  // Vector similarity search indexes
  contentEmbeddingIdx: index('legal_documents_content_embedding_idx').using('ivfflat', table.contentEmbedding),
  titleEmbeddingIdx: index('legal_documents_title_embedding_idx').using('ivfflat', table.titleEmbedding),
  
  // Unique constraints
  fileHashUnique: uniqueIndex('legal_documents_file_hash_unique').on(table.fileHash),
}));

// Cases table for case management
export const legalCases = pgTable('legal_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseNumber: text('case_number').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  
  // Case details
  clientName: text('client_name').notNull(),
  opposingParty: text('opposing_party'),
  jurisdiction: text('jurisdiction').notNull(),
  courtName: text('court_name'),
  judgeAssigned: text('judge_assigned'),
  
  // Case classification
  caseType: text('case_type').notNull().$type<'civil' | 'criminal' | 'administrative' | 'appellate' | 'arbitration'>(),
  practiceArea: text('practice_area').notNull(),
  priority: text('priority').notNull().default('medium').$type<'low' | 'medium' | 'high' | 'critical'>(),
  
  // Status and dates
  status: text('status').notNull().default('active').$type<'active' | 'pending' | 'closed' | 'archived' | 'on_hold'>(),
  filingDate: timestamp('filing_date'),
  trialDate: timestamp('trial_date'),
  closeDate: timestamp('close_date'),
  
  // Financial tracking
  estimatedValue: integer('estimated_value'),
  actualValue: integer('actual_value'),
  billingRate: integer('billing_rate'),
  totalBilled: integer('total_billed').default(0),
  
  // Case summary and strategy
  caseSummary: text('case_summary'),
  legalStrategy: text('legal_strategy'),
  keyIssues: text('key_issues').array(),
  precedents: jsonb('precedents').$type<{
    caseNumber: string;
    citation: string;
    relevance: 'high' | 'medium' | 'low';
    summary: string;
  }[]>(),
  
  // Audit trail
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
  assignedAttorney: uuid('assigned_attorney'),
}, (table) => ({
  caseNumberIdx: index('legal_cases_case_number_idx').on(table.caseNumber),
  clientNameIdx: index('legal_cases_client_name_idx').on(table.clientName),
  statusIdx: index('legal_cases_status_idx').on(table.status),
  practiceAreaIdx: index('legal_cases_practice_area_idx').on(table.practiceArea),
  priorityIdx: index('legal_cases_priority_idx').on(table.priority),
  attorneyIdx: index('legal_cases_attorney_idx').on(table.assignedAttorney),
}));

// Document-Case relationships
export const caseDocuments = pgTable('case_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => legalCases.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').notNull().references(() => legalDocuments.id, { onDelete: 'cascade' }),
  relationship: text('relationship').notNull().$type<'evidence' | 'pleading' | 'motion' | 'contract' | 'correspondence' | 'research' | 'exhibit'>(),
  importance: text('importance').notNull().default('medium').$type<'low' | 'medium' | 'high' | 'critical'>(),
  notes: text('notes'),
  addedAt: timestamp('added_at').notNull().defaultNow(),
  addedBy: uuid('added_by').notNull(),
}, (table) => ({
  caseIdIdx: index('case_documents_case_id_idx').on(table.caseId),
  documentIdIdx: index('case_documents_document_id_idx').on(table.documentId),
  relationshipIdx: index('case_documents_relationship_idx').on(table.relationship),
  importanceIdx: index('case_documents_importance_idx').on(table.importance),
  
  // Unique constraint to prevent duplicate document-case relationships
  uniqueCaseDocument: uniqueIndex('case_documents_unique').on(table.caseId, table.documentId),
}));

// Legal entities (people, organizations, etc.)
export const legalEntities = pgTable('legal_entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  entityType: text('entity_type').notNull().$type<'person' | 'corporation' | 'partnership' | 'llc' | 'government' | 'nonprofit' | 'trust' | 'estate'>(),
  
  // Contact information
  primaryEmail: text('primary_email'),
  primaryPhone: text('primary_phone'),
  address: jsonb('address').$type<{
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  }>(),
  
  // Legal details
  jurisdiction: text('jurisdiction'),
  taxId: text('tax_id'),
  incorporationDate: timestamp('incorporation_date'),
  
  // Relationships
  parentEntity: uuid('parent_entity').references(() => legalEntities.id),
  aliases: text('aliases').array(),
  
  // Vector embedding for entity matching
  nameEmbedding: vector('name_embedding', { dimensions: 384 }),
  
  // Status
  isActive: boolean('is_active').notNull().default(true),
  
  // Audit trail
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: index('legal_entities_name_idx').on(table.name),
  entityTypeIdx: index('legal_entities_type_idx').on(table.entityType),
  jurisdictionIdx: index('legal_entities_jurisdiction_idx').on(table.jurisdiction),
  emailIdx: index('legal_entities_email_idx').on(table.primaryEmail),
  activeIdx: index('legal_entities_active_idx').on(table.isActive),
  
  // Vector similarity index
  nameEmbeddingIdx: index('legal_entities_name_embedding_idx').using('ivfflat', table.nameEmbedding),
}));

// Agent analysis results cache
export const agentAnalysisCache = pgTable('agent_analysis_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  cacheKey: text('cache_key').notNull().unique(),
  documentId: uuid('document_id').references(() => legalDocuments.id),
  caseId: uuid('case_id').references(() => legalCases.id),
  
  // Analysis metadata
  agentName: text('agent_name').notNull(),
  analysisType: text('analysis_type').notNull().$type<'document_analysis' | 'contract_review' | 'risk_assessment' | 'precedent_search' | 'compliance_check'>(),
  prompt: text('prompt').notNull(),
  
  // Results
  response: text('response').notNull(),
  confidence: integer('confidence').notNull(), // 1-10 scale
  processingTime: integer('processing_time'), // milliseconds
  tokenUsage: jsonb('token_usage').$type<{
    prompt: number;
    completion: number;
    total: number;
  }>(),
  
  // Cache management
  expiresAt: timestamp('expires_at').notNull(),
  accessCount: integer('access_count').notNull().default(0),
  lastAccessed: timestamp('last_accessed').notNull().defaultNow(),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  cacheKeyIdx: index('agent_analysis_cache_key_idx').on(table.cacheKey),
  documentIdIdx: index('agent_analysis_cache_document_idx').on(table.documentId),
  caseIdIdx: index('agent_analysis_cache_case_idx').on(table.caseId),
  agentNameIdx: index('agent_analysis_cache_agent_idx').on(table.agentName),
  analysisTypeIdx: index('agent_analysis_cache_type_idx').on(table.analysisType),
  expiresAtIdx: index('agent_analysis_cache_expires_idx').on(table.expiresAt),
}));

// Zod schemas for validation
export const insertLegalDocumentSchema = createInsertSchema(legalDocuments, {
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  documentType: z.enum(['contract', 'motion', 'evidence', 'correspondence', 'brief', 'regulation', 'case_law']),
  jurisdiction: z.string().min(1).max(100),
  fileSize: z.number().positive().optional(),
});

export const selectLegalDocumentSchema = createSelectSchema(legalDocuments);

export const insertLegalCaseSchema = createInsertSchema(legalCases, {
  caseNumber: z.string().min(1).max(50),
  title: z.string().min(1).max(500),
  clientName: z.string().min(1).max(200),
  jurisdiction: z.string().min(1).max(100),
  caseType: z.enum(['civil', 'criminal', 'administrative', 'appellate', 'arbitration']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['active', 'pending', 'closed', 'archived', 'on_hold']),
});

export const selectLegalCaseSchema = createSelectSchema(legalCases);

export const insertLegalEntitySchema = createInsertSchema(legalEntities, {
  name: z.string().min(1).max(500),
  entityType: z.enum(['person', 'corporation', 'partnership', 'llc', 'government', 'nonprofit', 'trust', 'estate']),
  primaryEmail: z.string().email().optional(),
});

export const selectLegalEntitySchema = createSelectSchema(legalEntities);

// Type exports
export type LegalDocument = typeof legalDocuments.$inferSelect;
export type NewLegalDocument = typeof legalDocuments.$inferInsert;
export type LegalCase = typeof legalCases.$inferSelect;
export type NewLegalCase = typeof legalCases.$inferInsert;
export type LegalEntity = typeof legalEntities.$inferSelect;
export type NewLegalEntity = typeof legalEntities.$inferInsert;
export type CaseDocument = typeof caseDocuments.$inferSelect;
export type NewCaseDocument = typeof caseDocuments.$inferInsert;
export type AgentAnalysisCache = typeof agentAnalysisCache.$inferSelect;
export type NewAgentAnalysisCache = typeof agentAnalysisCache.$inferInsert;