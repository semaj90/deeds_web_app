// @ts-nocheck
// PostgreSQL schema for production
import { relations } from "drizzle-orm";
import {
  boolean,
  decimal,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { vector } from "pgvector/drizzle-orm"; // Re-enabled - pgvector is now installed!

// === AUTHENTICATION & USER MANAGEMENT ===

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  hashedPassword: text("hashed_password"),
  name: text("name"),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  avatarUrl: text("avatar_url"),
  role: varchar("role", { length: 50 }).default("prosecutor").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === LUCIA v3 AUTHENTICATION TABLES ===

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

export const emailVerificationCodes = pgTable("email_verification_codes", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  code: varchar("code", { length: 8 }).notNull(),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  tokenHash: varchar("token_hash", { length: 63 }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

// === LEGAL DOCUMENT MANAGEMENT ===

export const legalDocuments = pgTable("legal_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 500 }).notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull(), // statute, regulation, case_law, precedent, contract
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  court: varchar("court", { length: 200 }),
  citation: varchar("citation", { length: 300 }),
  fullCitation: text("full_citation"),
  docketNumber: varchar("docket_number", { length: 100 }),
  dateDecided: timestamp("date_decided", { mode: "date" }),
  datePublished: timestamp("date_published", { mode: "date" }),
  fullText: text("full_text"),
  content: text("content"), // Main document content for search/display
  summary: text("summary"),
  headnotes: text("headnotes"),
  // Aligned to 384 to match current migrations and document_sections chunks (nomic-embed-text dimensionality)
  embedding: vector("embedding", { dimensions: 384 }),
  keywords: jsonb("keywords").$type<string[]>().default([]),
  topics: jsonb("topics").$type<string[]>().default([]),
  parties: jsonb("parties");
    .$type<{
      plaintiff?: string;
      defendant?: string;
      petitioner?: string;
      respondent?: string;
    }>()
    .default({}),
  judges: jsonb("judges").$type<string[]>().default([]),
  attorneys: jsonb("attorneys")
    .$type<{ plaintiff?: string[]; defendant?: string[] }>()
    .default({}),
  outcome: varchar("outcome", { length: 100 }),
  precedentialValue: varchar("precedential_value", { length: 50 }), // binding, persuasive, non_precedential
  url: text("url"),
  pdfUrl: text("pdf_url"),
  westlawId: varchar("westlaw_id", { length: 100 }),
  lexisId: varchar("lexis_id", { length: 100 }),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  evidenceId: uuid("evidence_id").references(() => evidence.id, {
    onDelete: "cascade",
  }),
  isActive: boolean("is_active").default(true),
  // Auto-save functionality
  isDirty: boolean("is_dirty").default(false),
  lastSavedAt: timestamp("last_saved_at", { mode: "date" }),
  autoSaveData: jsonb("auto_save_data"),
  // Metadata
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const citations = pgTable("citations", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").references(() => legalDocuments.id, {
    onDelete: "cascade",
  }),
  citationType: varchar("citation_type", { length: 50 }).notNull(), // primary_authority, secondary_authority, supporting, distinguishing, overruled
  relevanceScore: decimal("relevance_score", { precision: 3, scale: 2 }), // 0.00 - 1.00
  pageNumber: integer("page_number"),
  pinpointCitation: varchar("pinpoint_citation", { length: 100 }),
  quotedText: text("quoted_text"),
  contextBefore: text("context_before"),
  contextAfter: text("context_after"),
  annotation: text("annotation"),
  legalPrinciple: text("legal_principle"),
  citationFormat: varchar("citation_format", { length: 20 }).default(
    "bluebook"
  ), // bluebook, apa, mla, chicago
  formattedCitation: text("formatted_citation"),
  shepardsTreatment: varchar("shepards_treatment", { length: 50 }), // good_law, questioned, criticized, overruled
  isKeyAuthority: boolean("is_key_authority").default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const savedReports = pgTable("saved_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  reportType: varchar("report_type", { length: 50 }).notNull(), // case_summary, evidence_analysis, legal_brief, motion, discovery
  templateId: uuid("template_id"),
  content: jsonb("content").notNull(), // Rich report data structure
  htmlContent: text("html_content"),
  generatedBy: varchar("generated_by", { length: 50 }).default("manual"), // ai, manual, template
  aiModel: varchar("ai_model", { length: 50 }),
  aiPrompt: text("ai_prompt"),
  exportFormat: varchar("export_format", { length: 20 }).default("pdf"), // pdf, docx, html, txt
  status: varchar("status", { length: 20 }).default("draft"), // draft, final, archived
  version: integer("version").default(1),
  wordCount: integer("word_count"),
  tags: jsonb("tags").$type<string[]>().default([]),
  metadata: jsonb("metadata").default({}),
  sharedWith: jsonb("shared_with").$type<string[]>().default([]),
  lastExported: timestamp("last_exported", { mode: "date" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const canvasAnnotations = pgTable("canvas_annotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  evidenceId: uuid("evidence_id").references(() => evidence.id, {
    onDelete: "cascade",
  }),
  fabricData: jsonb("fabric_data").notNull(), // Complete Fabric.js canvas state
  annotationType: varchar("annotation_type", { length: 50 }), // text, highlight, arrow, shape, measurement, redaction
  coordinates: jsonb("coordinates"), // Simplified coordinate data for queries
  boundingBox: jsonb("bounding_box"), // x, y, width, height for spatial queries
  text: text("text"), // Extracted text for search
  color: varchar("color", { length: 20 }),
  layerOrder: integer("layer_order").default(0),
  isVisible: boolean("is_visible").default(true),
  metadata: jsonb("metadata").default({}),
  version: integer("version").default(1),
  parentAnnotationId: uuid("parent_annotation_id"), // For grouped annotations
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const legalResearch = pgTable("legal_research", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  searchTerms: jsonb("search_terms").$type<string[]>().default([]),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  dateRange: jsonb("date_range"), // {from: date, to: date}
  courtLevel: varchar("court_level", { length: 50 }), // supreme, appellate, trial
  practiceArea: varchar("practice_area", { length: 100 }),
  resultsCount: integer("results_count").default(0),
  searchResults: jsonb("search_results").default([]),
  aiSummary: text("ai_summary"),
  keyFindings: jsonb("key_findings").default([]),
  recommendedCitations: jsonb("recommended_citations").default([]),
  searchDuration: integer("search_duration"), // milliseconds
  dataSource: varchar("data_source", { length: 50 }), // westlaw, lexis, google_scholar, internal
  isBookmarked: boolean("is_bookmarked").default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// === CASE MANAGEMENT ===

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseNumber: varchar("case_number", { length: 50 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  incidentDate: timestamp("incident_date", { mode: "date" }),
  location: text("location"),
  priority: varchar("priority", { length: 20 }).default("medium").notNull(),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  category: varchar("category", { length: 50 }),
  dangerScore: integer("danger_score").default(0).notNull(),
  estimatedValue: decimal("estimated_value", { precision: 12, scale: 2 }),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  leadProsecutor: uuid("lead_prosecutor"),
  assignedTeam: jsonb("assigned_team").default([]).notNull(),
  tags: jsonb("tags").default([]).notNull(),
  aiSummary: text("ai_summary"),
  aiTags: jsonb("ai_tags").default([]).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { mode: "date" }),
});

// === CRIMINAL RECORDS ===

export const criminals = pgTable("criminals", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  middleName: varchar("middle_name", { length: 100 }),
  aliases: jsonb("aliases").default([]).notNull(),
  dateOfBirth: timestamp("date_of_birth", { mode: "date" }),
  placeOfBirth: varchar("place_of_birth", { length: 200 }),
  address: text("address"),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  socialSecurityNumber: varchar("ssn", { length: 11 }),
  driversLicense: varchar("drivers_license", { length: 50 }),
  height: integer("height"),
  weight: integer("weight"),
  eyeColor: varchar("eye_color", { length: 20 }),
  hairColor: varchar("hair_color", { length: 20 }),
  distinguishingMarks: text("distinguishing_marks"),
  photoUrl: text("photo_url"),
  fingerprints: jsonb("fingerprints").default({}),
  threatLevel: varchar("threat_level", { length: 20 }).default("low").notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  notes: text("notes"),
  aiSummary: text("ai_summary"),
  aiTags: jsonb("ai_tags").default([]).notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === EVIDENCE MANAGEMENT ===

export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id"),
  criminalId: uuid("criminal_id"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  evidenceType: varchar("evidence_type", { length: 50 }).notNull(),
  fileType: varchar("file_type", { length: 50 }),
  subType: varchar("sub_type", { length: 50 }),
  fileUrl: text("file_url"),
  fileName: varchar("file_name", { length: 255 }),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  hash: varchar("hash", { length: 128 }),
  tags: jsonb("tags").default([]).notNull(),
  chainOfCustody: jsonb("chain_of_custody").default([]).notNull(),
  collectedAt: timestamp("collected_at", { mode: "date" }),
  collectedBy: varchar("collected_by", { length: 255 }),
  location: text("location"),
  labAnalysis: jsonb("lab_analysis").default({}).notNull(),
  aiAnalysis: jsonb("ai_analysis").default({}).notNull(),
  aiTags: jsonb("ai_tags").default([]).notNull(),
  aiSummary: text("ai_summary"),
  summary: text("summary"),
  isAdmissible: boolean("is_admissible").default(true).notNull(),
  confidentialityLevel: varchar("confidentiality_level", { length: 20 })
    .default("standard")
    .notNull(),
  canvasPosition: jsonb("canvas_position").default({}).notNull(),
  uploadedBy: uuid("uploaded_by"),
  uploadedAt: timestamp("uploaded_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === CASE ACTIVITIES & TIMELINE ===

export const caseActivities = pgTable("case_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull(),
  activityType: varchar("activity_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  scheduledFor: timestamp("scheduled_for", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  priority: varchar("priority", { length: 20 }).default("medium").notNull(),
  assignedTo: uuid("assigned_to"),
  relatedEvidence: jsonb("related_evidence").default([]).notNull(),
  relatedCriminals: jsonb("related_criminals").default([]).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === ATTACHMENT VERIFICATIONS ===

export const attachmentVerifications = pgTable("attachment_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  attachmentId: uuid("attachment_id").notNull(),
  verifiedBy: uuid("verified_by")
    .notNull()
    .references(() => users.id),
  verificationStatus: varchar("verification_status", { length: 50 })
    .default("pending")
    .notNull(),
  verificationNotes: text("verification_notes"),
  verifiedAt: timestamp("verified_at", { mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === THEMES & UI CUSTOMIZATION ===

export const themes = pgTable("themes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  cssVariables: jsonb("css_variables").notNull(),
  colorPalette: jsonb("color_palette").notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "cascade",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === VECTOR EMBEDDINGS FOR AI SEARCH ===

export const contentEmbeddings = pgTable("content_embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentId: uuid("content_id").notNull(),
  contentType: varchar("content_type", { length: 50 }).notNull(), // 'case', 'evidence', 'criminal'
  textContent: text("text_content").notNull(),
  embedding: text("embedding"), // JSON array of numbers for vector
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === RAG (Retrieval Augmented Generation) SESSIONS ===

export const ragSessions = pgTable("rag_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: varchar("session_id", { length: 255 }).notNull().unique(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }),
  model: varchar("model", { length: 100 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const ragMessages = pgTable("rag_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  messageIndex: integer("message_index").notNull(),
  role: varchar("role", { length: 20 }).notNull(), // 'user', 'assistant'
  content: text("content").notNull(),
  retrievedSources: jsonb("retrieved_sources").default([]).notNull(),
  sourceCount: integer("source_count").default(0).notNull(),
  retrievalScore: varchar("retrieval_score", { length: 10 }),
  processingTime: integer("processing_time"),
  model: varchar("model", { length: 100 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// === REPORTS & CITATIONS ===

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  reportType: varchar("report_type", { length: 50 }).default("case_summary"),
  status: varchar("status", { length: 20 }).default("draft"),
  isPublic: boolean("is_public").default(false),
  tags: jsonb("tags").default([]).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const canvasStates = pgTable("canvas_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  canvasData: jsonb("canvas_data").notNull(),
  version: integer("version").default(1),
  isDefault: boolean("is_default").default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const personsOfInterest = pgTable("persons_of_interest", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  aliases: jsonb("aliases").default([]).notNull(),
  relationship: varchar("relationship", { length: 100 }),
  threatLevel: varchar("threat_level", { length: 20 }).default("low"),
  status: varchar("status", { length: 20 }).default("active"),
  profileData: jsonb("profile_data").default({}).notNull(),
  tags: jsonb("tags").default([]).notNull(),
  position: jsonb("position").default({}).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const hashVerifications = pgTable("hash_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  evidenceId: uuid("evidence_id").references(() => evidence.id, {
    onDelete: "cascade",
  }),
  verifiedHash: varchar("verified_hash", { length: 64 }).notNull(),
  storedHash: varchar("stored_hash", { length: 64 }),
  result: boolean("result").notNull(),
  verificationMethod: varchar("verification_method", { length: 50 }).default(
    "manual"
  ),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { mode: "date" }).defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// === AI REPORTS & ANALYSIS ===

export const aiReports = pgTable("ai_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  reportType: varchar("report_type", { length: 50 }).notNull(), // case_overview, evidence_analysis, timeline_summary, prosecution_strategy
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  richTextContent: jsonb("rich_text_content"), // Tiptap JSON content
  metadata: jsonb("metadata").default({}).notNull(), // confidence, keyPoints, recommendations, etc.
  canvasElements: jsonb("canvas_elements").default([]).notNull(),
  generatedBy: varchar("generated_by", { length: 100 }).default("gemma3-legal"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }).default("0.85"),
  isActive: boolean("is_active").default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const statutes = pgTable("statutes", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  isActive: boolean("is_active").default(true),
  penalties: jsonb("penalties").default({}).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === CONTEXT7 LEGAL AI ENHANCEMENT TABLES ===

export const legalPrecedents = pgTable("legal_precedents", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseTitle: varchar("case_title", { length: 255 }).notNull(),
  citation: varchar("citation", { length: 255 }).notNull(),
  court: varchar("court", { length: 100 }),
  year: integer("year"),
  jurisdiction: varchar("jurisdiction", { length: 50 }),
  summary: text("summary"),
  fullText: text("full_text"),
  embedding: text("embedding"), // Legal document vector
  relevanceScore: decimal("relevance_score", { precision: 3, scale: 2 }),
  legalPrinciples: jsonb("legal_principles").default([]).notNull(),
  linkedCases: jsonb("linked_cases").default([]).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const legalAnalysisSessions = pgTable("legal_analysis_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionType: varchar("session_type", { length: 50 }).default("case_analysis"),
  analysisPrompt: text("analysis_prompt"),
  analysisResult: text("analysis_result"),
  confidenceLevel: decimal("confidence_level", { precision: 3, scale: 2 }),
  sourcesUsed: jsonb("sources_used").default([]).notNull(),
  model: varchar("model", { length: 100 }).default("gemma3-legal"),
  processingTime: integer("processing_time"), // milliseconds
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === VECTOR SEARCH TABLES ===

export const userEmbeddings = pgTable("user_embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  embedding: text("embedding").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const chatEmbeddings = pgTable("chat_embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull(),
  messageId: uuid("message_id").notNull(),
  content: text("content").notNull(),
  embedding: text("embedding").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const evidenceVectors = pgTable("evidence_vectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  evidenceId: uuid("evidence_id").references(() => evidence.id, {
    onDelete: "cascade",
  }),
  content: text("content").notNull(),
  embedding: text("embedding").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const caseEmbeddings = pgTable("case_embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  embedding: text("embedding").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// === TYPE EXPORTS ===

export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;

export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;

export type Criminal = typeof criminals.$inferSelect;
export type NewCriminal = typeof criminals.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type RagSession = typeof ragSessions.$inferSelect;
export type NewRagSession = typeof ragSessions.$inferInsert;

export type RagMessage = typeof ragMessages.$inferSelect;
export type NewRagMessage = typeof ragMessages.$inferInsert;

export type LegalDocument = typeof legalDocuments.$inferSelect;
export type NewLegalDocument = typeof legalDocuments.$inferInsert;

export type CaseActivity = typeof caseActivities.$inferSelect;
export type NewCaseActivity = typeof caseActivities.$inferInsert;

export type CanvasAnnotation = typeof canvasAnnotations.$inferSelect;
export type NewCanvasAnnotation = typeof canvasAnnotations.$inferInsert;

export type PersonOfInterest = typeof personsOfInterest.$inferSelect;
export type NewPersonOfInterest = typeof personsOfInterest.$inferInsert;

// === AI QUERY LOGGING SYSTEM ===

export const userAiQueries = pgTable("user_ai_queries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  response: text("response").notNull(),
  model: varchar("model", { length: 100 }).default("gemma3-legal").notNull(),
  queryType: varchar("query_type", { length: 50 }).default("general"), // general, evidence_analysis, case_summary, legal_research
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  tokensUsed: integer("tokens_used"),
  processingTime: integer("processing_time"), // milliseconds
  contextUsed: jsonb("context_used").default([]).notNull(), // References to evidence, cases, etc.
  embedding: vector("embedding", { dimensions: 768 }), // Query embedding for similarity search
  metadata: jsonb("metadata").default({}).notNull(),
  isSuccessful: boolean("is_successful").default(true).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export type UserAiQuery = typeof userAiQueries.$inferSelect;
export type NewUserAiQuery = typeof userAiQueries.$inferInsert;

export type AutoTag = typeof autoTags.$inferSelect;
export type NewAutoTag = typeof autoTags.$inferInsert;

export type DocumentSection = typeof documentSections.$inferSelect;
export type NewDocumentSection = typeof documentSections.$inferInsert;

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;

// === RELATIONS ===

// (Relations are defined using the `relations` function from "drizzle-orm" and are not explicitly listed here)

// === ADDITIONAL RELATIONS ===

export const reportsRelations = relations(reports, ({ one }) => ({
  case: one(cases, {
    fields: [reports.caseId],
    references: [cases.id],
  }),
  createdBy: one(users, {
    fields: [reports.createdBy],
    references: [users.id],
  }),
});

export const canvasStatesRelations = relations(canvasStates, ({ one }) => ({
  case: one(cases, {
    fields: [canvasStates.caseId],
    references: [cases.id],
  }),
  createdBy: one(users, {
    fields: [canvasStates.createdBy],
    references: [users.id],
  }),
});

export const aiReportsRelations = relations(aiReports, ({ one }) => ({
  case: one(cases, {
    fields: [aiReports.caseId],
    references: [cases.id],
  }),
  createdBy: one(users, {
    fields: [aiReports.createdBy],
    references: [users.id],
  }),
});

export const personsOfInterestRelations = relations(
  personsOfInterest,
  ({ one }) => ({
    case: one(cases, {
      fields: [personsOfInterest.caseId],
      references: [cases.id],
    }),
    createdBy: one(users, {
      fields: [personsOfInterest.createdBy],
      references: [users.id],
    }),
  })
);

export const hashVerificationsRelations = relations(
  hashVerifications,
  ({ one }) => ({
    evidence: one(evidence, {
      fields: [hashVerifications.evidenceId],
      references: [evidence.id],
    }),
    verifiedBy: one(users, {
      fields: [hashVerifications.verifiedBy],
      references: [users.id],
    }),
  })
);

// === CONTEXT7 LEGAL AI RELATIONS ===

export const legalDocumentsRelations = relations(legalDocuments, ({ one, many }) => ({
  case: one(cases, {
    fields: [legalDocuments.caseId],
    references: [cases.id],
  }),
  evidence: one(evidence, {
    fields: [legalDocuments.evidenceId],
    references: [evidence.id],
  }),
  documentSections: many(documentSections),
});

export const documentSectionsRelations = relations(documentSections, ({ one }) => ({
  document: one(legalDocuments, {
    fields: [documentSections.documentId],
    references: [legalDocuments.id],
  }),
});

export const legalPrecedentsRelations = relations(
  legalPrecedents,
  ({ many }) => ({
    // No direct foreign key relations but used via vector similarity
  })
);

export const legalAnalysisSessionsRelations = relations(
  legalAnalysisSessions,
  ({ one }) => ({
    case: one(cases, {
      fields: [legalAnalysisSessions.caseId],
      references: [cases.id],
    }),
    user: one(users, {
      fields: [legalAnalysisSessions.userId],
      references: [users.id],
    }),
  })
);

// === RELATIONSHIPS ===

export const usersRelations = relations(users, ({ many }) => ({
  casesAsLead: many(cases, { relationName: "leadProsecutor" }),
  casesCreated: many(cases, { relationName: "createdBy" }),
  evidenceUploaded: many(evidence),
  activitiesAssigned: many(caseActivities, { relationName: "assignedTo" }),
  activitiesCreated: many(caseActivities, { relationName: "createdBy" }),
  criminalsCreated: many(criminals),
  sessions: many(sessions),
});

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
});

export const casesRelations = relations(cases, ({ one, many }) => ({
  leadProsecutor: one(users, {
    fields: [cases.leadProsecutor],
    references: [users.id],
    relationName: "leadProsecutor",
  }),
  createdBy: one(users, {
    fields: [cases.createdBy],
    references: [users.id],
    relationName: "createdBy",
  }),
  evidence: many(evidence),
  activities: many(caseActivities),
});

export const criminalsRelations = relations(criminals, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [criminals.createdBy],
    references: [users.id],
  }),
  evidence: many(evidence),
});

export const evidenceRelations = relations(evidence, ({ one }) => ({
  uploadedBy: one(users, {
    fields: [evidence.uploadedBy],
    references: [users.id],
  }),
  case: one(cases, {
    fields: [evidence.caseId],
    references: [cases.id],
  }),
});

export const caseActivitiesRelations = relations(caseActivities, ({ one }) => ({
  case: one(cases, {
    fields: [caseActivities.caseId],
    references: [cases.id],
  }),
  assignedTo: one(users, {
    fields: [caseActivities.assignedTo],
    references: [users.id],
    relationName: "assignedTo",
  }),
  createdBy: one(users, {
    fields: [caseActivities.createdBy],
    references: [users.id],
    relationName: "createdBy",
  }),
});

export const attachmentVerificationsRelations = relations(
  attachmentVerifications,
  ({ one }) => ({
    verifiedBy: one(users, {
      fields: [attachmentVerifications.verifiedBy],
      references: [users.id],
    }),
  })
);

export const themesRelations = relations(themes, ({ one }) => ({
  createdBy: one(users, {
    fields: [themes.createdBy],
    references: [users.id],
  }),
});

export const contentEmbeddingsRelations = relations(
  contentEmbeddings,
  ({ one }) => ({
    content: one(cases, {
      fields: [contentEmbeddings.contentId],
      references: [cases.id],
    }),
  })
);

export const ragSessionsRelations = relations(ragSessions, ({ one }) => ({
  user: one(users, {
    fields: [ragSessions.userId],
    references: [users.id],
  }),
});

export const ragMessagesRelations = relations(ragMessages, ({ one }) => ({
  session: one(ragSessions, {
    fields: [ragMessages.sessionId],
    references: [ragSessions.sessionId],
  }),
});

// === NEW RELATIONS FOR AI SYSTEM ===

export const userAiQueriesRelations = relations(userAiQueries, ({ one }) => ({
  user: one(users, {
    fields: [userAiQueries.userId],
    references: [users.id],
  }),
  case: one(cases, {
    fields: [userAiQueries.caseId],
    references: [cases.id],
  }),
});

// === AUTO-TAGGING SYSTEM ===

export const autoTags = pgTable("auto_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id").notNull(), // Can reference evidence, cases, etc.
  entityType: varchar("entity_type", { length: 50 }).notNull(), // evidence, case, document
  tag: varchar("tag", { length: 100 }).notNull(),
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull(),
  source: varchar("source", { length: 50 }).default("ai_analysis").notNull(), // ai_analysis, manual, system
  model: varchar("model", { length: 100 }),
  extractedAt: timestamp("extracted_at", { mode: "date" }).defaultNow().notNull(),
  isConfirmed: boolean("is_confirmed").default(false).notNull(),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at", { mode: "date" }),
});

export const autoTagsRelations = relations(autoTags, ({ one }) => ({
  confirmedBy: one(users, {
    fields: [autoTags.confirmedBy],
    references: [users.id],
  }),
});

// === VECTOR CACHE AND METADATA TABLES ===

export const vectorMetadata = pgTable("vector_metadata", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: text("document_id").notNull().unique(),
  collectionName: varchar("collection_name", { length: 100 }).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

// === CASE SCORING SYSTEM ===

export const caseScores = pgTable("case_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  score: decimal("score", { precision: 5, scale: 2 }).notNull(),
  riskLevel: varchar("risk_level", { length: 20 }).notNull(), // LOW, MEDIUM, HIGH
  breakdown: jsonb("breakdown").default({}).notNull(),
  criteria: jsonb("criteria").default({}).notNull(),
  recommendations: jsonb("recommendations").default([]).notNull(),
  calculatedBy: uuid("calculated_by").references(() => users.id),
  calculatedAt: timestamp("calculated_at", { mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === DOCUMENT SECTIONS FOR RAG CHUNKING ===

export const documentSections = pgTable("document_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => legalDocuments.id, { onDelete: "cascade" }),
  sectionNumber: integer("section_number").notNull(),
  title: varchar("title", { length: 500 }),
  content: text("content").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  // Aligned to 384 dimensions to match nomic-embed-text model
  embedding: vector("embedding", { dimensions: 384 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === AI CHAT SYSTEM ===

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(), // "user"  | "assistant"  | "system"
  content: text("content").notNull(),
  clientMessageId: varchar("client_message_id", { length: 255 }), // for idempotency
  contentEmbedding: vector("content_embedding", { dimensions: 384 }), // for semantic search
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  bio: text("bio"),
  expertise: jsonb("expertise").$type<string[]>().default([]),
  preferences: jsonb("preferences").default({}).notNull(),
  profileEmbedding: vector("profile_embedding", { dimensions: 384 }), // for user similarity
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// === EMBEDDING JOBS & CACHE ===

export const embeddingJobs = pgTable("embedding_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: varchar("job_id", { length: 255 }).notNull().unique(),
  documentId: uuid("document_id"),
  text: text("text").notNull(),
  model: varchar("model", { length: 100 }).notNull().default("nomic-embed-text"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // "pending", "processing", "completed", "failed"
  embedding: vector("embedding", { dimensions: 384 }),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }),
});

export const embeddingCache = pgTable("embedding_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  textHash: varchar("text_hash", { length: 64 }).notNull().unique(), // SHA-256 of text
  model: varchar("model", { length: 100 }).notNull(),
  embedding: vector("embedding", { dimensions: 384 }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  lastAccessedAt: timestamp("last_accessed_at", { mode: "date" }).defaultNow().notNull(),
});

// === VECTOR SIMILARITY INDEXES ===

export const documentChunks = pgTable("document_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull(), // evidence, legal_document, case_summary
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 384 }).notNull(), // Fixed to match 384-dim
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// === RELATIONS FOR CHAT SYSTEM ===

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [chatSessions.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
});

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
  user: one(users, {
    fields: [chatMessages.userId],
    references: [users.id],
  }),
});

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
});

export const embeddingJobsRelations = relations(embeddingJobs, ({ one }) => ({
  // Optional relation to legal documents if needed
// === EXTENDED USER RELATIONS ===;
export const usersExtendedRelations = relations(users, ({ one, many }) => ({
  // Existing relations preserved
  sessions: many(sessions),
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  chatSessions: many(chatSessions),
  chatMessages: many(chatMessages),
  // ... other existing relations would be here
,});

// Additional relation exports can go here if needed
