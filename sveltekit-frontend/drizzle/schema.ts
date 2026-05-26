import { pgTable, uuid, varchar, jsonb, timestamp, index, real, boolean, text, foreignKey, numeric, integer, vector, unique, serial, bigint, bigserial, date, uniqueIndex, check, char, primaryKey, pgView, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const activityStatus = pgEnum("activity_status", ['pending', 'in_progress', 'completed', 'cancelled'])
export const caseLinkCategory = pgEnum("case_link_category", ['charged_under', 'cited_authority', 'defense_authority', 'court_ruling', 'related_regulation', 'constitutional_basis', 'sentencing_guideline', 'glossary_concept'])
export const caseLinkType = pgEnum("case_link_type", ['CHARGED_UNDER', 'CITED_IN', 'RELATED_TO', 'OVERRULED_BY', 'AFFIRMED_BY'])
export const casePriority = pgEnum("case_priority", ['low', 'medium', 'high', 'critical', 'urgent'])
export const caseRiskLevel = pgEnum("case_risk_level", ['low', 'medium', 'high', 'critical'])
export const caseStatus = pgEnum("case_status", ['open', 'active', 'closed', 'archived', 'pending', 'under_review', 'in_progress', 'pending_review'])
export const chatMessageRole = pgEnum("chat_message_role", ['user', 'assistant', 'system'])
export const citationType = pgEnum("citation_type", ['statutory', 'constitutional', 'regulatory', 'judicial', 'other'])
export const corpusType = pgEnum("corpus_type", ['constitution', 'statute', 'regulation', 'bill', 'case', 'glossary', 'treatise', 'other'])
export const documentStatus = pgEnum("document_status", ['queued', 'processing', 'completed', 'failed'])
export const documentType = pgEnum("document_type", ['pleading', 'motion', 'brief', 'contract', 'evidence', 'correspondence', 'court_order', 'transcript', 'affidavit', 'other'])
export const errorKind = pgEnum("error_kind", ['runtime', 'api', 'other'])
export const errorSeverity = pgEnum("error_severity", ['info', 'warn', 'error', 'critical'])
export const evidenceType = pgEnum("evidence_type", ['document', 'photo', 'video', 'audio', 'physical', 'digital', 'witness_statement', 'forensic', 'documentary', 'testimonial', 'demonstrative', 'real', 'circumstantial', 'hearsay', 'expert', 'scientific'])
export const legalNodeType = pgEnum("legal_node_type", ['document', 'title', 'article', 'amendment', 'chapter', 'part', 'section', 'subsection', 'paragraph', 'clause', 'definition', 'appendix', 'note'])
export const patchStatus = pgEnum("patch_status", ['suggested', 'applied', 'rejected'])
export const processingStatus = pgEnum("processing_status", ['queued', 'extracting', 'ocr', 'structuring', 'chunking', 'embedding', 'graphing', 'complete', 'failed'])
export const relationType = pgEnum("relation_type", ['supports', 'contradicts', 'same_person', 'timeline', 'chain_of_custody', 'corroborates', 'alibi', 'motive', 'opportunity', 'means', 'witness_statement', 'physical_evidence', 'digital_evidence', 'circumstantial', 'direct_evidence', 'hearsay', 'privileged', 'inadmissible'])
export const reportStatus = pgEnum("report_status", ['draft', 'pending', 'completed', 'published'])
export const routeHealthState = pgEnum("route_health_state", ['healthy', 'degraded', 'unhealthy'])
export const sourceType = pgEnum("source_type", ['upload', 'govinfo', 'state_official', 'openstates', 'lii_reference'])
export const suggestionState = pgEnum("suggestion_state", ['pending', 'applied', 'dismissed', 'snoozed'])
export const summaryType = pgEnum("summary_type", ['brief', 'detailed', 'executive', 'technical'])
export const threatLevel = pgEnum("threat_level", ['low', 'medium', 'high', 'critical'])
export const userRole = pgEnum("user_role", ['admin', 'investigator', 'analyst', 'viewer', 'user', 'prosecutor', 'detective', 'paralegal'])
export const verificationStatus = pgEnum("verification_status", ['pending', 'verified', 'failed', 'rejected'])


export const auditLog = pgTable("audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	action: varchar({ length: 100 }).notNull(),
	resourceType: varchar("resource_type", { length: 100 }).notNull(),
	resourceId: varchar("resource_id", { length: 255 }).notNull(),
	details: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const autoTags = pgTable("auto_tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entityId: uuid("entity_id").notNull(),
	entityType: varchar("entity_type", { length: 50 }).notNull(),
	tag: varchar({ length: 100 }).notNull(),
	confidence: real().notNull(),
	source: varchar({ length: 100 }).notNull(),
	model: varchar({ length: 100 }),
	isConfirmed: boolean("is_confirmed").default(false).notNull(),
	confirmedBy: uuid("confirmed_by"),
	confirmedAt: timestamp("confirmed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_autotags_entity").using("btree", table.entityId.asc().nullsLast().op("text_ops"), table.entityType.asc().nullsLast().op("text_ops")),
]);

export const canvasAnnotations = pgTable("canvas_annotations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	canvasStateId: uuid("canvas_state_id"),
	createdBy: uuid("created_by"),
	annotationData: jsonb("annotation_data").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
});

export const canvasAutosaves = pgTable("canvas_autosaves", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	canvasStateId: uuid("canvas_state_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const canvasStates = pgTable("canvas_states", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	userId: uuid("user_id"),
	stateData: jsonb("state_data").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const caseActivities = pgTable("case_activities", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	assignedTo: uuid("assigned_to"),
	createdBy: uuid("created_by"),
	activityType: varchar("activity_type", { length: 100 }),
	description: text(),
	status: activityStatus(),
	dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const caseScores = pgTable("case_scores", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	calculatedBy: uuid("calculated_by"),
	caseId: uuid("case_id").notNull(),
	score: numeric({ precision: 5, scale:  2 }).notNull(),
	riskLevel: caseRiskLevel("risk_level").notNull(),
	breakdown: jsonb().default({}).notNull(),
	criteria: jsonb().default({}).notNull(),
	recommendations: jsonb().default([]).notNull(),
	calculatedAt: timestamp("calculated_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.calculatedBy],
			foreignColumns: [users.id],
			name: "case_scores_calculated_by_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "case_scores_case_id_fkey"
		}).onDelete("cascade"),
]);

export const caseNoteVersions = pgTable("case_note_versions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	noteId: uuid("note_id").notNull(),
	title: varchar({ length: 255 }),
	content: text().notNull(),
	versionNumber: integer("version_number").notNull(),
	editedBy: uuid("edited_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("case_note_versions_note_id_idx").using("btree", table.noteId.asc().nullsLast().op("uuid_ops")),
	index("case_note_versions_version_idx").using("btree", table.noteId.asc().nullsLast().op("int4_ops"), table.versionNumber.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.noteId],
			foreignColumns: [caseNotes.id],
			name: "case_note_versions_note_id_fkey"
		}).onDelete("cascade"),
]);

export const caseReports = pgTable("case_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	version: integer().notNull(),
	isCurrent: boolean("is_current").default(true).notNull(),
	summaryText: text("summary_text").notNull(),
	citations: jsonb().default([]).notNull(),
	holding: text(),
	createdBy: varchar("created_by", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const caseEmbeddings = pgTable("case_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
	model: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("case_embeddings_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("idx_case_embeddings_halfvec_hnsw").using("hnsw", sql`((embedding)::halfvec(768))`).with({m: "16",ef_construction: "200"}),
	index("idx_case_embeddings_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
]);

export const caseNoteEvidenceRefs = pgTable("case_note_evidence_refs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	noteId: uuid("note_id").notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("case_note_refs_evidence_id_idx").using("btree", table.evidenceId.asc().nullsLast().op("uuid_ops")),
	index("case_note_refs_note_id_idx").using("btree", table.noteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.evidenceId],
			foreignColumns: [evidence.id],
			name: "case_note_evidence_refs_evidence_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.noteId],
			foreignColumns: [caseNotes.id],
			name: "case_note_evidence_refs_note_id_fkey"
		}).onDelete("cascade"),
	unique("case_note_refs_unique").on(table.noteId, table.evidenceId),
]);

export const caseNotes = pgTable("case_notes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	title: varchar({ length: 255 }),
	content: text().notNull(),
	isAi: boolean("is_ai").default(false),
	isPinned: boolean("is_pinned").default(false),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("case_notes_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("case_notes_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("case_notes_is_pinned_idx").using("btree", table.isPinned.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "case_notes_case_id_fkey"
		}).onDelete("cascade"),
]);

export const analysisJobs = pgTable("analysis_jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	caseId: uuid("case_id"),
	jobType: varchar("job_type", { length: 64 }).notNull(),
	status: varchar({ length: 32 }).default('queued').notNull(),
	progress: varchar({ length: 32 }).default('0'),
	result: jsonb().default({}),
	error: text(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("analysis_jobs_evidence_idx").using("btree", table.evidenceId.asc().nullsLast().op("uuid_ops")),
	index("analysis_jobs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("analysis_jobs_type_idx").using("btree", table.jobType.asc().nullsLast().op("text_ops")),
]);

export const attachmentVerifications = pgTable("attachment_verifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	attachmentId: uuid("attachment_id"),
	verifiedBy: uuid("verified_by"),
	status: verificationStatus(),
	verificationDate: timestamp("verification_date", { withTimezone: true, mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
});

export const aiReports = pgTable("ai_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	createdBy: uuid("created_by"),
	reportType: varchar("report_type", { length: 100 }).notNull(),
	summary: text(),
	fullReport: text("full_report"),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "ai_reports_case_id_fkey"
		}).onDelete("cascade"),
]);

export const caseStatuteLinks = pgTable("case_statute_links", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	statuteId: uuid("statute_id"),
	citationId: uuid("citation_id"),
	linkType: caseLinkType("link_type").default('CITED_IN').notNull(),
	notes: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("case_statute_links_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("case_statute_links_citation_id_idx").using("btree", table.citationId.asc().nullsLast().op("uuid_ops")),
	index("case_statute_links_statute_id_idx").using("btree", table.statuteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "case_statute_links_case_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.citationId],
			foreignColumns: [citations.id],
			name: "case_statute_links_citation_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.statuteId],
			foreignColumns: [statutes.id],
			name: "case_statute_links_statute_id_fkey"
		}).onDelete("set null"),
]);

export const contentEmbeddings = pgTable("content_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
	model: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_content_embeddings_halfvec_hnsw").using("hnsw", sql`((embedding)::halfvec(768))`).with({m: "16",ef_construction: "200"}),
	index("idx_content_embeddings_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
]);

export const citationTags = pgTable("citation_tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	citationId: uuid("citation_id").notNull(),
	tag: varchar({ length: 100 }).notNull(),
	color: varchar({ length: 7 }).default('#6b7280'),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("citation_tags_citation_id_idx").using("btree", table.citationId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.citationId],
			foreignColumns: [citations.id],
			name: "citation_tags_citation_id_fkey"
		}).onDelete("cascade"),
	unique("citation_tags_unique").on(table.citationId, table.tag),
]);

export const citationCollections = pgTable("citation_collections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	color: varchar({ length: 7 }).default('#8B2332'),
	isPublic: boolean("is_public").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("citation_collections_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "citation_collections_user_id_fkey"
		}).onDelete("cascade"),
]);

export const documentChunks = pgTable("document_chunks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	content: text().notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_document_chunks_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_path_ops")),
]);

export const criminals = pgTable("criminals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	firstName: varchar("first_name", { length: 100 }).notNull(),
	lastName: varchar("last_name", { length: 100 }).notNull(),
	middleName: varchar("middle_name", { length: 100 }),
	aliases: jsonb().default([]).notNull(),
	dateOfBirth: timestamp("date_of_birth", { mode: 'string' }),
	placeOfBirth: varchar("place_of_birth", { length: 200 }),
	address: text(),
	phone: varchar({ length: 20 }),
	email: varchar({ length: 255 }),
	ssn: varchar({ length: 11 }),
	driversLicense: varchar("drivers_license", { length: 50 }),
	height: integer(),
	weight: integer(),
	eyeColor: varchar("eye_color", { length: 20 }),
	hairColor: varchar("hair_color", { length: 20 }),
	distinguishingMarks: text("distinguishing_marks"),
	photoUrl: text("photo_url"),
	fingerprints: jsonb().default({}).notNull(),
	threatLevel: threatLevel("threat_level").default('low').notNull(),
	status: varchar({ length: 20 }).default('active').notNull(),
	notes: text(),
	aiSummary: text("ai_summary"),
	aiTags: jsonb("ai_tags").default([]).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("criminals_first_name_idx").using("btree", table.firstName.asc().nullsLast().op("text_ops")),
	index("criminals_last_name_idx").using("btree", table.lastName.asc().nullsLast().op("text_ops")),
	index("criminals_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("criminals_threat_level_idx").using("btree", table.threatLevel.asc().nullsLast().op("enum_ops")),
	index("idx_criminals_ai_tags_gin").using("gin", table.aiTags.asc().nullsLast().op("jsonb_path_ops")),
]);

export const documentProcessing = pgTable("document_processing", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	status: documentStatus().default('queued').notNull(),
	processor: varchar({ length: 100 }),
	metadata: jsonb(),
	error: text(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const documentSummaries = pgTable("document_summaries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	summaryType: summaryType("summary_type").notNull(),
	summaryText: text("summary_text").notNull(),
	model: varchar({ length: 100 }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const documentTopics = pgTable("document_topics", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	topicId: integer("topic_id").notNull(),
	membershipProbability: real("membership_probability").notNull(),
	centroidDistance: real("centroid_distance").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("document_topics_document_id_idx").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("document_topics_topic_id_idx").using("btree", table.topicId.asc().nullsLast().op("int4_ops")),
	unique("document_topics_document_id_topic_id_unique").on(table.documentId, table.topicId),
]);

export const documents = pgTable("documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	filePath: varchar("file_path", { length: 500 }),
	fileType: varchar("file_type", { length: 100 }),
	fileSize: integer("file_size"),
	content: text(),
	summary: text(),
	embeddingId: varchar("embedding_id", { length: 255 }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	status: varchar({ length: 50 }).default('pending'),
	s3Key: text("s3_key"),
	s3Bucket: text("s3_bucket").default('legal-documents'),
	originalName: text("original_name"),
	mimeType: text("mime_type"),
	userId: uuid("user_id"),
});

export const cases = pgTable("cases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: varchar({ length: 500 }).notNull(),
	description: text(),
	status: caseStatus().default('open'),
	priority: casePriority().default('medium'),
	caseNumber: varchar("case_number", { length: 100 }),
	createdBy: uuid("created_by"),
	assignedTo: uuid("assigned_to"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	practiceArea: varchar("practice_area", { length: 100 }),
	jurisdiction: varchar({ length: 100 }),
	court: varchar({ length: 200 }),
	clientName: varchar("client_name", { length: 200 }),
	opposingParty: varchar("opposing_party", { length: 200 }),
	userId: uuid("user_id"),
	assignedAttorney: uuid("assigned_attorney"),
	filingDate: timestamp("filing_date", { withTimezone: true, mode: 'string' }),
	dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }),
	closedDate: timestamp("closed_date", { withTimezone: true, mode: 'string' }),
	qdrantId: uuid("qdrant_id"),
	qdrantCollection: varchar("qdrant_collection", { length: 100 }),
	metadata: jsonb(),
}, (table) => [
	index("idx_cases_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_cases_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_cases_status_priority").using("btree", table.status.asc().nullsLast().op("enum_ops"), table.priority.asc().nullsLast().op("enum_ops")),
	index("idx_cases_status_priority_created").using("btree", table.status.asc().nullsLast().op("enum_ops"), table.priority.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [users.id],
			name: "cases_assigned_to_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "cases_created_by_fkey"
		}),
]);

export const emailVerificationCodes = pgTable("email_verification_codes", {
	id: serial().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	email: varchar({ length: 255 }).notNull(),
	code: varchar({ length: 8 }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "email_verification_codes_user_id_fkey"
		}).onDelete("cascade"),
	unique("email_verification_codes_user_id_unique").on(table.userId),
]);

export const errorClusters = pgTable("error_clusters", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	kind: errorKind().notNull(),
	severity: errorSeverity().default('warn').notNull(),
	pattern: text().notNull(),
	errorCount: integer("error_count").default(1).notNull(),
	routePaths: text("route_paths").array(),
	radius: numeric(),
	lastUpdated: timestamp("last_updated", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_error_clusters_kind").using("btree", table.kind.asc().nullsLast().op("enum_ops")),
	index("idx_error_clusters_severity").using("btree", table.severity.asc().nullsLast().op("enum_ops")),
]);

export const embeddingCache = pgTable("embedding_cache", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	textHash: text("text_hash").notNull(),
	model: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
}, (table) => [
	index("embedding_cache_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	unique("embedding_cache_text_hash_unique").on(table.textHash),
]);

export const citations = pgTable("citations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id"),
	caseId: uuid("case_id"),
	citationText: text("citation_text").notNull(),
	sourceUrl: text("source_url"),
	pageNumber: integer("page_number"),
	confidence: real(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	citationType: varchar("citation_type", { length: 100 }),
	title: varchar({ length: 500 }),
	annotation: text(),
	isKeyAuthority: boolean("is_key_authority").default(false),
	tags: jsonb().default([]),
	embedding: vector({ dimensions: 768 }),
});

export const errorEvents = pgTable("error_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routePath: varchar("route_path", { length: 255 }).notNull(),
	file: varchar({ length: 500 }),
	kind: errorKind().default('other').notNull(),
	severity: errorSeverity().default('warn').notNull(),
	tsCode: varchar("ts_code", { length: 50 }),
	message: text().notNull(),
	stack: text(),
	lineNumber: integer("line_number"),
	columnNumber: integer("column_number"),
	clusterId: uuid("cluster_id"),
	collectedAt: timestamp("collected_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_error_events_cluster").using("btree", table.clusterId.asc().nullsLast().op("uuid_ops")),
	index("idx_error_events_collected").using("btree", table.collectedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_error_events_kind").using("btree", table.kind.asc().nullsLast().op("enum_ops")),
	index("idx_error_events_route").using("btree", table.routePath.asc().nullsLast().op("text_ops")),
]);

export const errorSuggestionStates = pgTable("error_suggestion_states", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	suggestionId: uuid("suggestion_id").notNull(),
	routePath: varchar("route_path", { length: 255 }).notNull(),
	userId: uuid("user_id"),
	state: suggestionState().default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_error_suggestion_states_suggestion_route").using("btree", table.suggestionId.asc().nullsLast().op("text_ops"), table.routePath.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.suggestionId],
			foreignColumns: [errorSuggestions.id],
			name: "error_suggestion_states_suggestion_id_fkey"
		}).onDelete("cascade"),
	unique("uq_error_suggestion_states_suggestion_route_user").on(table.suggestionId, table.routePath, table.userId),
]);

export const evidenceAuditLog = pgTable("evidence_audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	userId: uuid("user_id"),
	action: varchar({ length: 50 }).notNull(),
	changes: jsonb(),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("evidence_audit_log_action_idx").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("evidence_audit_log_evidence_id_idx").using("btree", table.evidenceId.asc().nullsLast().op("uuid_ops")),
	index("evidence_audit_log_timestamp_idx").using("btree", table.timestamp.asc().nullsLast().op("timestamptz_ops")),
	index("evidence_audit_log_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.evidenceId],
			foreignColumns: [evidence.id],
			name: "evidence_audit_log_evidence_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "evidence_audit_log_user_id_fkey"
		}).onDelete("set null"),
]);

export const errorTimeline = pgTable("error_timeline", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routePath: varchar("route_path", { length: 255 }).notNull(),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	description: text(),
	metadata: jsonb(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_error_timeline_event").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("idx_error_timeline_route").using("btree", table.routePath.asc().nullsLast().op("text_ops")),
]);

export const errorSuggestions = pgTable("error_suggestions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clusterId: uuid("cluster_id").notNull(),
	title: varchar({ length: 255 }).notNull(),
	explanation: text().notNull(),
	patch: text(),
	confidence: numeric(),
	hints: text().array(),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	appliedCount: integer("applied_count").default(0).notNull(),
	successCount: integer("success_count").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_error_suggestions_cluster").using("btree", table.clusterId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clusterId],
			foreignColumns: [errorClusters.id],
			name: "error_suggestions_cluster_id_fkey"
		}),
]);

export const evidenceBoardConnections = pgTable("evidence_board_connections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	fromEvidenceId: uuid("from_evidence_id").notNull(),
	toEvidenceId: uuid("to_evidence_id").notNull(),
	connectionType: varchar("connection_type", { length: 50 }).default('related').notNull(),
	label: varchar({ length: 255 }),
	notes: text(),
	strength: real().default(1),
	isVisible: boolean("is_visible").default(true),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("evidence_board_connections_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("evidence_board_connections_type_idx").using("btree", table.connectionType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "evidence_board_connections_case_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.fromEvidenceId],
			foreignColumns: [evidence.id],
			name: "evidence_board_connections_from_evidence_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toEvidenceId],
			foreignColumns: [evidence.id],
			name: "evidence_board_connections_to_evidence_id_fkey"
		}).onDelete("cascade"),
]);

export const evidenceRelationships = pgTable("evidence_relationships", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	fromEvidenceId: uuid("from_evidence_id").notNull(),
	toEvidenceId: uuid("to_evidence_id").notNull(),
	relationshipType: relationType("relationship_type").notNull(),
	label: text(),
	strength: varchar({ length: 20 }).default('medium').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("evidence_relationships_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("evidence_relationships_from_idx").using("btree", table.fromEvidenceId.asc().nullsLast().op("uuid_ops")),
	index("evidence_relationships_to_idx").using("btree", table.toEvidenceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "evidence_relationships_case_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.fromEvidenceId],
			foreignColumns: [evidence.id],
			name: "evidence_relationships_from_evidence_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toEvidenceId],
			foreignColumns: [evidence.id],
			name: "evidence_relationships_to_evidence_id_fkey"
		}).onDelete("cascade"),
]);

export const evidenceVersions = pgTable("evidence_versions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	version: integer().notNull(),
	title: varchar({ length: 255 }),
	description: text(),
	metadata: jsonb(),
	changedBy: uuid("changed_by"),
	changeReason: text("change_reason"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("evidence_versions_evidence_id_idx").using("btree", table.evidenceId.asc().nullsLast().op("uuid_ops")),
	index("evidence_versions_version_idx").using("btree", table.evidenceId.asc().nullsLast().op("int4_ops"), table.version.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.changedBy],
			foreignColumns: [users.id],
			name: "evidence_versions_changed_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.evidenceId],
			foreignColumns: [evidence.id],
			name: "evidence_versions_evidence_id_fkey"
		}).onDelete("cascade"),
]);

export const legalDocuments = pgTable("legal_documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	content: text(),
	s3Key: text("s3_key").notNull(),
	s3Bucket: text("s3_bucket").default('legal-documents').notNull(),
	originalName: text("original_name").notNull(),
	mimeType: text("mime_type").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }).default(0).notNull(),
	caseId: uuid("case_id"),
	userId: uuid("user_id"),
	evidenceId: uuid("evidence_id"),
	createdBy: uuid("created_by"),
	status: documentStatus().default('queued').notNull(),
	documentType: documentType("document_type"),
	practiceArea: varchar("practice_area", { length: 100 }),
	metadata: jsonb(),
	contentEmbedding: vector("content_embedding", { dimensions: 768 }),
	qdrantId: uuid("qdrant_id"),
	qdrantCollection: varchar("qdrant_collection", { length: 100 }),
	lastSyncedToQdrant: timestamp("last_synced_to_qdrant", { withTimezone: true, mode: 'string' }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_legal_documents_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_legal_documents_embedding_hnsw").using("hnsw", table.contentEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("idx_legal_documents_halfvec_hnsw").using("hnsw", sql`((content_embedding)::halfvec(768))`).with({m: "16",ef_construction: "200"}),
	index("idx_legal_documents_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_legal_documents_qdrant_id").using("btree", table.qdrantId.asc().nullsLast().op("uuid_ops")),
	index("idx_legal_documents_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("idx_legal_documents_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("legal_documents_content_embedding_hnsw").using("hnsw", table.contentEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "legal_documents_case_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "legal_documents_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.evidenceId],
			foreignColumns: [evidence.id],
			name: "legal_documents_evidence_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "legal_documents_user_id_fkey"
		}).onDelete("set null"),
]);

export const legalAnalysisSessions = pgTable("legal_analysis_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	caseId: uuid("case_id"),
	analysisType: varchar("analysis_type", { length: 100 }).notNull(),
	inputData: jsonb("input_data"),
	outputSummary: text("output_summary"),
	status: varchar({ length: 50 }).default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "legal_analysis_user_fk"
		}).onDelete("cascade"),
]);

export const hashVerifications = pgTable("hash_verifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	verifiedBy: uuid("verified_by"),
	hashValue: text("hash_value").notNull(),
	algorithm: varchar({ length: 50 }).notNull(),
	status: verificationStatus().default('pending').notNull(),
	verificationDate: timestamp("verification_date", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const legalGlossary = pgTable("legal_glossary", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	term: varchar({ length: 255 }).notNull(),
	definition: text().notNull(),
	category: varchar({ length: 100 }),
	jurisdiction: varchar({ length: 100 }),
	relatedTerms: jsonb("related_terms"),
	sources: jsonb(),
	embedding: vector({ dimensions: 768 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_legal_glossary_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("legal_glossary_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	unique("legal_glossary_term_unique").on(table.term),
]);

export const evidenceVectors = pgTable("evidence_vectors", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	vector: vector({ dimensions: 768 }).notNull(),
	model: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_evidence_vectors_halfvec_hnsw").using("hnsw", sql`((vector)::halfvec(768))`).with({m: "16",ef_construction: "200"}),
	index("idx_evidence_vectors_hnsw").using("hnsw", table.vector.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
]);

export const legalPrecedents = pgTable("legal_precedents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	title: varchar({ length: 255 }).notNull(),
	summary: text().notNull(),
	citation: varchar({ length: 255 }),
	court: varchar({ length: 200 }),
	decisionDate: timestamp("decision_date", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const evidence = pgTable("evidence", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	userId: uuid("user_id"),
	criminalId: uuid("criminal_id"),
	uploadedBy: uuid("uploaded_by"),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	filePath: varchar("file_path", { length: 500 }),
	fileType: varchar("file_type", { length: 100 }),
	fileSize: integer("file_size"),
	hash: varchar({ length: 255 }),
	source: varchar({ length: 255 }),
	dateObtained: timestamp("date_obtained", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	chainOfCustody: jsonb("chain_of_custody"),
	metadata: jsonb(),
	evidenceType: evidenceType("evidence_type"),
	subType: varchar("sub_type", { length: 50 }),
	fileUrl: text("file_url"),
	fileName: varchar("file_name", { length: 255 }),
	canvasPosition: jsonb("canvas_position").default({}),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }),
	evidenceNumber: varchar("evidence_number", { length: 50 }),
	type: varchar({ length: 100 }),
	summary: text(),
	posX: integer("pos_x"),
	posY: integer("pos_y"),
	collectedAt: timestamp("collected_at", { withTimezone: true, mode: 'string' }),
	collectedBy: varchar("collected_by", { length: 255 }),
	mimeType: varchar("mime_type", { length: 100 }),
	tags: jsonb(),
	aiTags: jsonb("ai_tags"),
	aiAnalysis: jsonb("ai_analysis"),
	aiSummary: text("ai_summary"),
	embedding: vector({ dimensions: 768 }).default(sql`NULL`),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	verified: boolean(),
	status: varchar({ length: 50 }),
	extractedText: text("extracted_text"),
	entities: jsonb(),
	keywords: jsonb(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_evidence_ai_tags_gin").using("gin", table.aiTags.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_evidence_embedding_diskann").using("diskann", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_evidence_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("idx_evidence_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_evidence_tags_gin").using("gin", table.tags.asc().nullsLast().op("jsonb_path_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "evidence_case_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [users.id],
			name: "evidence_uploaded_by_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "evidence_user_id_fkey"
		}).onDelete("set null"),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
	tokenHash: varchar("token_hash", { length: 63 }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "password_reset_tokens_user_id_fkey"
		}).onDelete("cascade"),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	endpoint: text().notNull(),
	p256Dh: text().notNull(),
	auth: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_push_subscriptions_endpoint").using("btree", table.endpoint.asc().nullsLast().op("text_ops")),
	index("idx_push_subscriptions_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("push_subscriptions_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "push_subscriptions_user_id_fkey"
		}).onDelete("cascade"),
	unique("push_subscriptions_endpoint_key").on(table.endpoint),
]);

export const phase72Error = pgTable("phase72_error", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	errorHash: text("error_hash"),
	filePath: text("file_path").notNull(),
	line: integer(),
	column: integer(),
	errorCode: text("error_code"),
	severity: text().default('error'),
	message: text(),
	phase: integer().default(72),
	cycle: integer().default(1),
	status: text().default('open'),
	suggestion: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_phase72_error_code").using("btree", table.errorCode.asc().nullsLast().op("text_ops")),
	index("idx_phase72_error_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_phase72_error_file").using("btree", table.filePath.asc().nullsLast().op("text_ops")),
	index("idx_phase72_error_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const ragSessions = pgTable("rag_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	caseId: uuid("case_id"),
	title: varchar({ length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "rag_sessions_user_id_fk"
		}).onDelete("cascade"),
]);

export const ragMessages = pgTable("rag_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	role: varchar({ length: 50 }).notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const routeErrorPatches = pgTable("route_error_patches", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routePath: varchar("route_path", { length: 255 }).notNull(),
	routeFile: varchar("route_file", { length: 500 }),
	errorCode: varchar("error_code", { length: 64 }).notNull(),
	suggestionTitle: varchar("suggestion_title", { length: 255 }),
	patchText: text("patch_text").notNull(),
	patchExplanation: text("patch_explanation"),
	confidence: numeric().default('0.50').notNull(),
	hints: text().array(),
	status: patchStatus().default('suggested').notNull(),
	source: varchar({ length: 64 }).default('phase78').notNull(),
	metadata: jsonb().default({}).notNull(),
	createdBy: uuid("created_by"),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_route_patches_error_code").using("btree", table.errorCode.asc().nullsLast().op("text_ops")),
	index("idx_route_patches_route").using("btree", table.routePath.asc().nullsLast().op("text_ops")),
	index("idx_route_patches_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "route_error_patches_created_by_fkey"
		}).onDelete("set null"),
]);

export const savedReports = pgTable("saved_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	reportId: uuid("report_id").notNull(),
	caseId: uuid("case_id"),
	savedAt: timestamp("saved_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "saved_reports_user_id_fk"
		}).onDelete("cascade"),
]);

export const sessions = pgTable("sessions", {
	id: text().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_sessions_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "sessions_user_id_fkey"
		}).onDelete("cascade"),
]);

export const routeHealth = pgTable("route_health", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routePath: varchar("route_path", { length: 255 }).notNull(),
	file: varchar({ length: 500 }),
	state: routeHealthState().default('healthy').notNull(),
	recentErrorCount: integer("recent_error_count").default(0).notNull(),
	totalErrorCount: integer("total_error_count").default(0).notNull(),
	lastErrorAt: timestamp("last_error_at", { withTimezone: true, mode: 'string' }),
	lastErrorClusterId: uuid("last_error_cluster_id"),
	lastErrorMessageShort: text("last_error_message_short"),
	routeCluster: varchar("route_cluster", { length: 100 }),
	routeOwner: varchar("route_owner", { length: 100 }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_route_health_cluster").using("btree", table.routeCluster.asc().nullsLast().op("text_ops")),
	index("idx_route_health_path").using("btree", table.routePath.asc().nullsLast().op("text_ops")),
	index("idx_route_health_state").using("btree", table.state.asc().nullsLast().op("enum_ops")),
	index("idx_route_health_updated").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
	unique("route_health_route_path_key").on(table.routePath),
]);

export const statuteChunks = pgTable("statute_chunks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	statuteId: uuid("statute_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	content: text().notNull(),
	embedding: vector({ dimensions: 768 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_statute_chunks_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("idx_statute_chunks_halfvec_hnsw").using("hnsw", sql`((embedding)::halfvec(768))`).with({m: "16",ef_construction: "200"}),
	index("statute_chunks_chunk_index_idx").using("btree", table.chunkIndex.asc().nullsLast().op("int4_ops")),
	index("statute_chunks_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("statute_chunks_statute_id_idx").using("btree", table.statuteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.statuteId],
			foreignColumns: [statutes.id],
			name: "statute_chunks_statute_id_fkey"
		}).onDelete("cascade"),
]);

export const reports = pgTable("reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	createdBy: uuid("created_by"),
	title: varchar({ length: 255 }).notNull(),
	content: text(),
	status: reportStatus().default('draft').notNull(),
	generatedAt: timestamp("generated_at", { mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	type: varchar({ length: 64 }),
	reportType: varchar("report_type", { length: 100 }),
	format: varchar({ length: 50 }).default('html'),
}, (table) => [
	index("idx_reports_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_reports_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("idx_reports_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
]);

export const legalResearch = pgTable("legal_research", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	createdBy: uuid("created_by").notNull(),
	query: text().notNull(),
	results: jsonb(),
	status: varchar({ length: 50 }).default('completed').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "legal_research_created_by_fk"
		}).onDelete("set null"),
]);

export const statutes = pgTable("statutes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: varchar({ length: 255 }).notNull(),
	content: text().notNull(),
	jurisdiction: varchar({ length: 100 }),
	section: varchar({ length: 100 }),
	category: varchar({ length: 100 }),
	sourceUrl: text("source_url"),
	effectiveDate: timestamp("effective_date", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const reportAuditLog = pgTable("report_audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	reportId: uuid("report_id").notNull(),
	userId: uuid("user_id").notNull(),
	action: varchar({ length: 50 }).notNull(),
	changes: jsonb(),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("report_audit_log_report_id_idx").using("btree", table.reportId.asc().nullsLast().op("uuid_ops")),
	index("report_audit_log_timestamp_idx").using("btree", table.timestamp.asc().nullsLast().op("timestamptz_ops")),
	index("report_audit_log_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.reportId],
			foreignColumns: [reports.id],
			name: "report_audit_log_report_id_fkey"
		}).onDelete("cascade"),
]);

export const themes = pgTable("themes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	config: jsonb().notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "themes_user_id_fk"
		}).onDelete("cascade"),
]);

export const userAiQueries = pgTable("user_ai_queries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	caseId: uuid("case_id"),
	query: text().notNull(),
	response: text().notNull(),
	model: varchar({ length: 100 }).notNull(),
	queryType: varchar("query_type", { length: 50 }).notNull(),
	confidence: numeric({ precision: 3, scale:  2 }),
	processingTime: integer("processing_time"),
	contextUsed: jsonb("context_used").default([]),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "user_ai_queries_case_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "user_ai_queries_case_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_ai_queries_user_id_fkey"
		}).onDelete("cascade"),
]);

export const workspaceNotes = pgTable("workspace_notes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	content: text().notNull(),
	isAi: boolean("is_ai").default(false),
	embedding: vector({ dimensions: 768 }),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_workspace_notes_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("workspace_notes_is_ai_idx").using("btree", table.isAi.asc().nullsLast().op("bool_ops")),
	index("workspace_notes_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_notes_workspace_id_fkey"
		}).onDelete("cascade"),
]);

export const workspaces = pgTable("workspaces", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	caseId: uuid("case_id"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workspaces_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("workspaces_created_by_idx").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "workspaces_case_id_fkey"
		}).onDelete("cascade"),
]);

export const userInteractionHistory = pgTable("user_interaction_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	recommendationId: uuid("recommendation_id"),
	documentId: uuid("document_id"),
	caseId: uuid("case_id"),
	interactionType: varchar("interaction_type", { length: 50 }).notNull(),
	durationSeconds: integer("duration_seconds"),
	searchContext: text("search_context"),
	topicPreferences: jsonb("topic_preferences").default([]).notNull(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("user_interaction_history_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("user_interaction_history_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("user_interaction_history_document_id_idx").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("user_interaction_history_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
]);

export const storageFiles = pgTable("storage_files", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	key: text().notNull(),
	originalName: text("original_name"),
	bucket: text().notNull(),
	userId: uuid("user_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	size: bigint({ mode: "number" }).notNull(),
	mime: text(),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "storage_files_user_id_fkey"
		}).onDelete("set null"),
]);

export const vectorJobs = pgTable("vector_jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	status: varchar().notNull(),
	progress: integer().default(0).notNull(),
	result: jsonb(),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const vectorMetadata = pgTable("vector_metadata", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: text("document_id").notNull(),
	collectionName: varchar("collection_name", { length: 100 }).notNull(),
	metadata: jsonb().default({}).notNull(),
	contentHash: text("content_hash").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("vector_metadata_document_id_unique").on(table.documentId),
]);

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	name: varchar({ length: 255 }),
	title: varchar({ length: 255 }),
	role: userRole().default('prosecutor'),
	hashedPassword: text("hashed_password"),
	avatarUrl: text("avatar_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	firstName: varchar("first_name", { length: 255 }),
	lastName: varchar("last_name", { length: 255 }),
	isActive: boolean("is_active").default(true).notNull(),
	hasCompletedOnboarding: boolean("has_completed_onboarding").default(false),
	onboardingStep: integer("onboarding_step").default(0),
}, (table) => [
	unique("users_email_key").on(table.email),
]);

export const workspaceEvidence = pgTable("workspace_evidence", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	relevanceScore: real("relevance_score").default(0),
	addedBy: varchar("added_by", { length: 50 }).default('user'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workspace_evidence_evidence_id_idx").using("btree", table.evidenceId.asc().nullsLast().op("uuid_ops")),
	index("workspace_evidence_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.evidenceId],
			foreignColumns: [evidence.id],
			name: "workspace_evidence_evidence_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_evidence_workspace_id_fkey"
		}).onDelete("cascade"),
]);

export const workspaceSessions = pgTable("workspace_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	sessionId: uuid("session_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workspace_sessions_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("uuid_ops")),
	index("workspace_sessions_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_sessions_workspace_id_fkey"
		}).onDelete("cascade"),
]);

export const userEmbeddings = pgTable("user_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
	model: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_user_embeddings_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_embeddings_user_id_fk"
		}).onDelete("cascade"),
]);

export const vectorOutbox = pgTable("vector_outbox", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ownerType: varchar("owner_type", { length: 256 }).notNull(),
	ownerId: varchar("owner_id", { length: 256 }).notNull(),
	event: varchar({ length: 256 }).notNull(),
	vector: vector({ dimensions: 768 }),
	payload: jsonb().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const yorhaCases = pgTable("yorha_cases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseNumber: varchar("case_number", { length: 100 }).notNull(),
	title: varchar({ length: 500 }).notNull(),
	description: text(),
	status: varchar({ length: 50 }).default('active').notNull(),
	priority: varchar({ length: 20 }).default('medium').notNull(),
	caseType: varchar("case_type", { length: 100 }),
	jurisdiction: varchar({ length: 200 }),
	filedDate: timestamp("filed_date", { withTimezone: true, mode: 'string' }),
	closedDate: timestamp("closed_date", { withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by").notNull(),
	assignedTo: uuid("assigned_to"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("yorha_cases_case_number_idx").using("btree", table.caseNumber.asc().nullsLast().op("text_ops")),
	index("yorha_cases_created_by_idx").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("yorha_cases_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	unique("yorha_cases_case_number_key").on(table.caseNumber),
]);

export const workspaceStatutes = pgTable("workspace_statutes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	statuteId: uuid("statute_id"),
	statuteText: text("statute_text"),
	relevanceScore: real("relevance_score").default(0),
	source: varchar({ length: 50 }).default('user'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workspace_statutes_statute_id_idx").using("btree", table.statuteId.asc().nullsLast().op("uuid_ops")),
	index("workspace_statutes_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.statuteId],
			foreignColumns: [statutes.id],
			name: "workspace_statutes_statute_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_statutes_workspace_id_fkey"
		}).onDelete("cascade"),
]);

export const yorhaChatMessages = pgTable("yorha_chat_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	role: varchar({ length: 50 }).notNull(),
	content: text().notNull(),
	messageType: varchar("message_type", { length: 50 }).default('text'),
	referencedEvidence: jsonb("referenced_evidence"),
	modelUsed: varchar("model_used", { length: 100 }),
	tokensUsed: integer("tokens_used"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("yorha_chat_messages_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("yorha_chat_messages_role_idx").using("btree", table.role.asc().nullsLast().op("text_ops")),
	index("yorha_chat_messages_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("uuid_ops")),
]);

export const yorhaEvidenceConnections = pgTable("yorha_evidence_connections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	sourceNodeId: uuid("source_node_id").notNull(),
	targetNodeId: uuid("target_node_id").notNull(),
	connectionType: varchar("connection_type", { length: 100 }).notNull(),
	strength: integer().default(50),
	description: text(),
	aiReasoning: text("ai_reasoning"),
	confidenceScore: integer("confidence_score").default(0),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("yorha_evidence_connections_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("yorha_evidence_connections_source_idx").using("btree", table.sourceNodeId.asc().nullsLast().op("uuid_ops")),
	index("yorha_evidence_connections_target_idx").using("btree", table.targetNodeId.asc().nullsLast().op("uuid_ops")),
	index("yorha_evidence_connections_type_idx").using("btree", table.connectionType.asc().nullsLast().op("text_ops")),
]);

export const yorhaEvidenceNodes = pgTable("yorha_evidence_nodes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	title: varchar({ length: 500 }).notNull(),
	description: text(),
	evidenceType: varchar("evidence_type", { length: 100 }).notNull(),
	positionX: integer("position_x").default(0),
	positionY: integer("position_y").default(0),
	color: varchar({ length: 20 }).default('blue'),
	icon: varchar({ length: 100 }),
	source: varchar({ length: 500 }),
	dateCollected: timestamp("date_collected", { withTimezone: true, mode: 'string' }),
	relevanceScore: integer("relevance_score").default(0),
	filePath: varchar("file_path", { length: 1000 }),
	fileType: varchar("file_type", { length: 100 }),
	fileSize: integer("file_size"),
	aiSummary: text("ai_summary"),
	aiTags: jsonb("ai_tags"),
	keyEntities: jsonb("key_entities"),
	status: varchar({ length: 50 }).default('active').notNull(),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_yorha_evidence_nodes_ai_tags_gin").using("gin", table.aiTags.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_yorha_evidence_nodes_entities_gin").using("gin", table.keyEntities.asc().nullsLast().op("jsonb_path_ops")),
	index("yorha_evidence_nodes_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("yorha_evidence_nodes_created_by_idx").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("yorha_evidence_nodes_type_idx").using("btree", table.evidenceType.asc().nullsLast().op("text_ops")),
]);

export const yorhaSystemMetrics = pgTable("yorha_system_metrics", {
	id: serial().primaryKey().notNull(),
	cpuUsage: integer("cpu_usage"),
	cpuCores: integer("cpu_cores"),
	memoryUsage: integer("memory_usage"),
	memoryTotalGb: integer("memory_total_gb"),
	memoryUsedGb: integer("memory_used_gb"),
	gpuUsage: integer("gpu_usage"),
	gpuMemoryUsage: integer("gpu_memory_usage"),
	gpuTemperature: integer("gpu_temperature"),
	diskUsage: integer("disk_usage"),
	diskTotalGb: integer("disk_total_gb"),
	diskUsedGb: integer("disk_used_gb"),
	networkLatencyMs: integer("network_latency_ms"),
	networkBandwidthMbps: integer("network_bandwidth_mbps"),
	systemHealth: varchar("system_health", { length: 50 }).default('healthy'),
	activeCases: integer("active_cases").default(0),
	activeSessions: integer("active_sessions").default(0),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("yorha_system_metrics_recorded_at_idx").using("btree", table.recordedAt.asc().nullsLast().op("timestamptz_ops")),
]);

export const yorhaChatSessions = pgTable("yorha_chat_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	userId: uuid("user_id").notNull(),
	title: varchar({ length: 500 }),
	contextType: varchar("context_type", { length: 100 }),
	contextId: uuid("context_id"),
	status: varchar({ length: 50 }).default('active').notNull(),
	messageCount: integer("message_count").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_yorha_chat_sessions_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_yorha_chat_sessions_updated_at").using("btree", table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_yorha_chat_sessions_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("yorha_chat_sessions_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("yorha_chat_sessions_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("yorha_chat_sessions_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
]);

export const errorFeedback = pgTable("error_feedback", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	suggestionId: uuid("suggestion_id").notNull(),
	routePath: varchar("route_path", { length: 255 }).notNull(),
	helpful: boolean(),
	accurate: boolean(),
	worksSoon: boolean("works_soon"),
	feedback: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_error_feedback_route").using("btree", table.routePath.asc().nullsLast().op("text_ops")),
	index("idx_error_feedback_suggestion").using("btree", table.suggestionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.suggestionId],
			foreignColumns: [errorSuggestions.id],
			name: "error_feedback_suggestion_id_fkey"
		}),
]);

export const workspaceCitations = pgTable("workspace_citations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	messageId: uuid("message_id"),
	citationText: text("citation_text").notNull(),
	citationUrl: text("citation_url"),
	citationType: varchar("citation_type", { length: 50 }).default('statute'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workspace_citations_message_id_idx").using("btree", table.messageId.asc().nullsLast().op("uuid_ops")),
	index("workspace_citations_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_citations_workspace_id_fkey"
		}).onDelete("cascade"),
]);

export const poiPhotos = pgTable("poi_photos", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	poiId: uuid("poi_id").notNull(),
	minioKey: text("minio_key").notNull(),
	thumbnailKey: text("thumbnail_key"),
	url: text().notNull(),
	thumbnailUrl: text("thumbnail_url"),
	originalName: text("original_name").notNull(),
	mimeType: text("mime_type").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	size: bigint({ mode: "number" }).notNull(),
	aiCaption: text("ai_caption"),
	aiTags: jsonb("ai_tags").default([]),
	exifData: jsonb("exif_data"),
	forensicData: jsonb("forensic_data"),
	faceEmbedding: vector("face_embedding", { dimensions: 768 }),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_poi_photos_ai_tags_gin").using("gin", table.aiTags.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_poi_photos_face_embedding_hnsw").using("hnsw", table.faceEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("idx_poi_photos_forensic_data_gin").using("gin", table.forensicData.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_poi_photos_poi_id").using("btree", table.poiId.asc().nullsLast().op("uuid_ops")),
	index("idx_poi_photos_uploaded_at").using("btree", table.uploadedAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.poiId],
			foreignColumns: [personsOfInterest.id],
			name: "poi_photos_poi_id_fkey"
		}).onDelete("cascade"),
]);

export const chatEmbeddings = pgTable("chat_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ragMessageId: uuid("rag_message_id").notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
	model: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("chat_embeddings_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("idx_chat_embeddings_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
]);

export const jurisdictions = pgTable("jurisdictions", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	code: text().notNull(),
	name: text().notNull(),
	level: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	parentId: bigint("parent_id", { mode: "number" }),
}, (table) => [
	unique("jurisdictions_code_key").on(table.code),
]);

export const libraryDocumentVersions = pgTable("library_document_versions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	versionLabel: text("version_label"),
	sourceDate: date("source_date"),
	isCurrent: boolean("is_current").default(false),
	parentVersionId: uuid("parent_version_id"),
	diffSummary: text("diff_summary"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [libraryDocuments.id],
			name: "library_document_versions_document_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.parentVersionId],
			foreignColumns: [table.id],
			name: "library_document_versions_parent_version_id_fkey"
		}),
]);

export const legalChunks = pgTable("legal_chunks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	legalNodeId: uuid("legal_node_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	chunkText: text("chunk_text").notNull(),
	tokenCount: integer("token_count"),
	pageStart: integer("page_start"),
	pageEnd: integer("page_end"),
	charStart: integer("char_start"),
	charEnd: integer("char_end"),
	embedding: vector({ dimensions: 768 }),
	// TODO: failed to parse database type 'tsvector'
	tsv: unknown("tsv"),
	summary: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	qdrantPointId: text("qdrant_point_id"),
}, (table) => [
	index("idx_legal_chunks_qdrant").using("btree", table.qdrantPointId.asc().nullsLast().op("text_ops")).where(sql`(qdrant_point_id IS NOT NULL)`),
	index("legal_chunks_embed_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("legal_chunks_node_idx").using("btree", table.legalNodeId.asc().nullsLast().op("uuid_ops")),
	index("legal_chunks_tsv_idx").using("gin", table.tsv.asc().nullsLast().op("tsvector_ops")),
	foreignKey({
			columns: [table.legalNodeId],
			foreignColumns: [legalNodes.id],
			name: "legal_chunks_legal_node_id_fkey"
		}).onDelete("cascade"),
	unique("legal_chunks_legal_node_id_chunk_index_key").on(table.legalNodeId, table.chunkIndex),
]);

export const legalDefinitions = pgTable("legal_definitions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	term: text().notNull(),
	normalizedTerm: text("normalized_term").notNull(),
	definedInNodeId: uuid("defined_in_node_id").notNull(),
	definitionText: text("definition_text").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("legal_defs_term_idx").using("btree", table.normalizedTerm.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.definedInNodeId],
			foreignColumns: [legalNodes.id],
			name: "legal_definitions_defined_in_node_id_fkey"
		}).onDelete("cascade"),
]);

export const pageArtifacts = pgTable("page_artifacts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	pageNumber: integer("page_number").notNull(),
	imageMinioKey: text("image_minio_key"),
	extractedText: text("extracted_text"),
	ocrText: text("ocr_text"),
	finalText: text("final_text"),
	hasNativeText: boolean("has_native_text").default(false),
	ocrConfidence: numeric("ocr_confidence", { precision: 5, scale:  4 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("page_artifacts_doc_idx").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [libraryDocuments.id],
			name: "page_artifacts_document_id_fkey"
		}).onDelete("cascade"),
	unique("page_artifacts_document_id_page_number_key").on(table.documentId, table.pageNumber),
]);

export const ingestionJobs = pgTable("ingestion_jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	stage: processingStatus().default('queued').notNull(),
	status: text().default('running').notNull(),
	progress: numeric({ precision: 5, scale:  2 }).default('0'),
	errorText: text("error_text"),
	metricsJson: jsonb("metrics_json").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ingestion_jobs_doc_idx").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("ingestion_jobs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [libraryDocuments.id],
			name: "ingestion_jobs_document_id_fkey"
		}).onDelete("cascade"),
]);

export const libraryDocuments = pgTable("library_documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceType: sourceType("source_type").default('upload').notNull(),
	corpusType: corpusType("corpus_type").default('other').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	jurisdictionId: bigint("jurisdiction_id", { mode: "number" }),
	title: text().notNull(),
	shortTitle: text("short_title"),
	citation: text(),
	officialUrl: text("official_url"),
	sourceHash: text("source_hash"),
	mimeType: text("mime_type").default('application/pdf'),
	minioKey: text("minio_key").notNull(),
	pageCount: integer("page_count"),
	effectiveDate: date("effective_date"),
	updatedAtSource: timestamp("updated_at_source", { withTimezone: true, mode: 'string' }),
	isOfficial: boolean("is_official").default(false),
	processingStatus: processingStatus("processing_status").default('queued').notNull(),
	uploadedBy: uuid("uploaded_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sourceConfidence: text("source_confidence").default('medium'),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'string' }),
	minioKeyNormalized: text("minio_key_normalized"),
	sourceKind: text("source_kind").default('uploaded_pdf'),
}, (table) => [
	index("library_docs_corpus_idx").using("btree", table.corpusType.asc().nullsLast().op("enum_ops")),
	index("library_docs_jurisdiction_idx").using("btree", table.jurisdictionId.asc().nullsLast().op("int8_ops")),
	uniqueIndex("library_docs_source_hash_uidx").using("btree", table.sourceHash.asc().nullsLast().op("text_ops")).where(sql`(source_hash IS NOT NULL)`),
	index("library_docs_status_idx").using("btree", table.processingStatus.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.jurisdictionId],
			foreignColumns: [jurisdictions.id],
			name: "library_documents_jurisdiction_id_fkey"
		}),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [users.id],
			name: "library_documents_uploaded_by_fkey"
		}).onDelete("set null"),
	check("library_documents_source_confidence_check", sql`source_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])`),
	check("library_documents_source_kind_check", sql`source_kind = ANY (ARRAY['official_state'::text, 'lii_indexed'::text, 'uploaded_pdf'::text, 'scraped'::text, 'api'::text])`),
]);

export const legalNodes = pgTable("legal_nodes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	versionId: uuid("version_id"),
	parentNodeId: uuid("parent_node_id"),
	nodeType: legalNodeType("node_type").default('section').notNull(),
	ordinal: text(),
	heading: text(),
	citationLabel: text("citation_label"),
	nodePath: text("node_path").notNull(),
	depth: integer().default(0).notNull(),
	pageStart: integer("page_start"),
	pageEnd: integer("page_end"),
	charStart: integer("char_start"),
	charEnd: integer("char_end"),
	fullText: text("full_text").notNull(),
	textClean: text("text_clean").notNull(),
	// TODO: failed to parse database type 'tsvector'
	tsv: unknown("tsv"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tagsJson: jsonb("tags_json").default({}),
}, (table) => [
	index("idx_legal_nodes_tags").using("gin", table.tagsJson.asc().nullsLast().op("jsonb_ops")),
	index("legal_nodes_doc_idx").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("legal_nodes_parent_idx").using("btree", table.parentNodeId.asc().nullsLast().op("uuid_ops")),
	index("legal_nodes_path_idx").using("btree", table.documentId.asc().nullsLast().op("uuid_ops"), table.nodePath.asc().nullsLast().op("text_ops")),
	index("legal_nodes_tsv_idx").using("gin", table.tsv.asc().nullsLast().op("tsvector_ops")),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [libraryDocuments.id],
			name: "legal_nodes_document_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.versionId],
			foreignColumns: [libraryDocumentVersions.id],
			name: "legal_nodes_version_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.parentNodeId],
			foreignColumns: [table.id],
			name: "legal_nodes_parent_node_id_fkey"
		}).onDelete("cascade"),
]);

export const stateConstitutionSources = pgTable("state_constitution_sources", {
	id: serial().primaryKey().notNull(),
	stateCode: char("state_code", { length: 2 }).notNull(),
	stateName: text("state_name").notNull(),
	discoveryUrl: text("discovery_url").notNull(),
	sourceUrl: text("source_url"),
	format: text().default('html'),
	isOfficial: boolean("is_official").default(false),
	sourceConfidence: text("source_confidence").default('medium'),
	crawlerType: text("crawler_type").default('html'),
	lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true, mode: 'string' }),
	lastHash: text("last_hash"),
	lastFetchStatus: text("last_fetch_status"),
	documentId: uuid("document_id"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_scs_document_id").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")).where(sql`(document_id IS NOT NULL)`),
	index("idx_scs_state_code").using("btree", table.stateCode.asc().nullsLast().op("bpchar_ops")),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [libraryDocuments.id],
			name: "state_constitution_sources_document_id_fkey"
		}),
	unique("state_constitution_sources_state_code_key").on(table.stateCode),
	check("state_constitution_sources_format_check", sql`format = ANY (ARRAY['html'::text, 'pdf'::text, 'xml'::text])`),
	check("state_constitution_sources_source_confidence_check", sql`source_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])`),
	check("state_constitution_sources_crawler_type_check", sql`crawler_type = ANY (ARRAY['html'::text, 'pdf'::text, 'api'::text])`),
]);

export const legalCitations = pgTable("legal_citations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fromNodeId: uuid("from_node_id").notNull(),
	toNodeId: uuid("to_node_id"),
	citationText: text("citation_text").notNull(),
	citationType: citationType("citation_type").default('other').notNull(),
	normalizedTarget: text("normalized_target"),
	confidence: real().default(1),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_legal_citations_from").using("btree", table.fromNodeId.asc().nullsLast().op("uuid_ops")),
	index("idx_legal_citations_target").using("btree", table.normalizedTarget.asc().nullsLast().op("text_ops")),
	index("idx_legal_citations_to").using("btree", table.toNodeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.fromNodeId],
			foreignColumns: [legalNodes.id],
			name: "legal_citations_from_node_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toNodeId],
			foreignColumns: [legalNodes.id],
			name: "legal_citations_to_node_id_fkey"
		}).onDelete("set null"),
]);

export const caseLibraryLinks = pgTable("case_library_links", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	documentId: uuid("document_id"),
	nodeId: uuid("node_id"),
	category: caseLinkCategory().default('cited_authority').notNull(),
	relevanceScore: real("relevance_score"),
	citationText: text("citation_text"),
	notes: text(),
	addedBy: uuid("added_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("case_lib_links_case_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("case_lib_links_doc_idx").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("case_lib_links_node_idx").using("btree", table.nodeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "case_library_links_case_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [libraryDocuments.id],
			name: "case_library_links_document_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.nodeId],
			foreignColumns: [legalNodes.id],
			name: "case_library_links_node_id_fkey"
		}).onDelete("set null"),
]);

export const evidenceChunks = pgTable("evidence_chunks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	content: text().notNull(),
	pageNumber: integer("page_number"),
	embedding: vector({ dimensions: 768 }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_evidence_chunks_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("idx_evidence_chunks_evidence_id").using("btree", table.evidenceId.asc().nullsLast().op("uuid_ops")),
	index("idx_evidence_chunks_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_path_ops")),
	foreignKey({
			columns: [table.evidenceId],
			foreignColumns: [evidence.id],
			name: "evidence_chunks_evidence_id_fkey"
		}).onDelete("cascade"),
	unique("evidence_chunks_evidence_id_chunk_index_key").on(table.evidenceId, table.chunkIndex),
]);

export const timelineEvents = pgTable("timeline_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	poiId: uuid("poi_id"),
	caseId: uuid("case_id"),
	title: varchar({ length: 500 }).notNull(),
	description: text(),
	eventDate: timestamp("event_date", { withTimezone: true, mode: 'string' }).notNull(),
	eventType: varchar("event_type", { length: 100 }).default('general'),
	location: varchar({ length: 500 }),
	severity: varchar({ length: 20 }).default('low'),
	metadata: jsonb(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_timeline_events_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_timeline_events_event_date").using("btree", table.eventDate.asc().nullsLast().op("timestamptz_ops")),
	index("idx_timeline_events_poi_id").using("btree", table.poiId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.poiId],
			foreignColumns: [personsOfInterest.id],
			name: "timeline_events_poi_id_fkey"
		}).onDelete("cascade"),
]);

export const codemodMemories = pgTable("codemod_memories", {
	id: uuid().primaryKey().notNull(),
	errorCode: text("error_code"),
	errorKey: text("error_key"),
	message: text(),
	occurrenceCount: integer("occurrence_count"),
	priority: text(),
	framework: text(),
	source: text(),
	tags: text().array(),
	content: text(),
	langextract: jsonb(),
	embedding: vector({ dimensions: 768 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const chatMetadata = pgTable("chat_metadata", {
	chatId: varchar("chat_id", { length: 255 }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	title: varchar({ length: 500 }),
	caseId: uuid("case_id"),
	messageCount: varchar("message_count", { length: 50 }).default('0'),
	lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: 'string' }),
	isArchived: varchar("is_archived", { length: 10 }).default('false'),
	tags: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_chat_metadata_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_chat_metadata_last_message").using("btree", table.lastMessageAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_chat_metadata_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "chat_metadata_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "chat_metadata_case_id_fkey"
		}).onDelete("set null"),
]);

export const chatMessages = pgTable("chat_messages", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	chatId: varchar("chat_id", { length: 255 }).notNull(),
	userId: uuid("user_id"),
	role: chatMessageRole().notNull(),
	content: text().notNull(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	migratedFrom: varchar("migrated_from", { length: 255 }),
	metadata: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	caseId: uuid("case_id"),
}, (table) => [
	index("idx_chat_messages_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_chat_messages_chat_id").using("btree", table.chatId.asc().nullsLast().op("text_ops")),
	index("idx_chat_messages_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_chat_messages_migrated_from").using("btree", table.migratedFrom.asc().nullsLast().op("text_ops")),
	index("idx_chat_messages_timestamp").using("btree", table.timestamp.asc().nullsLast().op("timestamptz_ops")),
	index("idx_chat_messages_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "chat_messages_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "chat_messages_case_id_fkey"
		}).onDelete("set null"),
]);

export const codebaseFiles = pgTable("codebase_files", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	filePath: text("file_path").notNull(),
	fileHash: varchar("file_hash", { length: 64 }).notNull(),
	language: varchar({ length: 50 }).notNull(),
	linesOfCode: integer("lines_of_code").notNull(),
	sizeBytes: integer("size_bytes").notNull(),
	domain: varchar({ length: 100 }),
	importanceScore: real("importance_score").default(0),
	communityId: integer("community_id"),
	indexedAt: timestamp("indexed_at", { mode: 'string' }).defaultNow(),
	lastModified: timestamp("last_modified", { mode: 'string' }),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_codebase_files_community").using("btree", table.communityId.asc().nullsLast().op("int4_ops")),
	index("idx_codebase_files_domain").using("btree", table.domain.asc().nullsLast().op("text_ops")),
	index("idx_codebase_files_importance").using("btree", table.importanceScore.desc().nullsFirst().op("float4_ops")),
	index("idx_codebase_files_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	unique("codebase_files_file_path_key").on(table.filePath),
]);

export const codebaseEmbeddings = pgTable("codebase_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fileId: uuid("file_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	chunkText: text("chunk_text").notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
	embeddingModel: varchar("embedding_model", { length: 100 }).default('embeddinggemma:latest'),
	tokens: integer(),
	gpuDevice: varchar("gpu_device", { length: 50 }),
	cudaTimeMs: real("cuda_time_ms"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_codebase_embeddings_file").using("btree", table.fileId.asc().nullsLast().op("uuid_ops")),
	index("idx_codebase_embeddings_hnsw").using("hnsw", sql`((embedding)::halfvec(768))`).with({m: "16",ef_construction: "64"}),
	foreignKey({
			columns: [table.fileId],
			foreignColumns: [codebaseFiles.id],
			name: "codebase_embeddings_file_id_fkey"
		}).onDelete("cascade"),
	unique("codebase_embeddings_file_id_chunk_index_key").on(table.fileId, table.chunkIndex),
]);

export const codebaseGraphAnalysis = pgTable("codebase_graph_analysis", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	analysisType: varchar("analysis_type", { length: 50 }).notNull(),
	runAt: timestamp("run_at", { mode: 'string' }).defaultNow(),
	config: jsonb().notNull(),
	timing: jsonb().notNull(),
	gpuInfo: jsonb("gpu_info").notNull(),
	results: jsonb().notNull(),
	healthScore: integer("health_score"),
}, (table) => [
	index("idx_graph_analysis_results_gin").using("gin", table.results.asc().nullsLast().op("jsonb_ops")),
]);

export const codebaseSearchCache = pgTable("codebase_search_cache", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	queryHash: varchar("query_hash", { length: 64 }).notNull(),
	queryText: text("query_text").notNull(),
	queryEmbedding: vector("query_embedding", { dimensions: 768 }).notNull(),
	results: jsonb().notNull(),
	resultCount: integer("result_count").notNull(),
	gpuTimeMs: real("gpu_time_ms"),
	cachedAt: timestamp("cached_at", { mode: 'string' }).defaultNow(),
	lastAccessed: timestamp("last_accessed", { mode: 'string' }).defaultNow(),
	hitCount: integer("hit_count").default(1),
}, (table) => [
	index("idx_search_cache_accessed").using("btree", table.lastAccessed.desc().nullsFirst().op("timestamp_ops")),
	unique("codebase_search_cache_query_hash_key").on(table.queryHash),
]);

export const agentMemoryObservations = pgTable("agent_memory_observations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	source: varchar({ length: 100 }).default('claude-mem').notNull(),
	ide: varchar({ length: 50 }).default('opencode'),
	sessionId: text("session_id"),
	observationId: text("observation_id"),
	projectPath: text("project_path"),
	summary: text().notNull(),
	tags: jsonb().default([]),
	sourceRefs: jsonb("source_refs").default([]),
	toolCalls: jsonb("tool_calls").default([]),
	rawJson: jsonb("raw_json").default({}),
	embedding: vector("embedding", { dimensions: 768 }),
	embeddingModel: varchar("embedding_model", { length: 100 }).default('embeddinggemma:latest'),
	embeddingDim: integer("embedding_dim").default(768),
	qdrantPointId: text("qdrant_point_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("agent_memory_observations_session_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	index("agent_memory_observations_observation_idx").using("btree", table.observationId.asc().nullsLast().op("text_ops")),
	index("agent_memory_observations_qdrant_idx").using("btree", table.qdrantPointId.asc().nullsLast().op("text_ops")),
	index("agent_memory_observations_created_idx").using("btree", table.createdAt.desc().nullsLast().op("timestamptz_ops")),
]);

export const codebaseWikiPages = pgTable("codebase_wiki_pages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: varchar({ length: 200 }).notNull(),
	title: text().notNull(),
	summary: text(),
	content: text().notNull(),
	relatedFiles: uuid("related_files").array().default(["RAY"]),
	tags: text().array().default(["RAY"]),
	category: varchar({ length: 100 }),
	pagerankScore: real("pagerank_score").default(0),
	viewCount: integer("view_count").default(0),
	generatedAt: timestamp("generated_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_wiki_pages_category").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("idx_wiki_pages_fts").using("gin", sql`to_tsvector('english'::regconfig, ((((title || ' '::text) || su`),
	index("idx_wiki_pages_pagerank").using("btree", table.pagerankScore.desc().nullsFirst().op("float4_ops")),
	unique("codebase_wiki_pages_slug_key").on(table.slug),
]);

export const mapreduceReduceResults = pgTable("mapreduce_reduce_results", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	reduceKey: varchar("reduce_key", { length: 200 }).notNull(),
	aggregationType: varchar("aggregation_type", { length: 50 }).notNull(),
	result: jsonb().notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [codebaseMapreduceJobs.id],
			name: "mapreduce_reduce_results_job_id_fkey"
		}).onDelete("cascade"),
]);

export const gpuPerformanceMetrics = pgTable("gpu_performance_metrics", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	timestamp: timestamp({ mode: 'string' }).defaultNow(),
	gpuDevice: varchar("gpu_device", { length: 50 }).notNull(),
	operation: varchar({ length: 50 }).notNull(),
	batchSize: integer("batch_size").notNull(),
	inputSize: integer("input_size").notNull(),
	durationMs: real("duration_ms").notNull(),
	vramUsedMb: integer("vram_used_mb"),
	gpuUtilizationPct: integer("gpu_utilization_pct"),
	temperatureCelsius: integer("temperature_celsius"),
	fp16Mode: boolean("fp16_mode").default(false),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_gpu_metrics_timestamp").using("btree", table.timestamp.desc().nullsFirst().op("timestamp_ops")),
]);

export const codebaseMapreduceJobs = pgTable("codebase_mapreduce_jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobType: varchar("job_type", { length: 50 }).notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	totalFiles: integer("total_files").notNull(),
	processedFiles: integer("processed_files").default(0),
	batchSize: integer("batch_size").notNull(),
	concurrency: integer().notNull(),
	gpuDevice: varchar("gpu_device", { length: 50 }),
	startedAt: timestamp("started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	errorMessage: text("error_message"),
	results: jsonb(),
	metrics: jsonb().default({}),
	filePatterns: text("file_patterns").array(),
}, (table) => [
	index("idx_mapreduce_jobs_metrics_gin").using("gin", table.metrics.asc().nullsLast().op("jsonb_ops")),
]);

export const apiAuditLog = pgTable("api_audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	endpoint: text().notNull(),
	method: text().notNull(),
	statusCode: integer("status_code").notNull(),
	requestBody: jsonb("request_body"),
	responseBody: jsonb("response_body"),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	durationMs: integer("duration_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_api_audit_log_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_api_audit_log_endpoint").using("btree", table.endpoint.asc().nullsLast().op("text_ops")),
	index("idx_api_audit_log_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "api_audit_log_user_id_fkey"
		}).onDelete("set null"),
]);

export const poiProfiles = pgTable("poi_profiles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	name: text().notNull(),
	aliases: text().array(),
	dateOfBirth: date("date_of_birth"),
	description: text(),
	role: text(),
	riskLevel: text("risk_level"),
	contactInfo: jsonb("contact_info").default({}),
	physicalDescription: jsonb("physical_description").default({}),
	knownAssociates: text("known_associates").array(),
	timelineEvents: jsonb("timeline_events").default([]),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_poi_profiles_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_poi_profiles_name").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("idx_poi_profiles_role").using("btree", table.role.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "poi_profiles_case_id_fkey"
		}).onDelete("cascade"),
]);

export const mapreduceMapQueue = pgTable("mapreduce_map_queue", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	filePath: text("file_path").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	chunkText: text("chunk_text").notNull(),
	status: varchar({ length: 20 }).default('pending'),
	workerId: varchar("worker_id", { length: 100 }),
	retryCount: integer("retry_count").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	processedAt: timestamp("processed_at", { mode: 'string' }),
	language: varchar({ length: 50 }),
	domain: varchar({ length: 100 }),
}, (table) => [
	index("idx_mapreduce_queue_status").using("btree", table.status.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [codebaseMapreduceJobs.id],
			name: "mapreduce_map_queue_job_id_fkey"
		}).onDelete("cascade"),
]);

export const chatTurnEvidence = pgTable("chat_turn_evidence", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	chatTurnId: uuid("chat_turn_id"),
	evidenceId: uuid("evidence_id"),
	relevanceScore: real("relevance_score").default(0.5),
	snippet: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_chat_turn_evidence_evidence_id").using("btree", table.evidenceId.asc().nullsLast().op("uuid_ops")),
	index("idx_chat_turn_evidence_turn_id").using("btree", table.chatTurnId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.evidenceId],
			foreignColumns: [evidence.id],
			name: "chat_turn_evidence_evidence_id_fkey"
		}).onDelete("cascade"),
]);

export const aceChunks = pgTable("ace_chunks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	content: text().notNull(),
	chunkType: text("chunk_type"),
	sourceDocumentId: uuid("source_document_id"),
	chunkIndex: integer("chunk_index"),
	metadata: jsonb().default({}),
	embedding: vector({ dimensions: 768 }),
	qualityScore: real("quality_score").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	contentHash: text("content_hash"),
	embeddingModel: text("embedding_model"),
	pipelineVersion: text("pipeline_version"),
}, (table) => [
	index("idx_ace_chunks_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_ace_chunks_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_ace_chunks_embedding_hnsw").using("hnsw", sql`((embedding)::halfvec(768))`),
	index("idx_ace_chunks_pipeline_version").using("btree", table.pipelineVersion.asc().nullsLast().op("text_ops")),
	index("idx_ace_chunks_read_path").using("btree", table.caseId.asc().nullsLast().op("float4_ops"), table.pipelineVersion.asc().nullsLast().op("text_ops"), table.qualityScore.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("idx_ace_chunks_type").using("btree", table.chunkType.asc().nullsLast().op("text_ops")),
	uniqueIndex("uq_ace_chunks_case_hash_type").using("btree", table.caseId.asc().nullsLast().op("text_ops"), table.contentHash.asc().nullsLast().op("text_ops"), table.chunkType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "ace_chunks_case_id_fkey"
		}).onDelete("cascade"),
]);

export const personsOfInterest = pgTable("persons_of_interest", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	aliases: text().array(),
	description: text().default('),
	threatLevel: varchar("threat_level").default('low').notNull(),
	status: varchar().default('surveillance').notNull(),
	relationship: text(),
	aiProfile: jsonb("ai_profile"),
	who: jsonb(),
	what: jsonb(),
	why: jsonb(),
	how: jsonb(),
	risk: jsonb(),
	confidence: real(),
	modelVersion: text("model_version"),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }),
	lastUpdated: timestamp("last_updated", { withTimezone: true, mode: 'string' }),
	caseIds: text("case_ids").array(),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	crimes: text().array().default([""]),
	caseId: uuid("case_id"),
	profileData: jsonb("profile_data").default({}),
	tags: jsonb().default([]),
	position: jsonb().default({}),
	photoUrl: text("photo_url"),
	notes: text(),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_poi_ai_profile_gin").using("gin", table.aiProfile.asc().nullsLast().op("jsonb_path_ops")),
]);

export const chatDocumentAttachments = pgTable("chat_document_attachments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	chatSessionId: uuid("chat_session_id").notNull(),
	documentId: uuid("document_id"),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	fileSize: integer("file_size").notNull(),
	fileType: varchar("file_type", { length: 100 }),
	minioPath: varchar("minio_path", { length: 500 }),
	uploadTimestamp: timestamp("upload_timestamp", { withTimezone: true, mode: 'string' }).defaultNow(),
	embeddingStatus: varchar("embedding_status", { length: 50 }).default('pending'),
	qdrantId: uuid("qdrant_id"),
	metadata: jsonb().default({}),
}, (table) => [
	index("chat_attachments_document_idx").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("chat_attachments_session_idx").using("btree", table.chatSessionId.asc().nullsLast().op("uuid_ops")),
	index("chat_attachments_status_idx").using("btree", table.embeddingStatus.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.chatSessionId],
			foreignColumns: [yorhaChatSessions.id],
			name: "chat_document_attachments_chat_session_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "chat_document_attachments_document_id_fkey"
		}).onDelete("set null"),
]);

export const routeMetadata = pgTable("route_metadata", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routeId: varchar("route_id", { length: 255 }).notNull(),
	path: varchar({ length: 255 }).notNull(),
	kind: varchar({ length: 50 }).notNull(),
	group: varchar({ length: 100 }),
	status: varchar({ length: 50 }).default('healthy'),
	priority: integer().default(50),
	badges: jsonb().default([]),
	description: text(),
	tags: jsonb().default([]),
	metadata: jsonb().default({}),
	lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true, mode: 'string' }),
	accessCount: integer("access_count").default(0),
	errorCount: integer("error_count").default(0),
	healthScore: integer("health_score").default(100),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_route_metadata_archived_at").using("btree", table.archivedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_route_metadata_error_count").using("btree", table.errorCount.asc().nullsLast().op("int4_ops")),
	index("idx_route_metadata_health_score").using("btree", table.healthScore.asc().nullsLast().op("int4_ops")),
	index("idx_route_metadata_last_accessed_at").using("btree", table.lastAccessedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_route_metadata_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_route_metadata_route_id").using("btree", table.routeId.asc().nullsLast().op("text_ops")),
	index("idx_route_metadata_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_route_metadata_tags").using("gin", table.tags.asc().nullsLast().op("jsonb_ops")),
	unique("route_metadata_route_id_key").on(table.routeId),
]);

export const errorCluster = pgTable("error_cluster", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routeId: varchar("route_id", { length: 255 }).notNull(),
	tool: varchar({ length: 100 }).notNull(),
	code: varchar({ length: 100 }).notNull(),
	message: text().notNull(),
	severity: varchar({ length: 50 }).notNull(),
	count: integer().default(1).notNull(),
	filePath: varchar("file_path", { length: 255 }),
	rawLogSnippet: text("raw_log_snippet"),
	title: varchar({ length: 255 }),
	clusterId: varchar("cluster_id", { length: 255 }),
	errorCode: varchar("error_code", { length: 100 }),
	category: varchar({ length: 100 }),
	affectedRoutes: jsonb("affected_routes").default([]),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_error_cluster_category").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("idx_error_cluster_cluster_id").using("btree", table.clusterId.asc().nullsLast().op("text_ops")),
	index("idx_error_cluster_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_error_cluster_error_code").using("btree", table.errorCode.asc().nullsLast().op("text_ops")),
	index("idx_error_cluster_first_seen_at").using("btree", table.firstSeenAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_error_cluster_last_seen_at").using("btree", table.lastSeenAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_error_cluster_resolved_at").using("btree", table.resolvedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_error_cluster_route_id").using("btree", table.routeId.asc().nullsLast().op("text_ops")),
	index("idx_error_cluster_severity").using("btree", table.severity.asc().nullsLast().op("text_ops")),
	index("idx_error_cluster_tool").using("btree", table.tool.asc().nullsLast().op("text_ops")),
	index("idx_error_cluster_updated_at").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.routeId],
			foreignColumns: [routeMetadata.routeId],
			name: "error_cluster_route_id_fkey"
		}).onDelete("cascade"),
]);

export const routeInteractionLog = pgTable("route_interaction_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routeId: varchar("route_id", { length: 255 }).notNull(),
	userId: varchar("user_id", { length: 255 }),
	interactionType: varchar("interaction_type", { length: 50 }).notNull(),
	metadata: jsonb(),
	sessionId: varchar("session_id", { length: 255 }),
	durationMs: integer("duration_ms"),
	success: boolean().default(true),
	errorMessage: text("error_message"),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_route_interaction_log_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_route_interaction_log_ip_address").using("btree", table.ipAddress.asc().nullsLast().op("text_ops")),
	index("idx_route_interaction_log_route_id").using("btree", table.routeId.asc().nullsLast().op("text_ops")),
	index("idx_route_interaction_log_session_id").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	index("idx_route_interaction_log_success").using("btree", table.success.asc().nullsLast().op("bool_ops")),
	index("idx_route_interaction_log_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.routeId],
			foreignColumns: [routeMetadata.routeId],
			name: "route_interaction_log_route_id_fkey"
		}).onDelete("cascade"),
]);

export const routeHealthEvent = pgTable("route_health_event", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routeId: varchar("route_id", { length: 255 }).notNull(),
	oldStatus: varchar("old_status", { length: 50 }),
	newStatus: varchar("new_status", { length: 50 }).notNull(),
	reason: varchar({ length: 255 }),
	metadata: jsonb().default({}),
	triggeredBy: varchar("triggered_by", { length: 255 }),
	errorCount: integer("error_count").default(0),
	healthScore: integer("health_score"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_route_health_event_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_route_health_event_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_route_health_event_route_id").using("btree", table.routeId.asc().nullsLast().op("text_ops")),
	index("idx_route_health_event_triggered_by").using("btree", table.triggeredBy.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.routeId],
			foreignColumns: [routeMetadata.routeId],
			name: "route_health_event_route_id_fkey"
		}).onDelete("cascade"),
]);

export const errorBrainAnalysis = pgTable("error_brain_analysis", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routeId: varchar("route_id", { length: 255 }).notNull(),
	suggestions: jsonb().notNull(),
	selectedSuggestionIndex: integer("selected_suggestion_index"),
	phase: varchar({ length: 50 }),
	errorMessage: text("error_message"),
	status: varchar({ length: 50 }).default('pending'),
	modelVersion: varchar("model_version", { length: 100 }),
	confidenceScore: numeric("confidence_score", { precision: 5, scale:  2 }),
	executionTimeMs: integer("execution_time_ms"),
	metadata: jsonb().default({}),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_error_brain_analysis_confidence_score").using("btree", table.confidenceScore.asc().nullsLast().op("numeric_ops")),
	index("idx_error_brain_analysis_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_error_brain_analysis_model_version").using("btree", table.modelVersion.asc().nullsLast().op("text_ops")),
	index("idx_error_brain_analysis_route_id").using("btree", table.routeId.asc().nullsLast().op("text_ops")),
	index("idx_error_brain_analysis_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_error_brain_analysis_updated_at").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.routeId],
			foreignColumns: [routeMetadata.routeId],
			name: "error_brain_analysis_route_id_fkey"
		}).onDelete("cascade"),
]);

export const errorBrainPatch = pgTable("error_brain_patch", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	analysisId: uuid("analysis_id").notNull(),
	routeId: varchar("route_id", { length: 255 }).notNull(),
	patchContent: text("patch_content").notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }),
	verificationStatus: varchar("verification_status", { length: 50 }),
	verificationTimestamp: timestamp("verification_timestamp", { withTimezone: true, mode: 'string' }),
	verificationMessage: text("verification_message"),
	patchType: varchar("patch_type", { length: 50 }).default('code_fix'),
	filePath: varchar("file_path", { length: 500 }),
	lineStart: integer("line_start"),
	lineEnd: integer("line_end"),
	confidenceScore: numeric("confidence_score", { precision: 5, scale:  2 }),
	metadata: jsonb().default({}),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_error_brain_patch_analysis_id").using("btree", table.analysisId.asc().nullsLast().op("uuid_ops")),
	index("idx_error_brain_patch_confidence_score").using("btree", table.confidenceScore.asc().nullsLast().op("numeric_ops")),
	index("idx_error_brain_patch_file_path").using("btree", table.filePath.asc().nullsLast().op("text_ops")),
	index("idx_error_brain_patch_patch_type").using("btree", table.patchType.asc().nullsLast().op("text_ops")),
	index("idx_error_brain_patch_route_id").using("btree", table.routeId.asc().nullsLast().op("text_ops")),
	index("idx_error_brain_patch_updated_at").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_error_brain_patch_verification_status").using("btree", table.verificationStatus.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.analysisId],
			foreignColumns: [errorBrainAnalysis.id],
			name: "error_brain_patch_analysis_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.routeId],
			foreignColumns: [routeMetadata.routeId],
			name: "error_brain_patch_route_id_fkey"
		}).onDelete("cascade"),
]);

export const analyticsEvents = pgTable("analytics_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eventType: varchar("event_type", { length: 100 }).notNull(),
	userId: uuid("user_id"),
	sessionId: varchar("session_id", { length: 255 }),
	payload: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("analytics_events_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("analytics_events_event_type_idx").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("analytics_events_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "analytics_events_user_id_fkey"
		}).onDelete("set null"),
]);

export const chunkHitLog = pgTable("chunk_hit_log", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	chunkId: text("chunk_id").notNull(),
	relativePath: text("relative_path").default(').notNull(),
	gpuCluster: integer("gpu_cluster"),
	somCluster: integer("som_cluster"),
	pipeline: text().notNull(),
	queryHash: varchar("query_hash", { length: 16 }).notNull(),
	score: real(),
	rerankScore: real("rerank_score"),
	userId: uuid("user_id"),
	caseId: uuid("case_id"),
	hitAt: timestamp("hit_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("chunk_hit_pipeline_cluster_idx").using("btree", table.pipeline.asc().nullsLast().op("int4_ops"), table.gpuCluster.asc().nullsLast().op("int4_ops"), table.hitAt.desc().nullsFirst().op("int4_ops")),
	index("chunk_hit_query_hash_idx").using("btree", table.queryHash.asc().nullsLast().op("text_ops"), table.hitAt.desc().nullsFirst().op("text_ops")),
	index("idx_chunk_hit_log_analytics").using("btree", table.hitAt.desc().nullsFirst().op("int4_ops"), table.pipeline.asc().nullsLast().op("int4_ops"), table.gpuCluster.asc().nullsLast().op("int4_ops"), table.chunkId.asc().nullsLast().op("int4_ops"), table.queryHash.asc().nullsLast().op("int4_ops"), table.rerankScore.asc().nullsLast().op("int4_ops"), table.score.asc().nullsLast().op("int4_ops"), table.relativePath.asc().nullsLast().op("int4_ops")),
]);

export const queryVariancePairs = pgTable("query_variance_pairs", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	queryHashA: varchar("query_hash_a", { length: 16 }).notNull(),
	queryHashB: varchar("query_hash_b", { length: 16 }).notNull(),
	queryA: text("query_a").notNull(),
	queryB: text("query_b").notNull(),
	similarity: real().notNull(),
	hitCount: integer("hit_count").default(1).notNull(),
	pipeline: text(),
	lastSeen: timestamp("last_seen", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_qvp_query_a_trgm").using("gist", table.queryA.asc().nullsLast().op("gist_trgm_ops")),
	index("idx_qvp_query_b_trgm").using("gist", table.queryB.asc().nullsLast().op("gist_trgm_ops")),
	index("query_variance_pairs_a_idx").using("btree", table.queryHashA.asc().nullsLast().op("text_ops")),
	uniqueIndex("query_variance_pairs_pair_idx").using("btree", sql`LEAST(query_hash_a, query_hash_b)`, sql`GREATEST(query_hash_a, query_hash_b)`),
]);

export const ragQueryLog = pgTable("rag_query_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	caseId: uuid("case_id"),
	query: text().notNull(),
	queryHash: varchar("query_hash", { length: 16 }).notNull(),
	entityStatutes: jsonb("entity_statutes").default([]).notNull(),
	entityCases: jsonb("entity_cases").default([]).notNull(),
	totalEntityTags: integer("total_entity_tags").default(0).notNull(),
	totalFound: integer("total_found").default(0).notNull(),
	searchTimeMs: integer("search_time_ms"),
	rerankTimeMs: integer("rerank_time_ms"),
	rerankL0Hit: boolean("rerank_l0_hit").default(false).notNull(),
	rerankL1Hits: integer("rerank_l1_hits").default(0).notNull(),
	rerankFreshScored: integer("rerank_fresh_scored").default(0).notNull(),
	topChunkId: varchar("top_chunk_id", { length: 255 }),
	topChunkScore: real("top_chunk_score"),
	topRerankScore: real("top_rerank_score"),
	dagEnabled: boolean("dag_enabled").default(true).notNull(),
	dagStatus: varchar("dag_status", { length: 20 }),
	hybridSearch: boolean("hybrid_search").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("rag_query_log_hash_idx").using("btree", table.queryHash.asc().nullsLast().op("text_ops")),
	index("rag_query_log_user_created_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
]);

export const responseFeedback = pgTable("response_feedback", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	queryHash: text("query_hash").notNull(),
	userId: uuid("user_id"),
	rating: varchar({ length: 4 }).notNull(),
	pipeline: text(),
	chunkIds: text("chunk_ids").array(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("response_feedback_hash_idx").using("btree", table.queryHash.asc().nullsLast().op("text_ops")),
	uniqueIndex("response_feedback_hash_user_idx").using("btree", table.queryHash.asc().nullsLast().op("text_ops"), table.userId.asc().nullsLast().op("uuid_ops")),
	index("response_feedback_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
]);

export const qloraExamples = pgTable("qlora_examples", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	queryHash: varchar("query_hash", { length: 16 }).notNull(),
	instruction: text().notNull(),
	contextChunks: jsonb("context_chunks").default([]).notNull(),
	graphSummary: text("graph_summary"),
	response: text().notNull(),
	qualityTier: varchar("quality_tier", { length: 20 }),
	responseScore: real("response_score"),
	avgRerankScore: real("avg_rerank_score"),
	gpuClusters: jsonb("gpu_clusters").default([]).notNull(),
	pipelineHits: jsonb("pipeline_hits").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	query: text(),
	entityTags: jsonb("entity_tags").default([]).notNull(),
	modelVersion: varchar("model_version", { length: 50 }),
	datasetSplit: varchar("dataset_split", { length: 10 }),
}, (table) => [
	index("qlora_examples_created_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("qlora_examples_quality_idx").using("btree", table.qualityTier.asc().nullsLast().op("float4_ops"), table.responseScore.asc().nullsLast().op("text_ops")),
	index("qlora_examples_query_hash_idx").using("btree", table.queryHash.asc().nullsLast().op("text_ops")),
]);

export const collectionCitations = pgTable("collection_citations", {
	collectionId: uuid("collection_id").notNull(),
	citationId: uuid("citation_id").notNull(),
	addedAt: timestamp("added_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("collection_citations_citation_id_idx").using("btree", table.citationId.asc().nullsLast().op("uuid_ops")),
	index("collection_citations_collection_id_idx").using("btree", table.collectionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.citationId],
			foreignColumns: [citations.id],
			name: "collection_citations_citation_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.collectionId],
			foreignColumns: [citationCollections.id],
			name: "collection_citations_collection_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.collectionId, table.citationId], name: "collection_citations_pkey"}),
]);
export const vCodebaseCentralFiles = pgView("v_codebase_central_files", {	id: uuid(),
	filePath: text("file_path"),
	domain: varchar({ length: 100 }),
	importanceScore: real("importance_score"),
	communityId: integer("community_id"),
	linesOfCode: integer("lines_of_code"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	chunkCount: bigint("chunk_count", { mode: "number" }),
	metadata: jsonb(),
}).as(sql`SELECT cf.id, cf.file_path, cf.domain, cf.importance_score, cf.community_id, cf.lines_of_code, count(DISTINCT ce.id) AS chunk_count, cf.metadata FROM codebase_files cf LEFT JOIN codebase_embeddings ce ON cf.id = ce.file_id GROUP BY cf.id ORDER BY cf.importance_score DESC`);

export const vMapreduceJobsSummary = pgView("v_mapreduce_jobs_summary", {	id: uuid(),
	jobType: varchar("job_type", { length: 50 }),
	status: varchar({ length: 20 }),
	progress: text(),
	durationSeconds: numeric("duration_seconds"),
	avgMsPerFile: real("avg_ms_per_file"),
	startedAt: timestamp("started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
}).as(sql`SELECT id, job_type, status, (processed_files || '/'::text) || total_files AS progress, round(EXTRACT(epoch FROM completed_at - started_at), 2) AS duration_seconds, (metrics ->> 'avg_time_per_file_ms'::text)::real AS avg_ms_per_file, started_at, completed_at FROM codebase_mapreduce_jobs ORDER BY started_at DESC`);

export const vGpuPerformanceSummary = pgView("v_gpu_performance_summary", {	operation: varchar({ length: 50 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	runCount: bigint("run_count", { mode: "number" }),
	avgDurationMs: real("avg_duration_ms"),
	minDurationMs: real("min_duration_ms"),
	maxDurationMs: real("max_duration_ms"),
	avgGpuUtil: integer("avg_gpu_util"),
	avgVramMb: integer("avg_vram_mb"),
}).as(sql`SELECT operation, count(*) AS run_count, avg(duration_ms)::real AS avg_duration_ms, min(duration_ms) AS min_duration_ms, max(duration_ms) AS max_duration_ms, avg(gpu_utilization_pct)::integer AS avg_gpu_util, avg(vram_used_mb)::integer AS avg_vram_mb FROM gpu_performance_metrics WHERE "timestamp" > (now() - '24:00:00'::interval) GROUP BY operation ORDER BY (avg(duration_ms)::real) DESC`);
