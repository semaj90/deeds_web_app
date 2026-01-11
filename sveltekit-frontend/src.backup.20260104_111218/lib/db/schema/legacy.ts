import { sql } from "drizzle-orm"
import { bigint, boolean, check, doublePrecision, foreignKey, index, inet, integer, interval, jsonb, numeric, pgEnum, pgTable, pgView, primaryKey, real, serial, text, timestamp, unique, uniqueIndex, uuid, varchar, vector } from "drizzle-orm/pg-core"

export const caseStatus = pgEnum("case_status", ['open', 'in_progress', 'pending_review', 'closed', 'archived'])
export const documentStatus = pgEnum("document_status", ['draft', 'under_review', 'approved', 'rejected', 'archived'])
export const errorKind = pgEnum("error_kind", ['typescript', 'svelte', 'lint', 'build', 'runtime', 'api', 'other'])
export const errorSeverity = pgEnum("error_severity", ['info', 'warn', 'error', 'fatal'])
export const evidenceRelationshipStrength = pgEnum("evidence_relationship_strength", ['low', 'medium', 'high'])
export const evidenceRelationshipType = pgEnum("evidence_relationship_type", ['supports', 'contradicts', 'same_person', 'timeline', 'chain_of_custody'])
export const evidenceStatus = pgEnum("evidence_status", ['pending', 'verified', 'rejected', 'under_review'])
export const evidenceType = pgEnum("evidence_type", ['physical', 'digital', 'testimonial', 'documentary', 'scientific', 'video', 'document', 'photo', 'note', 'audio', 'forensic'])
export const nodeType = pgEnum("node_type", ['person', 'evidence', 'location', 'case'])
export const patchStatus = pgEnum("patch_status", ['suggested', 'applied', 'rejected'])
export const priorityLevel = pgEnum("priority_level", ['low', 'medium', 'high', 'critical', 'urgent'])
export const relationshipStrength = pgEnum("relationship_strength", ['strong', 'medium', 'weak'])
export const routeHealthState = pgEnum("route_health_state", ['healthy', 'flaky', 'broken'])
export const timelineEventType = pgEnum("timeline_event_type", ['evidence', 'person', 'location', 'action'])
export const userRole = pgEnum("user_role", ['prosecutor', 'detective', 'admin', 'analyst', 'paralegal'])


export const legalAnalysisSessions = pgTable("legal_analysis_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	userId: uuid("user_id"),
	sessionType: varchar("session_type", { length: 50 }).default('case_analysis'),
	analysisPrompt: text("analysis_prompt"),
	analysisResult: text("analysis_result"),
	confidenceLevel: numeric("confidence_level", { precision: 3, scale: 2 }),
	sourcesUsed: jsonb("sources_used").default([]).notNull(),
	model: varchar({ length: 100 }).default('gemma3-legal'),
	processingTime: integer("processing_time"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const predictiveAssetCache = pgTable("predictive_asset_cache", {
	id: serial().primaryKey().notNull(),
	assetType: text("asset_type").notNull(),
	predictions: jsonb(),
	confidenceScore: real("confidence_score"),
	cacheExpires: timestamp("cache_expires", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const knowledgeGraphs = pgTable("knowledge_graphs", {
	id: serial().primaryKey().notNull(),
	documentId: varchar("document_id", { length: 255 }).notNull(),
	title: varchar({ length: 500 }),
	content: text(),
	docType: varchar("doc_type", { length: 100 }),
	entities: jsonb(),
	embeddings: jsonb(),
	relationships: jsonb(),
	graphStats: jsonb("graph_stats"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	processingTimeMs: bigint("processing_time_ms", { mode: "number" }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_kg_document_id").using("btree", table.documentId.asc().nullsLast().op("text_ops")),
	index("idx_kg_entities").using("gin", table.entities.asc().nullsLast().op("jsonb_ops")),
	index("idx_kg_relationships").using("gin", table.relationships.asc().nullsLast().op("jsonb_ops")),
	unique("knowledge_graphs_document_id_key").on(table.documentId),
]);

export const ragQueryResults = pgTable("rag_query_results", {
	id: serial().notNull(),
	queryId: integer("query_id").notNull(),
	chunkId: integer("chunk_id").notNull(),
	similarityScore: real("similarity_score").notNull(),
	rank: integer().notNull(),
	used: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const legalEntities = pgTable("legal_entities", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	entityType: text("entity_type"),
	description: text(),
	contactInfo: jsonb("contact_info"),
	aliases: text().array(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const documentTopics = pgTable("document_topics", {
	id: serial().primaryKey().notNull(),
	documentId: integer("document_id"),
	topicId: integer("topic_id"),
	relevanceScore: real("relevance_score").default(1),
	assignedBy: text("assigned_by").default('ai'),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_document_topics_doc_id").using("btree", table.documentId.asc().nullsLast().op("int4_ops")),
	index("idx_document_topics_topic_id").using("btree", table.topicId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.topicId],
			foreignColumns: [legalTopics.id],
			name: "document_topics_topic_id_fkey"
		}),
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
	fingerprints: jsonb().default({}),
	threatLevel: varchar("threat_level", { length: 20 }).default('low').notNull(),
	status: varchar({ length: 20 }).default('active').notNull(),
	notes: text(),
	aiSummary: text("ai_summary"),
	aiTags: jsonb("ai_tags").default([]).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const knowledgeEdges = pgTable("knowledge_edges", {
	id: uuid().defaultRandom().notNull(),
	sourceId: uuid("source_id").notNull(),
	targetId: uuid("target_id").notNull(),
	relationship: text().notNull(),
	weight: real().default(1),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const canvasAnnotations = pgTable("canvas_annotations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id"),
	fabricData: jsonb("fabric_data").notNull(),
	annotationType: varchar("annotation_type", { length: 50 }),
	coordinates: jsonb(),
	boundingBox: jsonb("bounding_box"),
	color: varchar({ length: 20 }),
	layerOrder: integer("layer_order").default(0),
	isVisible: boolean("is_visible").default(true),
	metadata: jsonb().default({}),
	version: integer().default(1),
	parentAnnotationId: uuid("parent_annotation_id"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const caseActivities = pgTable("case_activities", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	activityType: varchar("activity_type", { length: 50 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	scheduledFor: timestamp("scheduled_for", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	status: varchar({ length: 20 }).default('pending').notNull(),
	priority: varchar({ length: 20 }).default('medium').notNull(),
	assignedTo: uuid("assigned_to"),
	relatedEvidence: jsonb("related_evidence").default([]).notNull(),
	relatedCriminals: jsonb("related_criminals").default([]).notNull(),
	metadata: jsonb().default({}).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_case_activities_case_assigned").using("btree", table.caseId.asc().nullsLast().op("uuid_ops"), table.assignedTo.asc().nullsLast().op("uuid_ops")).where(sql`(assigned_to IS NOT NULL)`),
	index("idx_case_activities_case_created").using("btree", table.caseId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_case_activities_case_status").using("btree", table.caseId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")),
]);

export const vectorEmbeddings = pgTable("vector_embeddings", {
	id: serial().primaryKey().notNull(),
	documentId: text("document_id").notNull(),
	content: text(),
	embedding: vector({ dimensions: 1536 }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	embedding384: vector("embedding_384", { dimensions: 384 }),
	embeddingModel: text("embedding_model"),
}, (table) => [
	index("idx_vector_embeddings_cosine").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "10"}),
	index("idx_vector_embeddings_embedding_384_ivfflat").using("ivfflat", table.embedding384.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
	index("test_gpu_performance_idx").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "50"}),
	index("vector_embeddings_embedding_384_hnsw_idx").using("hnsw", table.embedding384.asc().nullsLast().op("vector_cosine_ops")),
]);

export const vectorSimilarityQueries = pgTable("vector_similarity_queries", {
	id: serial().primaryKey().notNull(),
	queryText: text("query_text").notNull(),
	queryEmbedding: vector("query_embedding", { dimensions: 512 }).notNull(),
	userId: text("user_id"),
	sessionId: text("session_id"),
	practiceAreaFilter: text("practice_area_filter"),
	documentTypeFilter: text("document_type_filter"),
	responseTimeMs: real("response_time_ms").notNull(),
	resultsCount: real("results_count").notNull(),
	similarityThreshold: real("similarity_threshold").default(0.7),
	topResults: jsonb("top_results"),
	queryIntent: text("query_intent"),
	userSatisfaction: real("user_satisfaction")({ mode: 'string' }).defaultNow(),
});

export const legalTopics = pgTable("legal_topics", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	parentTopicId: integer("parent_topic_id"),
	topicLevel: integer("topic_level").default(1),
	embedding: vector({ dimensions: 768 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	embedding384: vector("embedding_384", { dimensions: 384 }),
}, (table) => [
	index("idx_legal_topics_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("legal_topics_embedding_384_hnsw_idx").using("hnsw", table.embedding384.asc().nullsLast().op("vector_cosine_ops")),
	foreignKey({
			columns: [table.parentTopicId],
			foreignColumns: [table.id],
			name: "legal_topics_parent_topic_id_fkey"
		}),
]);

export const emailVerificationCodes = pgTable("email_verification_codes", {
	id: serial().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	email: varchar({ length: 255 }).notNull(),
	code: varchar({ length: 8 }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	unique("email_verification_codes_user_id_unique").on(table.userId),
]);

export const extractedEntities = pgTable("extracted_entities", {
	id: serial().notNull(),
	documentId: integer("document_id").notNull(),
	chunkId: integer("chunk_id"),
	entityType: varchar("entity_type", { length: 50 }).notNull(),
	entityValue: text("entity_value").notNull(),
	confidence: real().notNull(),
	startOffset: integer("start_offset"),
	endOffset: integer("end_offset"),
	context: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const statutes = pgTable("statutes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: varchar({ length: 255 }).notNull(),
	code: varchar({ length: 100 }).notNull(),
	description: text(),
	category: varchar({ length: 100 }),
	jurisdiction: varchar({ length: 100 }),
	isActive: boolean("is_active").default(true),
	penalties: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const evidenceConnections = pgTable("evidence_connections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceEvidenceId: uuid("source_evidence_id").notNull(),
	targetEvidenceId: uuid("target_evidence_id").notNull(),
	connectionType: varchar("connection_type", { length: 50 }).notNull(),
	strength: numeric({ precision: 3, scale: 2 }).notNull(),
	sharedEntities: jsonb("shared_entities").default([]),
	sharedTerms: jsonb("shared_terms").default([]),
	temporalProximity: integer("temporal_proximity"),
	spatialProximity: numeric("spatial_proximity", { precision: 10, scale: 6 }),
	semanticSimilarity: numeric("semantic_similarity", { precision: 3, scale: 2 }),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_evidence_connections_source").using("btree", table.sourceEvidenceId.asc().nullsLast().op("uuid_ops")),
	index("idx_evidence_connections_strength").using("btree", table.strength.asc().nullsLast().op("numeric_ops")),
	index("idx_evidence_connections_target").using("btree", table.targetEvidenceId.asc().nullsLast().op("uuid_ops")),
	index("idx_evidence_connections_type").using("btree", table.connectionType.asc().nullsLast().op("text_ops")),
	unique("evidence_connections_source_evidence_id_target_evidence_id__key").on(table.sourceEvidenceId, table.targetEvidenceId, table.connectionType),
	check("evidence_connections_strength_check", sql`(strength >= (0)::numeric) AND (strength <= (1)::numeric)`),
]);

export const documentChunks = pgTable("document_chunks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	documentType: varchar("document_type", { length: 50 }).notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	content: text().notNull(),
	embedding: vector({ dimensions: 512 }).notNull(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	embedding384: vector("embedding_384", { dimensions: 384 }),
}, (table) => [
	index("document_chunks_document_id_idx").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("document_chunks_embedding_384_hnsw_idx").using("hnsw", table.embedding384.asc().nullsLast().op("vector_cosine_ops")),
	index("document_chunks_embedding_hnsw_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_document_chunks_compound").using("gin", table.documentType.asc().nullsLast().op("jsonb_ops"), table.metadata.asc().nullsLast().op("varchar_ops")),
	index("idx_document_chunks_document_id").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("idx_document_chunks_embedding").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "316"}),
	index("idx_document_chunks_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("idx_document_chunks_index").using("btree", table.documentId.asc().nullsLast().op("uuid_ops"), table.chunkIndex.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "document_chunks_document_id_fkey"
		}).onDelete("cascade"),
]);

export const chatSessions = pgTable("chat_sessions", {
	id: varchar().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	title: varchar().default('New Chat').notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	isActive: boolean("is_active").default(true),
	context: jsonb().default({}),
}, (table) => [
	index("idx_chat_sessions_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const documentRelationshipsJsonb = pgTable("document_relationships_jsonb", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	sourceId: uuid("source_id").notNull(),
	targetId: uuid("target_id").notNull(),
	relationshipMetadata: jsonb("relationship_metadata").notNull(),
	relationshipType: text("relationship_type").generatedAlwaysAs(sql`(relationship_metadata ->> 'type'::text)`),
	strength: real().generatedAlwaysAs(sql`((relationship_metadata ->> 'strength'::text))::real`),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_relationships_metadata_gin").using("gin", table.relationshipMetadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_relationships_source").using("btree", table.sourceId.asc().nullsLast().op("uuid_ops")),
	index("idx_relationships_strength").using("btree", table.strength.desc().nullsFirst().op("float4_ops")),
	index("idx_relationships_target").using("btree", table.targetId.asc().nullsLast().op("uuid_ops")),
	index("idx_relationships_type").using("btree", table.relationshipType.asc().nullsLast().op("text_ops")),
	unique("document_relationships_jsonb_source_id_target_id_relationsh_key").on(table.sourceId, table.targetId, table.relationshipType),
]);

export const migrations = pgTable("migrations", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	filename: varchar({ length: 255 }).notNull(),
	appliedAt: timestamp("applied_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const errorEvents = pgTable("error_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routePath: text("route_path").notNull(),
	filePath: text("file_path"),
	message: text().notNull(),
	stackTrace: text("stack_trace"),
	tsCode: text("ts_code"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	clusterId: text("cluster_id"),
	severity: text().default('error').notNull(),
	stack: text(),
	metaJson: jsonb("meta_json"),
}, (table) => [
	index("idx_error_events_created").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_error_events_route").using("btree", table.routePath.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clusterId],
			foreignColumns: [errorClusters.id],
			name: "error_events_cluster_id_error_clusters_id_fk"
		}),
]);

export const evidenceVectors = pgTable("evidence_vectors", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	content: text().notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
	analysisType: text("analysis_type"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const routeHealth = pgTable("route_health", {
	id: serial().primaryKey().notNull(),
	routePath: text("route_path").notNull(),
	errorState: text("error_state").notNull(),
	lastChecked: timestamp("last_checked", { mode: 'string' }).defaultNow(),
	errorCount: integer("error_count").default(0),
	healthScore: integer("health_score").default(100),
	metadata: jsonb(),
	routeCluster: varchar("route_cluster", { length: 100 }),
	routeOwner: varchar("route_owner", { length: 100 }),
}, (table) => [
	index("idx_route_health_cluster").using("btree", table.routeCluster.asc().nullsLast().op("text_ops")),
	index("idx_route_health_path").using("btree", table.routePath.asc().nullsLast().op("text_ops")),
	unique("route_health_route_path_key").on(table.routePath),
]);

export const errorSuggestions = pgTable("error_suggestions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routePath: text("route_path").notNull(),
	summary: text().notNull(),
	patch: text().notNull(),
	riskLevel: text("risk_level").default('medium'),
	source: text().default('synthesized'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	errorEventId: uuid("error_event_id"),
	clusterId: text("cluster_id"),
	createdByUserId: text("created_by_user_id"),
	appliedByUserId: text("applied_by_user_id"),
	applied: boolean().default(false).notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_error_suggestions_route").using("btree", table.routePath.asc().nullsLast().op("text_ops")),
]);

export const caseEmbeddingsOptimized = pgTable("case_embeddings_optimized", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	docId: uuid("doc_id").notNull(),
	pageNo: integer("page_no").notNull(),
	chunkNo: integer("chunk_no").notNull(),
	content: text().notNull(),
	embedding: vector({ dimensions: 768 }),
	docTitle: text("doc_title"),
	chunkType: varchar("chunk_type", { length: 50 }).default('content'),
	tokenCount: integer("token_count"),
	overlapStart: integer("overlap_start").default(0),
	overlapEnd: integer("overlap_end").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	embedding384: vector("embedding_384", { dimensions: 384 }),
}, (table) => [
	index("case_embeddings_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("case_embeddings_chunk_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops"), table.pageNo.asc().nullsLast().op("uuid_ops"), table.chunkNo.asc().nullsLast().op("int4_ops")),
	index("case_embeddings_doc_page_idx").using("btree", table.docId.asc().nullsLast().op("uuid_ops"), table.pageNo.asc().nullsLast().op("uuid_ops")),
	index("case_embeddings_optimized_embedding_384_hnsw_idx").using("hnsw", table.embedding384.asc().nullsLast().op("vector_cosine_ops")),
	index("case_embeddings_optimized_idx").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
]);

export const aiHistory = pgTable("ai_history", {
	id: uuid().defaultRandom().notNull(),
	userId: text("user_id"),
	prompt: text(),
	response: text(),
	embedding: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const documents = pgTable("documents", {
	uuid: varchar({ length: 36 }).notNull(),
	caseId: integer("case_id").notNull(),
	filename: varchar({ length: 255 }).notNull(),
	originalName: varchar("original_name", { length: 255 }).notNull(),
	contentType: varchar("content_type", { length: 100 }).notNull(),
	fileSize: integer("file_size").notNull(),
	minioPath: varchar("minio_path", { length: 500 }).notNull(),
	extractedText: text("extracted_text"),
	processingStatus: varchar("processing_status", { length: 50 }).default('pending').notNull(),
	processingError: text("processing_error"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	sourceUri: text("source_uri"),
	embedding: vector({ dimensions: 768 }),
	title: varchar({ length: 255 }),
	mimeType: varchar("mime_type", { length: 100 }),
	uploadedBy: uuid("uploaded_by").default(sql`'00000000-0000-0000-0000-000000000000'`).notNull(),
	id: uuid().defaultRandom().primaryKey().notNull(),
	processedAt: timestamp("processed_at", { mode: 'string' }),
}, (table) => [
	index("idx_documents_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("idx_documents_uploaded_by").using("btree", table.uploadedBy.asc().nullsLast().op("uuid_ops")),
	unique("documents_uuid_unique").on(table.uuid),
]);

export const hashVerifications = pgTable("hash_verifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id"),
	verifiedHash: varchar("verified_hash", { length: 64 }).notNull(),
	storedHash: varchar("stored_hash", { length: 64 }),
	result: boolean().notNull(),
	verificationMethod: varchar("verification_method", { length: 50 }).default('manual'),
	verifiedBy: uuid("verified_by"),
	verifiedAt: timestamp("verified_at", { mode: 'string' }).defaultNow(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_hash_verifications_evidence_verified").using("btree", table.evidenceId.asc().nullsLast().op("timestamp_ops"), table.verifiedAt.desc().nullsLast().op("timestamp_ops")).where(sql`(evidence_id IS NOT NULL)`),
]);

export const contentEmbeddings = pgTable("content_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	contentId: uuid("content_id").notNull(),
	contentType: varchar("content_type", { length: 50 }).notNull(),
	textContent: text("text_content").notNull(),
	embedding: text(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const caseScores = pgTable("case_scores", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	score: numeric({ precision: 5, scale: 2 }).notNull(),
	riskLevel: varchar("risk_level", { length: 20 }).notNull(),
	breakdown: jsonb().default({}).notNull(),
	criteria: jsonb().default({}).notNull(),
	recommendations: jsonb().default([]).notNull(),
	calculatedBy: uuid("calculated_by"),
	calculatedAt: timestamp("calculated_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	action: varchar({ length: 100 }).notNull(),
	resourceType: varchar("resource_type", { length: 50 }).notNull(),
	resourceId: uuid("resource_id"),
	details: jsonb().default({}),
	ipAddress: inet("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const users = pgTable("users", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	hashedPassword: varchar("hashed_password", { length: 255 }),
	username: varchar({ length: 100 }),
	firstName: varchar("first_name", { length: 100 }),
	lastName: varchar("last_name", { length: 100 }),
	role: varchar({ length: 50 }).default('user').notNull(),
	department: varchar({ length: 100 }),
	jurisdiction: varchar({ length: 100 }),
	permissions: jsonb().default([]).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	avatarUrl: varchar("avatar_url", { length: 500 }),
	lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: 'string' }),
	practiceAreas: jsonb("practice_areas").default([]),
	barNumber: varchar("bar_number", { length: 50 }),
	firmName: varchar("firm_name", { length: 200 }),
	profileEmbedding: vector("profile_embedding", { dimensions: 384 }),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("users_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("users_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("users_profile_embedding_hnsw_idx").using("hnsw", table.profileEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("users_role_idx").using("btree", table.role.asc().nullsLast().op("text_ops")),
	index("users_username_idx").using("btree", table.username.asc().nullsLast().op("text_ops")),
	unique("users_email_key").on(table.email),
]);

export const caseMemories = pgTable("case_memories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	memoryType: varchar("memory_type", { length: 128 }).notNull(),
	content: text(),
	metadata: jsonb(),
	embedding: vector({ dimensions: 1536 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_case_memories_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_case_memories_embedding").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
]);

export const cases = pgTable("cases", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	title: varchar({ length: 500 }).notNull(),
	description: text(),
	caseNumber: varchar("case_number", { length: 100 }),
	status: varchar({ length: 50 }).default('active').notNull(),
	priority: varchar({ length: 20 }).default('medium').notNull(),
	practiceArea: varchar("practice_area", { length: 100 }),
	jurisdiction: varchar({ length: 100 }),
	court: varchar({ length: 200 }),
	clientName: varchar("client_name", { length: 200 }),
	opposingParty: varchar("opposing_party", { length: 200 }),
	assignedAttorney: uuid("assigned_attorney"),
	filingDate: timestamp("filing_date", { withTimezone: true, mode: 'string' }),
	dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }),
	closedDate: timestamp("closed_date", { withTimezone: true, mode: 'string' }),
	caseEmbedding: vector("case_embedding", { dimensions: 384 }),
	qdrantId: uuid("qdrant_id"),
	qdrantCollection: varchar("qdrant_collection", { length: 100 }).default('cases'),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	caseEmbedding384: vector("case_embedding_384", { dimensions: 384 }),
}, (table) => [
	index("cases_assigned_attorney_idx").using("btree", table.assignedAttorney.asc().nullsLast().op("uuid_ops")),
	index("cases_case_embedding_384_hnsw_idx").using("hnsw", table.caseEmbedding384.asc().nullsLast().op("vector_cosine_ops")),
	index("cases_case_embedding_hnsw_idx").using("hnsw", table.caseEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	uniqueIndex("cases_case_number_idx").using("btree", table.caseNumber.asc().nullsLast().op("text_ops")),
	index("cases_created_at_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("cases_metadata_idx").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("cases_practice_area_idx").using("btree", table.practiceArea.asc().nullsLast().op("text_ops")),
	index("cases_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.assignedAttorney],
			foreignColumns: [users.id],
			name: "cases_assigned_attorney_fkey"
		}),
	unique("cases_case_number_key").on(table.caseNumber),
]);

export const ragMessages = pgTable("rag_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 255 }).notNull(),
	messageIndex: integer("message_index").notNull(),
	role: varchar({ length: 20 }).notNull(),
	content: text().notNull(),
	retrievedSources: jsonb("retrieved_sources").default([]).notNull(),
	sourceCount: integer("source_count").default(0).notNull(),
	retrievalScore: varchar("retrieval_score", { length: 10 }),
	processingTime: integer("processing_time"),
	model: varchar({ length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const embeddingCache = pgTable("embedding_cache", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	textHash: text("text_hash").notNull(),
	model: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("embedding_cache_text_hash_unique").on(table.textHash),
]);

export const sessions = pgTable("sessions", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	sessionContext: jsonb("session_context").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("sessions_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("sessions_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "sessions_user_id_fkey"
		}).onDelete("cascade"),
]);

export const queryFeedback = pgTable("query_feedback", {
	id: serial().primaryKey().notNull(),
	queryId: integer("query_id"),
	rating: integer(),
	feedbackText: text("feedback_text"),
	isHelpful: boolean("is_helpful"),
	userIp: text("user_ip"),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.queryId],
			foreignColumns: [legalQueries.id],
			name: "query_feedback_query_id_fkey"
		}),
]);

export const citations = pgTable("citations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	documentId: uuid("document_id"),
	citationType: varchar("citation_type", { length: 50 }).notNull(),
	relevanceScore: numeric("relevance_score", { precision: 3, scale: 2 }),
	pageNumber: integer("page_number"),
	pinpointCitation: varchar("pinpoint_citation", { length: 100 }),
	quotedText: text("quoted_text"),
	contextBefore: text("context_before"),
	contextAfter: text("context_after"),
	annotation: text(),
	legalPrinciple: text("legal_principle"),
	citationFormat: varchar("citation_format", { length: 20 }).default('bluebook'),
	formattedCitation: text("formatted_citation"),
	shepardsTreatment: varchar("shepards_treatment", { length: 50 }),
	isKeyAuthority: boolean("is_key_authority").default(false),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_citations_case_key").using("btree", table.caseId.asc().nullsLast().op("bool_ops"), table.isKeyAuthority.asc().nullsLast().op("uuid_ops")).where(sql`(case_id IS NOT NULL)`),
	index("idx_citations_doc_relevance").using("btree", table.documentId.asc().nullsLast().op("uuid_ops"), table.relevanceScore.desc().nullsLast().op("numeric_ops")).where(sql`(document_id IS NOT NULL)`),
]);

export const legalDocuments = pgTable("legal_documents", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	title: varchar({ length: 500 }).notNull(),
	content: text().notNull(),
	summary: text(),
	documentType: varchar("document_type", { length: 50 }).default('document').notNull(),
	practiceArea: varchar("practice_area", { length: 100 }),
	jurisdiction: varchar({ length: 100 }),
	caseNumber: varchar("case_number", { length: 100 }),
	filePath: varchar("file_path", { length: 1000 }),
	fileName: varchar("file_name", { length: 255 }),
	fileSize: integer("file_size"),
	mimeType: varchar("mime_type", { length: 100 }),
	titleEmbedding: vector("title_embedding", { dimensions: 384 }),
	contentEmbedding: vector("content_embedding", { dimensions: 384 }),
	summaryEmbedding: vector("summary_embedding", { dimensions: 384 }),
	qdrantId: uuid("qdrant_id"),
	qdrantCollection: varchar("qdrant_collection", { length: 100 }).default('legal_documents'),
	lastSyncedToQdrant: timestamp("last_synced_to_qdrant", { withTimezone: true, mode: 'string' }),
	userId: uuid("user_id"),
	caseId: uuid("case_id"),
	metadata: jsonb().default({}),
	status: varchar({ length: 20 }).default('active').notNull(),
	visibility: varchar({ length: 20 }).default('private').notNull(),
	aiProcessed: boolean("ai_processed").default(false).notNull(),
	confidenceScore: real("confidence_score").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	embedding384: vector("embedding_384", { dimensions: 384 }),
	evidenceId: uuid("evidence_id"),
	createdBy: uuid("created_by"),
}, (table) => [
	index("idx_legal_documents_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_legal_documents_practice_area").using("btree", table.practiceArea.asc().nullsLast().op("text_ops")),
	index("idx_legal_documents_type").using("btree", table.documentType.asc().nullsLast().op("text_ops")),
	index("legal_documents_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("legal_documents_content_embedding_hnsw_idx").using("hnsw", table.contentEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("legal_documents_practice_area_idx").using("btree", table.practiceArea.asc().nullsLast().op("text_ops")),
	uniqueIndex("legal_documents_qdrant_id_idx").using("btree", table.qdrantId.asc().nullsLast().op("uuid_ops")),
	index("legal_documents_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("legal_documents_summary_embedding_hnsw_idx").using("hnsw", table.summaryEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("legal_documents_title_embedding_hnsw_idx").using("hnsw", table.titleEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("legal_documents_title_idx").using("btree", table.title.asc().nullsLast().op("text_ops")),
	index("legal_documents_type_idx").using("btree", table.documentType.asc().nullsLast().op("text_ops")),
	index("legal_documents_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "legal_documents_created_by_users_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "legal_documents_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "legal_documents_case_id_fkey"
		}).onDelete("set null"),
]);

export const testRagSearchSessions = pgTable("test_rag_search_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	query: text().notNull(),
	queryEmbedding: vector("query_embedding", { dimensions: 768 }),
	results: jsonb(),
	searchType: text("search_type").notNull(),
	resultCount: integer("result_count").notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const legalPrecedents = pgTable("legal_precedents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseTitle: varchar("case_title", { length: 255 }).notNull(),
	citation: varchar({ length: 255 }).notNull(),
	court: varchar({ length: 100 }),
	year: integer(),
	jurisdiction: varchar({ length: 50 }),
	summary: text(),
	fullText: text("full_text"),
	embedding: text(),
	relevanceScore: numeric("relevance_score", { precision: 3, scale: 2 }),
	legalPrinciples: jsonb("legal_principles").default([]).notNull(),
	linkedCases: jsonb("linked_cases").default([]).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const ragSessions = pgTable("rag_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 255 }).notNull(),
	userId: uuid("user_id"),
	title: varchar({ length: 255 }),
	model: varchar({ length: 100 }),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_rag_sessions_user_active").using("btree", table.userId.asc().nullsLast().op("timestamp_ops"), table.isActive.asc().nullsLast().op("bool_ops"), table.updatedAt.desc().nullsFirst().op("uuid_ops")).where(sql`(user_id IS NOT NULL)`),
	unique("rag_sessions_session_id_unique").on(table.sessionId),
]);

export const vectorOperations = pgTable("vector_operations", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	operationType: varchar("operation_type", { length: 50 }).notNull(),
	entityType: varchar("entity_type", { length: 50 }).notNull(),
	entityId: uuid("entity_id").notNull(),
	modelName: varchar("model_name", { length: 100 }).default('nomic-embed-text').notNull(),
	dimensions: integer().default(384).notNull(),
	similarity: varchar({ length: 20 }).default('cosine'),
	processingTimeMs: integer("processing_time_ms"),
	similarityScore: real("similarity_score"),
	qdrantSynced: boolean("qdrant_synced").default(false).notNull(),
	qdrantSyncedAt: timestamp("qdrant_synced_at", { withTimezone: true, mode: 'string' }),
	qdrantError: text("qdrant_error"),
	status: varchar({ length: 20 }).default('pending').notNull(),
	metadata: jsonb().default({}),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("vector_operations_entity_id_idx").using("btree", table.entityId.asc().nullsLast().op("uuid_ops")),
	index("vector_operations_entity_type_idx").using("btree", table.entityType.asc().nullsLast().op("text_ops")),
	index("vector_operations_operation_type_idx").using("btree", table.operationType.asc().nullsLast().op("text_ops")),
	index("vector_operations_qdrant_synced_idx").using("btree", table.qdrantSynced.asc().nullsLast().op("bool_ops")),
	index("vector_operations_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const reports = pgTable("reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	title: varchar({ length: 255 }).notNull(),
	content: text(),
	reportType: varchar("report_type", { length: 50 }).default('case_summary'),
	status: varchar({ length: 20 }).default('draft'),
	isPublic: boolean("is_public").default(false),
	tags: jsonb().default([]).notNull(),
	metadata: jsonb().default({}).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const personsOfInterest = pgTable("persons_of_interest", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	name: varchar({ length: 255 }).notNull(),
	aliases: jsonb().default([]).notNull(),
	relationship: varchar({ length: 100 }),
	threatLevel: varchar("threat_level", { length: 20 }).default('low'),
	status: varchar({ length: 20 }).default('active'),
	profileData: jsonb("profile_data").default({}).notNull(),
	tags: jsonb().default([]).notNull(),
	position: jsonb().default({}).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_pois_case_status").using("btree", table.caseId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("text_ops")).where(sql`(case_id IS NOT NULL)`),
	index("idx_pois_case_threat").using("btree", table.caseId.asc().nullsLast().op("uuid_ops"), table.threatLevel.asc().nullsLast().op("uuid_ops")).where(sql`(case_id IS NOT NULL)`),
]);

export const processingJobs = pgTable("processing_jobs", {
	id: serial().notNull(),
	uuid: varchar({ length: 36 }).notNull(),
	documentId: integer("document_id"),
	jobType: varchar("job_type", { length: 50 }).notNull(),
	status: varchar({ length: 50 }).default('queued').notNull(),
	currentStep: varchar("current_step", { length: 50 }),
	progress: integer().default(0).notNull(),
	result: jsonb(),
	error: text(),
	startedAt: timestamp("started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const qdrantCollections = pgTable("qdrant_collections", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	vectorSize: integer("vector_size").default(384).notNull(),
	distance: varchar({ length: 20 }).default('Cosine').notNull(),
	status: varchar({ length: 20 }).default('active').notNull(),
	isOptimized: boolean("is_optimized").default(false).notNull(),
	pointsCount: integer("points_count").default(0).notNull(),
	lastSynced: timestamp("last_synced", { withTimezone: true, mode: 'string' }),
	config: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("qdrant_collections_name_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("qdrant_collections_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	unique("qdrant_collections_name_key").on(table.name),
]);

export const legalCases = pgTable("legal_cases", {
	id: serial().primaryKey().notNull(),
	caseName: text("case_name").notNull(),
	caseNumber: text("case_number"),
	court: text(),
	jurisdiction: text(),
	decisionDate: timestamp("decision_date", { mode: 'string' }),
	citation: text(),
	summary: text(),
	holding: text(),
	facts: text(),
	legalIssues: text("legal_issues"),
	embedding: vector({ dimensions: 768 }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	embedding384: vector("embedding_384", { dimensions: 384 }),
}, (table) => [
	index("idx_legal_cases_decision_date").using("btree", table.decisionDate.desc().nullsFirst().op("timestamp_ops")),
	index("idx_legal_cases_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_legal_cases_jurisdiction").using("btree", table.jurisdiction.asc().nullsLast().op("text_ops")),
	index("legal_cases_embedding_384_hnsw_idx").using("hnsw", table.embedding384.asc().nullsLast().op("vector_cosine_ops")),
]);

export const aiConfig = pgTable("ai_config", {
	id: serial().primaryKey().notNull(),
	configKey: text("config_key").notNull(),
	configValue: text("config_value"),
	configType: text("config_type").default('string'),
	description: text(),
	isActive: boolean("is_active").default(true),
	updatedBy: text("updated_by").default('system'),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	uniqueIndex("idx_ai_config_key").using("btree", table.configKey.asc().nullsLast().op("text_ops")).where(sql`(is_active = true)`),
]);

export const testRagDocuments = pgTable("test_rag_documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	filename: text().notNull(),
	content: text().notNull(),
	originalContent: text("original_content"),
	metadata: jsonb(),
	confidence: real(),
	legalAnalysis: jsonb("legal_analysis"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("test_rag_documents_created_at_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("test_rag_documents_legal_analysis_idx").using("gin", table.legalAnalysis.asc().nullsLast().op("jsonb_path_ops")),
	index("test_rag_documents_metadata_idx").using("gin", table.metadata.asc().nullsLast().op("jsonb_path_ops")),
]);

export const legalQueries = pgTable("legal_queries", {
	id: serial().primaryKey().notNull(),
	prompt: text().notNull(),
	context: text(),
	response: text(),
	tokensUsed: integer("tokens_used"),
	inferenceTime: real("inference_time"),
	modelUsed: text("model_used").default('unknown'),
	status: text().default('pending').notNull(),
	errorMessage: text("error_message"),
	userIp: text("user_ip"),
	similarDocsCount: integer("similar_docs_count").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_legal_queries_model_used").using("btree", table.modelUsed.asc().nullsLast().op("text_ops")),
	index("idx_legal_queries_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_legal_queries_timestamp").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
]);

export const apiRateLimits = pgTable("api_rate_limits", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	apiKeyHash: varchar("api_key_hash", { length: 64 }),
	endpoint: varchar({ length: 100 }).notNull(),
	requestsCount: integer("requests_count").default(0),
	windowStart: timestamp("window_start", { withTimezone: true, mode: 'string' }).defaultNow(),
	windowDuration: interval("window_duration").default('00'),
	maxRequests: integer("max_requests").default(1000),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const notificationPreferences = pgTable("notification_preferences", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	notificationType: varchar("notification_type", { length: 50 }).notNull(),
	enabled: boolean().default(true),
	deliveryMethod: varchar("delivery_method", { length: 20 }).default('email'),
	settings: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const ragDocuments = pgTable("rag_documents", {
	id: serial().primaryKey().notNull(),
	filename: text().notNull(),
	contentHash: text("content_hash").notNull(),
	fileType: text("file_type"),
	fileSize: integer("file_size"),
	content: text(),
	metadata: jsonb().default({}),
	embedding: vector({ dimensions: 768 }),
	processedAt: timestamp("processed_at", { mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	embedding384: vector("embedding_384", { dimensions: 384 }),
}, (table) => [
	index("idx_rag_content_hash").using("btree", table.contentHash.asc().nullsLast().op("text_ops")),
	index("idx_rag_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_rag_embedding_384").using("hnsw", table.embedding384.asc().nullsLast().op("vector_cosine_ops")),
	index("rag_documents_embedding_384_hnsw_idx").using("hnsw", table.embedding384.asc().nullsLast().op("vector_cosine_ops")),
	unique("rag_documents_content_hash_key").on(table.contentHash),
]);

export const recommendationCache = pgTable("recommendation_cache", {
	id: uuid().defaultRandom().notNull(),
	userId: uuid("user_id").notNull(),
	recommendationType: text("recommendation_type").notNull(),
	recommendations: jsonb().notNull(),
	score: real().default(0),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const yorhaEvidenceNodes = pgTable("yorha_evidence_nodes", {
	id: uuid().defaultRandom().notNull(),
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
	index("yorha_evidence_nodes_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("yorha_evidence_nodes_created_by_idx").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("yorha_evidence_nodes_type_idx").using("btree", table.evidenceType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [yorhaCases.id],
			name: "yorha_evidence_nodes_case_id_fkey"
		}).onDelete("cascade"),
]);

export const embeddings = pgTable("embeddings", {
	id: serial().primaryKey().notNull(),
	taskId: varchar("task_id", { length: 100 }),
	payload: text(),
	metadata: jsonb(),
	embedding: vector({ dimensions: 384 }),
	textHash: varchar("text_hash", { length: 64 }),
	content: text(),
	model: varchar({ length: 100 }).default('nomic-embed-text:latest'),
	documentType: varchar("document_type", { length: 50 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	embedding384: vector("embedding_384", { dimensions: 384 }),
}, (table) => [
	index("embeddings_embedding_384_hnsw_idx").using("hnsw", table.embedding384.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_embeddings_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_embeddings_document_type").using("btree", table.documentType.asc().nullsLast().op("text_ops")),
	index("idx_embeddings_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_embeddings_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_embeddings_model").using("btree", table.model.asc().nullsLast().op("text_ops")),
	index("idx_embeddings_model_created").using("btree", table.model.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_embeddings_text_hash").using("btree", table.textHash.asc().nullsLast().op("text_ops")),
	index("idx_embeddings_type_model").using("btree", table.documentType.asc().nullsLast().op("text_ops"), table.model.asc().nullsLast().op("text_ops")),
	index("idx_embeddings_updated_at").using("btree", table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_embeddings_vector_cosine").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("idx_embeddings_vector_ip").using("hnsw", table.embedding.asc().nullsLast().op("vector_ip_ops")).with({m: "16",ef_construction: "64"}),
	index("idx_embeddings_vector_l2").using("hnsw", table.embedding.asc().nullsLast().op("vector_l2_ops")).with({m: "16",ef_construction: "64"}),
	unique("embeddings_text_hash_unique").on(table.textHash),
]);

export const queryVectors = pgTable("query_vectors", {
	id: uuid().defaultRandom().notNull(),
	userId: uuid("user_id").notNull(),
	query: text().notNull(),
	embedding: vector({ dimensions: 384 }).notNull(),
	resultCount: integer("result_count").default(0),
	clickedResults: jsonb("clicked_results"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const yorhaCases = pgTable("yorha_cases", {
	id: uuid().defaultRandom().notNull(),
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
]);

export const knowledgeNodes = pgTable("knowledge_nodes", {
	id: uuid().defaultRandom().notNull(),
	nodeType: text("node_type").notNull(),
	nodeId: uuid("node_id").notNull(),
	label: text().notNull(),
	embedding: vector({ dimensions: 384 }).notNull(),
	properties: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const caseEmbeddings = pgTable("case_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	content: text().notNull(),
	embedding: text().notNull(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_case_embeddings_case").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")).where(sql`(case_id IS NOT NULL)`),
]);

export const codeEmbeddings = pgTable("code_embeddings", {
	id: serial().primaryKey().notNull(),
	path: text().notNull(),
	contentHash: text("content_hash").notNull(),
	embedding: vector({ dimensions: 768 }),
	metadata: jsonb().default({}),
	errorPatterns: text("error_patterns").array(),
	repairSuggestions: text("repair_suggestions").array(),
	confidenceScore: doublePrecision("confidence_score").default(0),
	lastUpdated: timestamp("last_updated", { mode: 'string' }).defaultNow(),
	embedding384: vector("embedding_384", { dimensions: 384 }),
}, (table) => [
	index("code_embeddings_embedding_384_hnsw_idx").using("hnsw", table.embedding384.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_code_embeddings_embedding").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_code_embeddings_errors").using("gin", table.errorPatterns.asc().nullsLast().op("array_ops")),
	index("idx_code_embeddings_path").using("btree", table.path.asc().nullsLast().op("text_ops")),
	unique("code_embeddings_path_key").on(table.path),
]);

export const recommendationRatings = pgTable("recommendation_ratings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recommendationId: uuid("recommendation_id").notNull(),
	rating: integer(),
	feedback: text(),
	implemented: boolean().default(false),
	userId: uuid("user_id"),
	ratedAt: timestamp("rated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_recommendation_ratings_recommendation_id").using("btree", table.recommendationId.asc().nullsLast().op("uuid_ops")),
	index("idx_recommendation_ratings_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.recommendationId],
			foreignColumns: [aiRecommendations.id],
			name: "recommendation_ratings_recommendation_id_fkey"
		}).onDelete("cascade"),
	check("recommendation_ratings_rating_check", sql`(rating >= 1) AND (rating <= 5)`),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
	tokenHash: varchar("token_hash", { length: 63 }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
});

export const legalDocumentsExtracted = pgTable("legal_documents_extracted", {
	id: serial().primaryKey().notNull(),
	documentId: varchar("document_id", { length: 255 }).notNull(),
	title: varchar({ length: 500 }),
	content: text(),
	docType: varchar("doc_type", { length: 100 }),
	entities: jsonb(),
	embedding: jsonb(),
	embeddingGemma: vector("embedding_gemma", { dimensions: 512 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	processingTimeMs: bigint("processing_time_ms", { mode: "number" }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	embedding384: vector("embedding_384", { dimensions: 384 }),
}, (table) => [
	index("legal_documents_extracted_embedding_384_hnsw_idx").using("hnsw", table.embedding384.asc().nullsLast().op("vector_cosine_ops")),
	unique("legal_documents_extracted_document_id_key").on(table.documentId),
]);

export const detectiveAnalysis = pgTable("detective_analysis", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	analysisType: varchar("analysis_type", { length: 50 }).notNull(),
	queryData: jsonb("query_data").notNull(),
	results: jsonb().notNull(),
	confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 }),
	aiModel: varchar("ai_model", { length: 100 }),
	processingTime: integer("processing_time"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_detective_analysis_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_detective_analysis_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_detective_analysis_query_data").using("gin", table.queryData.asc().nullsLast().op("jsonb_ops")),
	index("idx_detective_analysis_results").using("gin", table.results.asc().nullsLast().op("jsonb_ops")),
	index("idx_detective_analysis_type").using("btree", table.analysisType.asc().nullsLast().op("text_ops")),
]);

export const documentProcessingTasks = pgTable("document_processing_tasks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	taskType: text("task_type").notNull(),
	status: text().default('pending').notNull(),
	requestedAt: timestamp("requested_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	results: jsonb(),
	error: text(),
	modelUsed: text("model_used"),
	processingTime: integer("processing_time"),
	tokensUsed: integer("tokens_used"),
	confidenceScore: real("confidence_score"),
	requestedOptions: jsonb("requested_options"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const legalAnalysisCache = pgTable("legal_analysis_cache", {
	id: serial().primaryKey().notNull(),
	inputHash: text("input_hash").notNull(),
	promptText: text("prompt_text").notNull(),
	contextDocuments: jsonb("context_documents"),
	analysisType: text("analysis_type").notNull(),
	analysisContent: text("analysis_content").notNull(),
	analysisEmbedding: vector("analysis_embedding", { dimensions: 512 }),
	modelVersion: text("model_version").default('gemma3-legal:latest'),
	processingTimeMs: real("processing_time_ms"),
	tokenCount: real("token_count"),
	accessCount: real("access_count").default(1),
	lastAccessedAt: timestamp("last_accessed_at", { mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("legal_analysis_cache_input_hash_unique").on(table.inputHash),
]);

export const profile = pgTable("profile", {
	id: uuid().primaryKey().notNull(),
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
});

export const yorhaEvidenceConnections = pgTable("yorha_evidence_connections", {
	id: uuid().defaultRandom().notNull(),
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
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [yorhaCases.id],
			name: "yorha_evidence_connections_case_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sourceNodeId],
			foreignColumns: [yorhaEvidenceNodes.id],
			name: "yorha_evidence_connections_source_node_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetNodeId],
			foreignColumns: [yorhaEvidenceNodes.id],
			name: "yorha_evidence_connections_target_node_id_fkey"
		}).onDelete("cascade"),
]);

export const yorhaChatSessions = pgTable("yorha_chat_sessions", {
	id: uuid().defaultRandom().notNull(),
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
	index("yorha_chat_sessions_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("yorha_chat_sessions_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("yorha_chat_sessions_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [yorhaCases.id],
			name: "yorha_chat_sessions_case_id_fkey"
		}).onDelete("cascade"),
]);

export const aiEngineStatus = pgTable("ai_engine_status", {
	id: uuid().defaultRandom().notNull(),
	engineName: text("engine_name").notNull(),
	isOnline: boolean("is_online").default(false),
	lastHealthCheck: timestamp("last_health_check", { mode: 'string' }).defaultNow(),
	responseTime: integer("response_time"),
	version: text(),
	capabilities: jsonb(),
	configuration: jsonb(),
	errorStatus: text("error_status"),
	metadata: jsonb(),
});

export const themes = pgTable("themes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	cssVariables: jsonb("css_variables").notNull(),
	colorPalette: jsonb("color_palette").notNull(),
	isSystem: boolean("is_system").default(false).notNull(),
	isPublic: boolean("is_public").default(false).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const testRagEmbeddings = pgTable("test_rag_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id"),
	content: text().notNull(),
	embedding: vector({ dimensions: 768 }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	embedding384: vector("embedding_384", { dimensions: 384 }),
}, (table) => [
	index("test_rag_embeddings_document_id_idx").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("test_rag_embeddings_embedding_384_hnsw_idx").using("hnsw", table.embedding384.asc().nullsLast().op("vector_cosine_ops")),
	index("test_rag_embeddings_vector_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [testRagDocuments.id],
			name: "test_rag_embeddings_document_id_fkey"
		}).onDelete("cascade"),
]);

export const gpuInferenceMessages = pgTable("gpu_inference_messages", {
	id: uuid().defaultRandom().notNull(),
	sessionId: uuid("session_id"),
	role: text().notNull(),
	content: text().notNull(),
	embedding: real().array(),
	engineUsed: text("engine_used"),
	responseTime: integer("response_time"),
	tokensGenerated: integer("tokens_generated"),
	cacheHit: boolean("cache_hit").default(false),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const messages = pgTable("messages", {
	id: text().primaryKey().notNull(),
	sessionId: text("session_id").notNull(),
	content: text().notNull(),
	role: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	embedding: jsonb(),
	metadata: jsonb(),
	model: text().default('gemma3-legal').notNull(),
	confidence: integer(),
});

export const qloraTrainingJobs = pgTable("qlora_training_jobs", {
	id: serial().primaryKey().notNull(),
	config: jsonb().notNull(),
	status: text().default('pending'),
	performanceMetrics: jsonb("performance_metrics"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const documentEmbeddings = pgTable("document_embeddings", {
	id: serial().notNull(),
	path: text().notNull(),
	hash: text().notNull(),
	embeddingModel: text("embedding_model").notNull(),
	embeddingVector: vector("embedding_vector", { dimensions: 768 }),
	summary: text(),
	timestamp: timestamp("timestamp", { withTimezone: true, mode: 'string' }).defaultNow(),
	chunkIndex: integer("chunk_index").default(0),
	totalChunks: integer("total_chunks").default(1),
}, (table) => [
	index("idx_embeddings_path").using("btree", table.path.asc().nullsLast().op("text_ops")),
	index("idx_embeddings_timestamp").using("btree", table.timestamp.desc().nullsFirst().op("timestamptz_ops")),
]);

export const phase72Cluster = pgTable("phase72_cluster", {
	id: uuid().defaultRandom().notNull(),
	label: text(),
	phase: integer().default(72).notNull(),
	cycle: integer().notNull(),
	size: integer().default(0).notNull(),
	centroid: vector({ dimensions: 768 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_phase72_cluster_label").using("btree", table.label.asc().nullsLast().op("text_ops")),
	index("idx_phase72_cluster_phase_cycle").using("btree", table.phase.asc().nullsLast().op("int4_ops"), table.cycle.asc().nullsLast().op("int4_ops")),
]);

export const phase72ClusterSummary = pgTable("phase72_cluster_summary", {
	id: uuid().defaultRandom().notNull(),
	clusterId: uuid("cluster_id").notNull(),
	summaryText: text("summary_text").notNull(),
	model: text().notNull(),
	embedding: vector({ dimensions: 768 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_phase72_cluster_summary_cluster").using("btree", table.clusterId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clusterId],
			foreignColumns: [phase72Cluster.id],
			name: "phase72_cluster_summary_cluster_id_fkey"
		}).onDelete("cascade"),
]);

export const timelineEvents = pgTable("timeline_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	title: text().notNull(),
	description: text().notNull(),
	type: timelineEventType().notNull(),
	evidenceIds: jsonb("evidence_ids").default([]),
	personIds: jsonb("person_ids").default([]),
	locationIds: jsonb("location_ids").default([]),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	createdBy: text("created_by"),
}, (table) => [
	index("idx_timeline_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_timeline_timestamp").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_timeline_event_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
]);

export const evidenceRelationships = pgTable("evidence_relationships", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fromEvidenceId: uuid("from_evidence_id").notNull(),
	toEvidenceId: uuid("to_evidence_id").notNull(),
	label: text(),
	strength: relationshipStrength().default('medium'),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	createdBy: text("created_by"),
	caseId: uuid("case_id"),
	relationshipType: evidenceRelationshipType("relationship_type").default('supports').notNull(),
}, (table) => [
	index("evidence_relationships_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("evidence_relationships_from_idx").using("btree", table.fromEvidenceId.asc().nullsLast().op("uuid_ops")),
	index("evidence_relationships_to_idx").using("btree", table.toEvidenceId.asc().nullsLast().op("uuid_ops")),
	index("idx_evidence_rel_from").using("btree", table.fromEvidenceId.asc().nullsLast().op("uuid_ops")),
	index("idx_evidence_rel_to").using("btree", table.toEvidenceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.fromEvidenceId],
			foreignColumns: [evidence.id],
			name: "evidence_relationships_from_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toEvidenceId],
			foreignColumns: [evidence.id],
			name: "evidence_relationships_to_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "evidence_relationships_case_id_fk"
		}).onDelete("cascade"),
]);

export const phase72ErrorVector = pgTable("phase72_error_vector", {
	errorId: uuid("error_id").notNull(),
	model: text().notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_phase72_vector_ivf").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
	foreignKey({
			columns: [table.errorId],
			foreignColumns: [phase72Error.id],
			name: "phase72_error_vector_error_id_fkey"
		}).onDelete("cascade"),
]);

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

export const errorLogs = pgTable("error_logs", {
	id: uuid().defaultRandom().notNull(),
	message: text().notNull(),
	stackTrace: text("stack_trace"),
	embedding: real().array(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const systemSettings = pgTable("system_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	key: varchar({ length: 100 }).notNull(),
	value: jsonb().notNull(),
	description: text(),
	category: varchar({ length: 50 }).default('general'),
	isPublic: boolean("is_public").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("system_settings_key_key").on(table.key),
]);

export const aiReports = pgTable("ai_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	reportType: varchar("report_type", { length: 50 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	content: text().notNull(),
	richTextContent: jsonb("rich_text_content"),
	metadata: jsonb().default({}).notNull(),
	canvasElements: jsonb("canvas_elements").default([]).notNull(),
	generatedBy: varchar("generated_by", { length: 100 }).default('gemma3-legal'),
	confidence: numeric({ precision: 3, scale: 2 }).default('0.85'),
	isActive: boolean("is_active").default(true),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const canvasStates = pgTable("canvas_states", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	name: varchar({ length: 255 }).notNull(),
	canvasData: jsonb("canvas_data").notNull(),
	version: integer().default(1),
	isDefault: boolean("is_default").default(false),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_canvas_states_case_default").using("btree", table.caseId.asc().nullsLast().op("bool_ops"), table.isDefault.asc().nullsLast().op("bool_ops")).where(sql`(case_id IS NOT NULL)`),
]);

export const fileSummaries = pgTable("file_summaries", {
	id: serial().notNull(),
	path: text().notNull(),
	hash: text().notNull(),
	summary: text().notNull(),
	fileType: text("file_type"),
	wordCount: integer("word_count"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_file_summaries_fts").using("gin", sql`to_tsvector('english'::regconfig, summary)`),
	index("idx_file_summaries_path").using("btree", table.path.asc().nullsLast().op("text_ops")),
	index("idx_file_summaries_updated").using("btree", table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
]);

export const graphNodes = pgTable("graph_nodes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	nodeId: text("node_id").notNull(),
	label: text().notNull(),
	type: nodeType().notNull(),
	posX: integer("pos_x").notNull(),
	posY: integer("pos_y").notNull(),
	entityId: uuid("entity_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_graph_nodes_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_graph_nodes_node_id").using("btree", table.nodeId.asc().nullsLast().op("text_ops")),
]);

export const graphEdges = pgTable("graph_edges", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	fromNodeId: uuid("from_node_id").notNull(),
	toNodeId: uuid("to_node_id").notNull(),
	label: text(),
	strength: relationshipStrength().default('medium'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_graph_edges_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_graph_edges_from").using("btree", table.fromNodeId.asc().nullsLast().op("uuid_ops")),
	index("idx_graph_edges_to").using("btree", table.toNodeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.fromNodeId],
			foreignColumns: [graphNodes.id],
			name: "graph_edges_from_node_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toNodeId],
			foreignColumns: [graphNodes.id],
			name: "graph_edges_to_node_id_fkey"
		}).onDelete("cascade"),
]);

export const chatEmbeddings = pgTable("chat_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	messageId: uuid("message_id").notNull(),
	content: text().notNull(),
	embedding: text().notNull(),
	role: varchar({ length: 20 }).notNull(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const legalResearch = pgTable("legal_research", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	query: text().notNull(),
	searchTerms: jsonb("search_terms").default([]),
	jurisdiction: varchar({ length: 100 }),
	dateRange: jsonb("date_range"),
	courtLevel: varchar("court_level", { length: 50 }),
	practiceArea: varchar("practice_area", { length: 100 }),
	resultsCount: integer("results_count").default(0),
	searchResults: jsonb("search_results").default([]),
	aiSummary: text("ai_summary"),
	keyFindings: jsonb("key_findings").default([]),
	recommendedCitations: jsonb("recommended_citations").default([]),
	searchDuration: integer("search_duration"),
	dataSource: varchar("data_source", { length: 50 }),
	isBookmarked: boolean("is_bookmarked").default(false),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const savedReports = pgTable("saved_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: varchar({ length: 300 }).notNull(),
	caseId: uuid("case_id"),
	reportType: varchar("report_type", { length: 50 }).notNull(),
	templateId: uuid("template_id"),
	content: jsonb().notNull(),
	htmlContent: text("html_content"),
	generatedBy: varchar("generated_by", { length: 50 }).default('manual'),
	aiModel: varchar("ai_model", { length: 50 }),
	aiPrompt: text("ai_prompt"),
	exportFormat: varchar("export_format", { length: 20 }).default('pdf'),
	status: varchar({ length: 20 }).default('draft'),
	version: integer().default(1),
	wordCount: integer("word_count"),
	tags: jsonb().default([]),
	metadata: jsonb().default({}),
	sharedWith: jsonb("shared_with").default([]),
	lastExported: timestamp("last_exported", { mode: 'string' }),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const legalDocumentsJsonb = pgTable("legal_documents_jsonb", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	title: text().notNull(),
	content: text().notNull(),
	metadata: jsonb().notNull(),
	titleEmbedding: vector("title_embedding", { dimensions: 384 }),
	contentEmbedding: vector("content_embedding", { dimensions: 384 }),
	documentType: text("document_type").generatedAlwaysAs(sql`(metadata ->> 'documentType'::text)`),
	jurisdiction: text().generatedAlwaysAs(sql`(metadata ->> 'jurisdiction'::text)`),
	practiceArea: text("practice_area").generatedAlwaysAs(sql`(metadata ->> 'practiceArea'::text)`),
	confidentialityLevel: text("confidentiality_level").generatedAlwaysAs(sql`(metadata ->> 'confidentialityLevel'::text)`),
	urgency: text().generatedAlwaysAs(sql`(metadata ->> 'urgency'::text)`),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// TODO: failed to parse database type 'tsvector'
	// searchVector: unknown("search_vector").generatedAlwaysAs(sql`to_tsvector('english'::regconfig, ((title || ' '::text) || content))`),
}, (table) => [
	index("idx_legal_docs_confidentiality").using("btree", table.confidentialityLevel.asc().nullsLast().op("text_ops")),
	index("idx_legal_docs_content_embedding").using("ivfflat", table.contentEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
	index("idx_legal_docs_document_type").using("btree", table.documentType.asc().nullsLast().op("text_ops")),
	index("idx_legal_docs_jurisdiction").using("btree", table.jurisdiction.asc().nullsLast().op("text_ops")),
	index("idx_legal_docs_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_legal_docs_practice_area").using("btree", table.practiceArea.asc().nullsLast().op("text_ops")),
	// index("idx_legal_docs_search_vector").using("gin", table.searchVector.asc().nullsLast().op("tsvector_ops")),
	index("idx_legal_docs_title_embedding").using("ivfflat", table.titleEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
]);

export const caseTimeline = pgTable("case_timeline", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	eventDate: timestamp("event_date", { withTimezone: true, mode: 'string' }).notNull(),
	importance: varchar({ length: 20 }).default('medium'),
	evidenceId: uuid("evidence_id"),
	relatedEntityId: uuid("related_entity_id"),
	relatedEntityType: varchar("related_entity_type", { length: 50 }),
	eventData: jsonb("event_data").default({}),
	automated: boolean().default(false),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_case_timeline_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_case_timeline_event_date").using("btree", table.eventDate.asc().nullsLast().op("timestamptz_ops")),
	index("idx_case_timeline_event_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
]);

export const errorTimeline = pgTable("error_timeline", {
	id: uuid().defaultRandom().notNull(),
	routePath: varchar("route_path", { length: 255 }).notNull(),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	description: text(),
	metadata: jsonb(),
	occurredAt: timestamp("occurred_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_error_timeline_event").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("idx_error_timeline_route").using("btree", table.routePath.asc().nullsLast().op("text_ops")),
]);

export const phase72Error = pgTable("phase72_error", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	errorHash: text("error_hash").notNull(),
	filePath: text("file_path").notNull(),
	line: integer().notNull(),
	col: integer().notNull(),
	code: text().notNull(),
	severity: text().default('error').notNull(),
	message: text().notNull(),
	phase: integer().default(72).notNull(),
	cycle: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	embedding: vector({ dimensions: 384 }),
	occurrenceCount: integer("occurrence_count").default(1),
	lastSeen: timestamp("last_seen", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_phase72_error_code").using("btree", table.code.asc().nullsLast().op("text_ops")),
	index("idx_phase72_error_code_severity").using("btree", table.code.asc().nullsLast().op("text_ops"), table.severity.asc().nullsLast().op("text_ops")),
	index("idx_phase72_error_created").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_phase72_error_file").using("btree", table.filePath.asc().nullsLast().op("text_ops")),
	index("idx_phase72_error_hash").using("btree", table.errorHash.asc().nullsLast().op("text_ops")),
	index("idx_phase72_error_phase_cycle").using("btree", table.phase.asc().nullsLast().op("int4_ops"), table.cycle.asc().nullsLast().op("int4_ops")),
	index("phase72_error_embedding_idx").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
	index("phase72_error_last_seen_idx").using("btree", table.lastSeen.desc().nullsFirst().op("timestamp_ops")),
	index("phase72_error_occurrence_idx").using("btree", table.occurrenceCount.desc().nullsFirst().op("int4_ops")),
]);

export const evidenceFiles = pgTable("evidence_files", {
	id: uuid().defaultRandom().notNull(),
	chatTurnId: uuid("chat_turn_id"),
	caseId: uuid("case_id"),
	filename: text().notNull(),
	minioObjectName: text("minio_object_name").notNull(),
	contentType: text("content_type"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sizeBytes: bigint("size_bytes", { mode: "number" }),
	extractedText: text("extracted_text"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	metadata: jsonb(),
}, (table) => [
	index("idx_evidence_files_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_evidence_files_chat_turn_id").using("btree", table.chatTurnId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.chatTurnId],
			foreignColumns: [chatTurns.id],
			name: "evidence_files_chat_turn_id_fkey"
		}),
]);

export const uploads = pgTable("uploads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	userId: uuid("user_id"),
	originalFilename: varchar("original_filename", { length: 512 }).notNull(),
	storedFilename: varchar("stored_filename", { length: 512 }).notNull(),
	mimeType: varchar("mime_type", { length: 200 }),
	fileSize: integer("file_size"),
	storagePath: text("storage_path"),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("uploads_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("uploads_filename_idx").using("btree", table.originalFilename.asc().nullsLast().op("text_ops")),
	index("uploads_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
]);

export const documentEntities = pgTable("document_entities", {
	id: serial().primaryKey().notNull(),
	documentId: integer("document_id"),
	entityId: integer("entity_id"),
	relationshipType: text("relationship_type"),
	confidenceScore: real("confidence_score"),
	extractedBy: text("extracted_by").default('ai'),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_document_entities_doc_id").using("btree", table.documentId.asc().nullsLast().op("int4_ops")),
	index("idx_document_entities_entity_id").using("btree", table.entityId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [legalEntities.id],
			name: "document_entities_entity_id_fkey"
		}),
]);

export const userEmbeddings = pgTable("user_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	content: text().notNull(),
	embedding: text().notNull(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const aiRecommendations = pgTable("ai_recommendations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	type: varchar({ length: 50 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	reasoning: text(),
	priority: varchar({ length: 20 }).default('medium'),
	confidence: numeric({ precision: 3, scale: 2 }),
	aiModel: varchar("ai_model", { length: 100 }),
	supportingEvidence: jsonb("supporting_evidence").default([]),
	suggestedActions: jsonb("suggested_actions").default([]),
	estimatedImpact: text("estimated_impact"),
	timeframe: varchar({ length: 100 }),
	status: varchar({ length: 20 }).default('pending'),
	tags: jsonb().default([]),
	createdBy: varchar("created_by", { length: 50 }).default('ai-system'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ai_recommendations_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_ai_recommendations_priority").using("btree", table.priority.asc().nullsLast().op("text_ops")),
	index("idx_ai_recommendations_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_ai_recommendations_suggested_actions").using("gin", table.suggestedActions.asc().nullsLast().op("jsonb_ops")),
	index("idx_ai_recommendations_supporting_evidence").using("gin", table.supportingEvidence.asc().nullsLast().op("jsonb_ops")),
	index("idx_ai_recommendations_tags").using("gin", table.tags.asc().nullsLast().op("jsonb_ops")),
	index("idx_ai_recommendations_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	check("ai_recommendations_confidence_check", sql`(confidence >= (0)::numeric) AND (confidence <= (1)::numeric)`),
]);

export const ragQueries = pgTable("rag_queries", {
	id: serial().notNull(),
	uuid: varchar({ length: 36 }).notNull(),
	caseId: integer("case_id"),
	query: text().notNull(),
	queryEmbedding: vector("query_embedding", { dimensions: 384 }),
	response: text(),
	model: varchar({ length: 50 }).notNull(),
	tokensUsed: integer("tokens_used"),
	processingTimeMs: integer("processing_time_ms"),
	similarityThreshold: real("similarity_threshold").default(0.7).notNull(),
	resultsCount: integer("results_count"),
	userFeedback: jsonb("user_feedback"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const modelPerformance = pgTable("model_performance", {
	id: serial().primaryKey().notNull(),
	modelName: text("model_name").notNull(),
	modelVersion: text("model_version"),
	queryCount: integer("query_count").default(0),
	avgInferenceTime: real("avg_inference_time"),
	avgTokensPerResponse: real("avg_tokens_per_response"),
	successRate: real("success_rate"),
	userSatisfaction: real("user_satisfaction"),
	date: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_model_performance_model").using("btree", table.modelName.asc().nullsLast().op("text_ops"), table.date.desc().nullsFirst().op("text_ops")),
]);

export const chatUploads = pgTable("chat_uploads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	caseId: uuid("case_id"),
	filename: text().notNull(),
	mimeType: text("mime_type").notNull(),
	minioUrl: text("minio_url").notNull(),
	doclingResult: jsonb("docling_result"),
	extractedKeywords: text("extracted_keywords").array().default([""]),
	keyPhrases: text("key_phrases").array().default([""]),
	suggestions: text().array().default([""]),
	fileSizeBytes: integer("file_size_bytes"),
	processingTimeMs: integer("processing_time_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_chat_uploads_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_chat_uploads_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_chat_uploads_key_phrases").using("gin", table.keyPhrases.asc().nullsLast().op("array_ops")),
	index("idx_chat_uploads_keywords").using("gin", table.extractedKeywords.asc().nullsLast().op("array_ops")),
	index("idx_chat_uploads_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "chat_uploads_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "chat_uploads_case_id_fkey"
		}).onDelete("set null"),
]);

export const chatTurns = pgTable("chat_turns", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	userMessage: text("user_message").notNull(),
	assistantResponse: text("assistant_response").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	imageUrls: text("image_urls").array().default([""]),
	extractedKeywords: text("extracted_keywords").array().default([""]),
	keyPhrases: text("key_phrases").array().default([""]),
	suggestions: text().array().default([""]),
}, (table) => [
	index("idx_chat_turns_case_created").using("btree", table.caseId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_chat_turns_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_chat_turns_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_chat_turns_key_phrases").using("gin", table.keyPhrases.asc().nullsLast().op("array_ops")),
	index("idx_chat_turns_keywords").using("gin", table.extractedKeywords.asc().nullsLast().op("array_ops")),
]);

export const chatTurnEvidence = pgTable("chat_turn_evidence", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	chatTurnId: uuid("chat_turn_id").notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	objectUri: text("object_uri"),
	role: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_chat_turn_evidence_chat_turn").using("btree", table.chatTurnId.asc().nullsLast().op("uuid_ops")),
	index("idx_chat_turn_evidence_evidence").using("btree", table.evidenceId.asc().nullsLast().op("uuid_ops")),
	index("idx_chat_turn_evidence_role").using("btree", table.role.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.chatTurnId],
			foreignColumns: [chatTurns.id],
			name: "fk_chat_turn_evidence_chat_turn"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.evidenceId],
			foreignColumns: [evidence.id],
			name: "fk_chat_turn_evidence_evidence"
		}).onDelete("cascade"),
	check("chat_turn_evidence_role_check", sql`role = ANY (ARRAY['uploaded'::text, 'retrieved'::text])`),
]);

export const evidence = pgTable("evidence", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	evidenceNumber: text("evidence_number").notNull(),
	title: text().notNull(),
	type: evidenceType().notNull(),
	summary: text().notNull(),
	description: text(),
	posX: integer("pos_x"),
	posY: integer("pos_y"),
	collectedAt: timestamp("collected_at", { mode: 'string' }),
	collectedBy: text("collected_by"),
	verifiedAt: timestamp("verified_at", { mode: 'string' }),
	verified: boolean().default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	evidenceType: text("evidence_type"),
	fileType: varchar("file_type", { length: 50 }),
	fileUrl: text("file_url"),
	fileName: varchar("file_name", { length: 255 }),
	fileSize: integer("file_size"),
	mimeType: varchar("mime_type", { length: 100 }),
	hash: varchar({ length: 128 }),
	tags: jsonb().default([]),
	aiAnalysis: jsonb("ai_analysis").default({}),
	aiTags: jsonb("ai_tags").default([]),
	aiSummary: text("ai_summary"),
	uploadedBy: uuid("uploaded_by"),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_evidence_ai_tags").using("gin", table.aiTags.asc().nullsLast().op("jsonb_ops")),
	index("idx_evidence_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("idx_evidence_evidence_type").using("btree", table.evidenceType.asc().nullsLast().op("text_ops")),
	index("idx_evidence_number").using("btree", table.evidenceNumber.asc().nullsLast().op("text_ops")),
	index("idx_evidence_tags").using("gin", table.tags.asc().nullsLast().op("jsonb_ops")),
	index("idx_evidence_uploaded_at").using("btree", table.uploadedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_evidence_uploaded_by").using("btree", table.uploadedBy.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [users.id],
			name: "fk_evidence_uploaded_by"
		}).onDelete("set null"),
	unique("evidence_evidence_number_key").on(table.evidenceNumber),
]);

export const evidenceChunks = pgTable("evidence_chunks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	content: text().notNull(),
	pageNumber: integer("page_number"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_evidence_chunks_chunk_index").using("btree", table.evidenceId.asc().nullsLast().op("int4_ops"), table.chunkIndex.asc().nullsLast().op("int4_ops")),
	index("idx_evidence_chunks_evidence_id").using("btree", table.evidenceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.evidenceId],
			foreignColumns: [evidenceFiles.id],
			name: "evidence_chunks_evidence_id_fkey"
		}).onDelete("cascade"),
]);

export const evidenceTagLinks = pgTable("evidence_tag_links", {
	evidenceId: uuid("evidence_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	source: text().default('system').notNull(),
	confidence: real().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_evidence_tag_links_evidence_id").using("btree", table.evidenceId.asc().nullsLast().op("uuid_ops")),
	index("idx_evidence_tag_links_tag_id").using("btree", table.tagId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.evidenceId],
			foreignColumns: [evidenceFiles.id],
			name: "evidence_tag_links_evidence_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [citationTags.id],
			name: "evidence_tag_links_tag_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.evidenceId, table.tagId], name: "evidence_tag_links_pkey"}),
]);

export const chunkTagLinks = pgTable("chunk_tag_links", {
	chunkId: uuid("chunk_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	source: text().default('system').notNull(),
	confidence: real().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_chunk_tag_links_chunk_id").using("btree", table.chunkId.asc().nullsLast().op("uuid_ops")),
	index("idx_chunk_tag_links_tag_id").using("btree", table.tagId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.chunkId],
			foreignColumns: [evidenceChunks.id],
			name: "chunk_tag_links_chunk_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [citationTags.id],
			name: "chunk_tag_links_tag_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.chunkId, table.tagId], name: "chunk_tag_links_pkey"}),
]);
export const vectorIndexStats = pgView("vector_index_stats", {	// TODO: failed to parse database type 'name', schemaname: text("schemaname"),
	// TODO: failed to parse database type 'name', tablename: text("tablename"),
	// TODO: failed to parse database type 'name', indexname: text("indexname"),
	indexSize: text("index_size"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	scans: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tuplesRead: bigint("tuples_read", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tuplesFetched: bigint("tuples_fetched", { mode: "number" }),
}).as(sql`SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size, pg_stat_get_numscans(indexname::regclass::oid) AS scans, pg_stat_get_tuples_returned(indexname::regclass::oid) AS tuples_read, pg_stat_get_tuples_fetched(indexname::regclass::oid) AS tuples_fetched FROM pg_indexes WHERE tablename = 'embeddings'::name AND indexname ~~ '%vector%'::text`);

export const legalDocumentAnalytics = pgView("legal_document_analytics", {	documentType: text("document_type"),
	practiceArea: text("practice_area"),
	jurisdiction: text(),
	confidentialityLevel: text("confidentiality_level"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	documentCount: bigint("document_count", { mode: "number" }),
	avgAiConfidence: doublePrecision("avg_ai_confidence"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	humanVerifiedCount: bigint("human_verified_count", { mode: "number" }),
	latestDocument: timestamp("latest_document", { withTimezone: true, mode: 'string' }),
	earliestDocument: timestamp("earliest_document", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT document_type, practice_area, jurisdiction, confidentiality_level, count(*) AS document_count, avg( CASE WHEN (((metadata -> 'aiMetadata'::text) ->> 'confidence'::text)::real) IS NOT NULL THEN ((metadata -> 'aiMetadata'::text) ->> 'confidence'::text)::real ELSE NULL::real END) AS avg_ai_confidence, count( CASE WHEN (((metadata -> 'aiMetadata'::text) ->> 'humanVerified'::text)::boolean) = true THEN 1 ELSE NULL::integer END) AS human_verified_count, max(created_at) AS latest_document, min(created_at) AS earliest_document FROM legal_documents_jsonb GROUP BY document_type, practice_area, jurisdiction, confidentiality_level`);

export const citationNetwork = pgView("citation_network", {	documentId: uuid("document_id"),
	documentTitle: text("document_title"),
	documentType: text("document_type"),
	citationType: text("citation_type"),
	citedDocument: text("cited_document"),
	relevanceScore: real("relevance_score"),
}).as(sql`SELECT d.id AS document_id: d.title AS document_title, d.document_type: citation.value ->> 'type'::text AS citation_type, citation.value ->> 'citation'::text AS cited_document, (citation.value ->> 'relevance'::text)::real AS relevance_score FROM legal_documents_jsonb d, LATERAL jsonb_array_elements(d.metadata -> 'citations'::text) citation(value) WHERE (d.metadata -> 'citations'::text) IS NOT NULL`);

export const phase72ErrorStats = pgView("phase72_error_stats", {	code: text(),
	severity: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	count: bigint({ mode: "number" }),
	firstSeen: timestamp("first_seen", { withTimezone: true, mode: 'string' }),
	lastSeen: timestamp("last_seen", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT code, severity, count(*) AS count, min(created_at) AS first_seen, max(created_at) AS last_seen FROM phase72_error GROUP BY code, severity ORDER BY (count(*)) DESC`);

export const phase72RouteErrors = pgView("phase72_route_errors", {	filePath: text("file_path"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	errorCount: bigint("error_count", { mode: "number" }),
	firstSeen: timestamp("first_seen", { withTimezone: true, mode: 'string' }),
	lastSeen: timestamp("last_seen", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT file_path, count(*) AS error_count, min(created_at) AS first_seen, max(created_at) AS last_seen FROM phase72_error GROUP BY file_path ORDER BY (count(*)) DESC`);

export const phase72ClusterQuality = pgView("phase72_cluster_quality", {	id: uuid(),
	label: text(),
	size: integer(),
	cycle: integer(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	hasSummary: boolean("has_summary"),
}).as(sql`SELECT c.id: c.label, c.size: c.cycle, c.created_at, cs.id IS NOT NULL AS has_summary FROM phase72_cluster c LEFT JOIN phase72_cluster_summary cs ON cs.cluster_id = c.id`);

export const phase72ErrorSummary = pgView("phase72_error_summary", {	code: text(),
	severity: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	errorCount: bigint("error_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	affectedFiles: bigint("affected_files", { mode: "number" }),
	lastSeen: timestamp("last_seen", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT code, severity, count(*) AS error_count, count(DISTINCT file_path) AS affected_files, max(created_at) AS last_seen FROM phase72_error GROUP BY code, severity ORDER BY (count(*)) DESC`);