import { pgTable, unique, uuid, text, jsonb, timestamp, foreignKey, doublePrecision, integer, index, varchar, real, serial, vector, bigint, smallint, boolean, check, bigserial, type AnyPgColumn, char, interval, uniqueIndex, numeric, date, inet, primaryKey, pgView, pgMaterializedView, pgSequence, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const activityStatus = pgEnum("activity_status", ['pending', 'in_progress', 'completed', 'cancelled'])
export const appCriticalityEnum = pgEnum("app_criticality_enum", ['core', 'high_risk', 'mid_tier', 'optional', 'experimental'])
export const auditOperation = pgEnum("audit_operation", ['CREATE', 'UPDATE', 'DELETE'])
export const auditTable = pgEnum("audit_table", ['Evidence', 'Tag', 'EvidenceTag', 'RAGIndex'])
export const authorityLevel = pgEnum("authority_level", ['primary', 'persuasive', 'secondary', 'fictional'])
export const caseLinkCategory = pgEnum("case_link_category", ['charged_under', 'cited_authority', 'defense_authority', 'court_ruling', 'related_regulation', 'constitutional_basis', 'sentencing_guideline', 'glossary_concept'])
export const caseLinkType = pgEnum("case_link_type", ['CHARGED_UNDER', 'CITED_IN', 'RELATED_TO', 'OVERRULED_BY', 'AFFIRMED_BY'])
export const casePriority = pgEnum("case_priority", ['low', 'medium', 'high', 'critical', 'urgent'])
export const caseRiskLevel = pgEnum("case_risk_level", ['low', 'medium', 'high', 'critical'])
export const caseStatus = pgEnum("case_status", ['open', 'in_progress', 'pending_review', 'closed', 'archived', 'active', 'pending', 'under_review'])
export const chatMessageRole = pgEnum("chat_message_role", ['user', 'assistant', 'system'])
export const citationType = pgEnum("citation_type", ['statutory', 'constitutional', 'regulatory', 'judicial', 'other'])
export const classificationStatus = pgEnum("classification_status", ['PENDING', 'CLASSIFYING', 'COMPLETE', 'CONFLICT_DETECTED', 'FAILED', 'DEFERRED'])
export const confidentialityLevel = pgEnum("confidentiality_level", ['public', 'standard', 'confidential', 'restricted', 'classified'])
export const corpusType = pgEnum("corpus_type", ['constitution', 'statute', 'regulation', 'bill', 'case', 'glossary', 'treatise', 'other'])
export const courtroomAnimType = pgEnum("courtroom_anim_type", ['idle', 'speaking', 'objection', 'walk', 'gesture', 'point', 'sit', 'stand', 'present_evidence', 'react_surprised', 'react_angry', 'react_sad', 'nod', 'shake_head'])
export const documentStatus = pgEnum("document_status", ['queued', 'processing', 'processed', 'failed', 'pending_ocr', 'ocr_completed', 'pending_embedding', 'embedding_completed', 'pending_summary', 'summary_completed'])
export const documentType = pgEnum("document_type", ['case_law', 'statute', 'regulation', 'brief', 'contract', 'evidence', 'report', 'precedent'])
export const errorKind = pgEnum("error_kind", ['runtime', 'api', 'other'])
export const errorSeverity = pgEnum("error_severity", ['info', 'warn', 'error', 'critical'])
export const evidenceType = pgEnum("evidence_type", ['document', 'photo', 'video', 'audio', 'physical', 'digital', 'witness_statement', 'forensic', 'documentary', 'testimonial', 'demonstrative', 'real', 'circumstantial', 'hearsay', 'expert', 'scientific'])
export const featureState = pgEnum("feature_state", ['proposal', 'specified', 'planned', 'ready', 'claimed', 'implementing', 'testing', 'review_required', 'validated', 'merged', 'released', 'blocked'])
export const fictionalActorRole = pgEnum("fictional_actor_role", ['defendant', 'prosecutor', 'judge', 'defense_attorney', 'witness', 'victim', 'agent', 'expert_witness', 'informant'])
export const fictionalCaseCategory = pgEnum("fictional_case_category", ['wire_fraud', 'drug_trafficking', 'firearms', 'cybercrime', 'obstruction', 'verbal_contracts', 'tort_federal', 'federal_employee_liability'])
export const filePurposeEnum = pgEnum("file_purpose_enum", ['audit', 'config', 'utility', 'core', 'test', 'demo', 'deprecated', 'archived', 'infrastructure', 'other'])
export const inferenceBackend = pgEnum("inference_backend", ['ollama', 'tensorrt', 'bifrost', 'litellm', 'pytorch', 'onnx'])
export const jurisdiction = pgEnum("jurisdiction", ['CA', 'NY', 'TX', 'Fed-US', 'Other'])
export const legalNodeType = pgEnum("legal_node_type", ['document', 'title', 'article', 'amendment', 'chapter', 'part', 'section', 'subsection', 'paragraph', 'clause', 'definition', 'appendix', 'note'])
export const modelCapability = pgEnum("model_capability", ['chat', 'embedding', 'vlm', 'code', 'summarization', 'rerank'])
export const packetType = pgEnum("packet_type", ['code', 'test', 'doc', 'prompt', 'tool', 'schema', 'api', 'spec'])
export const patchStatus = pgEnum("patch_status", ['suggested', 'applied', 'rejected'])
export const processingStatus = pgEnum("processing_status", ['queued', 'extracting', 'ocr', 'structuring', 'chunking', 'embedding', 'graphing', 'complete', 'failed'])
export const recommendationStatus = pgEnum("recommendation_status", ['PROPOSED', 'EVIDENCE_GATHERING', 'READY_FOR_REVIEW', 'APPROVED', 'IMPLEMENTED', 'VALIDATED', 'REJECTED', 'SUPERSEDED'])
export const relationType = pgEnum("relation_type", ['supports', 'contradicts', 'same_person', 'timeline', 'chain_of_custody', 'corroborates', 'alibi', 'motive', 'opportunity', 'means', 'witness_statement', 'physical_evidence', 'digital_evidence', 'circumstantial', 'direct_evidence', 'hearsay', 'privileged', 'inadmissible'])
export const reportStatus = pgEnum("report_status", ['draft', 'review', 'approved', 'published', 'archived'])
export const routeHealthState = pgEnum("route_health_state", ['healthy', 'degraded', 'unhealthy'])
export const serviceTier = pgEnum("service_tier", ['core', 'data', 'inference', 'future'])
export const signalType = pgEnum("signal_type", ['DOMAIN_CLASS', 'INTENT_TAG', 'RETRIEVAL_LANE', 'GRAPH_FACT', 'CLASSIFICATION', 'RECOMMENDATION', 'LEARNED_POS', 'LEARNED_ENTITY', 'AST_SYMBOL', 'EVIDENCE_REFERENCE'])
export const sourceType = pgEnum("source_type", ['upload', 'govinfo', 'state_official', 'openstates', 'lii_reference'])
export const suggestionState = pgEnum("suggestion_state", ['pending', 'applied', 'dismissed', 'snoozed'])
export const summaryType = pgEnum("summary_type", ['legal_analysis', 'executive_summary', 'key_facts'])
export const thoroughnessEnum = pgEnum("thoroughness_enum", ['stub', 'outline', 'partial', 'feature_complete', 'battle_tested'])
export const threatLevel = pgEnum("threat_level", ['low', 'medium', 'high', 'critical'])
export const userRole = pgEnum("user_role", ['prosecutor', 'detective', 'admin', 'analyst', 'paralegal', 'investigator', 'viewer', 'user'])
export const verificationStatus = pgEnum("verification_status", ['pending', 'verified', 'rejected', 'needs_review'])

export const aceHitLogsIdSeq = pgSequence("ace_hit_logs_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })
export const agentContextFilesHistoryIdSeq = pgSequence("agent_context_files_history_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })
export const agentContextRelationsIdSeq = pgSequence("agent_context_relations_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })
export const codeRetrievalChunksIdSeq = pgSequence("code_retrieval_chunks_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })
export const cpgEdgesIdSeq = pgSequence("cpg_edges_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const cpgNodesIdSeq = pgSequence("cpg_nodes_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const documentEmbeddingsIdSeq = pgSequence("document_embeddings_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const errorTopkIndexIdSeq = pgSequence("error_topk_index_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const fileIndexIdSeq = pgSequence("file_index_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const fixAttemptsIdSeq = pgSequence("fix_attempts_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })
export const hypergraphEdgeMembersIdSeq = pgSequence("hypergraph_edge_members_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const jurisdictionsIdSeq = pgSequence("jurisdictions_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })
export const kgNodesIdSeq = pgSequence("kg_nodes_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const multiDbTransactionsIdSeq = pgSequence("multi_db_transactions_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89AgenticCallsIdSeq = pgSequence("phase89_agentic_calls_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89AstSignaturesIdSeq = pgSequence("phase89_ast_signatures_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89CacheHitsIdSeq = pgSequence("phase89_cache_hits_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89CollectionSummariesIdSeq = pgSequence("phase89_collection_summaries_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89CosineRankingsIdSeq = pgSequence("phase89_cosine_rankings_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89EditComparisonsIdSeq = pgSequence("phase89_edit_comparisons_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89EditLogIdSeq = pgSequence("phase89_edit_log_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89EmbeddingsIdSeq = pgSequence("phase89_embeddings_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89ErrorClustersIdSeq = pgSequence("phase89_error_clusters_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89ErrorInstancesIdSeq = pgSequence("phase89_error_instances_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89FileTimelineIdSeq = pgSequence("phase89_file_timeline_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89FixAttemptsIdSeq = pgSequence("phase89_fix_attempts_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89ImportEdgesIdSeq = pgSequence("phase89_import_edges_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89KbCardsIdSeq = pgSequence("phase89_kb_cards_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89RipgrepCacheIdSeq = pgSequence("phase89_ripgrep_cache_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89TagMirrorIdSeq = pgSequence("phase89_tag_mirror_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89TimelineIdSeq = pgSequence("phase89_timeline_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89UnitIndexIdSeq = pgSequence("phase89_unit_index_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89VectorEventsIdSeq = pgSequence("phase89_vector_events_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const phase89VectorEventsVlmIdSeq = pgSequence("phase89_vector_events_vlm_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const rawErrorEmbeddingsIdSeq = pgSequence("raw_error_embeddings_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const taxonomyEdgesIdSeq = pgSequence("taxonomy_edges_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })
export const taxonomyNodesIdSeq = pgSequence("taxonomy_nodes_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })
export const tsErrorsIdSeq = pgSequence("ts_errors_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "2147483647", cache: "1", cycle: false })
export const vaultMdIndexIdSeq = pgSequence("vault_md_index_id_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })

export const adminModelWeights = pgTable("admin_model_weights", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	component: text().notNull(),
	version: text().notNull(),
	sha256: text().notNull(),
	status: text().default('candidate').notNull(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("admin_model_weights_comp_ver_uq").on(table.component, table.version),
]);

export const aceRetrievalHits = pgTable("ace_retrieval_hits", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	runId: uuid("run_id"),
	stableKey: text("stable_key").notNull(),
	chunkId: text("chunk_id"),
	filePath: text("file_path"),
	source: text().notNull(),
	vectorScore: doublePrecision("vector_score"),
	graphScore: doublePrecision("graph_score"),
	tagScore: doublePrecision("tag_score"),
	recencyScore: doublePrecision("recency_score"),
	errorRelevanceScore: doublePrecision("error_relevance_score"),
	finalScore: doublePrecision("final_score"),
	rank: integer(),
	reason: text(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.runId],
			foreignColumns: [aceRetrievalRuns.id],
			name: "ace_retrieval_hits_run_id_fkey"
		}).onDelete("cascade"),
]);

export const adminAiSubagentRuns = pgTable("admin_ai_subagent_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	skillId: uuid("skill_id"),
	sessionId: uuid("session_id"),
	status: text().notNull(),
	mission: text().notNull(),
	result: text(),
	trace: jsonb().notNull(),
	tokensUsed: integer("tokens_used").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
}, (table) => [
	index("idx_admin_ai_subagent_runs_skill_id").using("btree", table.skillId.asc().nullsLast().op("uuid_ops")),
	index("idx_admin_ai_subagent_runs_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [adminAiSkills.id],
			name: "admin_ai_subagent_runs_skill_id_fkey"
		}),
]);

export const atlasArtifacts = pgTable("atlas_artifacts", {
	artifactId: uuid("artifact_id").defaultRandom().primaryKey().notNull(),
	packetKey: varchar("packet_key", { length: 255 }).notNull(),
	sourceRef: varchar("source_ref", { length: 512 }).notNull(),
	featureId: varchar("feature_id", { length: 255 }),
	artifactType: varchar("artifact_type", { length: 50 }).notNull(),
	contentHash: varchar("content_hash", { length: 64 }),
	generator: varchar({ length: 100 }).notNull(),
	generatorVersion: varchar("generator_version", { length: 100 }).notNull(),
	generatorConfig: text("generator_config"),
	storageBackend: varchar("storage_backend", { length: 50 }).notNull(),
	storageLocation: text("storage_location"),
	ganValidated: timestamp("gan_validated", { withTimezone: true, mode: 'string' }),
	ganValidationScore: real("gan_validation_score"),
	supersedesArtifactId: uuid("supersedes_artifact_id"),
	status: varchar({ length: 50 }).default('generated').notNull(),
	traceId: uuid("trace_id"),
	gitCommit: varchar("git_commit", { length: 40 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_artifacts_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_artifacts_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_artifacts_gan_validated").using("btree", table.ganValidated.asc().nullsLast().op("timestamptz_ops")),
	index("idx_artifacts_generator").using("btree", table.generator.asc().nullsLast().op("text_ops")),
	index("idx_artifacts_generator_status").using("btree", table.generator.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_artifacts_generator_version").using("btree", table.generatorVersion.asc().nullsLast().op("text_ops")),
	index("idx_artifacts_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_artifacts_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_artifacts_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_artifacts_supersedes").using("btree", table.supersedesArtifactId.asc().nullsLast().op("uuid_ops")),
	index("idx_artifacts_type").using("btree", table.artifactType.asc().nullsLast().op("text_ops")),
	index("idx_atlas_artifacts_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
]);

export const parentAtlasRecords = pgTable("parent_atlas_records", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	lane: varchar({ length: 64 }).notNull(),
	nodeId: varchar("node_id", { length: 255 }).notNull(),
	title: text(),
	sourceRef: text("source_ref"),
	payload: jsonb().notNull(),
	indexVersion: integer("index_version").default(1),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const parentAtlasVectors = pgTable("parent_atlas_vectors", {
	id: serial().primaryKey().notNull(),
	recordId: varchar("record_id", { length: 255 }),
	sourceRef: text("source_ref"),
	featureId: varchar("feature_id", { length: 255 }),
	taskId: varchar("task_id", { length: 255 }),
	embedding: vector({ dimensions: 768 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.recordId],
			foreignColumns: [parentAtlasRecords.id],
			name: "parent_atlas_vectors_record_id_fkey"
		}).onDelete("cascade"),
]);

export const atlasSvgGlyphs = pgTable("atlas_svg_glyphs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: varchar("packet_key", { length: 255 }).notNull(),
	sourceRef: varchar("source_ref", { length: 255 }),
	glyphId: varchar("glyph_id", { length: 255 }),
	glyphType: varchar("glyph_type", { length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_svg_glyphs_glyph_id").using("btree", table.glyphId.asc().nullsLast().op("text_ops")),
	index("idx_svg_glyphs_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	unique("atlas_svg_glyphs_packet_key_key").on(table.packetKey),
]);

export const atlasTreeNodes = pgTable("atlas_tree_nodes", {
	nodeId: uuid("node_id").primaryKey().notNull(),
	rootId: uuid("root_id"),
	parentId: uuid("parent_id"),
	packetKey: text("packet_key"),
	featureId: text("feature_id"),
	featureLabel: text("feature_label"),
	sourceRef: text("source_ref"),
	filePath: text("file_path"),
	pageIndexPath: text("page_index_path"),
	nodeType: text("node_type").default('document').notNull(),
	treeDepth: integer("tree_depth").default(0).notNull(),
	title: text(),
	summary: text(),
	metadata: jsonb().default({}).notNull(),
	ledgerType: text("ledger_type").default('canonical').notNull(),
	lineageVersion: text("lineage_version").default('tree-nodes-v1').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	communityId: bigint("community_id", { mode: "number" }),
	somCluster: integer("som_cluster"),
	somX: smallint("som_x"),
	somY: smallint("som_y"),
	qdrantPointId: text("qdrant_point_id"),
	neo4JNodeId: text("neo4j_node_id"),
	glyphRecordId: uuid("glyph_record_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	contentPreview: text("content_preview"),
}, (table) => [
	index("idx_atlas_tree_nodes_file_path").using("btree", table.filePath.asc().nullsLast().op("text_ops")),
	index("idx_tree_nodes_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_tree_nodes_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_tree_nodes_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_tree_nodes_page_index_path").using("btree", table.pageIndexPath.asc().nullsLast().op("text_ops")),
	index("idx_tree_nodes_parent_id").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	index("idx_tree_nodes_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
]);

export const atlasHigherHopIndex = pgTable("atlas_higher_hop_index", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	featureId: text("feature_id"),
	filePath: text("file_path"),
	treeNodeId: uuid("tree_node_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	communityId: bigint("community_id", { mode: "number" }),
	somCluster: integer("som_cluster"),
	somX: smallint("som_x"),
	somY: smallint("som_y"),
	qdrantCollection: text("qdrant_collection"),
	qdrantPointId: text("qdrant_point_id"),
	qdrantScore: doublePrecision("qdrant_score"),
	qdrantPayloadHash: text("qdrant_payload_hash"),
	bifrostKey: text("bifrost_key"),
	bifrostScore: doublePrecision("bifrost_score"),
	gpuKarpathyKey: text("gpu_karpathy_key"),
	gpuKarpathyRank: integer("gpu_karpathy_rank"),
	redisCentroidKey: text("redis_centroid_key"),
	neo4JNodeId: text("neo4j_node_id"),
	neo4JLabels: jsonb("neo4j_labels"),
	neo4JPagerank: doublePrecision("neo4j_pagerank"),
	neo4JBetweenness: doublePrecision("neo4j_betweenness"),
	neo4JEigenvector: doublePrecision("neo4j_eigenvector"),
	glyphRecordId: uuid("glyph_record_id"),
	glyphRenderType: text("glyph_render_type"),
	evidenceMode: text("evidence_mode").default('native').notNull(),
	repairStatus: text("repair_status").default('pending').notNull(),
	lineageVersion: integer("lineage_version").default(1),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	identityLane: text("identity_lane"),
	sourceRefKey: text("source_ref_key"),
	identityConfidence: doublePrecision("identity_confidence"),
}, (table) => [
	index("idx_higher_hop_bifrost_score").using("btree", table.bifrostScore.desc().nullsFirst().op("float8_ops")),
	index("idx_higher_hop_created_brin").using("brin", table.createdAt.asc().nullsLast().op("timestamptz_minmax_ops")),
	index("idx_higher_hop_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_higher_hop_file_path_trgm").using("gin", table.filePath.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_higher_hop_lineage_brin").using("brin", table.lineageVersion.asc().nullsLast().op("int4_minmax_ops")),
	index("idx_higher_hop_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_higher_hop_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_higher_hop_pagerank").using("btree", table.neo4JPagerank.desc().nullsFirst().op("float8_ops")),
	index("idx_higher_hop_qdrant_point").using("btree", table.qdrantPointId.asc().nullsLast().op("text_ops")),
	index("idx_higher_hop_repair_status").using("btree", table.repairStatus.asc().nullsLast().op("text_ops")),
	index("idx_higher_hop_som_cluster").using("btree", table.somCluster.asc().nullsLast().op("int4_ops")),
	index("idx_higher_hop_som_grid").using("btree", table.somX.asc().nullsLast().op("int2_ops"), table.somY.asc().nullsLast().op("int2_ops")),
	index("idx_higher_hop_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.glyphRecordId],
			foreignColumns: [atlasSvgGlyphs.id],
			name: "fk_glyph"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.treeNodeId],
			foreignColumns: [atlasTreeNodes.nodeId],
			name: "fk_tree_node"
		}).onDelete("set null"),
	unique("atlas_higher_hop_index_packet_key_key").on(table.packetKey),
]);

export const atlasFeatureRelationships = pgTable("atlas_feature_relationships", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceFeatureId: varchar("source_feature_id", { length: 255 }).notNull(),
	targetFeatureId: varchar("target_feature_id", { length: 255 }).notNull(),
	relationshipType: varchar("relationship_type", { length: 50 }).notNull(),
	strength: real().default(0.5),
	reasoning: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_feature_relationships_source").using("btree", table.sourceFeatureId.asc().nullsLast().op("text_ops")),
	index("idx_feature_relationships_strength").using("btree", table.strength.desc().nullsFirst().op("float4_ops")),
	index("idx_feature_relationships_target").using("btree", table.targetFeatureId.asc().nullsLast().op("text_ops")),
	index("idx_feature_relationships_type").using("btree", table.relationshipType.asc().nullsLast().op("text_ops")),
	unique("unique_relationship").on(table.relationshipType, table.sourceFeatureId, table.targetFeatureId),
]);

export const atlasDomainOntology = pgTable("atlas_domain_ontology", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	groupId: varchar("group_id", { length: 255 }).notNull(),
	groupLabel: varchar("group_label", { length: 255 }).notNull(),
	parentGroupId: varchar("parent_group_id", { length: 255 }),
	description: text(),
	taxonomyLevel: integer("taxonomy_level").default(0),
	confidence: real().default(1),
	examples: text().array(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_domain_ontology_group_id").using("btree", table.groupId.asc().nullsLast().op("text_ops")),
	index("idx_domain_ontology_level").using("btree", table.taxonomyLevel.asc().nullsLast().op("int4_ops")),
	index("idx_domain_ontology_parent").using("btree", table.parentGroupId.asc().nullsLast().op("text_ops")),
	unique("atlas_domain_ontology_group_id_key").on(table.groupId),
]);

export const atlasEnrichmentProgress = pgTable("atlas_enrichment_progress", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	passNumber: integer("pass_number").notNull(),
	passName: varchar("pass_name", { length: 100 }).notNull(),
	totalPackets: integer("total_packets"),
	processedPackets: integer("processed_packets").default(0),
	failedPackets: integer("failed_packets").default(0),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	durationMinutes: real("duration_minutes"),
	status: varchar({ length: 50 }).default('in_progress'),
	notes: text(),
}, (table) => [
	index("idx_enrichment_progress_pass").using("btree", table.passNumber.asc().nullsLast().op("int4_ops"), table.status.asc().nullsLast().op("int4_ops")),
	index("idx_enrichment_progress_started").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	unique("unique_pass_run").on(table.passNumber, table.startedAt),
]);

export const packetFeatures = pgTable("packet_features", {
	packetKey: text("packet_key").primaryKey().notNull(),
	sourceRef: text("source_ref").notNull(),
	featureId: text("feature_id").notNull(),
	keywords: text().array().default([""]),
	semanticTags: text("semantic_tags").array().default([""]),
	pagerank: real(),
	communityId: integer("community_id"),
	somCluster: integer("som_cluster"),
	somX: integer("som_x"),
	somY: integer("som_y"),
	embeddingDim: integer("embedding_dim").default(768),
	latent64Dim: integer("latent_64_dim").default(64),
	clusterId: integer("cluster_id"),
	rerankScore: real("rerank_score"),
	extractedAt: timestamp("extracted_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_packet_features_cluster_id").using("btree", table.clusterId.asc().nullsLast().op("int4_ops")),
	index("idx_packet_features_community_id").using("btree", table.communityId.asc().nullsLast().op("int4_ops")),
	index("idx_packet_features_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_packet_features_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "packet_features_packet_key_fkey"
		}).onDelete("cascade"),
]);

export const agentSchedulerJobs = pgTable("agent_scheduler_jobs", {
	id: text().primaryKey().notNull(),
	taskKey: text("task_key").notNull(),
	packetKey: text("packet_key"),
	jobType: text("job_type").notNull(),
	priority: integer().default(5),
	status: text().default('queued'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	result: jsonb(),
}, (table) => [
	index("idx_agent_jobs_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_agent_jobs_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [packetFeatures.packetKey],
			name: "agent_scheduler_jobs_packet_key_fkey"
		}),
]);

export const codeFeatureEmbeddings = pgTable("code_feature_embeddings", {
	featureId: text("feature_id").primaryKey().notNull(),
	embeddingModel: text("embedding_model").default('embeddinggemma:latest').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	qdrantId: bigint("qdrant_id", { mode: "number" }).notNull(),
	vectorName: text("vector_name").default('content').notNull(),
	vectorDim: integer("vector_dim").default(768),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_code_feature_embeddings_model").using("btree", table.embeddingModel.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.featureId],
			foreignColumns: [codeFeatures.featureId],
			name: "code_feature_embeddings_feature_id_fkey"
		}).onDelete("cascade"),
	unique("code_feature_embeddings_qdrant_id_key").on(table.qdrantId),
]);

export const featureStatistics = pgTable("feature_statistics", {
	featureId: text("feature_id").primaryKey().notNull(),
	pagerank: real().default(0),
	hitsAuthority: real("hits_authority").default(0),
	hitsHub: real("hits_hub").default(0),
	community: integer(),
	somCluster: integer("som_cluster"),
	somCell: varchar("som_cell", { length: 10 }),
	clusterDegree: integer("cluster_degree").default(0),
	inDegree: integer("in_degree").default(0),
	outDegree: integer("out_degree").default(0),
	betweenness: real().default(0),
	freshnessDays: integer("freshness_days").default(0),
	lastUpdated: timestamp("last_updated", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_feature_statistics_community").using("btree", table.community.asc().nullsLast().op("int4_ops")),
	index("idx_feature_statistics_last_updated").using("btree", table.lastUpdated.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_feature_statistics_pagerank").using("btree", table.pagerank.desc().nullsFirst().op("float4_ops")),
	index("idx_feature_statistics_som").using("btree", table.somCluster.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.featureId],
			foreignColumns: [codeFeatures.featureId],
			name: "feature_statistics_feature_id_fkey"
		}).onDelete("cascade"),
]);

export const codeFeatures = pgTable("code_features", {
	featureId: text("feature_id").primaryKey().notNull(),
	sourceRef: text("source_ref").notNull(),
	symbol: text().notNull(),
	kind: text().notNull(),
	language: text().notNull(),
	lineStart: integer("line_start"),
	lineEnd: integer("line_end"),
	packetKey: text("packet_key"),
	domainClass: text("domain_class"),
	ontologyLabel: text("ontology_label"),
	staticTags: text("static_tags").array().default(["RAY"]),
	summary: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	pageRankScore: real("page_rank_score").default(0),
	pageRankUpdatedAt: timestamp("page_rank_updated_at", { withTimezone: true, mode: 'string' }),
	topologySummary: text("topology_summary"),
	provenanceSummary: text("provenance_summary"),
	nounTerms: jsonb("noun_terms").default([]),
	somCell: varchar("som_cell", { length: 10 }).default(sql`NULL`),
	topologyWeight: real("topology_weight").default(0.5),
}, (table) => [
	index("idx_code_features_domain_class").using("btree", table.domainClass.asc().nullsLast().op("text_ops")),
	index("idx_code_features_kind").using("btree", table.kind.asc().nullsLast().op("text_ops")),
	index("idx_code_features_language").using("btree", table.language.asc().nullsLast().op("text_ops")),
	index("idx_code_features_ontology_label").using("btree", table.ontologyLabel.asc().nullsLast().op("text_ops")),
	index("idx_code_features_page_rank").using("btree", table.pageRankScore.desc().nullsFirst().op("float4_ops")),
	index("idx_code_features_page_rank_score").using("btree", table.pageRankScore.desc().nullsFirst().op("float4_ops")),
	index("idx_code_features_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_code_features_symbol").using("btree", table.symbol.asc().nullsLast().op("text_ops")),
	index("idx_code_features_tags").using("gin", table.staticTags.asc().nullsLast().op("array_ops")),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "code_features_packet_key_fkey"
		}).onDelete("set null"),
	unique("code_features_source_ref_symbol_kind_key").on(table.kind, table.sourceRef, table.symbol),
]);

export const codebaseChunkIndexBackup = pgTable("codebase_chunk_index_backup", {
	id: uuid(),
	qdrantId: varchar("qdrant_id", { length: 64 }),
	relativePath: text("relative_path"),
	symbol: varchar({ length: 255 }),
	kind: varchar({ length: 50 }),
	lineStart: integer("line_start"),
	lineEnd: integer("line_end"),
	// TODO: failed to parse database type 'halfvec(768)'
	contentEmbedding: unknown("content_embedding"),
	gpuCluster: integer("gpu_cluster"),
	somCluster: integer("som_cluster"),
	pageRankScore: real("page_rank_score"),
	communityId: integer("community_id"),
	tags: jsonb(),
	neo4JMeta: jsonb("neo4j_meta"),
	indexedAt: timestamp("indexed_at", { withTimezone: true, mode: 'string' }),
	enrichedAt: timestamp("enriched_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	content: text(),
	clusterSummary: jsonb("cluster_summary"),
	// TODO: failed to parse database type 'halfvec(768)'
	summaryEmbedding: unknown("summary_embedding"),
	// TODO: failed to parse database type 'halfvec(768)'
	signatureEmbedding: unknown("signature_embedding"),
	domain: varchar({ length: 50 }),
	language: varchar({ length: 20 }),
	extension: varchar({ length: 20 }),
	embeddingModel: varchar("embedding_model", { length: 100 }),
	summaryModel: varchar("summary_model", { length: 100 }),
	summary: text(),
	metadata: jsonb(),
	semanticTags: text("semantic_tags"),
	somBmuRow: integer("som_bmu_row"),
	somBmuCol: integer("som_bmu_col"),
	manifold4: real(),
	chunkId: text("chunk_id"),
	repoId: uuid("repo_id"),
	contentHash: text("content_hash"),
	tokenCount: integer("token_count"),
	neo4JGpuCluster: integer("neo4j_gpu_cluster"),
	outputMeta: jsonb("output_meta"),
	contentEmbedding384: vector("content_embedding_384", { dimensions: 384 }),
	summaryEmbedding384: vector("summary_embedding_384", { dimensions: 384 }),
	embeddingDimension: integer("embedding_dimension"),
	embeddingNormalized: boolean("embedding_normalized"),
	errorEmbedding: vector("error_embedding", { dimensions: 384 }),
});

export const codebaseChunkIndexStats = pgTable("codebase_chunk_index_stats", {
	id: serial().primaryKey().notNull(),
	totalChunks: integer("total_chunks").default(0).notNull(),
	summarizedChunks: integer("summarized_chunks").default(0).notNull(),
	missingChunks: integer("missing_chunks").default(0).notNull(),
	goodSummaries: integer("good_summaries").default(0).notNull(),
	contaminatedSummaries: integer("contaminated_summaries").default(0).notNull(),
	last5MinSummaries: integer("last_5min_summaries").default(0).notNull(),
	lastComputedAt: timestamp("last_computed_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("codebase_chunk_index_stats_last_computed_at_key").on(table.lastComputedAt),
]);

export const errorSignalStream = pgTable("error_signal_stream", {
	id: serial().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	taskId: text("task_id").notNull(),
	errorClass: text("error_class").notNull(),
	modelName: text("model_name").notNull(),
	evidence: jsonb().default({}).notNull(),
	ingestedAt: timestamp("ingested_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_error_signal_ingested_at").using("btree", table.ingestedAt.desc().nullsFirst().op("timestamp_ops")),
	index("idx_error_signal_packet_task_class").using("btree", table.packetKey.asc().nullsLast().op("text_ops"), table.taskId.asc().nullsLast().op("text_ops"), table.errorClass.asc().nullsLast().op("text_ops")),
]);

export const dagHitEnvelopeCache = pgTable("dag_hit_envelope_cache", {
	packetKey: text("packet_key").primaryKey().notNull(),
	// TODO: failed to parse database type 'bytea'
	binaryPayload: unknown("binary_payload").notNull(),
	packetShapeHash: text("packet_shape_hash").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	source: text().notNull(),
}, (table) => [
	index("idx_dag_hit_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamp_ops")),
	check("dag_hit_envelope_cache_source_check", sql`source = ANY (ARRAY['dag_hit'::text, 'cache_swap'::text, 'repair'::text])`),
]);

export const errorClusterGroups = pgTable("error_cluster_groups", {
	id: serial().primaryKey().notNull(),
	errorClass: text("error_class").notNull(),
	modelName: text("model_name").notNull(),
	taskId: text("task_id").notNull(),
	packetKeys: text("packet_keys").array().default([""]).notNull(),
	failureCount: integer("failure_count").default(0).notNull(),
	lastSeen: timestamp("last_seen", { mode: 'string' }).defaultNow().notNull(),
	recoveryPacketKey: text("recovery_packet_key"),
	recoveryConfidence: real("recovery_confidence"),
	recoveryReason: text("recovery_reason"),
}, (table) => [
	index("idx_error_cluster_class_model_seen").using("btree", table.errorClass.asc().nullsLast().op("timestamp_ops"), table.modelName.asc().nullsLast().op("text_ops"), table.lastSeen.desc().nullsFirst().op("text_ops")),
	index("idx_error_cluster_recovery_packet").using("btree", table.recoveryPacketKey.asc().nullsLast().op("text_ops")),
	unique("error_cluster_groups_error_class_model_name_task_id_key").on(table.errorClass, table.modelName, table.taskId),
]);

export const graphifyAuditKanban = pgTable("graphify_audit_kanban", {
	taskId: text("task_id").primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	featureId: text("feature_id"),
	featureLabel: text("feature_label"),
	sourceRefs: text("source_refs").array(),
	lane: text().default('todo').notNull(),
	status: text().default('pending').notNull(),
	policyScore: real("policy_score"),
	errorPattern: text("error_pattern"),
	hmmConfidence: real("hmm_confidence"),
	hmmSuggestedAction: text("hmm_suggested_action"),
	gemma4Recommendation: text("gemma4_recommendation"),
	astRerankerSignal: jsonb("ast_reranker_signal"),
	langextractSignal: jsonb("langextract_signal"),
	blendConfidence: real("blend_confidence"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const atlasFeatureEnvelopes = pgTable("atlas_feature_envelopes", {
	packetKey: text("packet_key").primaryKey().notNull(),
	sourceRef: text("source_ref").notNull(),
	sourceRefKey: text("source_ref_key"),
	featureId: text("feature_id").notNull(),
	featureLabel: text("feature_label").notNull(),
	domainClass: text("domain_class"),
	ontologyLabel: text("ontology_label").array().default([""]),
	topologyLabel: text("topology_label").array().default([""]),
	communityId: integer("community_id"),
	clusterKey: text("cluster_key"),
	somCluster: integer("som_cluster"),
	pagerank: real(),
	keywords: text().array().default([""]),
	entities: text().array().default([""]),
	summaryPacketKey: text("summary_packet_key"),
	provenance: jsonb().default({}),
	materializedAt: timestamp("materialized_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	summaryText: text("summary_text"),
	titleId: text("title_id"),
	lexicalNouns: jsonb("lexical_nouns").default([]),
	lexicalVerbs: jsonb("lexical_verbs").default([]),
	lexicalAdverbsLy: jsonb("lexical_adverbs_ly").default([]),
	lexicalTerms: jsonb("lexical_terms").default({}),
	summaryRankScore: real("summary_rank_score"),
	summaryRankStatus: text("summary_rank_status"),
	treeNodeId: text("tree_node_id"),
	usedConcepts: jsonb("used_concepts").default([]),
	filePath: text("file_path"),
	topology: jsonb().default({}),
	domainCentroidKey: text("domain_centroid_key"),
	featureCentroidKey: text("feature_centroid_key"),
	kmeansCentroidKey: text("kmeans_centroid_key"),
	somCentroidKey: text("som_centroid_key"),
	communityCentroidKey: text("community_centroid_key"),
	redisCentroidKey: text("redis_centroid_key"),
	somCell: text("som_cell"),
}, (table) => [
	index("idx_feature_envelopes_community_id").using("btree", table.communityId.asc().nullsLast().op("int4_ops")),
	index("idx_feature_envelopes_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_feature_envelopes_lexical_terms").using("gin", table.lexicalTerms.asc().nullsLast().op("jsonb_ops")),
	index("idx_feature_envelopes_som_cluster").using("btree", table.somCluster.asc().nullsLast().op("int4_ops")),
	index("idx_feature_envelopes_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_feature_envelopes_title_id").using("btree", table.titleId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "atlas_feature_envelopes_packet_key_fkey"
		}),
]);

export const agentTraces = pgTable("agent_traces", {
	traceId: uuid("trace_id").primaryKey().notNull(),
	taskId: text("task_id"),
	prompt: text(),
	retrievedPackets: jsonb("retrieved_packets"),
	toolCalls: jsonb("tool_calls"),
	commands: jsonb(),
	outcome: text(),
	retrievalStrategy: text("retrieval_strategy"),
	selectedConcepts: jsonb("selected_concepts"),
	score: real(),
	traceSource: text("trace_source"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const atlasFeatureRecommendationIndex = pgTable("atlas_feature_recommendation_index", {
	featureId: text("feature_id").primaryKey().notNull(),
	featureLabel: text("feature_label"),
	domainClass: text("domain_class"),
	titleId: text("title_id"),
	packetCount: integer("packet_count").default(0).notNull(),
	summaryCount: integer("summary_count").default(0).notNull(),
	missingSummaryCount: integer("missing_summary_count").default(0).notNull(),
	rankReadyCount: integer("rank_ready_count").default(0).notNull(),
	avgPageRank: real("avg_page_rank"),
	maxPageRank: real("max_page_rank"),
	communityId: integer("community_id"),
	somCluster: integer("som_cluster"),
	entityCount: integer("entity_count").default(0).notNull(),
	bitfrostKeyedCount: integer("bitfrost_keyed_count").default(0).notNull(),
	treeLinkedCount: integer("tree_linked_count").default(0).notNull(),
	lexicallyRichCount: integer("lexically_rich_count").default(0).notNull(),
	missingCommunityCount: integer("missing_community_count").default(0).notNull(),
	missingSomCount: integer("missing_som_count").default(0).notNull(),
	missingPagerankCount: integer("missing_pagerank_count").default(0).notNull(),
	summaryCoverage: real("summary_coverage").default(0).notNull(),
	rankCoverage: real("rank_coverage").default(0).notNull(),
	pagerankCoverage: real("pagerank_coverage").default(0).notNull(),
	somCoverage: real("som_coverage").default(0).notNull(),
	communityCoverage: real("community_coverage").default(0).notNull(),
	todoScore: integer("todo_score").default(0).notNull(),
	usedConcepts: jsonb("used_concepts").default([]),
	lexicalNouns: jsonb("lexical_nouns").default([]),
	lexicalVerbs: jsonb("lexical_verbs").default([]),
	lexicalAdverbsLy: jsonb("lexical_adverbs_ly").default([]),
	treeNodeId: text("tree_node_id"),
	packetKey: text("packet_key"),
	sourceRef: text("source_ref"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	qdrantKeyedCount: integer("qdrant_keyed_count").default(0).notNull(),
}, (table) => [
	index("idx_feature_recommendation_index_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_feature_recommendation_index_title_id").using("btree", table.titleId.asc().nullsLast().op("text_ops")),
	index("idx_feature_recommendation_index_todo_score").using("btree", table.todoScore.desc().nullsFirst().op("int4_ops")),
]);

export const atlasPacketFeatures = pgTable("atlas_packet_features", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	usedConcepts: text("used_concepts").array().default(["RAY"]),
	conceptCoverage: real("concept_coverage").default(0),
	lexicalFeatures: text("lexical_features").array().default(["RAY"]),
	astSymbols: text("ast_symbols").array().default(["RAY"]),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	entities: text().array().default([""]),
	treeNodeIds: jsonb("tree_node_ids").default({}),
	imports: text().array().default(["RAY"]),
	exports: text().array().default(["RAY"]),
}, (table) => [
	index("idx_ast_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packet_features_concepts_gin").using("gin", table.usedConcepts.asc().nullsLast().op("array_ops")),
	index("idx_atlas_packet_features_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	unique("atlas_packet_features_packet_key_key").on(table.packetKey),
]);

export const packetQdrantBridge = pgTable("packet_qdrant_bridge", {
	packetKey: text("packet_key").primaryKey().notNull(),
	sourceRef: text("source_ref").notNull(),
	featureId: text("feature_id"),
	qdrantPointId: text("qdrant_point_id").notNull(),
	qdrantCollection: text("qdrant_collection").default('codebase_chunks_768').notNull(),
	matchedBy: text("matched_by").notNull(),
	confidence: real().default(1).notNull(),
	relativePath: text("relative_path"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	directoryPath: text("directory_path"),
}, (table) => [
	index("idx_packet_qdrant_bridge_point_id").using("btree", table.qdrantPointId.asc().nullsLast().op("text_ops")),
	index("idx_packet_qdrant_bridge_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
]);

export const atlasPacketRegistry = pgTable("atlas_packet_registry", {
	packetKey: text("packet_key").primaryKey().notNull(),
	traceId: text("trace_id"),
	sourceRef: text("source_ref").notNull(),
	filePath: text("file_path").notNull(),
	featureId: text("feature_id").notNull(),
	title: text(),
	summary: text(),
	embeddingStatus: text("embedding_status").default('missing'),
	embeddingDim: integer("embedding_dim").default(768),
	embedding768D: vector("embedding_768d", { dimensions: 768 }),
	latent384D: vector("latent_384d", { dimensions: 384 }),
	// TODO: failed to parse database type 'bytea'
	latent64: unknown("latent_64"),
	kmeansClusterId: text("kmeans_cluster_id"),
	somX: integer("som_x"),
	somY: integer("som_y"),
	semanticZ: real("semantic_z"),
	activityW: real("activity_w"),
	manifold4: jsonb(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	qdrantPointId: bigint("qdrant_point_id", { mode: "number" }),
	turbovecId: text("turbovec_id"),
	neo4JNodeId: text("neo4j_node_id"),
	valkeyCacheKey: text("valkey_cache_key"),
	aceCacheKey: text("ace_cache_key"),
	seaweedfsFilerPath: text("seaweedfs_filer_path"),
	pagerankScore: real("pagerank_score"),
	authorityBlend: real("authority_blend"),
	karpathyScore: real("karpathy_score"),
	lastRerankScore: real("last_rerank_score"),
	retrievalCount: integer("retrieval_count").default(0),
	cacheHits: integer("cache_hits").default(0),
	cacheMisses: integer("cache_misses").default(0),
	lastRetrieved: timestamp("last_retrieved", { mode: 'string' }),
	cacheState: text("cache_state").default('cold'),
	activity: jsonb(),
	status: text().default('active'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	kagEdges: jsonb("kag_edges").default({}),
	dagEdges: jsonb("dag_edges").default({}),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalSizeBytes: bigint("total_size_bytes", { mode: "number" }),
	validationStatus: text("validation_status"),
	lastValidated: timestamp("last_validated", { mode: 'string' }),
	sourceRefKey: text("source_ref_key"),
	canonicalSourceRef: text("canonical_source_ref"),
	directoryPath: text("directory_path"),
	titleId: text("title_id"),
	treeNodeId: text("tree_node_id"),
	parentNodeId: text("parent_node_id"),
	rootNodeId: text("root_node_id"),
}, (table) => [
	index("idx_packet_authority").using("btree", table.authorityBlend.desc().nullsLast().op("float4_ops")),
	index("idx_packet_cache_state").using("btree", table.cacheState.asc().nullsLast().op("text_ops")),
	index("idx_packet_dag_edges").using("gin", table.dagEdges.asc().nullsLast().op("jsonb_ops")),
	index("idx_packet_embedding_cosine").using("hnsw", table.embedding768D.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_packet_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_packet_kag_edges").using("gin", table.kagEdges.asc().nullsLast().op("jsonb_ops")),
	index("idx_packet_pagerank").using("btree", table.pagerankScore.desc().nullsLast().op("float4_ops")),
	index("idx_packet_retrieved").using("btree", table.lastRetrieved.desc().nullsLast().op("timestamp_ops")),
	index("idx_packet_updated").using("btree", table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	unique("atlas_packet_registry_qdrant_point_id_key").on(table.qdrantPointId),
	unique("atlas_packet_registry_turbovec_id_key").on(table.turbovecId),
	unique("atlas_packet_registry_neo4j_node_id_key").on(table.neo4JNodeId),
	unique("atlas_packet_registry_valkey_cache_key_key").on(table.valkeyCacheKey),
	unique("atlas_packet_registry_ace_cache_key_key").on(table.aceCacheKey),
	unique("atlas_packet_registry_seaweedfs_filer_path_key").on(table.seaweedfsFilerPath),
	check("atlas_packet_registry_cache_state_check", sql`cache_state = ANY (ARRAY['L1:redis'::text, 'L2:bifrost'::text, 'L3:qdrant'::text, 'L4:disk'::text, 'cold'::text])`),
	check("atlas_packet_registry_embedding_status_check", sql`embedding_status = ANY (ARRAY['missing'::text, 'pending'::text, 'complete'::text, 'failed'::text])`),
	check("atlas_packet_registry_status_check", sql`status = ANY (ARRAY['active'::text, 'archived'::text, 'staged'::text, 'error'::text])`),
	check("atlas_packet_registry_validation_status_check", sql`validation_status = ANY (ARRAY['valid'::text, 'needs_review'::text, 'corrupted'::text])`),
]);

export const atlasTopologyClusters = pgTable("atlas_topology_clusters", {
	clusterId: integer("cluster_id").primaryKey().notNull(),
	size: integer().default(0),
	method: text().default('kmeans_phase2b'),
	// TODO: failed to parse database type 'bytea'
	semanticCenter: unknown("semantic_center"),
	authority: real().default(0),
	somRow: integer("som_row"),
	somCol: integer("som_col"),
	somCluster: integer("som_cluster"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	inertia: real(),
	silhouette: real(),
	daviesBouldin: real("davies_bouldin"),
});

export const atlasIdHierarchyMetadata = pgTable("atlas_id_hierarchy_metadata", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	repositoryId: uuid("repository_id"),
	directoryId: uuid("directory_id"),
	fileId: uuid("file_id"),
	moduleId: uuid("module_id"),
	symbolId: uuid("symbol_id"),
	featureId: text("feature_id"),
	chunkId: uuid("chunk_id"),
	sourceRef: text("source_ref"),
	directoryPath: text("directory_path"),
	confidence: real().default(1),
	lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true, mode: 'string' }),
	verifiedByLane: text("verified_by_lane"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_atlas_id_hierarchy_metadata_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_id_hierarchy_metadata_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_atlas_id_hierarchy_metadata_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "atlas_id_hierarchy_metadata_packet_key_fkey"
		}).onDelete("cascade"),
	unique("atlas_id_hierarchy_metadata_packet_key_key").on(table.packetKey),
]);

export const ontologyEdges = pgTable("ontology_edges", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourcePacketKey: varchar("source_packet_key", { length: 255 }).notNull(),
	targetPacketKey: varchar("target_packet_key", { length: 255 }).notNull(),
	edgeType: varchar("edge_type", { length: 50 }).notNull(),
	confidence: real().default(0.9).notNull(),
	extractedAt: timestamp("extracted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ontology_edges_source").using("btree", table.sourcePacketKey.asc().nullsLast().op("text_ops")),
	index("idx_ontology_edges_target").using("btree", table.targetPacketKey.asc().nullsLast().op("text_ops")),
	index("idx_ontology_edges_type").using("btree", table.edgeType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.sourcePacketKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "ontology_edges_source_packet_key_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetPacketKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "ontology_edges_target_packet_key_fkey"
		}).onDelete("cascade"),
	unique("ontology_edges_source_packet_key_target_packet_key_edge_typ_key").on(table.edgeType, table.sourcePacketKey, table.targetPacketKey),
	check("ontology_edges_confidence_check", sql`(confidence >= (0)::double precision) AND (confidence <= (1)::double precision)`),
]);

export const packetVectorBundles = pgTable("packet_vector_bundles", {
	packetKey: varchar("packet_key", { length: 255 }).primaryKey().notNull(),
	contentVector: vector("content_vector", { dimensions: 384 }),
	titleVector: vector("title_vector", { dimensions: 384 }),
	summaryVector: vector("summary_vector", { dimensions: 384 }),
	keywordVector: vector("keyword_vector", { dimensions: 384 }),
	apiVector: vector("api_vector", { dimensions: 384 }),
	topologyVector: vector("topology_vector", { dimensions: 384 }),
	latent64Vector: vector("latent64_vector", { dimensions: 64 }),
	graphVector: vector("graph_vector", { dimensions: 384 }),
	enrichedAt: timestamp("enriched_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_packet_vector_bundles_enriched").using("btree", table.enrichedAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "packet_vector_bundles_packet_key_fkey"
		}).onDelete("cascade"),
]);

export const toolExecutionLog = pgTable("tool_execution_log", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	toolId: text("tool_id").notNull(),
	query: text(),
	success: integer().notNull(),
	latencyMs: integer("latency_ms"),
	errorType: text("error_type"),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_tool_exec_log_success").using("btree", table.success.asc().nullsLast().op("int4_ops")),
	index("idx_tool_exec_log_timestamp").using("btree", table.timestamp.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_tool_exec_log_tool_id").using("btree", table.toolId.asc().nullsLast().op("text_ops")),
	index("idx_tool_exec_log_tool_timestamp").using("btree", table.toolId.asc().nullsLast().op("timestamptz_ops"), table.timestamp.desc().nullsFirst().op("text_ops")),
]);

export const toolRegistry = pgTable("tool_registry", {
	toolId: text("tool_id").primaryKey().notNull(),
	name: text().notNull(),
	summary: text().notNull(),
	inputSchema: jsonb("input_schema").default({}).notNull(),
	outputSchema: jsonb("output_schema").default({}).notNull(),
	examples: text().array().default([""]).notNull(),
	domains: text().array().default([""]).notNull(),
	embedding: vector({ dimensions: 384 }),
	successCount: integer("success_count").default(0),
	failureCount: integer("failure_count").default(0),
	avgLatencyMs: real("avg_latency_ms").default(0),
	allowedHmmStates: text("allowed_hmm_states").array().default(["RAY['CANONICAL'::text", "'RECOVERABLE'::tex"]),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	toolCapabilities: jsonb("tool_capabilities").default([]),
	toolConstraints: jsonb("tool_constraints").default({}),
	toolExamples: jsonb("tool_examples").default({}),
	toolTags: text("tool_tags").array().default([""]),
	failureModes: jsonb("failure_modes").default({"unknown":0,"timeouts":0,"rate_limit":0,"api_failure":0,"schema_mismatch":0}),
	timeoutCount: integer("timeout_count").default(0),
	schemaMismatchCount: integer("schema_mismatch_count").default(0),
	falsePositiveRate: real("false_positive_rate").default(0),
	rollingSuccessRate7D: real("rolling_success_rate_7d").default(0),
}, (table) => [
	index("idx_tool_registry_capabilities_gin").using("gin", table.toolCapabilities.asc().nullsLast().op("jsonb_ops")),
	index("idx_tool_registry_rolling_rate").using("btree", table.rollingSuccessRate7D.desc().nullsFirst().op("float4_ops")),
	index("idx_tool_registry_tags").using("gin", table.toolTags.asc().nullsLast().op("array_ops")),
	index("tool_registry_domain_idx").using("gin", table.domains.asc().nullsLast().op("array_ops")),
	index("tool_registry_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("tool_registry_schema_gin").using("gin", table.inputSchema.asc().nullsLast().op("jsonb_path_ops")),
]);

export const proposedToolCalls = pgTable("proposed_tool_calls", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	traceId: uuid("trace_id").notNull(),
	decisionId: varchar("decision_id", { length: 255 }).notNull(),
	query: text().notNull(),
	previousState: varchar("previous_state", { length: 50 }).notNull(),
	selectedToolName: varchar("selected_tool_name", { length: 255 }).notNull(),
	selectedToolNamespace: varchar("selected_tool_namespace", { length: 50 }),
	candidateTools: text("candidate_tools").array().notNull(),
	confidenceScore: real("confidence_score").notNull(),
}, (table) => [
	unique("proposed_tool_calls_decision_id_key").on(table.decisionId),
]);

export const projects = pgTable("projects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectKey: text("project_key").notNull(),
	name: text().notNull(),
	description: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("projects_project_key_key").on(table.projectKey),
]);

export const specs = pgTable("specs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	specKey: text("spec_key").notNull(),
	title: text().notNull(),
	currentRevisionId: uuid("current_revision_id"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.currentRevisionId],
			foreignColumns: [specRevisions.id],
			name: "specs_current_revision_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "specs_project_id_fkey"
		}).onDelete("cascade"),
	unique("specs_project_id_spec_key_key").on(table.projectId, table.specKey),
]);

export const specRevisions = pgTable("spec_revisions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	specId: uuid("spec_id").notNull(),
	revisionNumber: integer("revision_number").notNull(),
	content: jsonb().notNull(),
	contentHash: char("content_hash", { length: 64 }).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.specId],
			foreignColumns: [specs.id],
			name: "spec_revisions_spec_id_fkey"
		}).onDelete("cascade"),
	unique("spec_revisions_spec_id_revision_number_key").on(table.revisionNumber, table.specId),
]);

export const features = pgTable("features", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	specId: uuid("spec_id"),
	featureKey: text("feature_key").notNull(),
	title: text().notNull(),
	description: text(),
	state: featureState().default('proposal').notNull(),
	version: integer().default(1).notNull(),
	claimedBy: uuid("claimed_by"),
	blockedReason: text("blocked_reason"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "features_project_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.specId],
			foreignColumns: [specs.id],
			name: "features_spec_id_fkey"
		}).onDelete("set null"),
	unique("features_project_id_feature_key_key").on(table.featureKey, table.projectId),
]);

export const cacheProbeRuns = pgTable("cache_probe_runs", {
	runId: uuid("run_id").primaryKey().notNull(),
	contextHash: varchar("context_hash", { length: 64 }).notNull(),
	contextChars: integer("context_chars").notNull(),
	iterations: integer().notNull(),
	sourceFile: text("source_file").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_cache_probe_runs_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
]);

export const phase2FGroundTruthExpectations = pgTable("phase2f_ground_truth_expectations", {
	id: serial().primaryKey().notNull(),
	groundTruthId: varchar("ground_truth_id", { length: 255 }).notNull(),
	packetKey: varchar("packet_key", { length: 255 }).notNull(),
	rank: integer().notNull(),
	relevance: real().notNull(),
	reason: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.groundTruthId],
			foreignColumns: [phase2FGroundTruth.id],
			name: "phase2f_ground_truth_expectations_ground_truth_id_fkey"
		}).onDelete("cascade"),
]);

export const encoderProvenance = pgTable("encoder_provenance", {
	id: serial().primaryKey().notNull(),
	encoderId: text("encoder_id").notNull(),
	encoderType: varchar("encoder_type", { length: 50 }).notNull(),
	inputDimension: smallint("input_dimension").notNull(),
	outputDimension: smallint("output_dimension").notNull(),
	modelId: varchar("model_id", { length: 255 }).notNull(),
	checkpointHash: varchar("checkpoint_hash", { length: 64 }).notNull(),
	trainedAt: timestamp("trained_at", { withTimezone: true, mode: 'string' }).notNull(),
	trainingDurationSeconds: interval("training_duration_seconds"),
	trainingLossFinal: real("training_loss_final"),
	validationLossFinal: real("validation_loss_final"),
	normalization: varchar({ length: 50 }).default('l2').notNull(),
	normalizationParams: jsonb("normalization_params"),
	reconstructionMse: real("reconstruction_mse").notNull(),
	reconstructionMae: real("reconstruction_mae"),
	reconstructionPercentile95: real("reconstruction_percentile_95"),
	validationGates: jsonb("validation_gates").default({}).notNull(),
	validationPassed: boolean("validation_passed").default(false),
	validationPassedAt: timestamp("validation_passed_at", { withTimezone: true, mode: 'string' }),
	status: varchar({ length: 50 }).default('candidate').notNull(),
	approvedBy: varchar("approved_by", { length: 255 }),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	version: smallint().default(1).notNull(),
	previousEncoderId: text("previous_encoder_id"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_encoder_provenance_active").using("btree", table.status.asc().nullsLast().op("bool_ops"), table.validationPassed.asc().nullsLast().op("text_ops")),
	index("idx_encoder_provenance_id").using("btree", table.encoderId.asc().nullsLast().op("text_ops")),
	index("idx_encoder_provenance_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_encoder_provenance_validated").using("btree", table.validationPassed.asc().nullsLast().op("bool_ops")),
	index("idx_encoder_provenance_version").using("btree", table.encoderId.asc().nullsLast().op("int2_ops"), table.version.asc().nullsLast().op("text_ops")),
	unique("encoder_provenance_encoder_id_key").on(table.encoderId),
	check("encoder_provenance_dims_valid", sql`(input_dimension > 0) AND (output_dimension > 0)`),
	check("encoder_provenance_mse_valid", sql`reconstruction_mse >= (0)::double precision`),
	check("encoder_provenance_validation_consistent", sql`(validation_passed = false) OR (validation_passed_at IS NOT NULL)`),
]);

export const phase2FGroundTruth = pgTable("phase2f_ground_truth", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	query: text().notNull(),
	domain: varchar({ length: 50 }).notNull(),
	difficulty: varchar({ length: 50 }).notNull(),
	expectedCount: integer("expected_count").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const evaluationRelevanceCorrected = pgTable("evaluation_relevance_corrected", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	queryId: uuid("query_id").notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	chunkId: uuid("chunk_id"),
	qdrantPointId: text("qdrant_point_id"),
	corpusVersion: text("corpus_version").notNull(),
	relevanceGrade: smallint("relevance_grade").notNull(),
	judgmentSource: varchar("judgment_source", { length: 50 }).notNull(),
	confidence: real().notNull(),
	evidenceIds: uuid("evidence_ids").array().default([""]).notNull(),
	contentHash: text("content_hash"),
}, (table) => [
	index("idx_evaluation_relevance_corrected_confidence").using("btree", table.confidence.desc().nullsFirst().op("float4_ops")),
	index("idx_evaluation_relevance_corrected_corpus_version").using("btree", table.corpusVersion.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_relevance_corrected_grade").using("btree", table.relevanceGrade.asc().nullsLast().op("int2_ops")),
	index("idx_evaluation_relevance_corrected_packet_corpus").using("btree", table.packetKey.asc().nullsLast().op("text_ops"), table.corpusVersion.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_relevance_corrected_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_relevance_corrected_query_corpus").using("btree", table.queryId.asc().nullsLast().op("text_ops"), table.corpusVersion.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_relevance_corrected_query_grade_corpus").using("btree", table.queryId.asc().nullsLast().op("text_ops"), table.relevanceGrade.asc().nullsLast().op("text_ops"), table.corpusVersion.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_relevance_corrected_source").using("btree", table.judgmentSource.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.corpusVersion],
			foreignColumns: [evaluationCorpora.corpusVersion],
			name: "evaluation_relevance_corrected_corpus_version_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.queryId],
			foreignColumns: [evaluationQueries.id],
			name: "evaluation_relevance_corrected_query_id_fkey"
		}).onDelete("cascade"),
	unique("evaluation_relevance_correcte_query_id_packet_key_corpus_ve_key").on(table.corpusVersion, table.packetKey, table.queryId),
	check("ck_judgment_confidence", sql`(confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision)`),
	check("ck_judgment_source", sql`(judgment_source)::text = ANY ((ARRAY['human'::character varying, 'synthetic'::character varying, 'derived'::character varying, 'audit'::character varying])::text[])`),
	check("ck_not_null", sql`(packet_key IS NOT NULL) AND (source_ref IS NOT NULL)`),
	check("ck_relevance_grade", sql`(relevance_grade >= 0) AND (relevance_grade <= 3)`),
]);

export const atlasPacketsMaterializationQueue = pgTable("atlas_packets_materialization_queue", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetId: text("packet_id").notNull(),
	packetKey: text("packet_key").notNull(),
	corpusVersion: text("corpus_version").notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	errorMessage: text("error_message"),
	retryCount: integer("retry_count").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_packets_materialization_corpus").using("btree", table.corpusVersion.asc().nullsLast().op("text_ops")),
	index("idx_packets_materialization_status").using("btree", table.status.asc().nullsLast().op("text_ops")).where(sql`((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying])::text[]))`),
	foreignKey({
			columns: [table.packetId],
			foreignColumns: [atlasPackets.packetId],
			name: "atlas_packets_materialization_queue_packet_id_fkey"
		}).onDelete("cascade"),
	unique("atlas_packets_materialization_queue_packet_id_key").on(table.packetId),
]);

export const atlasQdrantRepairLog = pgTable("atlas_qdrant_repair_log", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	qdrantPointId: text("qdrant_point_id").notNull(),
	collectionName: text("collection_name").default(').notNull(),
	repairReason: text("repair_reason").notNull(),
	vectorNamesWritten: jsonb("vector_names_written").default([]).notNull(),
	payloadFieldsWritten: jsonb("payload_fields_written").default([]).notNull(),
	outboxEventId: text("outbox_event_id").notNull(),
	attemptCount: integer("attempt_count").default(1).notNull(),
	result: text().notNull(),
	repairedAt: timestamp("repaired_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("atlas_qdrant_repair_log_packet_key_outbox_event_id_key").on(table.outboxEventId, table.packetKey),
]);

export const stories = pgTable("stories", {
	storyId: uuid("story_id").defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	repositoryId: uuid("repository_id"),
	storyType: text("story_type").notNull(),
	title: text().notNull(),
	objective: text(),
	status: text().default('active').notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	summary: text(),
	outcome: text(),
	importanceScore: real("importance_score"),
	retentionClass: text("retention_class").default('standard').notNull(),
	metadata: jsonb().default({}).notNull(),
}, (table) => [
	index("idx_stories_case_id").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")).where(sql`(case_id IS NOT NULL)`),
	index("idx_stories_repository_id").using("btree", table.repositoryId.asc().nullsLast().op("uuid_ops")).where(sql`(repository_id IS NOT NULL)`),
	index("idx_stories_retention").using("btree", table.retentionClass.asc().nullsLast().op("text_ops")),
	index("idx_stories_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	check("stories_retention_class_check", sql`retention_class = ANY (ARRAY['ephemeral'::text, 'standard'::text, 'important'::text, 'permanent'::text])`),
	check("stories_status_check", sql`status = ANY (ARRAY['active'::text, 'completed'::text, 'abandoned'::text, 'paused'::text])`),
	check("stories_story_type_check", sql`story_type = ANY (ARRAY['investigation'::text, 'repair'::text, 'import'::text, 'simulation'::text, 'research'::text, 'retrieval'::text])`),
]);

export const codebaseChunkIndex = pgTable("codebase_chunk_index", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	qdrantId: varchar("qdrant_id", { length: 64 }),
	relativePath: text("relative_path").notNull(),
	symbol: varchar({ length: 255 }),
	kind: varchar({ length: 50 }),
	lineStart: integer("line_start"),
	lineEnd: integer("line_end"),
	// TODO: failed to parse database type 'halfvec(768)'
	contentEmbedding: unknown("content_embedding"),
	gpuCluster: integer("gpu_cluster"),
	somCluster: integer("som_cluster"),
	pageRankScore: real("page_rank_score"),
	communityId: integer("community_id"),
	tags: jsonb().default([]),
	neo4JMeta: jsonb("neo4j_meta").default({}),
	indexedAt: timestamp("indexed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	enrichedAt: timestamp("enriched_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	content: text(),
	clusterSummary: jsonb("cluster_summary").default({}),
	// TODO: failed to parse database type 'halfvec(768)'
	summaryEmbedding: unknown("summary_embedding"),
	// TODO: failed to parse database type 'halfvec(768)'
	signatureEmbedding: unknown("signature_embedding"),
	domain: varchar({ length: 50 }),
	language: varchar({ length: 20 }),
	extension: varchar({ length: 20 }),
	embeddingModel: varchar("embedding_model", { length: 100 }),
	summaryModel: varchar("summary_model", { length: 100 }),
	summary: text(),
	metadata: jsonb().default({}).notNull(),
	semanticTags: text("semantic_tags").array().default([""]).notNull(),
	somBmuRow: integer("som_bmu_row"),
	somBmuCol: integer("som_bmu_col"),
	manifold4: real().array(),
	chunkId: text("chunk_id"),
	repoId: uuid("repo_id"),
	contentHash: text("content_hash"),
	tokenCount: integer("token_count"),
	neo4JGpuCluster: integer("neo4j_gpu_cluster"),
	outputMeta: jsonb("output_meta").default({}).notNull(),
	contentEmbedding384: vector("content_embedding_384", { dimensions: 384 }),
	summaryEmbedding384: vector("summary_embedding_384", { dimensions: 384 }),
	embeddingDimension: integer("embedding_dimension").default(384),
	embeddingNormalized: boolean("embedding_normalized").default(true),
	errorEmbedding: vector("error_embedding", { dimensions: 384 }),
	sourceRef: text("source_ref"),
	latent64: vector("latent_64", { dimensions: 64 }),
	latent64Model: text("latent64_model").default('packet-autoencoder-768-64'),
	latent64Meta: jsonb("latent64_meta").default({"gates":{},"validated_at":null}),
	latent64ValidatedAt: timestamp("latent64_validated_at", { withTimezone: true, mode: 'string' }),
	// TODO: failed to parse database type 'bytea'
	latent64Msgpack: unknown("latent64_msgpack"),
	embeddingEligible: boolean("embedding_eligible").default(false).notNull(),
	summaryHash: text("summary_hash"),
	embeddingVersion: text("embedding_version"),
	embeddingDtype: text("embedding_dtype").default('float32'),
	embeddingCreatedAt: timestamp("embedding_created_at", { withTimezone: true, mode: 'string' }),
	encoderId: text("encoder_id"),
	latentEmbeddingValid: boolean("latent_embedding_valid"),
	latentEmbeddingValidatedAt: timestamp("latent_embedding_validated_at", { withTimezone: true, mode: 'string' }),
	// TODO: failed to parse database type 'tsvector'
	searchVector: unknown("search_vector"),
	astSymbols: jsonb("ast_symbols").default([]).notNull(),
	astImports: text("ast_imports").array().default([""]).notNull(),
	astExports: text("ast_exports").array().default([""]).notNull(),
	astFactsAt: timestamp("ast_facts_at", { withTimezone: true, mode: 'string' }),
	kmeansCluster: integer("kmeans_cluster"),
	centroidDistance: real("centroid_distance"),
	secondClusterId: integer("second_cluster_id"),
	secondDistance: real("second_distance"),
	clusterMargin: real("cluster_margin"),
	kmeansModelVersion: text("kmeans_model_version"),
	kmeansAssignedAt: timestamp("kmeans_assigned_at", { withTimezone: true, mode: 'string' }),
	kmeansVectorContract: text("kmeans_vector_contract"),
	kmeans384Cluster: integer("kmeans384_cluster"),
	kmeans384Distance: real("kmeans384_distance"),
	kmeans384SecondId: integer("kmeans384_second_id"),
	kmeans384SecondDist: real("kmeans384_second_dist"),
	kmeans384Margin: real("kmeans384_margin"),
	kmeans384ModelVersion: text("kmeans384_model_version"),
	kmeans384AssignedAt: timestamp("kmeans384_assigned_at", { withTimezone: true, mode: 'string' }),
	kmeansDistance: real("kmeans_distance"),
	contentEmbedding768: vector("content_embedding_768", { dimensions: 768 }),
}, (table) => [
	index("codebase_chunk_index_chunk_id_idx").using("btree", table.chunkId.asc().nullsLast().op("text_ops")),
	index("codebase_chunk_index_cluster_summary_gin").using("gin", table.clusterSummary.asc().nullsLast().op("jsonb_path_ops")),
	index("codebase_chunk_index_content_hnsw").using("hnsw", table.contentEmbedding.asc().nullsLast().op("halfvec_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("codebase_chunk_index_domain_idx").using("btree", table.domain.asc().nullsLast().op("text_ops")),
	index("codebase_chunk_index_extension_idx").using("btree", table.extension.asc().nullsLast().op("text_ops")),
	index("codebase_chunk_index_gpu_cluster_idx").using("btree", table.gpuCluster.asc().nullsLast().op("int4_ops")),
	index("codebase_chunk_index_language_idx").using("btree", table.language.asc().nullsLast().op("text_ops")),
	index("codebase_chunk_index_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_path_ops")),
	index("codebase_chunk_index_path_idx").using("btree", table.relativePath.asc().nullsLast().op("text_ops")),
	uniqueIndex("codebase_chunk_index_qdrant_id_unique").using("btree", table.qdrantId.asc().nullsLast().op("text_ops")),
	index("codebase_chunk_index_semantic_tags_gin").using("gin", table.semanticTags.asc().nullsLast().op("array_ops")),
	index("codebase_chunk_index_som_bmu_idx").using("btree", table.somBmuRow.asc().nullsLast().op("int4_ops"), table.somBmuCol.asc().nullsLast().op("int4_ops")),
	index("codebase_chunk_index_som_cluster_idx").using("btree", table.somCluster.asc().nullsLast().op("int4_ops")),
	index("codebase_chunk_index_summary_hnsw").using("hnsw", table.summaryEmbedding.asc().nullsLast().op("halfvec_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("codebase_chunk_index_tags_idx").using("gin", table.tags.asc().nullsLast().op("jsonb_ops")),
	index("idx_cci_kmeans384_cluster").using("btree", table.kmeans384Cluster.asc().nullsLast().op("int4_ops")).where(sql`(kmeans384_cluster IS NOT NULL)`),
	index("idx_cci_kmeans_cluster").using("btree", table.kmeansCluster.asc().nullsLast().op("int4_ops")).where(sql`(kmeans_cluster IS NOT NULL)`),
	index("idx_codebase_chunk_bm25_search").using("gin", table.searchVector.asc().nullsLast().op("tsvector_ops")),
	index("idx_codebase_chunk_content_embedding_384_hnsw").using("hnsw", table.contentEmbedding384.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("idx_codebase_chunk_content_embedding_768_hnsw").using("hnsw", table.contentEmbedding768.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("idx_codebase_chunk_embedding_model_normalized").using("btree", table.embeddingModel.asc().nullsLast().op("text_ops"), table.embeddingNormalized.asc().nullsLast().op("text_ops")).where(sql`((embedding_model IS NOT NULL) AND (embedding_normalized = true))`),
	index("idx_codebase_chunk_encoder_id").using("btree", table.encoderId.asc().nullsLast().op("text_ops")),
	index("idx_codebase_chunk_index_error_embedding_hnsw").using("hnsw", table.errorEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("idx_codebase_chunk_latent64_hnsw").using("hnsw", table.latent64.asc().nullsLast().op("vector_cosine_ops")).where(sql`(latent_64 IS NOT NULL)`),
	index("idx_codebase_chunk_latent_valid").using("btree", table.latentEmbeddingValid.asc().nullsLast().op("bool_ops")),
	index("idx_codebase_chunk_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_codebase_chunk_semantic_tags_gin").using("gin", table.semanticTags.asc().nullsLast().op("array_ops")),
	index("idx_codebase_chunk_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_codebase_chunk_summary_embedding_384_hnsw").using("hnsw", table.summaryEmbedding384.asc().nullsLast().op("vector_cosine_ops")).with({m: "12",ef_construction: "48"}),
	index("idx_codebase_chunk_summary_embedding_ivfflat").using("ivfflat", table.summaryEmbedding.asc().nullsLast().op("halfvec_cosine_ops")).with({lists: "100"}),
	index("idx_codebase_chunk_summary_null").using("btree", table.summary.asc().nullsLast().op("text_ops")).where(sql`((summary IS NOT NULL) AND (btrim(summary) <> ''::text))`),
	index("idx_codebase_chunk_tags_gin").using("gin", table.tags.asc().nullsLast().op("jsonb_path_ops")),
	foreignKey({
			columns: [table.encoderId],
			foreignColumns: [encoderProvenance.encoderId],
			name: "codebase_chunk_index_encoder_id_fkey"
		}).onDelete("set null"),
	check("codebase_chunk_kmeans_contract_consistency_chk", sql`(kmeans_model_version IS NULL) OR ((kmeans_cluster IS NOT NULL) AND (kmeans_vector_contract IS NOT NULL)))) NOT VALID`),
]);

export const episodicEvents = pgTable("episodic_events", {
	eventId: uuid("event_id").defaultRandom().primaryKey().notNull(),
	storyId: uuid("story_id").notNull(),
	runId: uuid("run_id"),
	threadId: text("thread_id"),
	workflowId: text("workflow_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sequenceNo: bigint("sequence_no", { mode: "number" }).notNull(),
	eventType: text("event_type").notNull(),
	workflowState: text("workflow_state"),
	actorType: text("actor_type").notNull(),
	actorId: text("actor_id"),
	inputRefs: jsonb("input_refs").default([]).notNull(),
	outputRefs: jsonb("output_refs").default([]).notNull(),
	eventPayload: jsonb("event_payload").default({}).notNull(),
	success: boolean(),
	errorCode: text("error_code"),
	errorMessage: text("error_message"),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_episodic_events_event_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("idx_episodic_events_occurred_at").using("btree", table.occurredAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_episodic_events_run_id").using("btree", table.runId.asc().nullsLast().op("uuid_ops")).where(sql`(run_id IS NOT NULL)`),
	index("idx_episodic_events_story_id").using("btree", table.storyId.asc().nullsLast().op("uuid_ops")),
	index("idx_episodic_events_success").using("btree", table.success.asc().nullsLast().op("bool_ops")).where(sql`(success IS NOT NULL)`),
	foreignKey({
			columns: [table.storyId],
			foreignColumns: [stories.storyId],
			name: "episodic_events_story_id_fkey"
		}).onDelete("cascade"),
	unique("episodic_events_story_id_sequence_no_key").on(table.sequenceNo, table.storyId),
	check("episodic_events_actor_type_check", sql`actor_type = ANY (ARRAY['agent'::text, 'tool'::text, 'user'::text, 'system'::text, 'pipeline'::text])`),
]);

export const semanticMemories = pgTable("semantic_memories", {
	memoryId: uuid("memory_id").defaultRandom().primaryKey().notNull(),
	repositoryId: uuid("repository_id"),
	titleId: text("title_id"),
	packetKey: text("packet_key"),
	sourceRef: text("source_ref").notNull(),
	memoryKind: text("memory_kind").notNull(),
	statement: text().notNull(),
	summary: text(),
	keywords: text().array().default([""]).notNull(),
	conceptIds: text("concept_ids").array().default([""]).notNull(),
	domainClass: text("domain_class"),
	confidence: real().notNull(),
	authorityScore: real("authority_score"),
	validFrom: timestamp("valid_from", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	validUntil: timestamp("valid_until", { withTimezone: true, mode: 'string' }),
	// TODO: failed to parse database type 'bytea'
	sourceHash: unknown("source_hash").notNull(),
	schemaVersion: text("schema_version").default('atlas-semantic-memory-v1').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	promotedFromEvent: uuid("promoted_from_event"),
}, (table) => [
	index("idx_semantic_memories_concept_ids").using("gin", table.conceptIds.asc().nullsLast().op("array_ops")),
	index("idx_semantic_memories_domain_class").using("btree", table.domainClass.asc().nullsLast().op("text_ops")).where(sql`(domain_class IS NOT NULL)`),
	index("idx_semantic_memories_keywords").using("gin", table.keywords.asc().nullsLast().op("array_ops")),
	index("idx_semantic_memories_memory_kind").using("btree", table.memoryKind.asc().nullsLast().op("text_ops")),
	index("idx_semantic_memories_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")).where(sql`(packet_key IS NOT NULL)`),
	index("idx_semantic_memories_repository_id").using("btree", table.repositoryId.asc().nullsLast().op("uuid_ops")).where(sql`(repository_id IS NOT NULL)`),
	index("idx_semantic_memories_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_semantic_memories_valid").using("btree", table.validFrom.asc().nullsLast().op("timestamptz_ops"), table.validUntil.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.promotedFromEvent],
			foreignColumns: [episodicEvents.eventId],
			name: "semantic_memories_promoted_from_event_fkey"
		}).onDelete("set null"),
	check("semantic_memories_confidence_check", sql`(confidence >= (0)::double precision) AND (confidence <= (1)::double precision)`),
	check("semantic_memories_memory_kind_check", sql`memory_kind = ANY (ARRAY['architectural_decision'::text, 'repair_procedure'::text, 'validated_fact'::text, 'user_preference'::text, 'tool_sequence'::text, 'failure_pattern'::text, 'concept_definition'::text])`),
]);

export const atlasKnowledgeObjects = pgTable("atlas_knowledge_objects", {
	knowledgeId: uuid("knowledge_id").defaultRandom().primaryKey().notNull(),
	objectType: text("object_type").notNull(),
	objectKey: text("object_key").notNull(),
	schemaId: text("schema_id").notNull(),
	schemaVersion: integer("schema_version").notNull(),
	canonicalData: jsonb("canonical_data").notNull(),
	contentHash: text("content_hash").notNull(),
	sourceRefKey: text("source_ref_key"),
	treeNodeId: text("tree_node_id"),
	packetKey: text("packet_key"),
	generatorType: text("generator_type").notNull(),
	generatorVersion: text("generator_version").notNull(),
	confidence: real(),
	validationStatus: text("validation_status").default('PENDING').notNull(),
	validFrom: timestamp("valid_from", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	validTo: timestamp("valid_to", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ako_canonical_data_gin").using("gin", table.canonicalData.asc().nullsLast().op("jsonb_ops")),
	index("idx_ako_object_type_key").using("btree", table.objectType.asc().nullsLast().op("text_ops"), table.objectKey.asc().nullsLast().op("text_ops")),
	index("idx_ako_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")).where(sql`(packet_key IS NOT NULL)`),
	index("idx_ako_source_ref").using("btree", table.sourceRefKey.asc().nullsLast().op("text_ops")).where(sql`(source_ref_key IS NOT NULL)`),
	index("idx_ako_validation_status").using("btree", table.validationStatus.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.schemaId, table.schemaVersion],
			foreignColumns: [atlasSchemaRegistry.schemaId, atlasSchemaRegistry.schemaVersion],
			name: "atlas_knowledge_objects_schema_id_schema_version_fkey"
		}),
	foreignKey({
			columns: [table.treeNodeId],
			foreignColumns: [atlasAstNodes.treeNodeId],
			name: "fk_ako_tree_node"
		}),
	unique("atlas_knowledge_objects_object_type_object_key_schema_versi_key").on(table.contentHash, table.objectKey, table.objectType, table.schemaVersion),
	check("atlas_knowledge_objects_generator_type_check", sql`generator_type = ANY (ARRAY['AST'::text, 'DETERMINISTIC'::text, 'MODEL'::text, 'HUMAN'::text, 'IMPORT'::text])`),
	check("atlas_knowledge_objects_validation_status_check", sql`validation_status = ANY (ARRAY['PENDING'::text, 'VALID'::text, 'INVALID'::text, 'SUPERSEDED'::text])`),
]);

export const atlasClusterModels = pgTable("atlas_cluster_models", {
	id: serial().primaryKey().notNull(),
	modelVersion: text("model_version").notNull(),
	k: integer().notNull(),
	dim: integer().notNull(),
	nChunks: integer("n_chunks").notNull(),
	centroids: jsonb().notNull(),
	inertia: real(),
	languageStats: jsonb("language_stats"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb().default({}).notNull(),
	sourceColumn: text("source_column"),
	sourceVectorDimension: integer("source_vector_dimension"),
	sourceEmbeddingModel: text("source_embedding_model"),
	normalization: text(),
	algorithm: text(),
	randomSeed: integer("random_seed"),
	manifestHash: text("manifest_hash"),
	vectorContract: text("vector_contract"),
	modelRole: text("model_role"),
	isAssignmentActive: boolean("is_assignment_active").default(false).notNull(),
}, (table) => [
	unique("atlas_cluster_models_model_version_key").on(table.modelVersion),
]);

export const atlasHyperedges = pgTable("atlas_hyperedges", {
	hyperedgeId: uuid("hyperedge_id").defaultRandom().primaryKey().notNull(),
	contractHyperedgeId: text("contract_hyperedge_id"),
	relationType: text("relation_type").notNull(),
	schemaId: text("schema_id").notNull(),
	schemaVersion: integer("schema_version").notNull(),
	sourceRefKey: text("source_ref_key").notNull(),
	packetKey: text("packet_key"),
	workspaceRevision: text("workspace_revision"),
	sourceRevision: text("source_revision"),
	graphRevision: text("graph_revision"),
	producerRevision: text("producer_revision"),
	evidenceHash: text("evidence_hash").notNull(),
	evidenceRefs: text("evidence_refs").array().default([]).notNull(),
	checksum: text("checksum"),
	properties: jsonb().default({}).notNull(),
	lifecycle: text().default('OBSERVED').notNull(),
	provenance: jsonb().default({}).notNull(),
	extractorVersion: text("extractor_version").notNull(),
	confidence: real(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ahe_relation_type").using("btree", table.relationType.asc().nullsLast().op("text_ops")),
	index("idx_ahe_source_ref").using("btree", table.sourceRefKey.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.schemaId, table.schemaVersion],
			foreignColumns: [atlasSchemaRegistry.schemaId, atlasSchemaRegistry.schemaVersion],
			name: "atlas_hyperedges_schema_id_schema_version_fkey"
		}),
]);

export const atlasEmbeddings384 = pgTable("atlas_embeddings_384", {
	embeddingId: uuid("embedding_id").defaultRandom().primaryKey().notNull(),
	subjectType: text("subject_type").notNull(),
	subjectId: text("subject_id").notNull(),
	vectorRole: text("vector_role").notNull(),
	vectorContract: text("vector_contract").notNull(),
	modelName: text("model_name").notNull(),
	modelVersion: text("model_version").notNull(),
	dimension: integer().default(384).notNull(),
	dtype: text().default('float32').notNull(),
	normalized: boolean().notNull(),
	embedding: vector({ dimensions: 384 }),
	inputHash: text("input_hash").notNull(),
	vectorHash: text("vector_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ae384_content_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).where(sql`((vector_role = 'content'::text) AND (normalized = true))`).with({m: "16",ef_construction: "128"}),
	index("idx_ae384_subject").using("btree", table.subjectType.asc().nullsLast().op("text_ops"), table.subjectId.asc().nullsLast().op("text_ops")),
	unique("atlas_embeddings_384_subject_type_subject_id_vector_role_ve_key").on(table.inputHash, table.subjectId, table.subjectType, table.vectorContract, table.vectorRole),
	check("atlas_embeddings_384_dimension_check", sql`dimension = 384`),
	check("atlas_embeddings_384_subject_type_check", sql`subject_type = ANY (ARRAY['chunk'::text, 'packet'::text, 'tree_node'::text, 'feature'::text, 'summary'::text])`),
	check("atlas_embeddings_384_vector_role_check", sql`vector_role = ANY (ARRAY['content'::text, 'summary'::text, 'signature'::text, 'latent'::text, 'routing'::text])`),
]);

export const atlasValidationResults = pgTable("atlas_validation_results", {
	validationId: uuid("validation_id").defaultRandom().primaryKey().notNull(),
	knowledgeId: uuid("knowledge_id"),
	schemaId: text("schema_id").notNull(),
	schemaVersion: integer("schema_version").notNull(),
	validatorName: text("validator_name").notNull(),
	validatorVersion: text("validator_version").notNull(),
	passed: boolean().notNull(),
	errors: jsonb().default([]).notNull(),
	warnings: jsonb().default([]).notNull(),
	inputHash: text("input_hash").notNull(),
	validatedAt: timestamp("validated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_avr_knowledge_id").using("btree", table.knowledgeId.asc().nullsLast().op("uuid_ops")).where(sql`(knowledge_id IS NOT NULL)`),
	index("idx_avr_schema").using("btree", table.schemaId.asc().nullsLast().op("int4_ops"), table.schemaVersion.asc().nullsLast().op("int4_ops"), table.passed.asc().nullsLast().op("int4_ops")),
	index("idx_avr_validator").using("btree", table.validatorName.asc().nullsLast().op("text_ops"), table.passed.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.knowledgeId],
			foreignColumns: [atlasKnowledgeObjects.knowledgeId],
			name: "atlas_validation_results_knowledge_id_fkey"
		}),
]);

export const atlasAstNodes = pgTable("atlas_ast_nodes", {
	treeNodeId: text("tree_node_id").primaryKey().notNull(),
	structuralKey: text("structural_key").notNull(),
	repoId: uuid("repo_id").notNull(),
	relativePath: text("relative_path").notNull(),
	nodeKind: text("node_kind").notNull(),
	qualifiedSymbol: text("qualified_symbol").default(').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	startByte: bigint("start_byte", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	endByte: bigint("end_byte", { mode: "number" }),
	lineStart: integer("line_start"),
	lineEnd: integer("line_end"),
	normalizedNodeHash: text("normalized_node_hash").notNull(),
	sourceContentHash: text("source_content_hash").notNull(),
	parserName: text("parser_name").notNull(),
	parserVersion: text("parser_version").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	supersededBy: text("superseded_by"),
	parserLanguage: text("parser_language").default('typescript').notNull(),
	normalizedSignature: text("normalized_signature").default(').notNull(),
	parentTreeNodeId: text("parent_tree_node_id"),
	sourceRefKey: text("source_ref_key"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_aan_node_kind").using("btree", table.nodeKind.asc().nullsLast().op("text_ops")),
	index("idx_aan_qualified_symbol").using("btree", table.qualifiedSymbol.asc().nullsLast().op("text_ops")).where(sql`(qualified_symbol IS NOT NULL)`),
	index("idx_aan_relative_path").using("btree", table.relativePath.asc().nullsLast().op("text_ops")),
	index("idx_atlas_ast_nodes_language").using("btree", table.parserLanguage.asc().nullsLast().op("text_ops")),
	index("idx_atlas_ast_nodes_parent").using("btree", table.parentTreeNodeId.asc().nullsLast().op("text_ops")).where(sql`(parent_tree_node_id IS NOT NULL)`),
	index("idx_atlas_ast_nodes_source_content_hash").using("btree", table.sourceContentHash.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.parentTreeNodeId],
			foreignColumns: [table.treeNodeId],
			name: "atlas_ast_nodes_parent_tree_node_id_fkey"
		}),
	foreignKey({
			columns: [table.supersededBy],
			foreignColumns: [table.treeNodeId],
			name: "atlas_ast_nodes_superseded_by_fkey"
		}),
	unique("atlas_ast_nodes_repo_id_relative_path_node_kind_qualified_s_key").on(table.nodeKind, table.normalizedNodeHash, table.qualifiedSymbol, table.relativePath, table.repoId),
	check("chk_atlas_ast_nodes_kind", sql`node_kind = ANY (ARRAY['file'::text, 'module'::text, 'class'::text, 'interface'::text, 'type'::text, 'function'::text, 'method'::text, 'constructor'::text, 'parameter'::text, 'route'::text, 'schema'::text, 'test'::text, 'call_site'::text, 'import'::text, 'export'::text])`),
]);

export const atlasPacketMetrics = pgTable("atlas_packet_metrics", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	featureDensity: real("feature_density").default(0),
	complexityScore: real("complexity_score").default(0),
	semanticEntropy: real("semantic_entropy").default(0),
	retrievalRelevance: real("retrieval_relevance").default(0),
	authorityScore: real("authority_score").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	naiveBayesPredictions: jsonb("naive_bayes_predictions").default({}),
	hmmRecommendations: jsonb("hmm_recommendations").default({}),
	pcaLatent: real("pca_latent").array(),
	pcaLatentDim: integer("pca_latent_dim"),
	jepaLatent: real("jepa_latent").array(),
	jepaLatentDim: integer("jepa_latent_dim"),
	packetJepaSimilarity: real("packet_jepa_similarity"),
	jepaModelVersion: text("jepa_model_version"),
	jepaTrainedAt: timestamp("jepa_trained_at", { withTimezone: true, mode: 'string' }),
	jepaScoredAt: timestamp("jepa_scored_at", { withTimezone: true, mode: 'string' }),
	jepaEvaluation: jsonb("jepa_evaluation").default({}),
	semanticTopkRank: integer("semantic_topk_rank"),
	semanticTopkScore: real("semantic_topk_score"),
	semanticTopkFeatureId: text("semantic_topk_feature_id"),
	semanticTopkDomainClass: text("semantic_topk_domain_class"),
	semanticTopkTitleId: text("semantic_topk_title_id"),
	semanticTopkSource: text("semantic_topk_source").default('semantic-fanout-topk'),
	semanticTopkGeneratedAt: timestamp("semantic_topk_generated_at", { withTimezone: true, mode: 'string' }),
	semanticTopkAnalysis: jsonb("semantic_topk_analysis").default({}),
	qdrantPointId: text("qdrant_point_id"),
	treeNodeId: uuid("tree_node_id"),
	titleId: text("title_id"),
	featureId: text("feature_id"),
	domainClass: text("domain_class"),
	// TODO: failed to parse database type 'bytea'
	latent64: unknown("latent_64"),
	kmeansCluster: integer("kmeans_cluster"),
	somCluster: integer("som_cluster"),
	somRow: integer("som_row"),
	somCol: integer("som_col"),
	manifold4D: real("manifold_4d").array(),
	pageRankScore: real("page_rank_score"),
	cheirankScore: real("cheirank_score"),
	cheirankRank: integer("cheirank_rank"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	communityId: bigint("community_id", { mode: "number" }),
	kCoreScore: real("k_core_score"),
	repairProbability: real("repair_probability"),
	metadata: jsonb().default({}),
	latent128: text("latent_128"),
	latent64Format: text("latent_64_format"),
	somIndex: integer("som_index"),
	aeDistance: real("ae_distance"),
}, (table) => [
	index("idx_atlas_packet_metrics_cheirank_rank").using("btree", table.cheirankRank.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_packet_metrics_cheirank_score").using("btree", table.cheirankScore.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_packet_metrics_community_id").using("btree", table.communityId.asc().nullsLast().op("int8_ops")),
	index("idx_atlas_packet_metrics_domain_class").using("btree", table.domainClass.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packet_metrics_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packet_metrics_kmeans_cluster").using("btree", table.kmeansCluster.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_packet_metrics_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_packet_metrics_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packet_metrics_page_rank_score").using("btree", table.pageRankScore.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_packet_metrics_qdrant_point_id").using("btree", table.qdrantPointId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packet_metrics_semantic_topk_analysis_gin").using("gin", table.semanticTopkAnalysis.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_packet_metrics_semantic_topk_domain_class").using("btree", table.semanticTopkDomainClass.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packet_metrics_semantic_topk_feature_id").using("btree", table.semanticTopkFeatureId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packet_metrics_semantic_topk_score").using("btree", table.semanticTopkScore.desc().nullsLast().op("float4_ops")),
	index("idx_atlas_packet_metrics_som_cluster").using("btree", table.somCluster.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_packet_metrics_title_id").using("btree", table.titleId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packet_metrics_tree_node_id").using("btree", table.treeNodeId.asc().nullsLast().op("uuid_ops")),
	unique("atlas_packet_metrics_packet_key_key").on(table.packetKey),
]);

export const atlasTopologyIndex = pgTable("atlas_topology_index", {
	packetKey: text("packet_key").primaryKey().notNull(),
	relationType: text("relation_type"),
	xCosine: real("x_cosine"),
	yGraph: integer("y_graph"),
	zSom: integer("z_som"),
	wAuthority: real("w_authority"),
	cheirankScore: real("cheirank_score"),
	cheirankRank: integer("cheirank_rank"),
	somSource: text("som_source"),
	karpathyScore: real("karpathy_score"),
	// TODO: failed to parse database type 'bytea'
	latent64: unknown("latent_64"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	communityId: bigint("community_id", { mode: "number" }),
	treeNodeId: uuid("tree_node_id"),
	pagerank: doublePrecision(),
	betweenness: doublePrecision(),
	eigenvector: doublePrecision(),
	nn1: uuid("nn_1"),
	nn2: uuid("nn_2"),
	nn3: uuid("nn_3"),
	nn4: uuid("nn_4"),
	aeDistance: doublePrecision("ae_distance"),
	topologyVersion: integer("topology_version").default(1).notNull(),
	topologyUpdatedAt: timestamp("topology_updated_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	authorityScore: doublePrecision("authority_score"),
	pagerankRaw: doublePrecision("pagerank_raw"),
	pagerankPercentile: doublePrecision("pagerank_percentile"),
	authorityBand: text("authority_band"),
	pagerankRunId: uuid("pagerank_run_id"),
	pagerankContractVersion: text("pagerank_contract_version"),
	graphSnapshotHash: text("graph_snapshot_hash"),
	pagerankComputedAt: timestamp("pagerank_computed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_atlas_topology_index_cheirank_rank").using("btree", table.cheirankRank.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_topology_index_cheirank_score").using("btree", table.cheirankScore.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_topology_index_community_id").using("btree", table.communityId.asc().nullsLast().op("int8_ops")),
	index("idx_atlas_topology_index_karpathy_score").using("btree", table.karpathyScore.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_topology_index_pagerank").using("btree", table.pagerank.desc().nullsFirst().op("float8_ops")),
	index("idx_atlas_topology_index_relation_type").using("btree", table.relationType.asc().nullsLast().op("text_ops")),
	index("idx_atlas_topology_index_topology_version").using("btree", table.topologyVersion.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_topology_index_tree_node_id").using("btree", table.treeNodeId.asc().nullsLast().op("uuid_ops")),
	index("idx_atlas_topology_index_x_cosine").using("btree", table.xCosine.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_topology_index_y_graph").using("btree", table.yGraph.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_topology_index_z_som").using("btree", table.zSom.asc().nullsLast().op("int4_ops")),
]);

export const agentRuns = pgTable("agent_runs", {
	runId: uuid("run_id").defaultRandom().primaryKey().notNull(),
	workflowName: text("workflow_name").notNull(),
	workflowVersion: text("workflow_version").notNull(),
	status: text().default('PROPOSED').notNull(),
	tenantId: uuid("tenant_id").notNull(),
	initiatedBy: text("initiated_by").notNull(),
	state: jsonb().default({}).notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_agent_runs_status").using("btree", table.status.asc().nullsLast().op("timestamptz_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_agent_runs_tenant").using("btree", table.tenantId.asc().nullsLast().op("timestamptz_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	check("agent_runs_status_check", sql`status = ANY (ARRAY['PROPOSED'::text, 'VALIDATED'::text, 'AUTHORIZED'::text, 'READY'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'DENIED'::text, 'WAITING_APPROVAL'::text])`),
]);

export const agentRunActions = pgTable("agent_run_actions", {
	actionId: uuid("action_id").defaultRandom().primaryKey().notNull(),
	runId: uuid("run_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sequenceNo: bigint("sequence_no", { mode: "number" }).notNull(),
	actionType: text("action_type").notNull(),
	inputPacket: jsonb("input_packet").notNull(),
	inputHash: text("input_hash").notNull(),
	permissionScope: text("permission_scope").array().default([""]).notNull(),
	riskLevel: smallint("risk_level").default(0).notNull(),
	status: text().default('PROPOSED').notNull(),
	idempotencyKey: text("idempotency_key").notNull(),
	causationId: uuid("causation_id"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_agent_run_actions_run").using("btree", table.runId.asc().nullsLast().op("uuid_ops"), table.sequenceNo.asc().nullsLast().op("int8_ops")),
	index("idx_agent_run_actions_status").using("btree", table.status.asc().nullsLast().op("text_ops"), table.startedAt.desc().nullsFirst().op("text_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [agentRuns.runId],
			name: "agent_run_actions_run_id_fkey"
		}),
	unique("agent_run_actions_run_id_sequence_no_key").on(table.runId, table.sequenceNo),
	unique("agent_run_actions_idempotency_key_key").on(table.idempotencyKey),
	check("agent_run_actions_status_check", sql`status = ANY (ARRAY['PROPOSED'::text, 'VALIDATED'::text, 'AUTHORIZED'::text, 'READY'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'RETRY_PENDING'::text, 'DENIED'::text, 'WAITING_APPROVAL'::text, 'FAILED'::text])`),
]);

export const agentActionResults = pgTable("agent_action_results", {
	resultId: uuid("result_id").defaultRandom().primaryKey().notNull(),
	actionId: uuid("action_id").notNull(),
	outputPacket: jsonb("output_packet"),
	outputHash: text("output_hash"),
	exitCode: integer("exit_code"),
	errorCode: text("error_code"),
	errorDetail: jsonb("error_detail"),
	durationMs: integer("duration_ms").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.actionId],
			foreignColumns: [agentRunActions.actionId],
			name: "agent_action_results_action_id_fkey"
		}),
]);

export const atlasRpcPackets = pgTable("atlas_rpc_packets", {
	packetKey: text("packet_key").primaryKey().notNull(),
	sourceRef: text("source_ref").notNull(),
	featureId: text("feature_id"),
	titleId: text("title_id"),
	domainClass: text("domain_class"),
	contentHash: text("content_hash").notNull(),
	payloadContractVersion: text("payload_contract_version").notNull(),
	// TODO: failed to parse database type 'bytea'
	msgpack: unknown("msgpack").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("atlas_rpc_packets_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
]);

export const atlasAcpAudit = pgTable("atlas_acp_audit", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: varchar("packet_key", { length: 255 }),
	sourceRef: varchar("source_ref", { length: 512 }),
	hmmRecommendationId: uuid("hmm_recommendation_id"),
	repairLane: varchar("repair_lane", { length: 50 }),
	jobId: varchar("job_id", { length: 255 }),
	status: varchar({ length: 20 }).default('enqueued'),
	confidence: real(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_acp_audit_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_acp_audit_repair_lane").using("btree", table.repairLane.asc().nullsLast().op("text_ops")),
	index("idx_acp_audit_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const featureSemanticFacts = pgTable("feature_semantic_facts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	domainClass: text("domain_class"),
	domainSimilarity: real("domain_similarity"),
	similarityConfidence: real("similarity_confidence"),
	embeddingDim: integer("embedding_dim").default(768),
	contentHash: text("content_hash").notNull(),
	embeddingModel: text("embedding_model").default('embeddinggemma-768'),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("feature_semantic_facts_packet_key_content_hash_key").on(table.contentHash, table.packetKey),
]);

export const atlasTopologyFeatures = pgTable("atlas_topology_features", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	featureVersion: integer("feature_version").default(1).notNull(),
	featureVector: real("feature_vector").array().notNull(),
	featureDim: integer("feature_dim").default(40).notNull(),
	pagerankScore: real("pagerank_score"),
	karpathyBlend: real("karpathy_blend"),
	somRow: smallint("som_row"),
	somCol: smallint("som_col"),
	kmeansCluster: smallint("kmeans_cluster"),
	graphDegree: integer("graph_degree"),
	exportedParquet: boolean("exported_parquet").default(false).notNull(),
	exportedAt: timestamp("exported_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	snapshotId: bigint("snapshot_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("atf_exported_idx").using("btree", table.exportedParquet.asc().nullsLast().op("bool_ops")).where(sql`(NOT exported_parquet)`),
	index("atf_kmeans_idx").using("btree", table.kmeansCluster.asc().nullsLast().op("int2_ops")).where(sql`(kmeans_cluster IS NOT NULL)`),
	index("atf_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	unique("atlas_topology_features_packet_key_feature_version_key").on(table.featureVersion, table.packetKey),
]);

export const atlasTypedEdges = pgTable("atlas_typed_edges", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	srcPacketKey: text("src_packet_key").notNull(),
	dstPacketKey: text("dst_packet_key").notNull(),
	edgeType: text("edge_type").notNull(),
	edgeVersion: integer("edge_version").default(1).notNull(),
	weight: real().default(1).notNull(),
	metadata: jsonb(),
	exportedParquet: boolean("exported_parquet").default(false).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	snapshotId: bigint("snapshot_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ate_dst_idx").using("btree", table.dstPacketKey.asc().nullsLast().op("text_ops")),
	index("ate_exported_idx").using("btree", table.exportedParquet.asc().nullsLast().op("bool_ops")).where(sql`(NOT exported_parquet)`),
	index("ate_src_idx").using("btree", table.srcPacketKey.asc().nullsLast().op("text_ops")),
	index("ate_type_idx").using("btree", table.edgeType.asc().nullsLast().op("text_ops")),
	unique("atlas_typed_edges_src_packet_key_dst_packet_key_edge_type_e_key").on(table.dstPacketKey, table.edgeType, table.edgeVersion, table.srcPacketKey),
]);

export const atlasFeatureSnapshots = pgTable("atlas_feature_snapshots", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	snapshotTag: text("snapshot_tag").notNull(),
	graphifyPass: integer("graphify_pass").notNull(),
	pipelineVersion: text("pipeline_version").default('1.0').notNull(),
	totalPackets: integer("total_packets"),
	totalVectors: integer("total_vectors"),
	totalTopologyRows: integer("total_topology_rows"),
	totalEdges: integer("total_edges"),
	kmeansK: integer("kmeans_k"),
	somRows: smallint("som_rows").default(20),
	somCols: smallint("som_cols").default(20),
	pagerankIterations: integer("pagerank_iterations"),
	arrowVectorsPath: text("arrow_vectors_path"),
	parquetTopoPath: text("parquet_topo_path"),
	parquetEdgesPath: text("parquet_edges_path"),
	arrowRowMapPath: text("arrow_row_map_path"),
	status: text().default('building').notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	manifestJson: jsonb("manifest_json"),
}, (table) => [
	index("afs_pass_idx").using("btree", table.graphifyPass.asc().nullsLast().op("int4_ops")),
	index("afs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	unique("atlas_feature_snapshots_snapshot_tag_key").on(table.snapshotTag),
]);

export const unknownPackets = pgTable("unknown_packets", {
	unknownId: text("unknown_id").primaryKey().notNull(),
	observationId: text("observation_id").notNull(),
	workspaceId: varchar("workspace_id", { length: 256 }).notNull(),
	potentialSourceRef: text("potential_source_ref").notNull(),
	potentialFeatureId: varchar("potential_feature_id", { length: 256 }),
	potentialFeatureLabel: varchar("potential_feature_label", { length: 512 }),
	potentialPacketKey: text("potential_packet_key"),
	status: varchar({ length: 32 }).default('OBSERVATION').notNull(),
	identityScore: real("identity_score"),
	semanticScore: real("semantic_score"),
	sourceScore: real("source_score"),
	topologyScore: real("topology_score"),
	freshnessScore: real("freshness_score"),
	combinedScore: real("combined_score"),
	identityProof: varchar("identity_proof", { length: 16 }),
	semanticProof: varchar("semantic_proof", { length: 16 }),
	topologyProof: varchar("topology_proof", { length: 16 }),
	lineageProof: varchar("lineage_proof", { length: 16 }),
	contentProof: varchar("content_proof", { length: 16 }),
	promotedPacketKey: text("promoted_packet_key"),
	promotionTimestamp: timestamp("promotion_timestamp", { mode: 'string' }),
	rejectionReason: text("rejection_reason"),
	analystNotes: text("analyst_notes"),
	sourceKind: varchar("source_kind", { length: 32 }).notNull(),
	evidencePayload: jsonb("evidence_payload"),
	ledgerHash: text("ledger_hash"),
	ingestedAt: timestamp("ingested_at", { mode: 'string' }).defaultNow().notNull(),
	scoredAt: timestamp("scored_at", { mode: 'string' }),
	validatedAt: timestamp("validated_at", { mode: 'string' }),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_unknown_combined_score").using("btree", table.combinedScore.desc().nullsFirst().op("float4_ops")),
	uniqueIndex("idx_unknown_identity_unique").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.potentialSourceRef.asc().nullsLast().op("text_ops")),
	index("idx_unknown_ingested_at").using("btree", table.ingestedAt.desc().nullsFirst().op("timestamp_ops")),
	index("idx_unknown_source_ref").using("btree", table.potentialSourceRef.asc().nullsLast().op("text_ops")),
	index("idx_unknown_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_unknown_workspace").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	unique("unknown_packets_observation_id_key").on(table.observationId),
	check("unknown_proof_valid", sql`(identity_proof IS NULL) OR ((identity_proof)::text = ANY ((ARRAY['PASS'::character varying, 'FAIL'::character varying])::text[]))`),
	check("unknown_source_kind_valid", sql`(source_kind)::text = ANY ((ARRAY['scanner'::character varying, 'ldr'::character varying, 'user_submission'::character varying, 'edge_case'::character varying])::text[])`),
	check("unknown_status_valid", sql`(status)::text = ANY ((ARRAY['OBSERVATION'::character varying, 'CANDIDATE'::character varying, 'VALIDATED'::character varying, 'PROMOTED'::character varying, 'REJECTED'::character varying])::text[])`),
]);

export const unknownResolutionLedger = pgTable("unknown_resolution_ledger", {
	ledgerId: text("ledger_id").primaryKey().notNull(),
	unknownId: text("unknown_id").notNull(),
	stage: varchar({ length: 32 }).notNull(),
	gateName: varchar("gate_name", { length: 256 }).notNull(),
	gateResult: varchar("gate_result", { length: 16 }),
	checkDescription: text("check_description"),
	checkTimestamp: timestamp("check_timestamp", { mode: 'string' }).defaultNow().notNull(),
	evidenceSummary: jsonb("evidence_summary"),
	actionTaken: varchar("action_taken", { length: 256 }),
	actionTimestamp: timestamp("action_timestamp", { mode: 'string' }),
}, (table) => [
	index("idx_ledger_stage").using("btree", table.stage.asc().nullsLast().op("text_ops")),
	index("idx_ledger_timestamp").using("btree", table.checkTimestamp.desc().nullsFirst().op("timestamp_ops")),
	index("idx_ledger_unknown").using("btree", table.unknownId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.unknownId],
			foreignColumns: [unknownPackets.unknownId],
			name: "unknown_resolution_ledger_unknown_id_fkey"
		}).onDelete("cascade"),
	check("ledger_result_valid", sql`(gate_result IS NULL) OR ((gate_result)::text = ANY ((ARRAY['PASS'::character varying, 'FAIL'::character varying, 'WARN'::character varying])::text[]))`),
	check("ledger_stage_valid", sql`(stage)::text = ANY ((ARRAY['OBSERVATION'::character varying, 'CANDIDATE'::character varying, 'VALIDATED'::character varying, 'PROMOTED'::character varying, 'REJECTED'::character varying])::text[])`),
]);

export const semanticSignals = pgTable("semantic_signals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: varchar("workspace_id", { length: 255 }).notNull(),
	revisionId: varchar("revision_id", { length: 255 }).notNull(),
	workspaceRevision: text("workspace_revision").notNull(),
	subjectId: varchar("subject_id", { length: 255 }).notNull(),
	signalType: signalType("signal_type").notNull(),
	producer: varchar({ length: 255 }).notNull(),
	producerModelRevision: varchar("producer_model_revision", { length: 255 }),
	producerSchemaVersion: varchar("producer_schema_version", { length: 255 }),
	evidenceIds: text("evidence_ids").array().default([""]).notNull(),
	evidenceConfidence: real("evidence_confidence"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: varchar("created_by", { length: 255 }),
	lifecycleState: varchar("lifecycle_state", { length: 50 }).default('ACTIVE').notNull(),
	stateReason: text("state_reason"),
	stateChangedAt: timestamp("state_changed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	stateChangedBy: varchar("state_changed_by", { length: 255 }),
	supersededBy: uuid("superseded_by"),
	retentionUntil: timestamp("retention_until", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_semantic_signals_evidence_ids").using("gin", table.evidenceIds.asc().nullsLast().op("array_ops")),
	index("idx_semantic_signals_producer").using("btree", table.producer.asc().nullsLast().op("text_ops")),
	index("idx_semantic_signals_subject_type").using("btree", table.subjectId.asc().nullsLast().op("enum_ops"), table.signalType.asc().nullsLast().op("text_ops")),
	index("idx_semantic_signals_workspace_revision").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.revisionId.asc().nullsLast().op("text_ops")),
	check("lifecycle_state_valid", sql`(lifecycle_state)::text = ANY ((ARRAY['ACTIVE'::character varying, 'SUPERSEDED'::character varying, 'RETRACTED'::character varying, 'ARCHIVED'::character varying, 'PURGE_PENDING'::character varying, 'PURGED'::character varying])::text[])`),
	check("semantic_signals_evidence_confidence_range", sql`(evidence_confidence IS NULL) OR ((evidence_confidence >= (0.0)::double precision) AND (evidence_confidence <= (1.0)::double precision))`),
]);

export const classificationEnvelope = pgTable("classification_envelope", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	signalId: uuid("signal_id").notNull(),
	subjectId: varchar("subject_id", { length: 255 }).notNull(),
	workspaceId: varchar("workspace_id", { length: 255 }).notNull(),
	status: classificationStatus().default('PENDING').notNull(),
	version: integer().default(1).notNull(),
	domainLabels: jsonb("domain_labels"),
	conflictFlag: boolean("conflict_flag").default(false).notNull(),
	conflictDetails: jsonb("conflict_details"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: varchar("created_by", { length: 255 }),
	validatedAt: timestamp("validated_at", { withTimezone: true, mode: 'string' }),
	validatedBy: varchar("validated_by", { length: 255 }),
	failureReason: text("failure_reason"),
	lifecycleState: varchar("lifecycle_state", { length: 50 }).default('ACTIVE').notNull(),
	stateChangedAt: timestamp("state_changed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	stateChangedBy: varchar("state_changed_by", { length: 255 }),
}, (table) => [
	index("idx_classification_envelope_conflict").using("btree", table.conflictFlag.asc().nullsLast().op("bool_ops")),
	index("idx_classification_envelope_signal_status").using("btree", table.signalId.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("uuid_ops")),
	index("idx_classification_envelope_subject_workspace").using("btree", table.subjectId.asc().nullsLast().op("text_ops"), table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.signalId],
			foreignColumns: [semanticSignals.id],
			name: "fk_classification_envelope_signal_id"
		}).onDelete("restrict"),
	check("lifecycle_state_valid_classification", sql`(lifecycle_state)::text = ANY ((ARRAY['ACTIVE'::character varying, 'SUPERSEDED'::character varying, 'ARCHIVED'::character varying, 'PURGE_PENDING'::character varying])::text[])`),
]);

export const recommendationLog = pgTable("recommendation_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: varchar("workspace_id", { length: 255 }).notNull(),
	revisionId: varchar("revision_id", { length: 255 }).notNull(),
	subjectId: varchar("subject_id", { length: 255 }).notNull(),
	proposedAction: text("proposed_action").notNull(),
	inferenceExplanation: text("inference_explanation").notNull(),
	evidenceIds: text("evidence_ids").array().default([""]).notNull(),
	evidenceConfidence: real("evidence_confidence").default(0.5).notNull(),
	validationCriteria: text("validation_criteria").notNull(),
	expectedImpact: text("expected_impact").notNull(),
	rollbackPlan: text("rollback_plan").notNull(),
	rollbackVerification: text("rollback_verification").notNull(),
	status: recommendationStatus().default('PROPOSED').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: varchar("created_by", { length: 255 }).notNull(),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	approvedBy: varchar("approved_by", { length: 255 }),
	implementedAt: timestamp("implemented_at", { withTimezone: true, mode: 'string' }),
	validatedAt: timestamp("validated_at", { withTimezone: true, mode: 'string' }),
	validationError: text("validation_error"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lifecycleState: varchar("lifecycle_state", { length: 50 }).default('ACTIVE').notNull(),
	stateChangedAt: timestamp("state_changed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	stateChangedBy: varchar("state_changed_by", { length: 255 }),
	approvedByDistinctFromCreatedBy: boolean("approved_by_distinct_from_created_by").default(false).notNull(),
	proofManifestId: uuid("proof_manifest_id"),
}, (table) => [
	index("idx_recommendation_log_created_by").using("btree", table.createdBy.asc().nullsLast().op("text_ops")),
	index("idx_recommendation_log_evidence").using("gin", table.evidenceIds.asc().nullsLast().op("array_ops")),
	index("idx_recommendation_log_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("idx_recommendation_log_subject_workspace").using("btree", table.subjectId.asc().nullsLast().op("text_ops"), table.workspaceId.asc().nullsLast().op("text_ops")),
	check("approved_by_not_creator", sql`(approved_by IS NULL) OR ((approved_by)::text <> (created_by)::text)`),
	check("lifecycle_state_valid_recommendation", sql`(lifecycle_state)::text = ANY ((ARRAY['ACTIVE'::character varying, 'SUPERSEDED'::character varying, 'RETRACTED'::character varying, 'ARCHIVED'::character varying, 'PURGE_PENDING'::character varying])::text[])`),
	check("recommendation_log_evidence_confidence_range", sql`(evidence_confidence >= (0.0)::double precision) AND (evidence_confidence <= (1.0)::double precision)`),
]);

export const semanticLifecycleEvents = pgTable("semantic_lifecycle_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entityType: varchar("entity_type", { length: 50 }).notNull(),
	entityId: uuid("entity_id").notNull(),
	previousState: varchar("previous_state", { length: 50 }).notNull(),
	newState: varchar("new_state", { length: 50 }).notNull(),
	reason: text(),
	actorType: varchar("actor_type", { length: 50 }).notNull(),
	actorId: varchar("actor_id", { length: 255 }).notNull(),
	runId: uuid("run_id"),
	proofManifestId: uuid("proof_manifest_id"),
	workspaceRevision: text("workspace_revision").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_semantic_lifecycle_events_actor").using("btree", table.actorId.asc().nullsLast().op("text_ops")),
	index("idx_semantic_lifecycle_events_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_semantic_lifecycle_events_entity").using("btree", table.entityId.asc().nullsLast().op("uuid_ops")),
	check("must_have_state_change", sql`(previous_state)::text IS DISTINCT FROM (new_state)::text`),
	check("valid_lifecycle_states", sql`(new_state)::text = ANY ((ARRAY['ACTIVE'::character varying, 'SUPERSEDED'::character varying, 'RETRACTED'::character varying, 'ARCHIVED'::character varying, 'PURGE_PENDING'::character varying, 'PURGED'::character varying])::text[])`),
]);

export const aceContextCache = pgTable("ace_context_cache", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	queryHash: text("query_hash").notNull(),
	userId: integer("user_id"),
	policyTier: varchar("policy_tier", { length: 30 }).notNull(),
	contextJson: jsonb("context_json").notNull(),
	chunkCount: integer("chunk_count").default(0).notNull(),
	totalTokens: integer("total_tokens").default(0).notNull(),
	cacheSource: varchar("cache_source", { length: 20 }).default('miss').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const adminAiChatMessages = pgTable("admin_ai_chat_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	role: text().notNull(),
	content: text().notNull(),
	toolName: text("tool_name"),
	toolCallJson: jsonb("tool_call_json"),
	toolResultJson: jsonb("tool_result_json"),
	contextPackJson: jsonb("context_pack_json"),
	attachments: jsonb(),
	metadata: jsonb(),
	tokenEstimate: integer("token_estimate"),
	latencyMs: integer("latency_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [adminAiChatSessions.id],
			name: "admin_ai_chat_messages_session_id_fkey"
		}).onDelete("cascade"),
]);

export const aceErrorEmbeddings = pgTable("ace_error_embeddings", {
	id: serial().primaryKey().notNull(),
	errorId: text("error_id"),
	embedding: jsonb(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const aceRetrievalRuns = pgTable("ace_retrieval_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	query: text().notNull(),
	intent: text(),
	mode: text(),
	model: text(),
	queryEmbeddingModel: text("query_embedding_model"),
	expandedTerms: text("expanded_terms").array().default([""]),
	contextBudgetTokens: integer("context_budget_tokens"),
	finalContextTokens: integer("final_context_tokens"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const adminRaptorSummaries = pgTable("admin_raptor_summaries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	level: integer().default(0).notNull(),
	summary: text().notNull(),
	sourceClusters: jsonb("source_clusters").notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("admin_raptor_summaries_created_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("admin_raptor_summaries_level_idx").using("btree", table.level.asc().nullsLast().op("int4_ops")),
]);

export const adminAiChatSessions = pgTable("admin_ai_chat_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	title: text().default('Admin chat').notNull(),
	mode: text().default('read_only_trace').notNull(),
	provider: text().default('ollama').notNull(),
	model: text().notNull(),
	kbSnapshotHash: text("kb_snapshot_hash"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	contextTag: text("context_tag").default('global').notNull(),
	active: boolean().default(true).notNull(),
}, (table) => [
	uniqueIndex("admin_ai_chat_sessions_user_context_active_unique").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.contextTag.asc().nullsLast().op("text_ops")).where(sql`(active = true)`),
]);

export const adminAiSkills = pgTable("admin_ai_skills", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	systemPrompt: text("system_prompt").notNull(),
	toolAllowlist: text("tool_allowlist").array(),
	inputSchema: jsonb("input_schema"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	createdBy: integer("created_by"),
	isSystem: boolean("is_system").default(false),
}, (table) => [
	index("idx_admin_ai_skills_name").using("btree", table.name.asc().nullsLast().op("text_ops")),
	unique("admin_ai_skills_name_key").on(table.name),
]);

export const agentSessions = pgTable("agent_sessions", {
	id: serial().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 255 }).notNull(),
	lane: varchar({ length: 64 }).notNull(),
	taskType: varchar("task_type", { length: 64 }).notNull(),
	status: varchar({ length: 32 }).default('active').notNull(),
	outcome: text(),
	metadata: jsonb().default({}),
	startTime: timestamp("start_time", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	endTime: timestamp("end_time", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("agent_sessions_session_id_key").on(table.sessionId),
]);

export const aiUsageLog = pgTable("ai_usage_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id"),
	endpoint: varchar({ length: 255 }).notNull(),
	model: varchar({ length: 100 }).notNull(),
	promptTokens: integer("prompt_tokens").default(0).notNull(),
	completionTokens: integer("completion_tokens").default(0).notNull(),
	totalTokens: integer("total_tokens").default(0).notNull(),
	durationMs: integer("duration_ms"),
	cached: boolean().default(false).notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

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

export const analyticsEvents = pgTable("analytics_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eventType: varchar("event_type", { length: 100 }).notNull(),
	userId: integer("user_id"),
	sessionId: varchar("session_id", { length: 255 }),
	payload: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("analytics_events_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("analytics_events_event_type_idx").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("analytics_events_user_id_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
]);

export const apiAuditLog = pgTable("api_audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: varchar("request_id", { length: 64 }),
	method: varchar({ length: 10 }).notNull(),
	path: varchar({ length: 500 }).notNull(),
	statusCode: integer("status_code").notNull(),
	durationMs: integer("duration_ms"),
	userId: integer("user_id"),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: varchar("user_agent", { length: 500 }),
	requestBodySize: integer("request_body_size"),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const attachmentVerifications = pgTable("attachment_verifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	attachmentId: uuid("attachment_id"),
	verifiedBy: integer("verified_by"),
	status: verificationStatus(),
	verificationDate: timestamp("verification_date", { mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow(),
});

export const aiReports = pgTable("ai_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	createdBy: integer("created_by"),
	reportType: varchar("report_type", { length: 100 }).notNull(),
	summary: text(),
	fullReport: text("full_report"),
	generatedAt: timestamp("generated_at", { mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "ai_reports_created_by_users_id_fk"
		}).onDelete("set null"),
]);

export const audioTranscripts = pgTable("audio_transcripts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	caseId: uuid("case_id"),
	language: varchar({ length: 10 }).default('en').notNull(),
	duration: real().notNull(),
	fullText: text("full_text").notNull(),
	segmentCount: integer("segment_count").default(0).notNull(),
	whisperModel: varchar("whisper_model", { length: 50 }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
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
	confirmedBy: integer("confirmed_by"),
	confirmedAt: timestamp("confirmed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const canonicalChunks = pgTable("canonical_chunks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	chunkId: varchar("chunk_id", { length: 200 }).notNull(),
	documentId: uuid("document_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	content: text().notNull(),
	tokenCount: integer("token_count"),
	semanticLabel: varchar("semantic_label", { length: 200 }),
	domains: jsonb().default([]),
	keyTerms: jsonb("key_terms").default([]),
	embedding: vector({ dimensions: 768 }),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("canonical_chunks_chunk_id_unique").on(table.chunkId),
]);

export const canonicalDocuments = pgTable("canonical_documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: varchar({ length: 500 }).notNull(),
	docType: varchar("doc_type", { length: 100 }).notNull(),
	citation: varchar({ length: 500 }),
	jurisdiction: jurisdiction().notNull(),
	authorityLevel: authorityLevel("authority_level").notNull(),
	sourceUrl: text("source_url"),
	sourceName: varchar("source_name", { length: 200 }),
	licenseTag: varchar("license_tag", { length: 100 }),
	retrievedAt: timestamp("retrieved_at", { withTimezone: true, mode: 'string' }),
	fullText: text("full_text"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const canvasAnnotations = pgTable("canvas_annotations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	canvasStateId: uuid("canvas_state_id"),
	createdBy: integer("created_by"),
	annotationData: jsonb("annotation_data").default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow(),
});

export const canvasAutosaves = pgTable("canvas_autosaves", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	canvasStateId: uuid("canvas_state_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const canvasStates = pgTable("canvas_states", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	userId: integer("user_id"),
	stateData: jsonb("state_data").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const caseActivities = pgTable("case_activities", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	assignedTo: integer("assigned_to"),
	createdBy: integer("created_by"),
	activityType: varchar("activity_type", { length: 100 }),
	description: text(),
	status: activityStatus(),
	dueDate: timestamp("due_date", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const caseEmbeddings = pgTable("case_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	embedding: text().notNull(),
	model: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

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
});

export const caseNoteEvidenceRefs = pgTable("case_note_evidence_refs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	noteId: uuid("note_id").notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("case_note_refs_unique").on(table.evidenceId, table.noteId),
]);

export const caseNoteVersions = pgTable("case_note_versions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	noteId: uuid("note_id").notNull(),
	title: varchar({ length: 255 }),
	content: text().notNull(),
	versionNumber: integer("version_number").notNull(),
	editedBy: uuid("edited_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const caseNotes = pgTable("case_notes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	title: varchar({ length: 255 }),
	content: text().notNull(),
	isAi: boolean("is_ai").default(false),
	isPinned: boolean("is_pinned").default(false),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

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

export const casePersons = pgTable("case_persons", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	personId: uuid("person_id").notNull(),
	relationshipType: varchar("relationship_type", { length: 64 }),
	isPrimary: varchar("is_primary", { length: 5 }).default('false'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("case_persons_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("case_persons_person_id_idx").using("btree", table.personId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("case_persons_unique_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops"), table.personId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "case_persons_case_id_fkey"
		}).onDelete("cascade"),
]);

export const caseScores = pgTable("case_scores", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	calculatedBy: integer("calculated_by"),
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
			name: "case_scores_calculated_by_users_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "case_scores_case_id_cases_id_fk"
		}).onDelete("cascade"),
]);

export const chatEmbeddings = pgTable("chat_embeddings", {
	id: serial().primaryKey().notNull(),
	text: text().notNull(),
	embedding: vector({ dimensions: 384 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_chat_embeddings_embedding").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "50"}),
]);

export const chatMessages = pgTable("chat_messages", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	chatId: varchar("chat_id", { length: 255 }).notNull(),
	userId: integer("user_id"),
	caseId: uuid("case_id"),
	role: chatMessageRole().notNull(),
	content: text().notNull(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	migratedFrom: varchar("migrated_from", { length: 255 }),
	metadata: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const chatMetadata = pgTable("chat_metadata", {
	chatId: varchar("chat_id", { length: 255 }).primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	title: varchar({ length: 500 }),
	caseId: uuid("case_id"),
	messageCount: varchar("message_count", { length: 50 }).default('0'),
	lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: 'string' }),
	isArchived: varchar("is_archived", { length: 10 }).default('false'),
	tags: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const chunkHitLog = pgTable("chunk_hit_log", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	chunkId: text("chunk_id").notNull(),
	relativePath: text("relative_path").notNull(),
	gpuCluster: integer("gpu_cluster"),
	somCluster: integer("som_cluster"),
	pipeline: text().notNull(),
	queryHash: varchar("query_hash", { length: 16 }).notNull(),
	score: real(),
	rerankScore: real("rerank_score"),
	userId: integer("user_id"),
	caseId: uuid("case_id"),
	hitAt: timestamp("hit_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("chunk_hit_pipeline_cluster_idx").using("btree", table.pipeline.asc().nullsLast().op("int4_ops"), table.gpuCluster.asc().nullsLast().op("int4_ops"), table.hitAt.desc().nullsFirst().op("int4_ops")),
	index("chunk_hit_query_hash_idx").using("btree", table.queryHash.asc().nullsLast().op("text_ops"), table.hitAt.desc().nullsFirst().op("text_ops")),
]);

export const citationTags = pgTable("citation_tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	jurisdiction: jurisdiction().notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("citation_tags_name_jurisdiction_unique").on(table.jurisdiction, table.name),
]);

export const citations = pgTable("citations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	documentId: text("document_id"),
	citationText: text("citation_text").notNull(),
	pageNumber: integer("page_number"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	sourceUrl: text("source_url"),
	confidence: real(),
	createdBy: integer("created_by"),
});

export const clusterNarratives = pgTable("cluster_narratives", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clusterId: integer("cluster_id").notNull(),
	k: integer().default(20).notNull(),
	summary: text().notNull(),
	purpose: text().notNull(),
	patterns: jsonb().default([]).notNull(),
	keyFiles: jsonb("key_files").default([]).notNull(),
	warnings: jsonb().default([]).notNull(),
	crossReferences: jsonb("cross_references").default([]).notNull(),
	memberCount: integer("member_count").default(0).notNull(),
	dominantAstCluster: text("dominant_ast_cluster"),
	tags: jsonb().default([]).notNull(),
	narrativeEmbedding: vector("narrative_embedding", { dimensions: 768 }),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const clusterSummaries = pgTable("cluster_summaries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	repoId: text("repo_id").default('default').notNull(),
	gpuCluster: integer("gpu_cluster").notNull(),
	summary: text().notNull(),
	purpose: text(),
	patterns: text().array(),
	warnings: text().array(),
	representativeChunkIds: uuid("representative_chunk_ids").array().default([""]).notNull(),
	memberCount: integer("member_count").default(0).notNull(),
	tags: text().array().default([""]).notNull(),
	centroidDistanceMean: real("centroid_distance_mean"),
	summaryModel: varchar("summary_model", { length: 100 }),
	summaryEmbedding: vector("summary_embedding", { dimensions: 768 }),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("cluster_summaries_embedding_hnsw").using("hnsw", table.summaryEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("cluster_summaries_repo_cluster").using("btree", table.repoId.asc().nullsLast().op("int4_ops"), table.gpuCluster.asc().nullsLast().op("text_ops")),
	index("cluster_summaries_tags_gin").using("gin", table.tags.asc().nullsLast().op("array_ops")),
	index("idx_cluster_summaries_embedding_ivfflat").using("ivfflat", table.summaryEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "5"}),
	index("idx_cluster_summaries_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_cluster_summaries_tags_gin").using("gin", table.tags.asc().nullsLast().op("array_ops")),
]);

export const codeLlmIndex = pgTable("code_llm_index", {
	pathHash: varchar("path_hash", { length: 16 }).primaryKey().notNull(),
	path: text().notNull(),
	isDir: boolean("is_dir").default(false).notNull(),
	llmOutput: text("llm_output").notNull(),
	source: varchar({ length: 32 }).default('ace').notNull(),
	query: text(),
	glyphClusterId: integer("glyph_cluster_id"),
	somBmuRow: integer("som_bmu_row"),
	somBmuCol: integer("som_bmu_col"),
	hitCount: integer("hit_count").default(0).notNull(),
	tokenCount: integer("token_count"),
	outputMeta: jsonb("output_meta").default({}).notNull(),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastHitAt: timestamp("last_hit_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	refreshedAt: timestamp("refreshed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("code_llm_index_cluster_idx").using("btree", table.glyphClusterId.asc().nullsLast().op("int4_ops")),
	index("code_llm_index_confidence_idx").using("btree", sql`(((output_meta ->> 'confidence'::text))::real)`).where(sql`(output_meta ? 'confidence'::text)`),
	index("code_llm_index_grounding_idx").using("btree", sql`(((output_meta ->> 'groundingScore'::text))::real)`).where(sql`(output_meta ? 'groundingScore'::text)`),
	index("code_llm_index_hit_count_idx").using("btree", table.hitCount.asc().nullsLast().op("int4_ops")),
	index("code_llm_index_last_hit_idx").using("btree", table.lastHitAt.asc().nullsLast().op("timestamptz_ops")),
	index("code_llm_index_output_meta_gin").using("gin", table.outputMeta.asc().nullsLast().op("jsonb_path_ops")),
	index("code_llm_index_source_idx").using("btree", table.source.asc().nullsLast().op("text_ops")),
]);

export const codeRelations = pgTable("code_relations", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "code_relations_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	sourceFile: text("source_file").notNull(),
	targetKey: text("target_key").notNull(),
	relationType: text("relation_type").notNull(),
	confidence: real().default(0.8).notNull(),
	evidence: jsonb().default({}),
	runId: text("run_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("code_relations_evidence_gin_idx").using("gin", table.evidence.asc().nullsLast().op("jsonb_ops")),
	index("code_relations_source_file_idx").using("btree", table.sourceFile.asc().nullsLast().op("text_ops")),
	index("code_relations_target_key_idx").using("btree", table.targetKey.asc().nullsLast().op("text_ops"), table.relationType.asc().nullsLast().op("text_ops")),
	uniqueIndex("code_relations_upsert_idx").using("btree", table.sourceFile.asc().nullsLast().op("text_ops"), table.targetKey.asc().nullsLast().op("text_ops"), table.relationType.asc().nullsLast().op("text_ops")),
]);

export const cases = pgTable("cases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	status: text().notNull(),
	caseNumber: varchar("case_number", { length: 100 }),
	jurisdiction: varchar({ length: 100 }),
	practiceArea: varchar("practice_area", { length: 100 }),
	priority: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
	court: varchar({ length: 200 }),
	clientName: varchar("client_name", { length: 200 }),
	opposingParty: varchar("opposing_party", { length: 200 }),
	assignedAttorney: integer("assigned_attorney"),
	filingDate: timestamp("filing_date", { withTimezone: true, mode: 'string' }),
	dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }),
	closedDate: timestamp("closed_date", { withTimezone: true, mode: 'string' }),
	qdrantId: uuid("qdrant_id"),
	qdrantCollection: varchar("qdrant_collection", { length: 100 }),
	userId: integer("user_id"),
});

export const codeRepos = pgTable("code_repos", {
	repoId: uuid("repo_id").primaryKey().notNull(),
	name: text(),
	branch: text(),
});

export const codebaseAuditReports = pgTable("codebase_audit_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	createdBy: integer("created_by"),
	reportType: varchar("report_type", { length: 50 }).default('full').notNull(),
	cudaAvailable: boolean("cuda_available").default(false).notNull(),
	gpuMemoryMb: integer("gpu_memory_mb"),
	gpuMemoryFreeMb: integer("gpu_memory_free_mb"),
	graphAnalysis: jsonb("graph_analysis"),
	evidenceAnalysis: jsonb("evidence_analysis"),
	codebaseAnalysis: jsonb("codebase_analysis"),
	durationMs: integer("duration_ms").notNull(),
	graphDurationMs: integer("graph_duration_ms"),
	evidenceDurationMs: integer("evidence_duration_ms"),
	codebaseDurationMs: integer("codebase_duration_ms"),
	status: varchar({ length: 32 }).default('completed').notNull(),
	error: text(),
	cacheKey: varchar("cache_key", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const communityReports = pgTable("community_reports", {
	communityId: integer("community_id").primaryKey().notNull(),
	clusterIds: integer("cluster_ids").array().default([]).notNull(),
	memberCount: integer("member_count").default(0).notNull(),
	summary: text().default(').notNull(),
	purpose: text().default(').notNull(),
	tags: text().array().default([""]).notNull(),
	cohesionScore: real("cohesion_score").default(0).notNull(),
	embedding: vector({ dimensions: 768 }),
	builtAt: timestamp("built_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const contentEmbeddings = pgTable("content_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	embedding: text().notNull(),
	model: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const contextTimeline = pgTable("context_timeline", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id"),
	sessionId: text("session_id").default(').notNull(),
	eventType: text("event_type").notNull(),
	pipeline: text().default('ace').notNull(),
	summaryId: uuid("summary_id"),
	hyperedgeHash: varchar("hyperedge_hash", { length: 8 }),
	signal: text(),
	grpoReward: real("grpo_reward"),
	pipelineWeightAfter: real("pipeline_weight_after"),
	triggeredRebuild: boolean("triggered_rebuild").default(false).notNull(),
	payload: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ctx_event_type").using("btree", table.eventType.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("ctx_hyperedge").using("btree", table.hyperedgeHash.asc().nullsLast().op("text_ops")),
	index("ctx_pipeline_reward").using("btree", table.pipeline.asc().nullsLast().op("text_ops"), table.grpoReward.asc().nullsLast().op("text_ops")),
	index("ctx_session_created").using("btree", table.sessionId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("ctx_user_created").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.createdAt.desc().nullsFirst().op("int4_ops")),
]);

export const courtroomModels = pgTable("courtroom_models", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	role: varchar({ length: 50 }).notNull(),
	modelUrl: varchar("model_url", { length: 500 }).notNull(),
	thumbnailUrl: varchar("thumbnail_url", { length: 500 }),
	skeletonType: varchar("skeleton_type", { length: 50 }).default('mixamo').notNull(),
	scaleX: real("scale_x").default(1).notNull(),
	scaleY: real("scale_y").default(1).notNull(),
	scaleZ: real("scale_z").default(1).notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("courtroom_models_role_idx").using("btree", table.role.asc().nullsLast().op("text_ops")),
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
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const diagnosisEvents = pgTable("diagnosis_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routePath: varchar("route_path", { length: 255 }),
	filePath: varchar("file_path", { length: 500 }),
	query: text().notNull(),
	mode: varchar({ length: 20 }).default('route').notNull(),
	probableRootCauseType: varchar("probable_root_cause_type", { length: 50 }).default('unknown').notNull(),
	riskLevel: varchar("risk_level", { length: 10 }).default('medium').notNull(),
	diagnosis: text().notNull(),
	likelyFiles: jsonb("likely_files").default([]).notNull(),
	impactedFiles: jsonb("impacted_files").default([]).notNull(),
	fixPlan: jsonb("fix_plan").default([]).notNull(),
	evidence: jsonb().default([]).notNull(),
	rankedFiles: jsonb("ranked_files").default([]).notNull(),
	suggestedTests: jsonb("suggested_tests").default([]).notNull(),
	sources: jsonb().default({}).notNull(),
	needsHumanReview: boolean("needs_human_review").default(true).notNull(),
	unsafeToAutoPatch: boolean("unsafe_to_auto_patch").default(false).notNull(),
	cached: boolean().default(false).notNull(),
	totalMs: integer("total_ms"),
	stages: jsonb().default({}).notNull(),
	userId: integer("user_id"),
	feedbackAccurate: boolean("feedback_accurate"),
	feedbackHelpful: boolean("feedback_helpful"),
	queryEmbedding: vector("query_embedding", { dimensions: 768 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const directoryClusterCheckpoints = pgTable("directory_cluster_checkpoints", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	stableKey: text("stable_key").notNull(),
	directoryPath: text("directory_path").notNull(),
	checkpointHash: text("checkpoint_hash").notNull(),
	fileCount: integer("file_count").default(0).notNull(),
	routeCount: integer("route_count").default(0).notNull(),
	testCount: integer("test_count").default(0).notNull(),
	clusterLabel: text("cluster_label"),
	tags: text().array().default([""]).notNull(),
	audit: jsonb().default({}).notNull(),
	metadata: jsonb().default({}).notNull(),
	indexedAt: timestamp("indexed_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("dir_cluster_path_idx").using("btree", table.directoryPath.asc().nullsLast().op("text_ops")),
	unique("directory_cluster_checkpoints_stable_key_key").on(table.stableKey),
]);

export const documents = pgTable("documents", {
	id: text().default(gen_random_uuid()).primaryKey().notNull(),
	userId: integer("user_id"),
	title: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	content: text(),
	s3Key: text("s3_key").notNull(),
	s3Bucket: text("s3_bucket").default('legal-documents').notNull(),
	originalName: text("original_name").notNull(),
	mimeType: text("mime_type").notNull(),
	status: documentStatus().default('queued').notNull(),
});

export const documentChunks = pgTable("document_chunks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: text("document_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
	content: text().notNull(),
});

export const documentProcessing = pgTable("document_processing", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	status: text().default('queued').notNull(),
	processor: varchar({ length: 100 }),
	metadata: jsonb(),
	error: text(),
	startedAt: timestamp("started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const documentSummaries = pgTable("document_summaries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	summaryType: summaryType("summary_type").notNull(),
	summaryText: text("summary_text").notNull(),
	model: varchar({ length: 100 }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const emailVerificationCodes = pgTable("email_verification_codes", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	email: varchar({ length: 255 }).notNull(),
	code: varchar({ length: 8 }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
});

export const embeddedSummaries = pgTable("embedded_summaries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	chunkId: text("chunk_id").notNull(),
	repoId: uuid("repo_id"),
	sourceType: text("source_type").notNull(),
	sourceHash: text("source_hash").notNull(),
	summaryType: text("summary_type").notNull(),
	summaryText: text("summary_text").notNull(),
	summaryJson: jsonb("summary_json").default({}).notNull(),
	outputMeta: jsonb("output_meta").default({}).notNull(),
	model: text().notNull(),
	embeddingModel: text("embedding_model").notNull(),
	qdrantCollection: text("qdrant_collection").notNull(),
	qdrantPointId: text("qdrant_point_id"),
	tags: text().array().default([""]).notNull(),
	confidence: doublePrecision().default(0.75).notNull(),
	somBmuRow: integer("som_bmu_row"),
	somBmuCol: integer("som_bmu_col"),
	manifold4: real().array(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	gpuCluster: integer("gpu_cluster"),
	topoByte: smallint("topo_byte").default(0).notNull(),
	topoClass: text("topo_class").default('unclassified').notNull(),
	embedding: vector({ dimensions: 768 }),
}, (table) => [
	index("embedded_summaries_gpu_cluster_idx").using("btree", table.gpuCluster.asc().nullsLast().op("int4_ops")),
	index("idx_embedded_summaries_vector_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	unique("embedded_summaries_chunk_hash_type_uq").on(table.chunkId, table.sourceHash, table.summaryType),
]);

export const embeddingCache = pgTable("embedding_cache", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	textHash: text("text_hash").notNull(),
	model: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
}, (table) => [
	index("embedding_cache_hnsw_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	unique("embedding_cache_text_hash_unique").on(table.textHash),
]);

export const enhancedGraphMappings = pgTable("enhanced_graph_mappings", {
	id: text().primaryKey().notNull(),
	kind: text().notNull(),
	label: text().notNull(),
	path: text(),
	summary: text(),
	edges: jsonb().default([]).notNull(),
	scores: jsonb().default({}).notNull(),
	flags: integer().default(0).notNull(),
	vectors: jsonb().default({}).notNull(),
	manifold4: real().array(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_enhanced_graph_kind").using("btree", table.kind.asc().nullsLast().op("text_ops")),
]);

export const crimes = pgTable("crimes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	crimeCode: text("crime_code").notNull(),
	crimeCategory: text("crime_category").notNull(),
	crimeClassification: text("crime_classification").notNull(),
	attempted: boolean().default(false),
	sentencingYear: integer("sentencing_year"),
	sentenceLengthMonths: integer("sentence_length_months"),
	enhancements: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("crimes_case_id_idx").using("btree", table.caseId.asc().nullsLast().op("uuid_ops")),
	index("crimes_category_idx").using("btree", table.crimeCategory.asc().nullsLast().op("text_ops")),
	index("crimes_classification_idx").using("btree", table.crimeClassification.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [cases.id],
			name: "crimes_case_id_fkey"
		}).onDelete("cascade"),
]);

export const enrichmentJobs = pgTable("enrichment_jobs", {
	jobId: uuid("job_id").defaultRandom().primaryKey().notNull(),
	repoId: text("repo_id"),
	jobType: varchar("job_type", { length: 64 }).notNull(),
	status: varchar({ length: 32 }).default('pending').notNull(),
	cursor: text(),
	totalProcessed: integer("total_processed").default(0).notNull(),
	totalUpserted: integer("total_upserted").default(0).notNull(),
	totalFailed: integer("total_failed").default(0).notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}).notNull(),
	error: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_enrichment_jobs_job_type").using("btree", table.jobType.asc().nullsLast().op("text_ops")),
	index("idx_enrichment_jobs_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const errorClusters = pgTable("error_clusters", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	kind: errorKind().notNull(),
	severity: errorSeverity().default('warn').notNull(),
	pattern: text().notNull(),
	errorCount: integer("error_count").default(1).notNull(),
	routePaths: text("route_paths").array(),
	radius: numeric(),
	lastUpdated: timestamp("last_updated", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
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
	collectedAt: timestamp("collected_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const errorFeedback = pgTable("error_feedback", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	suggestionId: uuid("suggestion_id").notNull(),
	routePath: varchar("route_path", { length: 255 }).notNull(),
	helpful: boolean(),
	accurate: boolean(),
	worksSoon: boolean("works_soon"),
	feedback: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const errorFingerprints = pgTable("error_fingerprints", {
	errorHash: text("error_hash").primaryKey().notNull(),
	normalizedText: text("normalized_text").notNull(),
	rawText: text("raw_text").notNull(),
	topSymbols: text("top_symbols").array().default([""]).notNull(),
	topFiles: text("top_files").array().default([""]).notNull(),
	priorFix: text("prior_fix"),
	confidence: real().default(0.5).notNull(),
	seenCount: integer("seen_count").default(1).notNull(),
	firstSeen: timestamp("first_seen", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastSeen: timestamp("last_seen", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("error_fingerprints_fts_idx").using("gin", sql`to_tsvector('english'::regconfig, normalized_text)`),
	index("error_fingerprints_normalized_trgm_idx").using("gin", table.normalizedText.asc().nullsLast().op("gin_trgm_ops")),
	index("error_fingerprints_top_files_gin_idx").using("gin", table.topFiles.asc().nullsLast().op("array_ops")),
	index("error_fingerprints_top_symbols_gin_idx").using("gin", table.topSymbols.asc().nullsLast().op("array_ops")),
]);

export const errorSuggestionStates = pgTable("error_suggestion_states", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	suggestionId: uuid("suggestion_id").notNull(),
	routePath: varchar("route_path", { length: 255 }).notNull(),
	userId: integer("user_id"),
	state: suggestionState().default('pending').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("uq_error_suggestion_states_suggestion_route_user").on(table.routePath, table.suggestionId, table.userId),
]);

export const errorSuggestions = pgTable("error_suggestions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clusterId: uuid("cluster_id").notNull(),
	title: varchar({ length: 255 }).notNull(),
	explanation: text().notNull(),
	patch: text(),
	confidence: numeric(),
	hints: text().array(),
	generatedAt: timestamp("generated_at", { mode: 'string' }).defaultNow().notNull(),
	appliedCount: integer("applied_count").default(0).notNull(),
	successCount: integer("success_count").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const errorTimeline = pgTable("error_timeline", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routePath: varchar("route_path", { length: 255 }).notNull(),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	description: text(),
	metadata: jsonb(),
	occurredAt: timestamp("occurred_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const evidenceAnalysisCache = pgTable("evidence_analysis_cache", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	caseId: uuid("case_id"),
	analysisType: varchar("analysis_type", { length: 50 }).notNull(),
	result: jsonb().notNull(),
	resultEmbedding: vector("result_embedding", { dimensions: 768 }),
	confidence: real().default(0),
	objectCount: integer("object_count").default(0),
	tags: jsonb().default([]),
	llmEscalated: boolean("llm_escalated").default(false),
	processingTimeMs: integer("processing_time_ms").default(0),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const evidenceAuditLog = pgTable("evidence_audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	userId: integer("user_id"),
	action: varchar({ length: 50 }).notNull(),
	changes: jsonb(),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("evidence_audit_log_action_idx").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("evidence_audit_log_evidence_id_idx").using("btree", table.evidenceId.asc().nullsLast().op("uuid_ops")),
	index("evidence_audit_log_timestamp_idx").using("btree", table.timestamp.asc().nullsLast().op("timestamptz_ops")),
	index("evidence_audit_log_user_id_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
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
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const evidenceEntities = pgTable("evidence_entities", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	caseId: uuid("case_id"),
	entityText: text("entity_text").notNull(),
	entityLabel: varchar("entity_label", { length: 50 }).notNull(),
	confidence: real(),
	startOffset: integer("start_offset"),
	endOffset: integer("end_offset"),
	source: varchar({ length: 20 }).default('llm'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const evidenceForensicFlags = pgTable("evidence_forensic_flags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	caseId: uuid("case_id"),
	flagType: varchar("flag_type", { length: 50 }).notNull(),
	description: text().notNull(),
	severity: varchar({ length: 10 }).notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const evidence = pgTable("evidence", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	evidenceType: evidenceType("evidence_type").notNull(),
	fileUrl: text("file_url"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	criminalId: uuid("criminal_id"),
	fileType: varchar("file_type", { length: 50 }),
	subType: varchar("sub_type", { length: 50 }),
	fileName: varchar("file_name", { length: 255 }),
	canvasPosition: jsonb("canvas_position").default({}).notNull(),
	uploadedBy: integer("uploaded_by"),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow().notNull(),
	filePath: varchar("file_path", { length: 500 }),
	fileSize: integer("file_size"),
	hash: varchar({ length: 255 }),
	source: varchar({ length: 255 }),
	dateObtained: timestamp("date_obtained", { withTimezone: true, mode: 'string' }),
	chainOfCustody: jsonb("chain_of_custody"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	userId: integer("user_id"),
	evidenceNumber: varchar("evidence_number", { length: 50 }),
	type: varchar({ length: 100 }),
	summary: text(),
	posX: integer("pos_x"),
	posY: integer("pos_y"),
	collectedAt: timestamp("collected_at", { withTimezone: true, mode: 'string' }),
	collectedBy: varchar("collected_by", { length: 255 }),
	mimeType: varchar("mime_type", { length: 100 }),
	tags: jsonb().default([]),
	aiTags: jsonb("ai_tags").default([]),
	aiAnalysis: jsonb("ai_analysis"),
	aiSummary: text("ai_summary"),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	verified: boolean().default(false),
	status: varchar({ length: 50 }).default('pending'),
	extractedText: text("extracted_text"),
	entities: jsonb().default([]),
	keywords: jsonb().default([]),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	embedding: vector({ dimensions: 768 }),
	// TODO: failed to parse database type 'tsvector'
	searchVector: unknown("search_vector"),
}, (table) => [
	index("evidence_deleted_at_idx").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("evidence_entities_gin_idx").using("gin", table.entities.asc().nullsLast().op("jsonb_ops")),
	index("evidence_search_vector_idx").using("gin", table.searchVector.asc().nullsLast().op("tsvector_ops")),
	index("evidence_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("evidence_tags_gin_idx").using("gin", table.tags.asc().nullsLast().op("jsonb_ops")),
	index("evidence_verified_idx").using("btree", table.verified.asc().nullsLast().op("bool_ops")),
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
});

export const evidenceVectors = pgTable("evidence_vectors", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	embedding: vector({ dimensions: 384 }),
	embeddingType: varchar("embedding_type", { length: 50 }).notNull(),
	sourceField: varchar("source_field", { length: 100 }).notNull(),
	model: varchar({ length: 100 }).default('nomic-embed-text').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("evidence_vectors_hnsw_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
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
});

export const failedJobs = pgTable("failed_jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	queue: varchar({ length: 100 }).notNull(),
	dlqQueue: varchar("dlq_queue", { length: 100 }).notNull(),
	reason: varchar({ length: 100 }).default('unknown').notNull(),
	retryCount: integer("retry_count").default(0).notNull(),
	payload: jsonb().default({}),
	error: text(),
	deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("failed_jobs_dead_lettered_at_idx").using("btree", table.deadLetteredAt.asc().nullsLast().op("timestamptz_ops")),
	index("failed_jobs_queue_idx").using("btree", table.queue.asc().nullsLast().op("text_ops")),
	index("failed_jobs_resolved_at_idx").using("btree", table.resolvedAt.asc().nullsLast().op("timestamptz_ops")),
]);

export const fictionalCaseCharges = pgTable("fictional_case_charges", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fictionalCaseId: uuid("fictional_case_id").notNull(),
	chargeName: varchar("charge_name", { length: 300 }).notNull(),
	statute: varchar({ length: 200 }),
	elements: jsonb().default([]),
	canonChunkIds: jsonb("canon_chunk_ids").default([]),
	isPrimary: boolean("is_primary").default(false),
	metadata: jsonb().default({}),
});

export const featureMaps = pgTable("feature_maps", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	status: text().default('stable').notNull(),
	paths: jsonb().default({}).notNull(),
	graphTriples: jsonb("graph_triples").default([]).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	flags: bigint({ mode: "number" }).default(0).notNull(),
	glyph: text(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const fictionalCaseActors = pgTable("fictional_case_actors", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fictionalCaseId: uuid("fictional_case_id").notNull(),
	name: varchar({ length: 200 }).notNull(),
	role: fictionalActorRole().notNull(),
	description: text(),
	metadata: jsonb().default({}),
});

export const fictionalCaseEvents = pgTable("fictional_case_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fictionalCaseId: uuid("fictional_case_id").notNull(),
	eventType: varchar("event_type", { length: 100 }).notNull(),
	eventDate: date("event_date"),
	description: text(),
	canonChunkIds: jsonb("canon_chunk_ids").default([]),
	orderIndex: integer("order_index").default(0),
	metadata: jsonb().default({}),
});

export const fictionalCases = pgTable("fictional_cases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: varchar("case_id", { length: 200 }).notNull(),
	category: fictionalCaseCategory().notNull(),
	charge: varchar({ length: 300 }).notNull(),
	primaryStatute: varchar("primary_statute", { length: 200 }),
	defendantName: varchar("defendant_name", { length: 200 }).notNull(),
	incidentDate: date("incident_date"),
	jurisdictionCity: varchar("jurisdiction_city", { length: 200 }),
	jurisdiction: jurisdiction(),
	financialLoss: real("financial_loss"),
	narrative: text().notNull(),
	disclaimer: text(),
	isFictional: boolean("is_fictional").default(true).notNull(),
	generatedBy: varchar("generated_by", { length: 100 }),
	guardrailTriggered: boolean("guardrail_triggered").default(false),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("fictional_cases_case_id_unique").on(table.caseId),
]);

export const glyphRecords = pgTable("glyph_records", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	glyphId: text("glyph_id").notNull(),
	sourceId: text("source_id").notNull(),
	caseId: uuid("case_id"),
	kind: varchar({ length: 30 }).notNull(),
	section: varchar({ length: 30 }).default('UNKNOWN').notNull(),
	schemaVersion: integer("schema_version").default(1).notNull(),
	somCluster: integer("som_cluster"),
	centroidId: integer("centroid_id"),
	grpoRewardScore: real("grpo_reward_score"),
	summary: text().notNull(),
	tags: jsonb().default([]).notNull(),
	entities: jsonb().default([]).notNull(),
	kagNeighbors: jsonb("kag_neighbors").default([]).notNull(),
	dagPrev: jsonb("dag_prev").default([]).notNull(),
	dagNext: jsonb("dag_next").default([]).notNull(),
	topology: jsonb().default({}).notNull(),
	render: jsonb().default({}).notNull(),
	recordJson: jsonb("record_json").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const hypergraphEdges = pgTable("hypergraph_edges", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	edgeHash: varchar("edge_hash", { length: 64 }).notNull(),
	edgeId: text("edge_id"),
	edgeType: text("edge_type").default('generic').notNull(),
	memberIds: text("member_ids").array().default([""]).notNull(),
	title: text(),
	summary: text(),
	gradeLabel: varchar("grade_label", { length: 4 }).default('D').notNull(),
	gradeScore: real("grade_score").default(0).notNull(),
	confidence: real().default(0.5).notNull(),
	source: text(),
	gpuCluster: integer("gpu_cluster"),
	communityId: integer("community_id"),
	topoClass: text("topo_class"),
	somCluster: integer("som_cluster"),
	glyphCluster: text("glyph_cluster"),
	somCell: text("som_cell"),
	manifold4: real().array(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	label: text(),
	queryHash: text("query_hash"),
	runId: uuid("run_id"),
	weight: real().default(1).notNull(),
}, (table) => [
	index("hypergraph_edges_cluster_idx").using("btree", table.gpuCluster.asc().nullsLast().op("int4_ops")),
	index("hypergraph_edges_edge_type_idx").using("btree", table.edgeType.asc().nullsLast().op("text_ops")),
	index("hypergraph_edges_glyph_cluster_idx").using("btree", table.glyphCluster.asc().nullsLast().op("text_ops")),
	index("hypergraph_edges_grade_idx").using("btree", table.gradeLabel.asc().nullsLast().op("text_ops")),
	index("hypergraph_edges_som_cluster_idx").using("btree", table.somCluster.asc().nullsLast().op("int4_ops")),
	index("hypergraph_edges_topo_class_idx").using("btree", table.topoClass.asc().nullsLast().op("text_ops")),
	unique("hypergraph_edges_edge_hash_uq").on(table.edgeHash),
]);

export const hashVerifications = pgTable("hash_verifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	verifiedBy: integer("verified_by"),
	hashValue: text("hash_value").notNull(),
	algorithm: varchar({ length: 50 }).notNull(),
	status: verificationStatus().default('pending').notNull(),
	verificationDate: timestamp("verification_date", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const hermesDagRuns = pgTable("hermes_dag_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	dagName: text("dag_name").default(').notNull(),
	inputJson: jsonb("input_json").default({}).notNull(),
	outputJson: jsonb("output_json").default({}).notNull(),
	status: text().default('pending').notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("hermes_dag_runs_dag_name_idx").using("btree", table.dagName.asc().nullsLast().op("text_ops")),
	index("hermes_dag_runs_started_idx").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("hermes_dag_runs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	check("hermes_dag_runs_status_check", sql`status = ANY (ARRAY['pending'::text, 'running'::text, 'success'::text, 'failed'::text])`),
]);

export const ingestionBuffers = pgTable("ingestion_buffers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scope: text().notNull(),
	clusterId: integer("cluster_id"),
	k: integer().default(20).notNull(),
	bufferJsonb: jsonb("buffer_jsonb").default({}).notNull(),
	tokenEstimate: integer("token_estimate").default(0).notNull(),
	compressionRatio: real("compression_ratio").default(1).notNull(),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("ingestion_buffers_scope_cluster_k").on(table.clusterId, table.k, table.scope),
]);

export const grpoMemorySticks = pgTable("grpo_memory_sticks", {
	id: text().primaryKey().notNull(),
	featureId: text("feature_id"),
	queryHash: text("query_hash").notNull(),
	contextPacketHash: text("context_packet_hash").notNull(),
	selectedIds: jsonb("selected_ids").default([]).notNull(),
	rejectedIds: jsonb("rejected_ids").default([]).notNull(),
	rewardSignals: jsonb("reward_signals").default({}).notNull(),
	scores: jsonb().default({}).notNull(),
	cacheKeys: jsonb("cache_keys").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.featureId],
			foreignColumns: [featureMaps.id],
			name: "grpo_memory_sticks_feature_id_fkey"
		}).onDelete("set null"),
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
});

export const jurisdictions = pgTable("jurisdictions", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).default(sql`nextval('jurisdictions_id_seq'::regclass)`).primaryKey().notNull(),
	code: text().notNull(),
	name: text().notNull(),
	level: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	parentId: bigint("parent_id", { mode: "number" }),
});

export const kagDagNodes = pgTable("kag_dag_nodes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	runId: uuid("run_id"),
	nodeKey: text("node_key").notNull(),
	nodeType: text("node_type").notNull(),
	input: jsonb().default({}),
	output: jsonb().default({}),
	status: text().notNull(),
	cacheHit: boolean("cache_hit").default(false),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	durationMs: integer("duration_ms"),
	error: jsonb().default({}),
}, (table) => [
	index("kag_dag_nodes_cache_idx").using("btree", table.cacheHit.asc().nullsLast().op("bool_ops")),
	index("kag_dag_nodes_run_idx").using("btree", table.runId.asc().nullsLast().op("uuid_ops")),
	index("kag_dag_nodes_type_idx").using("btree", table.nodeType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [kagDagRuns.id],
			name: "kag_dag_nodes_run_id_fkey"
		}).onDelete("cascade"),
	unique("kag_dag_nodes_run_id_node_key_key").on(table.nodeKey, table.runId),
]);

export const knowledgeArtifacts = pgTable("knowledge_artifacts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceType: varchar("source_type", { length: 30 }).notNull(),
	sourceId: text("source_id").notNull(),
	summary: text(),
	tags: jsonb().default([]).notNull(),
	metadata: jsonb().default({}).notNull(),
	embedText: text("embed_text"),
	somCluster: integer("som_cluster"),
	schemaVersion: integer("schema_version").default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const legalAnalysisSessions = pgTable("legal_analysis_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	caseId: uuid("case_id"),
	analysisType: varchar("analysis_type", { length: 100 }).notNull(),
	inputData: jsonb("input_data"),
	outputSummary: text("output_summary"),
	status: varchar({ length: 50 }).default('pending').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

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
	summary: text(),
	qdrantPointId: text("qdrant_point_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("legal_chunks_node_chunk_uniq").on(table.chunkIndex, table.legalNodeId),
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
});

export const legalDefinitions = pgTable("legal_definitions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	term: text().notNull(),
	normalizedTerm: text("normalized_term").notNull(),
	definedInNodeId: uuid("defined_in_node_id"),
	definitionText: text("definition_text").notNull(),
	confidence: real().default(1),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const legalDocuments = pgTable("legal_documents", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	content: text(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	s3Bucket: text("s3_bucket").default('legal-documents').notNull(),
	userId: integer("user_id"),
	evidenceId: uuid("evidence_id"),
	createdBy: integer("created_by"),
	status: text().default('queued').notNull(),
	contentEmbedding: vector("content_embedding", { dimensions: 768 }),
	qdrantId: uuid("qdrant_id"),
	qdrantCollection: varchar("qdrant_collection", { length: 100 }),
	lastSyncedToQdrant: timestamp("last_synced_to_qdrant", { withTimezone: true, mode: 'string' }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	// TODO: failed to parse database type 'tsvector'
	contentTsv: unknown("content_tsv").generatedAlwaysAs(sql`(setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(content, ''::text)), 'B'::"char"))`),
	jurisdiction: varchar({ length: 100 }),
}, (table) => [
	index("idx_legal_documents_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("legal_documents_content_tsv_gin").using("gin", table.contentTsv.asc().nullsLast().op("tsvector_ops")),
	index("legal_documents_hnsw_idx").using("hnsw", table.contentEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("legal_documents_jurisdiction_idx").using("btree", table.jurisdiction.asc().nullsLast().op("text_ops")).where(sql`(jurisdiction IS NOT NULL)`),
]);

export const legalGlossary = pgTable("legal_glossary", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	term: varchar({ length: 255 }).notNull(),
	definition: text().notNull(),
	category: varchar({ length: 100 }),
	jurisdiction: varchar({ length: 100 }),
	relatedTerms: jsonb("related_terms"),
	sources: jsonb(),
	embedding: vector({ dimensions: 768 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

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
	tagsJson: jsonb("tags_json").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const kagDagRuns = pgTable("kag_dag_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	query: text().notNull(),
	queryHash: text("query_hash").notNull(),
	intent: text(),
	status: text().notNull(),
	model: text(),
	totalDurationMs: integer("total_duration_ms"),
	finalAnswer: text("final_answer"),
	finalJson: jsonb("final_json").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}),
});

export const legalPrecedents = pgTable("legal_precedents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	title: varchar({ length: 255 }).notNull(),
	summary: text().notNull(),
	citation: varchar({ length: 255 }),
	court: varchar({ length: 200 }),
	decisionDate: timestamp("decision_date", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const legalResearch = pgTable("legal_research", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	createdBy: integer("created_by").notNull(),
	query: text().notNull(),
	results: jsonb(),
	status: varchar({ length: 50 }).default('completed').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const legalTerms = pgTable("legal_terms", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	term: varchar({ length: 300 }).notNull(),
	domain: varchar({ length: 100 }).notNull(),
	jurisdiction: jurisdiction(),
	formalDefinition: text("formal_definition").notNull(),
	plainDefinition: text("plain_definition"),
	relatedChunkIds: jsonb("related_chunk_ids").default([]),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const libraryDocumentVersions = pgTable("library_document_versions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	versionLabel: text("version_label"),
	sourceDate: date("source_date"),
	isCurrent: boolean("is_current").default(false),
	parentVersionId: uuid("parent_version_id"),
	diffSummary: text("diff_summary"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

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
	uploadedBy: integer("uploaded_by"),
	sourceConfidence: text("source_confidence").default('medium'),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'string' }),
	minioKeyNormalized: text("minio_key_normalized"),
	sourceKind: text("source_kind").default('uploaded_pdf'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const llmSummaryCache = pgTable("llm_summary_cache", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	stableKey: text("stable_key").notNull(),
	sourceType: text("source_type").notNull(),
	sourceHash: text("source_hash").notNull(),
	model: text().notNull(),
	summaryShort: text("summary_short"),
	summaryLong: text("summary_long"),
	jsonSummary: jsonb("json_summary").default({}),
	embeddingModel: text("embedding_model"),
	qdrantPointId: text("qdrant_point_id"),
	tags: text().array().default([""]),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("llm_summary_cache_json_gin").using("gin", table.jsonSummary.asc().nullsLast().op("jsonb_ops")),
	index("llm_summary_cache_tags_gin").using("gin", table.tags.asc().nullsLast().op("array_ops")),
	unique("llm_summary_cache_stable_key_key").on(table.stableKey),
]);

export const llmSynthesisEvents = pgTable("llm_synthesis_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	runId: text("run_id").notNull(),
	sessionId: text("session_id"),
	userId: integer("user_id"),
	query: text().notNull(),
	profile: text().notNull(),
	acePacket: jsonb("ace_packet").notNull(),
	toolCalls: jsonb("tool_calls").default([]).notNull(),
	sourceRefs: jsonb("source_refs").default([]).notNull(),
	cacheKeys: jsonb("cache_keys").default({}).notNull(),
	model: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	authUserId: text("auth_user_id"),
	trustTier: text("trust_tier"),
	validation: jsonb().default({}).notNull(),
}, (table) => [
	index("llm_synthesis_events_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("llm_synthesis_events_run_id_idx").using("btree", table.runId.asc().nullsLast().op("text_ops")),
	index("llm_synthesis_events_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	index("llm_synthesis_events_user_id_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
]);

export const memoryGainAudits = pgTable("memory_gain_audits", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	query: text().notNull(),
	topic: text(),
	candidateHash: text("candidate_hash").notNull(),
	existingMemoryIds: text("existing_memory_ids").array().default([""]),
	gainScore: doublePrecision("gain_score"),
	decision: text().notNull(),
	accuracyScore: doublePrecision("accuracy_score"),
	densityScore: doublePrecision("density_score"),
	clarityScore: doublePrecision("clarity_score"),
	noveltyScore: doublePrecision("novelty_score"),
	reasoning: text(),
	improvements: text().array().default([""]),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("memory_gain_audits_decision_idx").using("btree", table.decision.asc().nullsLast().op("text_ops")),
	index("memory_gain_audits_query_idx").using("btree", table.query.asc().nullsLast().op("text_ops")),
	index("memory_gain_audits_score_idx").using("btree", table.gainScore.asc().nullsLast().op("float8_ops")),
]);

export const metadataEnvelopes = pgTable("metadata_envelopes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceType: text("source_type").notNull(),
	stableKey: text("stable_key").notNull(),
	repoRoot: text("repo_root"),
	filePath: text("file_path"),
	directoryPath: text("directory_path"),
	name: text(),
	language: text(),
	contentHash: text("content_hash"),
	schemaVersion: integer("schema_version").default(1).notNull(),
	metadata: jsonb().default({}).notNull(),
	features: jsonb().default({}).notNull(),
	relations: jsonb().default([]).notNull(),
	diagnostics: jsonb().default([]).notNull(),
	embeddingModel: text("embedding_model"),
	qdrantCollection: text("qdrant_collection"),
	qdrantPointId: text("qdrant_point_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	indexedAt: timestamp("indexed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("metadata_envelopes_features_gin").using("gin", table.features.asc().nullsLast().op("jsonb_ops")),
	index("metadata_envelopes_file_path_idx").using("btree", table.filePath.asc().nullsLast().op("text_ops")),
	index("metadata_envelopes_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("metadata_envelopes_relations_gin").using("gin", table.relations.asc().nullsLast().op("jsonb_ops")),
	index("metadata_envelopes_source_type_idx").using("btree", table.sourceType.asc().nullsLast().op("text_ops")),
	unique("metadata_envelopes_stable_key_key").on(table.stableKey),
]);

export const modelRegistry = pgTable("model_registry", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 200 }).notNull(),
	backend: inferenceBackend().notNull(),
	capability: modelCapability().default('chat').notNull(),
	version: varchar({ length: 50 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	parameterCount: bigint("parameter_count", { mode: "number" }),
	quantization: varchar({ length: 50 }),
	contextWindow: integer("context_window"),
	embeddingDims: integer("embedding_dims"),
	isActive: boolean("is_active").default(true).notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	healthEndpoint: varchar("health_endpoint", { length: 500 }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("model_registry_name_backend_unique").on(table.backend, table.name),
]);

export const modelWeights = pgTable("model_weights", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	modelName: varchar("model_name", { length: 255 }).notNull(),
	version: varchar({ length: 50 }).notNull(),
	status: varchar({ length: 50 }).default('candidate').notNull(),
	checksumSha256: char("checksum_sha256", { length: 64 }).notNull(),
	filePath: text("file_path").notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("model_weights_model_name_version_key").on(table.modelName, table.version),
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
	unique("page_artifacts_doc_page_uniq").on(table.documentId, table.pageNumber),
]);

export const panelActivityLog = pgTable("panel_activity_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id"),
	sessionId: text("session_id").notNull(),
	route: text().notNull(),
	panelKey: text("panel_key").notNull(),
	filePath: text("file_path"),
	toolUsed: text("tool_used"),
	dwellMs: integer("dwell_ms"),
	ts: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("pal_file_idx").using("btree", table.filePath.asc().nullsLast().op("text_ops")).where(sql`(file_path IS NOT NULL)`),
	index("pal_ts_idx").using("btree", table.ts.desc().nullsFirst().op("timestamptz_ops")),
	index("pal_user_route_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.route.asc().nullsLast().op("text_ops"), table.ts.desc().nullsFirst().op("timestamptz_ops")),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
	tokenHash: varchar("token_hash", { length: 63 }).primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
});

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
	generatedAt: timestamp("generated_at", { mode: 'string' }),
	lastUpdated: timestamp("last_updated", { mode: 'string' }),
	crimes: text().array(),
	caseIds: text("case_ids").array(),
	caseId: uuid("case_id"),
	profileData: jsonb("profile_data").default({}),
	tags: jsonb().default([]),
	position: jsonb().default({}),
	photoUrl: text("photo_url"),
	notes: text(),
	metadata: jsonb().default({}),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const qdrantCentroidClusters = pgTable("qdrant_centroid_clusters", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clusterKey: text("cluster_key").notNull(),
	collectionName: text("collection_name").notNull(),
	label: text(),
	summary: text(),
	centroidPointId: text("centroid_point_id"),
	centroidVectorHash: text("centroid_vector_hash"),
	tags: text().array().default([""]),
	directoryPaths: text("directory_paths").array().default([""]),
	memberCount: integer("member_count").default(0),
	avgScore: doublePrecision("avg_score"),
	pageRank: doublePrecision("page_rank"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("qdrant_centroid_clusters_dirs_gin").using("gin", table.directoryPaths.asc().nullsLast().op("array_ops")),
	index("qdrant_centroid_clusters_tags_gin").using("gin", table.tags.asc().nullsLast().op("array_ops")),
	unique("qdrant_centroid_clusters_cluster_key_key").on(table.clusterKey),
]);

export const qloraExamples = pgTable("qlora_examples", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	query: text().notNull(),
	queryHash: varchar("query_hash", { length: 16 }).notNull(),
	instruction: text().notNull(),
	contextChunks: jsonb("context_chunks").notNull(),
	graphSummary: text("graph_summary"),
	response: text().notNull(),
	responseScore: real("response_score").notNull(),
	pipelineHits: jsonb("pipeline_hits").default({}),
	gpuClusters: jsonb("gpu_clusters").default([]),
	avgRerankScore: real("avg_rerank_score"),
	entityTags: jsonb("entity_tags").default([]),
	datasetSplit: text("dataset_split").default('train'),
	qualityTier: text("quality_tier").default('silver'),
	modelVersion: text("model_version"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	usedInRun: integer("used_in_run").default(0),
}, (table) => [
	index("qlora_examples_clusters_idx").using("gin", table.gpuClusters.asc().nullsLast().op("jsonb_ops")),
	index("qlora_examples_dataset_split_idx").using("btree", table.datasetSplit.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("qlora_examples_quality_idx").using("btree", table.qualityTier.asc().nullsLast().op("text_ops"), table.responseScore.desc().nullsFirst().op("text_ops")),
]);

export const queryVariancePairs = pgTable("query_variance_pairs", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	queryHashA: varchar("query_hash_a", { length: 16 }).notNull(),
	queryHashB: varchar("query_hash_b", { length: 16 }).notNull(),
	queryA: text("query_a").notNull(),
	queryB: text("query_b").notNull(),
	similarity: real().notNull(),
	hitCount: integer("hit_count").default(1),
	pipeline: text(),
	lastSeen: timestamp("last_seen", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("query_variance_pairs_a_idx").using("btree", table.queryHashA.asc().nullsLast().op("text_ops")),
	uniqueIndex("query_variance_pairs_pair_idx").using("btree", sql`LEAST(query_hash_a, query_hash_b)`, sql`GREATEST(query_hash_a, query_hash_b)`),
]);

export const ragIndexMetadata = pgTable("rag_index_metadata", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	chunkId: uuid("chunk_id").notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	tags: text().array().default([""]).notNull(),
	tagWeight: real("tag_weight").default(1).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const ragMessages = pgTable("rag_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	role: varchar({ length: 50 }).notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const ragQueryCache = pgTable("rag_query_cache", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	queryHash: text("query_hash").notNull(),
	normalizedQuery: text("normalized_query").notNull(),
	queryEmbeddingModel: text("query_embedding_model"),
	queryVectorId: text("query_vector_id"),
	entityFingerprint: text("entity_fingerprint"),
	tagFingerprint: text("tag_fingerprint"),
	centroidClusterId: text("centroid_cluster_id"),
	answer: text(),
	answerJson: jsonb("answer_json").default({}),
	hitCount: integer("hit_count").default(0),
	lastHitAt: timestamp("last_hit_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	metadata: jsonb().default({}),
}, (table) => [
	index("rag_query_cache_centroid_idx").using("btree", table.centroidClusterId.asc().nullsLast().op("text_ops")),
	index("rag_query_cache_entity_idx").using("btree", table.entityFingerprint.asc().nullsLast().op("text_ops")),
	index("rag_query_cache_tags_idx").using("btree", table.tagFingerprint.asc().nullsLast().op("text_ops")),
	unique("rag_query_cache_query_hash_key").on(table.queryHash),
]);

export const ragQueryLog = pgTable("rag_query_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id"),
	caseId: uuid("case_id"),
	query: text().notNull(),
	queryHash: varchar("query_hash", { length: 16 }).notNull(),
	// TODO: failed to parse database type 'halfvec(768)'
	queryEmbedding: unknown("query_embedding"),
	entityStatutes: jsonb("entity_statutes").default([]),
	entityCases: jsonb("entity_cases").default([]),
	entityCaCodes: jsonb("entity_ca_codes").default([]),
	totalEntityTags: integer("total_entity_tags").default(0),
	totalFound: integer("total_found").default(0),
	searchTimeMs: integer("search_time_ms"),
	rerankTimeMs: integer("rerank_time_ms"),
	rerankL0Hit: boolean("rerank_l0_hit").default(false),
	rerankL1Hits: integer("rerank_l1_hits").default(0),
	rerankFreshScored: integer("rerank_fresh_scored").default(0),
	topChunkId: varchar("top_chunk_id", { length: 255 }),
	topChunkScore: real("top_chunk_score"),
	topRerankScore: real("top_rerank_score"),
	dagEnabled: boolean("dag_enabled").default(true),
	dagStatus: varchar("dag_status", { length: 20 }),
	hybridSearch: boolean("hybrid_search").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("rag_query_log_case_created_idx").using("btree", table.caseId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("rag_query_log_embedding_hnsw").using("hnsw", table.queryEmbedding.asc().nullsLast().op("halfvec_cosine_ops")).with({m: "16",ef_construction: "200"}),
	index("rag_query_log_hash_idx").using("btree", table.queryHash.asc().nullsLast().op("text_ops")),
	index("rag_query_log_query_hash_idx").using("btree", table.queryHash.asc().nullsLast().op("text_ops")),
	index("rag_query_log_user_created_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.createdAt.desc().nullsFirst().op("int4_ops")),
]);

export const ragSessions = pgTable("rag_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	caseId: uuid("case_id"),
	title: varchar({ length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const reports = pgTable("reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	createdBy: integer("created_by"),
	title: varchar({ length: 255 }).notNull(),
	content: text(),
	status: reportStatus().default('draft').notNull(),
	generatedAt: timestamp("generated_at", { mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	type: varchar({ length: 50 }),
	reportType: varchar("report_type", { length: 50 }),
	format: varchar({ length: 50 }),
});

export const researchSummaries = pgTable("research_summaries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	source: text().notNull(),
	pipeline: text().default('ace').notNull(),
	entityType: text("entity_type").notNull(),
	query: text().notNull(),
	queryHash: varchar("query_hash", { length: 8 }).notNull(),
	title: text(),
	url: text(),
	collection: text(),
	citationLabel: text("citation_label"),
	sectionPath: text("section_path"),
	jurisdiction: text(),
	summary: text().notNull(),
	entityTags: text("entity_tags").array().default([""]).notNull(),
	relevanceScore: real("relevance_score").default(0).notNull(),
	embedding: vector({ dimensions: 768 }),
	userId: integer("user_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	savedCitationId: uuid("saved_citation_id"),
	manifold4: real().array(),
	outputMeta: jsonb("output_meta").default({}).notNull(),
}, (table) => [
	index("rs_embedding_hnsw").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("rs_entity_tags_gin").using("gin", table.entityTags.asc().nullsLast().op("array_ops")),
	index("rs_entity_type_score").using("btree", table.entityType.asc().nullsLast().op("text_ops"), table.relevanceScore.desc().nullsFirst().op("text_ops"), table.id.desc().nullsFirst().op("text_ops")),
	index("rs_fts").using("gin", sql`to_tsvector('english'::regconfig, ((COALESCE(query, ''::text) |`),
	index("rs_pipeline_score_id").using("btree", table.pipeline.asc().nullsLast().op("text_ops"), table.relevanceScore.desc().nullsFirst().op("text_ops"), table.id.desc().nullsFirst().op("text_ops")),
	index("rs_query_hash").using("btree", table.queryHash.asc().nullsLast().op("text_ops")),
	index("rs_query_trgm").using("gin", table.query.asc().nullsLast().op("gin_trgm_ops")),
	index("rs_saved_citation").using("btree", table.savedCitationId.asc().nullsLast().op("uuid_ops")).where(sql`(saved_citation_id IS NOT NULL)`),
	index("rs_source_score").using("btree", table.source.asc().nullsLast().op("text_ops"), table.relevanceScore.desc().nullsFirst().op("text_ops"), table.id.desc().nullsFirst().op("text_ops")),
	index("rs_user_created").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.createdAt.desc().nullsFirst().op("int4_ops")),
]);

export const responseFeedback = pgTable("response_feedback", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	queryHash: text("query_hash").notNull(),
	userId: integer("user_id"),
	rating: varchar({ length: 4 }).notNull(),
	pipeline: text(),
	chunkIds: text("chunk_ids").array(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("response_feedback_hash_idx").using("btree", table.queryHash.asc().nullsLast().op("text_ops")),
	uniqueIndex("response_feedback_hash_user_idx").using("btree", table.queryHash.asc().nullsLast().op("int4_ops"), table.userId.asc().nullsLast().op("int4_ops")),
]);

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
	createdBy: integer("created_by"),
	appliedAt: timestamp("applied_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const routeHealth = pgTable("route_health", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routePath: varchar("route_path", { length: 255 }).notNull(),
	file: varchar({ length: 500 }),
	state: routeHealthState().default('healthy').notNull(),
	recentErrorCount: integer("recent_error_count").default(0).notNull(),
	totalErrorCount: integer("total_error_count").default(0).notNull(),
	lastErrorAt: timestamp("last_error_at", { mode: 'string' }),
	lastErrorClusterId: uuid("last_error_cluster_id"),
	lastErrorMessageShort: text("last_error_message_short"),
	routeCluster: varchar("route_cluster", { length: 100 }),
	routeOwner: varchar("route_owner", { length: 100 }),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("route_health_route_path_unique").on(table.routePath),
]);

export const routeMetadata = pgTable("route_metadata", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	routeId: varchar("route_id", { length: 255 }).notNull(),
	path: varchar({ length: 255 }).notNull(),
	kind: varchar({ length: 50 }).default('page').notNull(),
	group: varchar({ length: 100 }),
	status: varchar({ length: 50 }).default('healthy'),
	priority: integer().default(50),
	badges: jsonb().default([]),
	description: text(),
	tags: jsonb().default([]),
	metadata: jsonb().default({}),
	lastAccessedAt: timestamp("last_accessed_at", { mode: 'string' }),
	accessCount: integer("access_count").default(0),
	errorCount: integer("error_count").default(0),
	healthScore: integer("health_score").default(100),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	archivedAt: timestamp("archived_at", { mode: 'string' }),
}, (table) => [
	index("idx_route_metadata_archived_at").using("btree", table.archivedAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_route_metadata_error_count").using("btree", table.errorCount.asc().nullsLast().op("int4_ops")),
	index("idx_route_metadata_health_score").using("btree", table.healthScore.asc().nullsLast().op("int4_ops")),
	index("idx_route_metadata_last_accessed_at").using("btree", table.lastAccessedAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_route_metadata_route_id").using("btree", table.routeId.asc().nullsLast().op("text_ops")),
	index("idx_route_metadata_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	unique("route_metadata_route_id_key").on(table.routeId),
]);

export const savedCitations = pgTable("saved_citations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	caseId: text("case_id"),
	statuteCode: text("statute_code").notNull(),
	statuteTitle: text("statute_title"),
	jurisdiction: text(),
	severity: text(),
	year: integer(),
	sourceType: text("source_type").default('manual'),
	highlightedText: text("highlighted_text"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const savedReports = pgTable("saved_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	reportId: uuid("report_id").notNull(),
	caseId: uuid("case_id"),
	savedAt: timestamp("saved_at", { mode: 'string' }).defaultNow().notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const serviceCapabilities = pgTable("service_capabilities", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	serviceName: varchar("service_name", { length: 100 }).notNull(),
	tier: serviceTier().notNull(),
	port: integer(),
	healthEndpoint: varchar("health_endpoint", { length: 500 }),
	fallbackService: varchar("fallback_service", { length: 100 }),
	isRequired: boolean("is_required").default(false).notNull(),
	dockerProfile: varchar("docker_profile", { length: 50 }),
	lastHealthCheck: timestamp("last_health_check", { withTimezone: true, mode: 'string' }),
	lastHealthStatus: boolean("last_health_status"),
	lastLatencyMs: integer("last_latency_ms"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("svc_capabilities_name_unique").on(table.serviceName),
]);

export const sessions = pgTable("sessions", {
	id: text().default(gen_random_uuid()).primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
}, (table) => [
	index("idx_sessions_user_id").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
]);

export const stateConstitutionSources = pgTable("state_constitution_sources", {
	id: serial().primaryKey().notNull(),
	stateCode: text("state_code").notNull(),
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
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("state_constitution_sources_state_code_unique").on(table.stateCode),
]);

export const rgSearchRuns = pgTable("rg_search_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	runKey: varchar("run_key", { length: 64 }).notNull(),
	query: text().notNull(),
	args: jsonb().default({}).notNull(),
	diagnostics: jsonb().default({}).notNull(),
	clusterCount: integer("cluster_count"),
	userId: integer("user_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("rg_runs_runkey").using("btree", table.runKey.asc().nullsLast().op("text_ops")),
	index("rg_runs_user_created").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "rg_search_runs_user_id_fkey"
		}).onDelete("set null"),
	unique("rg_search_runs_run_key_key").on(table.runKey),
]);

export const statutes = pgTable("statutes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: varchar({ length: 255 }).notNull(),
	content: text().notNull(),
	jurisdiction: varchar({ length: 100 }),
	effectiveDate: timestamp("effective_date", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	section: varchar({ length: 100 }),
	category: varchar({ length: 100 }),
	sourceUrl: text("source_url"),
});

export const storageFiles = pgTable("storage_files", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	key: text().notNull(),
	originalName: text("original_name"),
	bucket: text().notNull(),
	userId: integer("user_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	size: bigint({ mode: "number" }).notNull(),
	mime: text(),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow().notNull(),
});

export const synthesisRuns = pgTable("synthesis_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id"),
	query: text().notNull(),
	model: varchar({ length: 100 }).notNull(),
	cacheHit: varchar("cache_hit", { length: 10 }),
	latencyMs: integer("latency_ms"),
	confidence: real(),
	grpoRewardScore: real("grpo_reward_score"),
	policyTier: varchar("policy_tier", { length: 30 }),
	citations: jsonb().default([]).notNull(),
	answer: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const topologySnapshots = pgTable("topology_snapshots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	runId: text("run_id").notNull(),
	gitCommit: text("git_commit"),
	repoRoot: text("repo_root").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb().default({}).notNull(),
});

export const termExamples = pgTable("term_examples", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	termId: uuid("term_id").notNull(),
	exampleText: text("example_text").notNull(),
	relationship: varchar({ length: 50 }).notNull(),
	sourceChunkId: varchar("source_chunk_id", { length: 200 }),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const themes = pgTable("themes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	config: jsonb().notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const atlasSemanticDiffs = pgTable("atlas_semantic_diffs", {
	diffId: uuid("diff_id").defaultRandom().primaryKey().notNull(),
	packetKey: varchar("packet_key", { length: 255 }).notNull(),
	sourceRef: varchar("source_ref", { length: 512 }).notNull(),
	similarity: real().notNull(),
	recommendation: varchar({ length: 50 }).notNull(),
	actionTaken: varchar("action_taken", { length: 50 }),
	regenerationCostSaved: real("regeneration_cost_saved"),
	traceId: uuid("trace_id"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_semantic_diffs_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_semantic_diffs_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_semantic_diffs_recommendation").using("btree", table.recommendation.asc().nullsLast().op("text_ops")),
	index("idx_semantic_diffs_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_semantic_diffs_trace_id").using("btree", table.traceId.asc().nullsLast().op("uuid_ops")),
]);

export const tensorAnalysisCache = pgTable("tensor_analysis_cache", {
	stableKey: text("stable_key").primaryKey().notNull(),
	contentHash: text("content_hash").notNull(),
	topoByte: smallint("topo_byte").default(0).notNull(),
	topoHex: text("topo_hex").default('0x00').notNull(),
	topoClass: text("topo_class").default('unclassified').notNull(),
	manifold4X: real("manifold4_x").default(0),
	manifold4Y: real("manifold4_y").default(0),
	manifold4Z: real("manifold4_z").default(0),
	manifold4W: real("manifold4_w").default(0),
	centroidKey: text("centroid_key"),
	somCluster: smallint("som_cluster"),
	graphAuthorityScore: real("graph_authority_score").default(0),
	tensorJson: jsonb("tensor_json").default({}),
	qdrantPayload: jsonb("qdrant_payload").default({}),
	outputMeta: jsonb("output_meta").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	tensorAffinityScore: real("tensor_affinity_score").default(0).notNull(),
}, (table) => [
	index("tensor_analysis_cache_authority_idx").using("btree", table.graphAuthorityScore.desc().nullsFirst().op("float4_ops")),
	index("tensor_analysis_cache_centroid_idx").using("btree", table.centroidKey.asc().nullsLast().op("text_ops")),
	index("tensor_analysis_cache_json_gin").using("gin", table.tensorJson.asc().nullsLast().op("jsonb_ops")),
	index("tensor_analysis_cache_topo_byte_idx").using("btree", table.topoByte.asc().nullsLast().op("int2_ops")),
]);

export const uploadedFiles = pgTable("uploaded_files", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	originalName: text("original_name").notNull(),
	objectKey: text("object_key").notNull(),
	bucket: text().notNull(),
	mimeType: text("mime_type"),
	sizeBytes: integer("size_bytes").notNull(),
	status: text().default('uploaded').notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("uploaded_files_object_key_key").on(table.objectKey),
]);

export const userAiQueries = pgTable("user_ai_queries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	caseId: uuid("case_id"),
	query: text().notNull(),
	response: text().notNull(),
	model: varchar({ length: 100 }).notNull(),
	queryType: varchar("query_type", { length: 50 }).notNull(),
	confidence: numeric({ precision: 3, scale:  2 }),
	processingTime: integer("processing_time"),
	contextUsed: jsonb("context_used").default([]),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const userAnalyticsEvents = pgTable("user_analytics_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id"),
	sessionId: varchar("session_id", { length: 100 }),
	eventType: varchar("event_type", { length: 100 }).notNull(),
	payload: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const userEmbeddings = pgTable("user_embeddings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	embedding: text().notNull(),
	model: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const userResearchTasks = pgTable("user_research_tasks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id"),
	sessionId: text("session_id"),
	title: text().notNull(),
	selfPrompt: text("self_prompt").notNull(),
	pipelineHint: text("pipeline_hint").default('ace').notNull(),
	priority: text().default('medium').notNull(),
	status: text().default('pending').notNull(),
	sourceText: text("source_text"),
	summary: text(),
	result: jsonb(),
	notified: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
});

export const vectorJobs = pgTable("vector_jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	status: varchar().notNull(),
	progress: integer().default(0).notNull(),
	result: jsonb(),
	error: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
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

export const vectorOutbox = pgTable("vector_outbox", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ownerType: varchar("owner_type", { length: 256 }).notNull(),
	ownerId: varchar("owner_id", { length: 256 }).notNull(),
	event: varchar({ length: 256 }).notNull(),
	vector: text(),
	payload: jsonb().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	firstName: varchar("first_name", { length: 255 }),
	lastName: varchar("last_name", { length: 255 }),
	role: userRole().default('prosecutor').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	hashedPassword: varchar("hashed_password", { length: 255 }).notNull(),
	name: varchar({ length: 255 }),
	isActive: boolean("is_active").default(true).notNull(),
	avatarUrl: varchar("avatar_url", { length: 2048 }),
	hasCompletedOnboarding: boolean("has_completed_onboarding").default(false).notNull(),
	onboardingStep: integer("onboarding_step").default(0).notNull(),
}, (table) => [
	unique("users_email_unique").on(table.email),
]);

export const vlmImageTags = pgTable("vlm_image_tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 200 }).notNull(),
	description: text(),
	source: varchar({ length: 50 }).default('manual').notNull(),
	hitCount: integer("hit_count").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("vlm_image_tags_name_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("vlm_image_tags_source_idx").using("btree", table.source.asc().nullsLast().op("text_ops")),
	unique("vlm_image_tags_name_key").on(table.name),
]);

export const wardenAuditLog = pgTable("warden_audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	prosecutorId: uuid("prosecutor_id").notNull(),
	caseId: uuid("case_id"),
	evidenceId: uuid("evidence_id"),
	action: varchar({ length: 50 }).notNull(),
	details: jsonb(),
	sha256: varchar({ length: 64 }),
	timestamp: timestamp({ mode: 'string' }).defaultNow(),
});

export const wardenCases = pgTable("warden_cases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	prosecutorId: uuid("prosecutor_id").notNull(),
	title: varchar({ length: 512 }).default('Untitled Case'),
	description: text(),
	caseNumber: varchar("case_number", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const wardenChunks = pgTable("warden_chunks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	caseId: uuid("case_id").notNull(),
	seq: integer(),
	section: varchar({ length: 100 }),
	text: text().notNull(),
	tokenLength: integer("token_length"),
	embedding: vector({ dimensions: 768 }),
	latent128: vector({ dimensions: 128 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("warden_chunks_hnsw_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
]);

export const wardenCitationGraph = pgTable("warden_citation_graph", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: varchar("case_id", { length: 128 }).notNull(),
	citedCaseId: varchar("cited_case_id", { length: 128 }).notNull(),
	weight: real().default(1),
	source: varchar({ length: 64 }).default('ai'),
	approved: boolean().default(false),
	approvedBy: uuid("approved_by"),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const wardenCitations = pgTable("warden_citations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	caseId: uuid("case_id").notNull(),
	chunkId: uuid("chunk_id"),
	type: varchar({ length: 50 }),
	citationText: text("citation_text"),
	citationNormalized: varchar("citation_normalized", { length: 255 }),
	page: integer(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const wardenEvidence = pgTable("warden_evidence", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	prosecutorId: uuid("prosecutor_id").notNull(),
	fileName: varchar("file_name", { length: 512 }).notNull(),
	sha256: varchar({ length: 64 }).notNull(),
	mimeType: varchar("mime_type", { length: 100 }),
	fileSize: integer("file_size"),
	minioPath: varchar("minio_path", { length: 512 }).notNull(),
	minioBucket: varchar("minio_bucket", { length: 100 }).notNull(),
	documentType: varchar("document_type", { length: 100 }),
	documentSubtype: varchar("document_subtype", { length: 100 }),
	inferenceConfidence: real("inference_confidence"),
	status: varchar({ length: 50 }).default('pending'),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	reviewedBy: uuid("reviewed_by"),
	rejectionReason: text("rejection_reason"),
	metadata: jsonb(),
	prevSha256: varchar("prev_sha256", { length: 64 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("warden_evidence_sha256_unique").on(table.sha256),
]);

export const wardenEvidenceSummaries = pgTable("warden_evidence_summaries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	holding: text().notNull(),
	reasoning: text(),
	citations: jsonb(),
	keywords: text().array(),
	suggestedAt: timestamp("suggested_at", { mode: 'string' }).defaultNow(),
	approved: boolean().default(false),
	approvedBy: uuid("approved_by"),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const wardenFileLocks = pgTable("warden_file_locks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sha256: varchar({ length: 64 }).notNull(),
	lockedAt: timestamp("locked_at", { mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	lockedBy: uuid("locked_by").notNull(),
}, (table) => [
	unique("warden_file_locks_sha256_unique").on(table.sha256),
]);

export const wardenHmmTopics = pgTable("warden_hmm_topics", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	chunkId: uuid("chunk_id").notNull(),
	topicLabel: varchar("topic_label", { length: 100 }),
	probability: real(),
	sequence: integer(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const wardenHoldings = pgTable("warden_holdings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	chunkId: uuid("chunk_id"),
	issue: text(),
	holding: text().notNull(),
	reasoning: text(),
	references: jsonb(),
	confidence: real(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const wardenOcr = pgTable("warden_ocr", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	rawText: text("raw_text"),
	cleanedText: text("cleaned_text"),
	confidence: real(),
	pageCount: integer("page_count"),
	extractedAt: timestamp("extracted_at", { mode: 'string' }).defaultNow(),
});

export const wardenUsers = pgTable("warden_users", {
	id: uuid().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("warden_users_email_unique").on(table.email),
]);

export const whisperSegments = pgTable("whisper_segments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	transcriptId: uuid("transcript_id").notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	segmentIndex: integer("segment_index").notNull(),
	startMs: integer("start_ms").notNull(),
	endMs: integer("end_ms").notNull(),
	text: text().notNull(),
	language: varchar({ length: 10 }),
	embedding: vector({ dimensions: 768 }),
	embeddingModel: varchar("embedding_model", { length: 50 }),
	qdrantPointId: varchar("qdrant_point_id", { length: 200 }),
	speaker: varchar({ length: 100 }),
	confidence: real(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const workspaceCitations = pgTable("workspace_citations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	messageId: uuid("message_id"),
	citationText: text("citation_text").notNull(),
	citationUrl: text("citation_url"),
	citationType: varchar("citation_type", { length: 50 }).default('statute'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const workspaceEvidence = pgTable("workspace_evidence", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	evidenceId: uuid("evidence_id").notNull(),
	relevanceScore: real("relevance_score").default(0),
	addedBy: varchar("added_by", { length: 50 }).default('user'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const workspaceNotes = pgTable("workspace_notes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	content: text().notNull(),
	isAi: boolean("is_ai").default(false),
	embedding: vector({ dimensions: 768 }),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const workspaceSessions = pgTable("workspace_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	sessionId: uuid("session_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const workspaceStatutes = pgTable("workspace_statutes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	statuteId: uuid("statute_id"),
	statuteText: text("statute_text"),
	relevanceScore: real("relevance_score").default(0),
	source: varchar({ length: 50 }).default('user'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	description: text(),
	caseId: uuid("case_id"),
	createdBy: integer("created_by"),
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
	createdBy: integer("created_by").notNull(),
	assignedTo: integer("assigned_to"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("yorha_cases_case_number_unique").on(table.caseNumber),
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
});

export const yorhaChatSessions = pgTable("yorha_chat_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	userId: integer("user_id").notNull(),
	title: varchar({ length: 500 }),
	contextType: varchar("context_type", { length: 100 }),
	contextId: uuid("context_id"),
	status: varchar({ length: 50 }).default('active').notNull(),
	messageCount: integer("message_count").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: 'string' }),
});

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
	createdBy: integer("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

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
	createdBy: integer("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

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
});

export const rgSearchHits = pgTable("rg_search_hits", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	runId: uuid("run_id").notNull(),
	filePath: text("file_path").notNull(),
	lineNumber: integer("line_number"),
	snippet: text(),
	source: varchar({ length: 16 }).notNull(),
	scores: jsonb().default({}).notNull(),
	finalScore: real("final_score").default(0).notNull(),
	clusterId: integer("cluster_id"),
	entities: jsonb().default([]).notNull(),
	rank: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("rg_hits_cluster").using("btree", table.clusterId.asc().nullsLast().op("int4_ops")),
	index("rg_hits_entities_gin").using("gin", table.entities.asc().nullsLast().op("jsonb_ops")),
	index("rg_hits_final_score").using("btree", table.finalScore.asc().nullsLast().op("float4_ops")),
	index("rg_hits_run_rank").using("btree", table.runId.asc().nullsLast().op("int4_ops"), table.rank.asc().nullsLast().op("uuid_ops")),
	index("rg_hits_scores_gin").using("gin", table.scores.asc().nullsLast().op("jsonb_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [rgSearchRuns.id],
			name: "rg_search_hits_run_id_fkey"
		}).onDelete("cascade"),
]);

export const taskRegistry = pgTable("task_registry", {
	taskId: uuid("task_id").primaryKey().notNull(),
	taskType: text("task_type").notNull(),
	status: text().notNull(),
	payload: jsonb().default({}),
	result: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const gpuCandidateEval = pgTable("gpu_candidate_eval", {
	evalId: uuid("eval_id").defaultRandom().primaryKey().notNull(),
	traceId: uuid("trace_id"),
	packetId: text("packet_id"),
	candidateRank: integer("candidate_rank"),
	semanticScore: real("semantic_score"),
	summaryScore: real("summary_score"),
	signatureScore: real("signature_score"),
	latentDistance: real("latent_distance"),
	somDistance: real("som_distance"),
	clusterId: integer("cluster_id"),
	gpuLatencyMs: real("gpu_latency_ms"),
	indexName: text("index_name"),
	modelVersion: text("model_version"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_gpu_candidate_eval_packet_id").using("btree", table.packetId.asc().nullsLast().op("text_ops")),
	index("idx_gpu_candidate_eval_trace_id").using("btree", table.traceId.asc().nullsLast().op("uuid_ops")),
]);

export const agentOsEvents = pgTable("agent_os_events", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	traceId: uuid("trace_id"),
	eventType: text("event_type"),
	source: text(),
	title: text(),
	body: text(),
	severity: text(),
	featureId: text("feature_id"),
	packetId: text("packet_id"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_agent_os_events_event_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("idx_agent_os_events_severity").using("btree", table.severity.asc().nullsLast().op("text_ops")),
	index("idx_agent_os_events_trace_id").using("btree", table.traceId.asc().nullsLast().op("uuid_ops")),
]);

export const atlasFeatureVectors = pgTable("atlas_feature_vectors", {
	packetKey: text("packet_key").primaryKey().notNull(),
	sourceRef: text("source_ref").notNull(),
	directoryPath: text("directory_path").notNull(),
	treeNodeId: uuid("tree_node_id"),
	featureId: text("feature_id").notNull(),
	featureLabel: text("feature_label").notNull(),
	domainClass: text("domain_class"),
	keywords: text().array().default([""]),
	semanticTags: text("semantic_tags").array().default([""]),
	ontologyClasses: text("ontology_classes").array().default([""]),
	pagerank: real(),
	betweenness: real(),
	eigenvector: real(),
	communityId: integer("community_id"),
	somCluster: integer("som_cluster"),
	somX: integer("som_x"),
	somY: integer("som_y"),
	embeddingDim: integer("embedding_dim").default(768),
	latent64Dim: integer("latent_64_dim").default(64),
	featureExtractionVersion: text("feature_extraction_version").default('v1'),
	extractedAt: timestamp("extracted_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_atlas_feature_vectors_community_id").using("btree", table.communityId.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_feature_vectors_domain_class").using("btree", table.domainClass.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_vectors_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_vectors_identity").using("btree", table.packetKey.asc().nullsLast().op("text_ops"), table.sourceRef.asc().nullsLast().op("text_ops"), table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_vectors_keywords").using("gin", table.keywords.asc().nullsLast().op("array_ops")),
	index("idx_atlas_feature_vectors_ontology").using("gin", table.ontologyClasses.asc().nullsLast().op("array_ops")),
	index("idx_atlas_feature_vectors_pagerank").using("btree", table.pagerank.desc().nullsFirst().op("float4_ops")),
	index("idx_atlas_feature_vectors_semantic_tags").using("gin", table.semanticTags.asc().nullsLast().op("array_ops")),
	index("idx_atlas_feature_vectors_som_cluster").using("btree", table.somCluster.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_feature_vectors_som_coords").using("btree", table.somX.asc().nullsLast().op("int4_ops"), table.somY.asc().nullsLast().op("int4_ops")).where(sql`((som_x IS NOT NULL) AND (som_y IS NOT NULL))`),
	index("idx_atlas_feature_vectors_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_vectors_tree_node_id").using("btree", table.treeNodeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.treeNodeId],
			foreignColumns: [atlasTreeNodes.nodeId],
			name: "atlas_feature_vectors_tree_node_id_fkey"
		}).onDelete("set null"),
	check("valid_pagerank", sql`(pagerank IS NULL) OR (pagerank >= (0)::double precision)`),
	check("valid_som_coords", sql`((som_x IS NULL) AND (som_y IS NULL)) OR ((som_x IS NOT NULL) AND (som_y IS NOT NULL) AND (som_x >= 0) AND (som_y >= 0) AND (som_x < 20) AND (som_y < 20))`),
]);

export const chrom97Packets = pgTable("chrom97_packets", {
	packetKey: text("packet_key").primaryKey().notNull(),
	packetJson: jsonb("packet_json").notNull(),
	packetHash: text("packet_hash").notNull(),
	sourceRef: text("source_ref").notNull(),
	featureId: text("feature_id").notNull(),
	featureLabel: text("feature_label"),
	somCluster: integer("som_cluster"),
	communityId: integer("community_id"),
	materializedAt: timestamp("materialized_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_chrom97_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_chrom97_som_cluster").using("btree", table.somCluster.asc().nullsLast().op("int4_ops")),
	index("idx_chrom97_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [atlasFeatureEnvelopes.packetKey],
			name: "chrom97_packets_packet_key_fkey"
		}),
	unique("chrom97_packets_packet_hash_key").on(table.packetHash),
]);

export const analysisPassResults = pgTable("analysis_pass_results", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	passKey: text("pass_key").notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref"),
	featureId: text("feature_id"),
	passType: text("pass_type").notNull(),
	status: text().default('pending').notNull(),
	inputHash: text("input_hash"),
	promptHash: text("prompt_hash"),
	modelName: text("model_name"),
	temperature: real(),
	maxTokens: integer("max_tokens"),
	output: jsonb().default({}),
	scores: jsonb().default({}),
	indexPush: jsonb("index_push").default({}),
	provenance: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_analysis_pass_output_gin").using("gin", table.output.asc().nullsLast().op("jsonb_ops")),
	index("idx_analysis_pass_packet").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_analysis_pass_provenance_gin").using("gin", table.provenance.asc().nullsLast().op("jsonb_ops")),
	index("idx_analysis_pass_source_feature").using("btree", table.sourceRef.asc().nullsLast().op("text_ops"), table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_analysis_pass_type_status").using("btree", table.passType.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
]);

export const atlasSummaryLayers = pgTable("atlas_summary_layers", {
	packetKey: text("packet_key").notNull(),
	layerType: text("layer_type"),
	summaryLevel: text("summary_level"),
	summary: text(),
	summaryText: text("summary_text"),
	keywords: text().array(),
	entities: text().array(),
	metadata: jsonb().default({}),
	embedding: vector({ dimensions: 768 }),
	embeddingModel: text("embedding_model").default('embeddinggemma:latest'),
	vectorDim: integer("vector_dim").default(768),
	modelName: text("model_name"),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	sourceRef: text("source_ref"),
	featureId: text("feature_id"),
	sourceRefKey: text("source_ref_key"),
	kmeansCluster: integer("kmeans_cluster"),
	somX: integer("som_x"),
	somY: integer("som_y"),
}, (table) => [
	index("idx_atlas_summary_layers_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_summary_layers_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_summary_layers_entities").using("gin", table.entities.asc().nullsLast().op("array_ops")),
	index("idx_summary_layers_keywords").using("gin", table.keywords.asc().nullsLast().op("array_ops")),
	index("idx_summary_layers_layer_type").using("btree", table.layerType.asc().nullsLast().op("text_ops")),
	index("idx_summary_layers_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_summary_layers_packet_effective_level").using("btree", sql`packet_key`, sql`COALESCE(layer_type, summary_level)`),
	index("idx_summary_layers_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_summary_layers_summary_fts").using("gin", sql`to_tsvector('english'::regconfig, COALESCE(summary, summary_tex`),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "atlas_summary_layers_packet_key_fkey"
		}).onDelete("cascade"),
]);

export const clusterCards = pgTable("cluster_cards", {
	id: text().primaryKey().notNull(),
	card: jsonb().notNull(),
	centroidDim: integer("centroid_dim"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("cluster_cards_card_gin").using("gin", table.card.asc().nullsLast().op("jsonb_ops")),
	index("cluster_cards_centroid_dim").using("btree", table.centroidDim.asc().nullsLast().op("int4_ops")),
	index("cluster_cards_centroid_dim_idx").using("btree", table.centroidDim.asc().nullsLast().op("int4_ops")),
	index("cluster_cards_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
]);

export const retrievalTelemetry = pgTable("retrieval_telemetry", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	query: text().notNull(),
	queryHash: text("query_hash").notNull(),
	latencyMs: integer("latency_ms").notNull(),
	vectorHits: integer("vector_hits").default(0).notNull(),
	trigramHits: integer("trigram_hits").default(0).notNull(),
	ftsHits: integer("fts_hits").default(0).notNull(),
	selectedPacketKey: text("selected_packet_key"),
	selectedPacketKeys: jsonb("selected_packet_keys").default([]).notNull(),
	selectedFeatureId: text("selected_feature_id"),
	featureIds: jsonb("feature_ids").default([]).notNull(),
	fusionScore: doublePrecision("fusion_score"),
	cacheHit: boolean("cache_hit").default(false).notNull(),
	surface: text().notNull(),
	environment: text().notNull(),
	retrievalStrategy: text("retrieval_strategy").default('fusion').notNull(),
}, (table) => [
	index("idx_retrieval_telemetry_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_retrieval_telemetry_environment").using("btree", table.environment.asc().nullsLast().op("text_ops")),
	index("idx_retrieval_telemetry_feature_ids_gin").using("gin", table.featureIds.asc().nullsLast().op("jsonb_ops")),
	index("idx_retrieval_telemetry_latency_ms").using("btree", table.latencyMs.asc().nullsLast().op("int4_ops")),
	index("idx_retrieval_telemetry_query_hash").using("btree", table.queryHash.asc().nullsLast().op("text_ops")),
	index("idx_retrieval_telemetry_selected_packet_keys_gin").using("gin", table.selectedPacketKeys.asc().nullsLast().op("jsonb_ops")),
	index("idx_retrieval_telemetry_strategy").using("btree", table.retrievalStrategy.asc().nullsLast().op("text_ops")),
	index("idx_retrieval_telemetry_strategy_created").using("btree", table.retrievalStrategy.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_retrieval_telemetry_surface").using("btree", table.surface.asc().nullsLast().op("text_ops")),
]);

export const atlasRetrievalEvalTimes = pgTable("atlas_retrieval_eval_times", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	queryHash: text("query_hash"),
	packetKey: text("packet_key"),
	featureId: text("feature_id"),
	sourceRef: text("source_ref"),
	qdrantMs: real("qdrant_ms"),
	pgBm25Ms: real("pg_bm25_ms"),
	pgvectorMs: real("pgvector_ms"),
	redisMs: real("redis_ms"),
	bitfrostMs: real("bitfrost_ms"),
	neo4JMs: real("neo4j_ms"),
	turbovecMs: real("turbovec_ms"),
	rerankMs: real("rerank_ms"),
	gemma4Ms: real("gemma4_ms"),
	totalMs: real("total_ms"),
	cacheHitSource: text("cache_hit_source"),
	ttlRemaining: integer("ttl_remaining"),
	payload: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	route: text(),
	bm25Ms: real("bm25_ms"),
	resultCount: integer("result_count"),
	error: text(),
	domainClass: text("domain_class"),
	ontologyLabel: text("ontology_label"),
	topologyLabel: text("topology_label"),
	protocol: text(),
	accelerator: text(),
	cudaAvailable: boolean("cuda_available"),
	cuvsEnabled: boolean("cuvs_enabled"),
	matmulMs: real("matmul_ms"),
	embeddingMs: real("embedding_ms"),
	verdict: text(),
}, (table) => [
	index("idx_eval_times_accelerator").using("btree", table.accelerator.asc().nullsLast().op("text_ops")),
	index("idx_eval_times_domain_class").using("btree", table.domainClass.asc().nullsLast().op("text_ops")),
	index("idx_eval_times_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_eval_times_ontology_label").using("btree", table.ontologyLabel.asc().nullsLast().op("text_ops")),
	index("idx_eval_times_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_eval_times_payload_gin").using("gin", table.payload.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_eval_times_protocol").using("btree", table.protocol.asc().nullsLast().op("text_ops")),
	index("idx_eval_times_query_hash").using("btree", table.queryHash.asc().nullsLast().op("text_ops")),
	index("idx_eval_times_result_count").using("btree", table.resultCount.asc().nullsLast().op("int4_ops")),
	index("idx_eval_times_route").using("btree", table.route.asc().nullsLast().op("text_ops")),
	index("idx_eval_times_verdict").using("btree", table.verdict.asc().nullsLast().op("text_ops")),
]);

export const conceptRecords = pgTable("concept_records", {
	conceptId: text("concept_id").primaryKey().notNull(),
	label: text(),
	evidenceCards: jsonb("evidence_cards").default([]).notNull(),
	featureIds: jsonb("feature_ids").default([]).notNull(),
	packetKeys: jsonb("packet_keys").default([]).notNull(),
	successCount: integer("success_count").default(0).notNull(),
	failureCount: integer("failure_count").default(0).notNull(),
	evidence: jsonb().default([]).notNull(),
	somClusters: jsonb("som_clusters").default([]).notNull(),
	retrievalCount: integer("retrieval_count").default(0).notNull(),
	repairSuccess: doublePrecision("repair_success").default(1).notNull(),
	retrievalStrategy: text("retrieval_strategy").default('fusion'),
	lastRetrievedAt: timestamp("last_retrieved_at", { withTimezone: true, mode: 'string' }),
	conceptTemperature: doublePrecision("concept_temperature").default(0.5),
	strategyDistribution: jsonb("strategy_distribution").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_concept_records_active").using("btree", table.conceptTemperature.desc().nullsFirst().op("float8_ops"), table.lastRetrievedAt.desc().nullsFirst().op("float8_ops")),
	index("idx_concept_records_feature_ids_gin").using("gin", table.featureIds.asc().nullsLast().op("jsonb_ops")),
	index("idx_concept_records_last_retrieved").using("btree", table.lastRetrievedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_concept_records_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_concept_records_retrieval_strategy").using("btree", table.retrievalStrategy.asc().nullsLast().op("text_ops")),
	index("idx_concept_records_strategy_dist_gin").using("gin", table.strategyDistribution.asc().nullsLast().op("jsonb_ops")),
	index("idx_concept_records_temperature").using("btree", table.conceptTemperature.desc().nullsFirst().op("float8_ops")),
]);

export const symbolResolver = pgTable("symbol_resolver", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	featureId: text("feature_id").notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref"),
	nodeType: text("node_type"),
	confidence: real().default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_symbol_resolver_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_symbol_resolver_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_symbol_resolver_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	unique("symbol_resolver_feature_id_packet_key_key").on(table.featureId, table.packetKey),
]);

export const benchmarkResults = pgTable("benchmark_results", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	queryId: varchar("query_id", { length: 255 }).notNull(),
	queryText: text("query_text"),
	fullVectorTopk: text("full_vector_topk").array().default([""]),
	latent64Topk: text("latent64_topk").array().default([""]),
	spearmanCorrelation: real("spearman_correlation"),
	recallAt10: real("recall_at_10"),
	recallAt20: real("recall_at_20"),
	recallAt50: real("recall_at_50"),
	recallAt100: real("recall_at_100"),
	ndcgAt20Full: real("ndcg_at_20_full"),
	ndcgAt20Latent: real("ndcg_at_20_latent"),
	ndcgRegression: real("ndcg_regression"),
	latencyFullMs: real("latency_full_ms"),
	latencyLatentMs: real("latency_latent_ms"),
	latencyImprovementPct: real("latency_improvement_pct"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_benchmark_results_query_id").using("btree", table.queryId.asc().nullsLast().op("text_ops")),
	index("idx_benchmark_results_recall").using("btree", table.recallAt100.asc().nullsLast().op("float4_ops")),
	index("idx_benchmark_results_spearman").using("btree", table.spearmanCorrelation.asc().nullsLast().op("float4_ops")),
	unique("benchmark_results_query_id_key").on(table.queryId),
]);

export const packetFeatureKeywords = pgTable("packet_feature_keywords", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	packetKey: varchar("packet_key", { length: 255 }).notNull(),
	keywords: text().array().default([""]),
	keywordCount: integer("keyword_count").default(0),
	tfIdfScores: real("tf_idf_scores").array().default([]),
	bm25Ready: boolean("bm25_ready").default(false),
	extractedAt: timestamp("extracted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_packet_feature_keywords_count").using("btree", table.keywordCount.asc().nullsLast().op("int4_ops")),
	index("idx_packet_feature_keywords_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "packet_feature_keywords_packet_key_fkey"
		}).onDelete("cascade"),
	unique("packet_feature_keywords_packet_key_key").on(table.packetKey),
]);

export const ontologyKeywords = pgTable("ontology_keywords", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	featureId: varchar("feature_id", { length: 255 }).notNull(),
	keywords: text().array().default([""]),
	keywordSources: text("keyword_sources").array().default([""]),
	aggregationConfidence: real("aggregation_confidence").default(0.8),
	extractedAt: timestamp("extracted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ontology_keywords_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	unique("ontology_keywords_feature_id_key").on(table.featureId),
]);

export const toolCallEvents = pgTable("tool_call_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	traceId: uuid("trace_id"),
	sessionId: text("session_id"),
	toolName: text("tool_name").notNull(),
	toolSource: text("tool_source").default('mcp').notNull(),
	arguments: jsonb().default({}).notNull(),
	resultSummary: text("result_summary"),
	resultOk: boolean("result_ok"),
	errorMessage: text("error_message"),
	latencyMs: integer("latency_ms"),
	otelSpanId: text("otel_span_id"),
	otelTraceId: text("otel_trace_id"),
	calledAt: timestamp("called_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_tce_called_at").using("btree", table.calledAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_tce_session").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	index("idx_tce_tool_name").using("btree", table.toolName.asc().nullsLast().op("text_ops")),
]);

export const agentTasks = pgTable("agent_tasks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	taskType: text("task_type").notNull(),
	title: text(),
	description: text(),
	status: text().default('pending').notNull(),
	priority: integer().default(50).notNull(),
	sourceRef: text("source_ref"),
	packetKey: text("packet_key"),
	sessionId: text("session_id"),
	payload: jsonb().default({}).notNull(),
	result: jsonb(),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_at_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_at_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_at_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const outcomeLedger = pgTable("outcome_ledger", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	taskId: uuid("task_id"),
	traceId: uuid("trace_id"),
	toolCallId: uuid("tool_call_id"),
	outcomeType: text("outcome_type").notNull(),
	score: real(),
	reward: real(),
	feedback: text(),
	metadata: jsonb().default({}).notNull(),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ol_outcome_type").using("btree", table.outcomeType.asc().nullsLast().op("text_ops")),
	index("idx_ol_recorded_at").using("btree", table.recordedAt.desc().nullsFirst().op("timestamptz_ops")),
]);

export const agentObservations = pgTable("agent_observations", {
	observationId: uuid("observation_id").defaultRandom().primaryKey().notNull(),
	agentName: varchar("agent_name", { length: 255 }).notNull(),
	toolName: varchar("tool_name", { length: 255 }).notNull(),
	inputHash: varchar("input_hash", { length: 64 }).notNull(),
	outputSummary: text("output_summary").notNull(),
	decisionContext: jsonb("decision_context").default({}).notNull(),
	confidence: real().default(0.5).notNull(),
	bm25Tags: text("bm25_tags").array().default([""]).notNull(),
	hnswEmbedding: vector("hnsw_embedding", { dimensions: 384 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_agent_observations_agent_tool").using("btree", table.agentName.asc().nullsLast().op("timestamp_ops"), table.toolName.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("idx_agent_observations_bm25_tags_gin").using("gin", table.bm25Tags.asc().nullsLast().op("array_ops")),
	index("idx_agent_observations_hnsw").using("hnsw", table.hnswEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	check("bm25_tags_not_empty", sql`(array_length(bm25_tags, 1) IS NULL) OR (array_length(bm25_tags, 1) > 0)`),
	check("confidence_range", sql`(confidence >= (0)::double precision) AND (confidence <= (1)::double precision)`),
]);

export const dispatcherStateHistory = pgTable("dispatcher_state_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 255 }).notNull(),
	stateJson: jsonb("state_json").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_dispatcher_state_session").using("btree", table.sessionId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	check("session_not_empty", sql`(session_id)::text <> ''::text`),
]);

export const packetSourceFeatures = pgTable("packet_source_features", {
	packetKey: text("packet_key").primaryKey().notNull(),
	sourceRef: text("source_ref").notNull(),
	sourceKind: text("source_kind").default('unknown').notNull(),
	isMarkdown: boolean("is_markdown").default(false),
	isTxt: boolean("is_txt").default(false),
	isCode: boolean("is_code").default(false),
	aiGeneratedScore: real("ai_generated_score").default(0),
	handMadeScore: real("hand_made_score").default(0),
	specScore: real("spec_score").default(0),
	recommendationScore: real("recommendation_score").default(0),
	predictedDomain: varchar("predicted_domain", { length: 50 }),
	domainConfidence: real("domain_confidence"),
	domainDetectionMethod: varchar("domain_detection_method", { length: 50 }),
	featureId: text("feature_id"),
	featureLabel: text("feature_label"),
	treeNodeId: text("tree_node_id"),
	inferredDomain: text("inferred_domain"),
	hmmState: text("hmm_state"),
	keywords: text().array(),
	keywordCount: integer("keyword_count"),
	keywordCoverage: real("keyword_coverage"),
	keywordCounts: jsonb("keyword_counts").default({}).notNull(),
	symbols: text().array(),
	symbolCount: integer("symbol_count"),
	imports: text().array(),
	importsCount: integer("imports_count"),
	exports: text().array(),
	exportsCount: integer("exports_count"),
	functions: text().array(),
	functionsCount: integer("functions_count"),
	classes: text().array(),
	classesCount: integer("classes_count"),
	interfaces: text().array(),
	interfacesCount: integer("interfaces_count"),
	regexHits: jsonb("regex_hits").default({}).notNull(),
	nlpTags: text("nlp_tags").array().default([""]),
	derivedTitle: text("derived_title"),
	semanticTitleId: text("semantic_title_id"),
	extractionSource: varchar("extraction_source", { length: 50 }),
	extractionVersion: varchar("extraction_version", { length: 50 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	validationErrors: text("validation_errors").array(),
	isValid: boolean("is_valid").default(true),
	status: varchar({ length: 50 }).default('pending'),
}, (table) => [
	index("packet_source_features_confidence_idx").using("btree", table.domainConfidence.desc().nullsFirst().op("float4_ops")),
	index("packet_source_features_domain_idx").using("btree", table.inferredDomain.asc().nullsLast().op("text_ops")),
	index("packet_source_features_feature_idx").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("packet_source_features_hmm_composite_idx").using("btree", table.hmmState.asc().nullsLast().op("text_ops"), table.featureId.asc().nullsLast().op("text_ops"), table.treeNodeId.asc().nullsLast().op("text_ops")),
	index("packet_source_features_hmm_idx").using("btree", table.hmmState.asc().nullsLast().op("text_ops")),
	index("packet_source_features_keywords_gin").using("gin", table.keywords.asc().nullsLast().op("array_ops")),
	index("packet_source_features_kind_idx").using("btree", table.sourceKind.asc().nullsLast().op("text_ops")),
	index("packet_source_features_regex_gin").using("gin", table.regexHits.asc().nullsLast().op("jsonb_path_ops")),
	index("packet_source_features_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("packet_source_features_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("packet_source_features_symbols_gin").using("gin", table.symbols.asc().nullsLast().op("array_ops")),
	index("packet_source_features_tags_gin").using("gin", table.nlpTags.asc().nullsLast().op("array_ops")),
	index("packet_source_features_tree_idx").using("btree", table.treeNodeId.asc().nullsLast().op("text_ops")),
	index("packet_source_features_xgboost_composite_idx").using("btree", table.predictedDomain.asc().nullsLast().op("text_ops"), table.domainConfidence.asc().nullsLast().op("text_ops"), table.featureId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "fk_packet_key"
		}).onDelete("cascade"),
]);

export const retrievalPromotionDecisions = pgTable("retrieval_promotion_decisions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	traceId: varchar("trace_id", { length: 100 }).notNull(),
	packetKey: varchar("packet_key", { length: 255 }).notNull(),
	rank: integer().notNull(),
	finalScore: real("final_score").notNull(),
	selected: boolean().notNull(),
	destination: varchar({ length: 50 }).notNull(),
	validationGatePassed: boolean("validation_gate_passed").notNull(),
	reasonCodes: text("reason_codes").array().default(["RAY"]),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_retrieval_promo_destination").using("btree", table.destination.asc().nullsLast().op("text_ops")),
	index("idx_retrieval_promo_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_retrieval_promo_selected").using("btree", table.packetKey.asc().nullsLast().op("text_ops"), table.finalScore.desc().nullsFirst().op("float4_ops")).where(sql`(selected = true)`),
	index("idx_retrieval_promo_trace_id").using("btree", table.traceId.asc().nullsLast().op("text_ops")),
	check("valid_destination", sql`(destination)::text = ANY ((ARRAY['browser-l1'::character varying, 'valkey-hot'::character varying, 'valkey-warm'::character varying, 'analytics-only'::character varying, 'cold-archive'::character varying])::text[])`),
]);

export const atlasPackets = pgTable("atlas_packets", {
	packetId: text("packet_id").primaryKey().notNull(),
	artifactId: text("artifact_id"),
	packetKey: text("packet_key"),
	sourceRef: text("source_ref"),
	sourceRefKey: text("source_ref_key"),
	filePath: text("file_path"),
	directoryPath: text("directory_path"),
	featureId: text("feature_id"),
	featureLabel: text("feature_label"),
	communityId: integer("community_id"),
	conceptIds: text("concept_ids").array(),
	clusterId: integer("cluster_id"),
	embedding: vector({ dimensions: 768 }),
	payload: jsonb().default({}),
	metadata: jsonb().default({}),
	permissions: jsonb().default({"source":"repo_index","can_write":false,"can_export":false,"visibility":"internal","can_execute":false}).notNull(),
	topology: jsonb().default({}).notNull(),
	vectors: jsonb().default({}).notNull(),
	summary: text(),
	tags: text().array(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	byteStart: bigint("byte_start", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	byteEnd: bigint("byte_end", { mode: "number" }),
	sha256: text(),
	sourceKind: text("source_kind"),
	sourcePath: text("source_path"),
	groupId: text("group_id"),
	packetUniverse: text("packet_universe").default('atlas'),
	qdrantPointId: text("qdrant_point_id"),
	qdrantCollection: text("qdrant_collection"),
	qdrantVectorDim: integer("qdrant_vector_dim"),
	identityLane: text("identity_lane").default('qdrant_chunk'),
	identityConfidence: doublePrecision("identity_confidence").default(1),
	somCluster: text("som_cluster"),
	somRow: integer("som_row"),
	somCol: integer("som_col"),
	somIndex: integer("som_index"),
	kmeansCluster: integer("kmeans_cluster"),
	pagerank: real(),
	betweenness: real(),
	eigenvector: real(),
	neo4JNodeId: text("neo4j_node_id"),
	redisCentroidKey: text("redis_centroid_key"),
	// TODO: failed to parse database type 'bytea'
	latent64: unknown("latent_64"),
	rewardPrior: doublePrecision("reward_prior").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	functionSymbol: text("function_symbol"),
	contentEmbedding384: vector("content_embedding_384", { dimensions: 384 }),
	embeddingStatus: text("embedding_status").default('pending'),
	embeddingTimestamp: timestamp("embedding_timestamp", { withTimezone: true, mode: 'string' }),
	extractedEntities: jsonb("extracted_entities").default([]),
	keywords: text().array().default([""]),
	errorPattern: varchar("error_pattern", { length: 255 }),
	featureGroupId: varchar("feature_group_id", { length: 255 }),
	domainClass: varchar("domain_class", { length: 255 }),
	taxonomyLevel: integer("taxonomy_level").default(0),
	bm25IndexedAt: timestamp("bm25_indexed_at", { withTimezone: true, mode: 'string' }),
	bm25Score: real("bm25_score"),
	bm25Terms: text("bm25_terms").array(),
	packetUlid: text("packet_ulid"),
	titleId: text("title_id"),
	canonicalSourceRef: text("canonical_source_ref"),
	pageRankScore: real("page_rank_score"),
	kmeansClusterId: integer("kmeans_cluster_id"),
	treeNodeId: text("tree_node_id"),
	routingHints: text("routing_hints").array(),
	communitySource: text("community_source"),
	communityConfidence: numeric("community_confidence"),
	lineageVersion: text("lineage_version"),
	ledgerType: text("ledger_type"),
	canonical: boolean(),
	payloadBackfilledAt: timestamp("payload_backfilled_at", { withTimezone: true, mode: 'string' }),
	kCore: integer("k_core"),
	ngrams: text().array(),
	trigrams: text().array(),
	engrams: text().array(),
	usedConcepts: text("used_concepts").array(),
	topologCluster: integer("topolog_cluster"),
	topologConfidence: real("topolog_confidence").default(0.5),
	topologMethod: text("topolog_method").default('unassigned'),
	topologAppliedAt: timestamp("topolog_applied_at", { withTimezone: true, mode: 'string' }),
	repositoryId: uuid("repository_id"),
	directoryId: uuid("directory_id"),
	fileId: uuid("file_id"),
	moduleId: uuid("module_id"),
	symbolId: uuid("symbol_id"),
	chunkId: uuid("chunk_id"),
	recoveryLane: text("recovery_lane").default('canonical'),
	somClusterId: integer("som_cluster_id"),
	ontology: jsonb(),
	packetTypeTest: text("packet_type_test"),
	packetType: text("packet_type").default('code'),
	packetOntology: jsonb("packet_ontology").default({"tags":[],"examples":{},"constraints":{},"capabilities":[]}),
	parentPacketKey: text("parent_packet_key"),
	relatedPackets: text("related_packets").array().default([""]),
	telemetry: jsonb().default({"failure_count":0,"success_count":0,"avg_latency_ms":0,"execution_count":0}),
	embeddingEligible: boolean("embedding_eligible").default(false).notNull(),
	summaryHash: text("summary_hash"),
	embeddingVersion: text("embedding_version"),
	embeddingClaimedAt: timestamp("embedding_claimed_at", { withTimezone: true, mode: 'string' }),
	embeddingClaimedBy: text("embedding_claimed_by"),
	featureEnvelope: jsonb("feature_envelope"),
	domainConfidence: doublePrecision("domain_confidence"),
	titleGeneratorVersion: text("title_generator_version").default('v1'),
	filePurpose: filePurposeEnum("file_purpose").default('other'),
	thoroughness: thoroughnessEnum().default('stub'),
	appCriticality: appCriticalityEnum("app_criticality").default('optional'),
	testCoveragePct: integer("test_coverage_pct").default(0),
	fileUnderstandingComputedAt: timestamp("file_understanding_computed_at", { mode: 'string' }),
	fileUnderstandingMethod: text("file_understanding_method"),
	openspecId: uuid("openspec_id"),
	gsdId: uuid("gsd_id"),
	enrichmentUpdatedAt: timestamp("enrichment_updated_at", { mode: 'string' }),
	somCellX: integer("som_cell_x"),
	somCellY: integer("som_cell_y"),
	astScore: real("ast_score").default(0),
	communityBoost: real("community_boost").default(1),
	rerankFeatures: jsonb("rerank_features").default({}),
	pagerankScore: real("pagerank_score").default(0),
	somDistance: real("som_distance").default(0),
	predictedDomain: text("predicted_domain"),
	classifierKind: text("classifier_kind"),
	classifierVersion: text("classifier_version"),
	pagerankRaw: real("pagerank_raw"),
	authorityScore: real("authority_score"),
	workspaceId: varchar("workspace_id", { length: 256 }).default('unknown'),
	semanticAnchor: varchar("semantic_anchor", { length: 512 }).default('unknown'),
	ontologyVersion: varchar("ontology_version", { length: 64 }),
	contentHash: varchar("content_hash", { length: 64 }),
	domainMemberships: jsonb("domain_memberships"),
	primaryDomain: text("primary_domain"),
}, (table) => [
	index("atlas_packets_domain_unclassified_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops")).where(sql`(domain_class IS NULL)`),
	index("atlas_packets_metadata_gin_idx").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_packets_ast_score").using("btree", table.astScore.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_packets_bm25_indexed_at").using("btree", table.bm25IndexedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_atlas_packets_bm25_terms").using("gin", table.bm25Terms.asc().nullsLast().op("array_ops")),
	index("idx_atlas_packets_canonical_source_ref").using("btree", table.canonicalSourceRef.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_chunk_id").using("btree", table.chunkId.asc().nullsLast().op("uuid_ops")),
	index("idx_atlas_packets_community_boost").using("btree", table.communityBoost.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_packets_community_confidence_idx").using("btree", table.communityConfidence.asc().nullsLast().op("numeric_ops")),
	index("idx_atlas_packets_community_id").using("btree", table.communityId.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_packets_community_id_idx").using("btree", table.communityId.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_packets_community_source_idx").using("btree", table.communitySource.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_concept_ids").using("gin", table.conceptIds.asc().nullsLast().op("array_ops")),
	index("idx_atlas_packets_directory_id").using("btree", table.directoryId.asc().nullsLast().op("uuid_ops")),
	index("idx_atlas_packets_domain_class").using("btree", table.domainClass.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_domain_class_idx").using("btree", table.domainClass.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_domain_confidence").using("btree", table.domainConfidence.asc().nullsLast().op("float8_ops")).where(sql`((domain_confidence IS NOT NULL) AND (domain_confidence > (0.7)::double precision))`),
	index("idx_atlas_packets_domain_memberships").using("gin", table.domainMemberships.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_packets_embedding_status").using("btree", table.embeddingStatus.asc().nullsLast().op("text_ops")).where(sql`(embedding_status = 'pending'::text)`),
	index("idx_atlas_packets_envelope_fts").using("gin", sql`to_tsvector('english'::regconfig, ((((((COALESCE((payload ->> '`),
	index("idx_atlas_packets_error_pattern").using("btree", table.errorPattern.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_extracted_entities").using("gin", table.extractedEntities.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_packets_feature_group_id").using("btree", table.featureGroupId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_feature_id_composite").using("btree", table.featureId.asc().nullsLast().op("text_ops"), table.featureLabel.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_feature_id_idx").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_feature_label_idx").using("btree", table.featureLabel.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_file_id").using("btree", table.fileId.asc().nullsLast().op("uuid_ops")),
	index("idx_atlas_packets_file_path").using("btree", table.filePath.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_file_path_trgm").using("gin", table.filePath.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_atlas_packets_hierarchy").using("btree", table.repositoryId.asc().nullsLast().op("text_ops"), table.directoryId.asc().nullsLast().op("text_ops"), table.fileId.asc().nullsLast().op("text_ops"), table.moduleId.asc().nullsLast().op("text_ops"), table.symbolId.asc().nullsLast().op("text_ops"), table.featureId.asc().nullsLast().op("uuid_ops")),
	index("idx_atlas_packets_identity_compound_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops"), table.sourceRef.asc().nullsLast().op("text_ops"), table.featureId.asc().nullsLast().op("text_ops"), table.titleId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_identity_lane").using("btree", table.identityLane.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_keywords").using("gin", table.keywords.asc().nullsLast().op("array_ops")),
	index("idx_atlas_packets_kmeans_cluster_id").using("btree", table.kmeansClusterId.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_packets_kmeans_cluster_idx").using("btree", table.kmeansCluster.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_packets_ledger_type_idx").using("btree", table.ledgerType.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_lineage_version_idx").using("btree", table.lineageVersion.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_packets_metadata_gin_pathops").using("gin", table.metadata.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_atlas_packets_module_id").using("btree", table.moduleId.asc().nullsLast().op("uuid_ops")),
	index("idx_atlas_packets_neo4j_node_id").using("btree", table.neo4JNodeId.asc().nullsLast().op("text_ops")).where(sql`(neo4j_node_id IS NOT NULL)`),
	index("idx_atlas_packets_ontology_gin").using("gin", table.packetOntology.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_packets_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_packet_key_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_packet_ulid").using("btree", table.packetUlid.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_page_rank_score").using("btree", table.pageRankScore.desc().nullsLast().op("float4_ops")),
	index("idx_atlas_packets_pagerank_score").using("btree", table.pagerankScore.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_packets_payload_gin").using("gin", table.payload.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_packets_payload_gin_pathops").using("gin", table.payload.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_atlas_packets_payload_path").using("gin", table.payload.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_atlas_packets_permissions_gin_pathops").using("gin", table.permissions.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_atlas_packets_primary_domain").using("btree", table.primaryDomain.asc().nullsLast().op("text_ops")).where(sql`(primary_domain IS NOT NULL)`),
	index("idx_atlas_packets_qdrant_point_id").using("btree", table.qdrantPointId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_redis_centroid_key").using("btree", table.redisCentroidKey.asc().nullsLast().op("text_ops")).where(sql`(redis_centroid_key IS NOT NULL)`),
	index("idx_atlas_packets_repository_id").using("btree", table.repositoryId.asc().nullsLast().op("uuid_ops")),
	index("idx_atlas_packets_rerank_features").using("gin", table.rerankFeatures.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_packets_routing_hints").using("gin", table.routingHints.asc().nullsLast().op("array_ops")),
	index("idx_atlas_packets_som_cell").using("btree", table.somCellX.asc().nullsLast().op("int4_ops"), table.somCellY.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_packets_som_cluster").using("btree", table.somCluster.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_som_distance").using("btree", table.somDistance.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_packets_som_index").using("btree", table.somIndex.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_packets_som_index_idx").using("btree", table.somIndex.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_packets_source_feature").using("btree", table.sourceRef.asc().nullsLast().op("text_ops"), table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_source_kind").using("btree", table.sourceKind.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_source_ref_key").using("btree", table.sourceRefKey.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_summary_fts").using("gin", sql`to_tsvector('english'::regconfig, COALESCE(summary, ''::text))`),
	index("idx_atlas_packets_symbol_id").using("btree", table.symbolId.asc().nullsLast().op("uuid_ops")),
	index("idx_atlas_packets_tags").using("gin", table.tags.asc().nullsLast().op("array_ops")),
	index("idx_atlas_packets_tags_gin").using("gin", table.tags.asc().nullsLast().op("array_ops")),
	index("idx_atlas_packets_taxonomy_level").using("btree", table.taxonomyLevel.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_packets_title_id").using("btree", table.titleId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_topology_gin_pathops").using("gin", table.topology.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_atlas_packets_tree_node_id").using("btree", table.treeNodeId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_type").using("btree", table.packetType.asc().nullsLast().op("text_ops")),
	index("idx_atlas_packets_vectors_gin_pathops").using("gin", table.vectors.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_latent_64_not_null").using("hash", table.packetId.asc().nullsLast().op("text_ops")).where(sql`(latent_64 IS NOT NULL)`),
	index("idx_packets_centroid_cache").using("btree", table.featureId.asc().nullsLast().op("text_ops")).where(sql`(som_cluster_id IS NOT NULL)`),
	index("idx_packets_feature_envelope").using("gin", table.featureEnvelope.asc().nullsLast().op("jsonb_ops")),
	index("idx_packets_source_feature_multi_hop").using("btree", table.sourceRef.asc().nullsLast().op("text_ops"), table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_packets_used_concepts_gin").using("gin", table.usedConcepts.asc().nullsLast().op("array_ops")),
	unique("atlas_packets_packet_key_key").on(table.packetKey),
	check("atlas_packets_ontology_check", sql`(ontology IS NULL) OR (jsonb_typeof(ontology) = 'object'::text)`),
	check("check_primary_domain_exists", sql`(primary_domain IS NULL) OR (domain_memberships IS NULL) OR (domain_memberships ? primary_domain)`),
]);

export const cacheProbeResults = pgTable("cache_probe_results", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	runId: uuid("run_id").notNull(),
	caseId: varchar("case_id", { length: 32 }).notNull(),
	iteration: integer().notNull(),
	layer: varchar({ length: 64 }).notNull(),
	success: boolean().default(false).notNull(),
	totalMs: integer("total_ms"),
	promptTokens: integer("prompt_tokens"),
	completionTokens: integer("completion_tokens"),
	promptEvalTokens: integer("prompt_eval_tokens"),
	promptEvalMs: integer("prompt_eval_ms"),
	generationMs: integer("generation_ms"),
	ttftMs: integer("ttft_ms"),
	reusedPrefixTokens: integer("reused_prefix_tokens"),
	slotId: integer("slot_id"),
	lookupMs: integer("lookup_ms"),
	cacheHit: boolean("cache_hit"),
	inferredCacheHit: boolean("inferred_cache_hit"),
	reason: text(),
	error: text(),
	contextHash: varchar("context_hash", { length: 64 }).notNull(),
	executionOrder: integer("execution_order").notNull(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_cache_probe_results_case").using("btree", table.caseId.asc().nullsLast().op("text_ops")),
	index("idx_cache_probe_results_layer").using("btree", table.layer.asc().nullsLast().op("text_ops")),
	index("idx_cache_probe_results_run").using("btree", table.runId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [cacheProbeRuns.runId],
			name: "cache_probe_results_run_id_fkey"
		}).onDelete("cascade"),
]);

export const executionReviews = pgTable("execution_reviews", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	executionId: uuid("execution_id").notNull(),
	toolExecuted: boolean("tool_executed").default(false),
	proposalMatched: boolean("proposal_matched").default(false),
	exitCodeValid: boolean("exit_code_valid").default(false),
	evidenceComplete: boolean("evidence_complete").default(false),
	fileModificationsAllowed: boolean("file_modifications_allowed").default(true),
	permissionPassed: boolean("permission_passed").default(false),
	decision: varchar({ length: 32 }).notNull(),
	issues: jsonb().default([]),
	recommendation: text(),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("execution_reviews_execution_id_key").on(table.executionId),
]);

export const evaluationQueries = pgTable("evaluation_queries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	query: text().notNull(),
	domain: varchar({ length: 50 }).notNull(),
	difficulty: integer().notNull(),
	expectedCount: integer("expected_count"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_evaluation_queries_difficulty").using("btree", table.difficulty.asc().nullsLast().op("int4_ops")),
	index("idx_evaluation_queries_domain").using("btree", table.domain.asc().nullsLast().op("text_ops")),
	check("ck_difficulty", sql`(difficulty >= 1) AND (difficulty <= 5)`),
]);

export const phase2FEvaluationResults = pgTable("phase2f_evaluation_results", {
	id: serial().primaryKey().notNull(),
	queryId: varchar("query_id", { length: 255 }).notNull(),
	signal: varchar({ length: 50 }).notNull(),
	precisionAt5: real("precision_at_5"),
	precisionAt10: real("precision_at_10"),
	recallAt5: real("recall_at_5"),
	recallAt10: real("recall_at_10"),
	recallAt20: real("recall_at_20"),
	mrr: real(),
	ndcg10: real("ndcg_10"),
	map: real(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	ablationId: integer("ablation_id"),
	laneName: varchar("lane_name", { length: 50 }),
}, (table) => [
	unique("phase2f_evaluation_results_query_id_signal_key").on(table.queryId, table.signal),
]);

export const evaluationResults = pgTable("evaluation_results", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	queryId: uuid("query_id").notNull(),
	packetKey: text("packet_key").notNull(),
	corpusVersion: text("corpus_version").notNull(),
	ablationId: integer("ablation_id").notNull(),
	ablationConfigName: varchar("ablation_config_name", { length: 50 }).notNull(),
	laneName: varchar("lane_name", { length: 50 }).notNull(),
	retrievalRank: integer("retrieval_rank").notNull(),
	featureEnvelope: jsonb("feature_envelope").notNull(),
	groundTruthGrade: smallint("ground_truth_grade"),
	groundTruthSource: varchar("ground_truth_source", { length: 20 }),
	groundTruthConfidence: real("ground_truth_confidence"),
	relevancePredicted: real("relevance_predicted"),
	relevanceJudged: smallint("relevance_judged"),
	matchConfidence: real("match_confidence"),
}, (table) => [
	index("idx_evaluation_results_ablation").using("btree", table.ablationId.asc().nullsLast().op("int4_ops"), table.ablationConfigName.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_results_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_evaluation_results_ground_truth").using("btree", table.groundTruthGrade.asc().nullsLast().op("text_ops"), table.groundTruthSource.asc().nullsLast().op("int2_ops")),
	index("idx_evaluation_results_lane").using("btree", table.laneName.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_results_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_results_query_ablation").using("btree", table.queryId.asc().nullsLast().op("int4_ops"), table.corpusVersion.asc().nullsLast().op("text_ops"), table.ablationId.asc().nullsLast().op("uuid_ops")),
	index("idx_evaluation_results_query_corpus").using("btree", table.queryId.asc().nullsLast().op("text_ops"), table.corpusVersion.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.corpusVersion],
			foreignColumns: [evaluationCorpora.corpusVersion],
			name: "evaluation_results_corpus_version_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.queryId],
			foreignColumns: [evaluationQueries.id],
			name: "evaluation_results_query_id_fkey"
		}).onDelete("cascade"),
	check("ck_ablation_id", sql`(ablation_id >= 1) AND (ablation_id <= 7)`),
	check("ck_ground_truth_confidence", sql`(ground_truth_confidence IS NULL) OR ((ground_truth_confidence >= (0.0)::double precision) AND (ground_truth_confidence <= (1.0)::double precision))`),
	check("ck_ground_truth_grade", sql`(ground_truth_grade IS NULL) OR ((ground_truth_grade >= 0) AND (ground_truth_grade <= 3))`),
	check("ck_match_confidence", sql`(match_confidence >= (0.0)::double precision) AND (match_confidence <= (1.0)::double precision)`),
	check("ck_relevance_judged", sql`(relevance_judged IS NULL) OR ((relevance_judged >= 0) AND (relevance_judged <= 3))`),
	check("ck_relevance_predicted", sql`(relevance_predicted >= (0.0)::double precision) AND (relevance_predicted <= (1.0)::double precision)`),
	check("ck_retrieval_rank", sql`retrieval_rank >= 1`),
]);

export const evaluationCorpora = pgTable("evaluation_corpora", {
	corpusVersion: text("corpus_version").primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	gitCommit: text("git_commit").notNull(),
	postgresPacketCount: integer("postgres_packet_count").notNull(),
	postgresChunkCount: integer("postgres_chunk_count").notNull(),
	qdrantCollection: text("qdrant_collection").notNull(),
	qdrantPointCount: integer("qdrant_point_count").notNull(),
	embeddingModel: text("embedding_model").notNull(),
	embeddingDimension: integer("embedding_dimension").notNull(),
	embeddingModelVersion: text("embedding_model_version").notNull(),
	querySetHash: text("query_set_hash").notNull(),
	judgmentSetHash: text("judgment_set_hash").notNull(),
}, (table) => [
	index("idx_evaluation_corpora_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_evaluation_corpora_embedding_model").using("btree", table.embeddingModel.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_corpora_git_commit").using("btree", table.gitCommit.asc().nullsLast().op("text_ops")),
	check("ck_chunk_count", sql`postgres_chunk_count > 0`),
	check("ck_embedding_dim", sql`embedding_dimension > 0`),
	check("ck_packet_count", sql`postgres_packet_count > 0`),
	check("ck_qdrant_count", sql`qdrant_point_count >= 0`),
]);

export const evaluationEvidence = pgTable("evaluation_evidence", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	queryId: uuid("query_id").notNull(),
	evidenceType: varchar("evidence_type", { length: 50 }).notNull(),
	evidenceDetail: jsonb("evidence_detail").notNull(),
	extractorVersion: varchar("extractor_version", { length: 20 }).notNull(),
	extractorName: varchar("extractor_name", { length: 100 }).notNull(),
	confidence: real().notNull(),
}, (table) => [
	index("idx_evaluation_evidence_confidence").using("btree", table.confidence.desc().nullsFirst().op("float4_ops")),
	index("idx_evaluation_evidence_extractor").using("btree", table.extractorName.asc().nullsLast().op("text_ops"), table.extractorVersion.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_evidence_packet_query").using("btree", table.packetKey.asc().nullsLast().op("uuid_ops"), table.queryId.asc().nullsLast().op("uuid_ops")),
	index("idx_evaluation_evidence_packet_type").using("btree", table.packetKey.asc().nullsLast().op("text_ops"), table.evidenceType.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_evidence_query").using("btree", table.queryId.asc().nullsLast().op("uuid_ops")),
	index("idx_evaluation_evidence_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_evaluation_evidence_type").using("btree", table.evidenceType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.queryId],
			foreignColumns: [evaluationQueries.id],
			name: "evaluation_evidence_query_id_fkey"
		}).onDelete("cascade"),
	check("ck_evidence_type", sql`(evidence_type)::text = ANY ((ARRAY['ast'::character varying, 'route'::character varying, 'schema'::character varying, 'test'::character varying, 'semantic'::character varying])::text[])`),
	check("ck_extractor_confidence", sql`(confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision)`),
	check("ck_not_null", sql`(packet_key IS NOT NULL) AND (source_ref IS NOT NULL)`),
]);

export const atlasPacketsIdentityConflicts = pgTable("atlas_packets_identity_conflicts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetId: text("packet_id").notNull(),
	conflictType: varchar("conflict_type", { length: 50 }).notNull(),
	conflictDetail: jsonb("conflict_detail").notNull(),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_packets_identity_conflicts_resolved").using("btree", table.resolvedAt.asc().nullsLast().op("timestamp_ops")).where(sql`(resolved_at IS NULL)`),
	index("idx_packets_identity_conflicts_type").using("btree", table.conflictType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.packetId],
			foreignColumns: [atlasPackets.packetId],
			name: "atlas_packets_identity_conflicts_packet_id_fkey"
		}).onDelete("cascade"),
	unique("atlas_packets_identity_conflicts_packet_id_conflict_type_key").on(table.conflictType, table.packetId),
]);

export const evaluationSeedQueries = pgTable("evaluation_seed_queries", {
	queryId: varchar("query_id", { length: 12 }).primaryKey().notNull(),
	queryText: text("query_text").notNull(),
	sourceType: varchar("source_type", { length: 50 }).notNull(),
	sourceRef: varchar("source_ref", { length: 500 }),
	confidence: doublePrecision().default(0.5),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	check("valid_source", sql`(source_type)::text = ANY ((ARRAY['code_comment'::character varying, 'feature_description'::character varying, 'documentation'::character varying, 'gemma4_synthetic'::character varying])::text[])`),
]);

export const evaluationCandidates = pgTable("evaluation_candidates", {
	id: serial().primaryKey().notNull(),
	queryId: varchar("query_id", { length: 12 }).notNull(),
	packetKey: varchar("packet_key", { length: 100 }).notNull(),
	candidateRank: integer("candidate_rank").notNull(),
	retrievalScore: doublePrecision("retrieval_score").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.queryId],
			foreignColumns: [evaluationSeedQueries.queryId],
			name: "evaluation_candidates_query_id_fkey"
		}).onDelete("cascade"),
	unique("evaluation_candidates_query_id_packet_key_key").on(table.packetKey, table.queryId),
]);

export const evaluationJudgments = pgTable("evaluation_judgments", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	queryId: varchar("query_id", { length: 12 }).notNull(),
	packetKey: varchar("packet_key", { length: 100 }).notNull(),
	relevanceGrade: integer("relevance_grade").default(1).notNull(),
	isGold: boolean("is_gold").default(false),
	gradedBy: varchar("graded_by", { length: 50 }).default('pending'),
	gradedAt: timestamp("graded_at", { mode: 'string' }),
	confidence: doublePrecision().default(0.5),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_eval_judgments_grade").using("btree", table.relevanceGrade.asc().nullsLast().op("int4_ops")),
	index("idx_eval_judgments_graded_by").using("btree", table.gradedBy.asc().nullsLast().op("text_ops")),
	index("idx_eval_judgments_query").using("btree", table.queryId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "evaluation_judgments_packet_key_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.queryId],
			foreignColumns: [evaluationSeedQueries.queryId],
			name: "evaluation_judgments_query_id_fkey"
		}).onDelete("cascade"),
	unique("evaluation_judgments_query_id_packet_key_key").on(table.packetKey, table.queryId),
	check("valid_grade", sql`relevance_grade = ANY (ARRAY[0, 1, 2, 3])`),
	check("valid_grader", sql`(graded_by)::text = ANY ((ARRAY['pending'::character varying, 'human'::character varying, 'gemma4'::character varying])::text[])`),
]);

export const atlasConcepts = pgTable("atlas_concepts", {
	conceptId: serial("concept_id").primaryKey().notNull(),
	name: varchar({ length: 256 }).notNull(),
	definition: text(),
	embedding: vector({ dimensions: 384 }),
	frequency: integer().default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_concepts_name").using("btree", table.name.asc().nullsLast().op("text_ops")),
	unique("atlas_concepts_name_key").on(table.name),
]);

export const evaluationDatasets = pgTable("evaluation_datasets", {
	id: serial().primaryKey().notNull(),
	version: varchar({ length: 20 }).notNull(),
	frozenAt: timestamp("frozen_at", { mode: 'string' }).defaultNow().notNull(),
	totalJudgments: integer("total_judgments").notNull(),
	totalQueries: integer("total_queries").notNull(),
	uniquePackets: integer("unique_packets").notNull(),
	queriesWithSpanGte2: integer("queries_with_span_gte_2").notNull(),
	featureCorrelationScore: doublePrecision("feature_correlation_score"),
	gradeDistribution: jsonb("grade_distribution"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("evaluation_datasets_version_key").on(table.version),
]);

export const evaluationRuns = pgTable("evaluation_runs", {
	id: serial().primaryKey().notNull(),
	runId: varchar("run_id", { length: 50 }).notNull(),
	datasetVersion: varchar("dataset_version", { length: 20 }).notNull(),
	gitCommit: varchar("git_commit", { length: 40 }).notNull(),
	embeddingVersion: varchar("embedding_version", { length: 50 }),
	rerankerVersion: varchar("reranker_version", { length: 50 }),
	featureVersion: varchar("feature_version", { length: 50 }),
	modelVersion: varchar("model_version", { length: 50 }),
	timestamp: timestamp({ mode: 'string' }).defaultNow().notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_eval_runs_commit").using("btree", table.gitCommit.asc().nullsLast().op("text_ops")),
	index("idx_eval_runs_dataset").using("btree", table.datasetVersion.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.datasetVersion],
			foreignColumns: [evaluationDatasets.version],
			name: "evaluation_runs_dataset_version_fkey"
		}),
	foreignKey({
			columns: [table.datasetVersion],
			foreignColumns: [evaluationDatasets.version],
			name: "evaluation_runs_dataset_version_fkey1"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.datasetVersion],
			foreignColumns: [evaluationDatasets.version],
			name: "fk_eval_runs_dataset"
		}).onDelete("restrict"),
	unique("evaluation_runs_run_id_key").on(table.runId),
]);

export const evaluationSplits = pgTable("evaluation_splits", {
	id: serial().primaryKey().notNull(),
	queryId: varchar("query_id", { length: 12 }).notNull(),
	split: varchar({ length: 20 }).notNull(),
	foldId: integer("fold_id").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("evaluation_splits_query_id_key").on(table.queryId),
]);

export const promotionOutbox = pgTable("promotion_outbox", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	contentHash: text("content_hash"),
	summary: text(),
	operation: text().notNull(),
	status: text().default('pending').notNull(),
	payload: jsonb().default({}).notNull(),
	errorMessage: text("error_message"),
	retryCount: integer("retry_count").default(0).notNull(),
	maxRetries: integer("max_retries").default(3).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_promotion_outbox_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_promotion_outbox_pending").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(status = 'pending'::text)`),
	index("idx_promotion_outbox_processing").using("btree", table.startedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(status = 'processing'::text)`),
	uniqueIndex("idx_promotion_outbox_unique_pending").using("btree", table.packetKey.asc().nullsLast().op("text_ops"), table.sourceRef.asc().nullsLast().op("text_ops"), table.operation.asc().nullsLast().op("text_ops")).where(sql`(status = 'pending'::text)`),
	check("promotion_outbox_operation_check", sql`operation = ANY (ARRAY['promote_summary'::text, 'promote_embedding'::text, 'promote_qdrant'::text, 'promote_neo4j'::text])`),
	check("promotion_outbox_status_check", sql`status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])`),
]);

export const gpuClusterCentroids = pgTable("gpu_cluster_centroids", {
	clusterId: integer("cluster_id").primaryKey().notNull(),
	clusterType: text("cluster_type").default('gpu').notNull(),
	centroidVec: real("centroid_vec").array().notNull(),
	chunkCount: integer("chunk_count").default(0).notNull(),
	topoClass: text("topo_class").default('unclassified').notNull(),
	topoByte: smallint("topo_byte").default(0).notNull(),
	dominantTags: text("dominant_tags").array().default([""]).notNull(),
	purpose: text(),
	metadata: jsonb().default({}).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const atlasEmbeddings768 = pgTable("atlas_embeddings_768", {
	embeddingId: uuid("embedding_id").defaultRandom().primaryKey().notNull(),
	subjectType: text("subject_type").notNull(),
	subjectId: text("subject_id").notNull(),
	vectorRole: text("vector_role").notNull(),
	vectorContract: text("vector_contract").notNull(),
	modelName: text("model_name").notNull(),
	modelVersion: text("model_version").notNull(),
	dimension: integer().default(768).notNull(),
	dtype: text().default('float32').notNull(),
	normalized: boolean().notNull(),
	embedding: vector({ dimensions: 768 }),
	inputHash: text("input_hash").notNull(),
	vectorHash: text("vector_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ae768_subject").using("btree", table.subjectType.asc().nullsLast().op("text_ops"), table.subjectId.asc().nullsLast().op("text_ops")),
	unique("atlas_embeddings_768_subject_type_subject_id_vector_role_ve_key").on(table.inputHash, table.subjectId, table.subjectType, table.vectorContract, table.vectorRole),
	check("atlas_embeddings_768_dimension_check", sql`dimension = 768`),
]);

export const atlasEmbeddings64Latent = pgTable("atlas_embeddings_64_latent", {
	embeddingId: uuid("embedding_id").defaultRandom().primaryKey().notNull(),
	subjectType: text("subject_type").notNull(),
	subjectId: text("subject_id").notNull(),
	vectorRole: text("vector_role").default('latent').notNull(),
	vectorContract: text("vector_contract").notNull(),
	encoderVersion: text("encoder_version").notNull(),
	dimension: integer().default(64).notNull(),
	normalized: boolean().default(false).notNull(),
	embedding: vector({ dimensions: 64 }),
	inputHash: text("input_hash").notNull(),
	vectorHash: text("vector_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ae64_subject").using("btree", table.subjectType.asc().nullsLast().op("text_ops"), table.subjectId.asc().nullsLast().op("text_ops")),
	unique("atlas_embeddings_64_latent_subject_type_subject_id_vector_r_key").on(table.inputHash, table.subjectId, table.subjectType, table.vectorContract, table.vectorRole),
	check("atlas_embeddings_64_latent_dimension_check", sql`dimension = 64`),
]);

export const atlasGraphFacts = pgTable("atlas_graph_facts", {
	graphFactId: uuid("graph_fact_id").defaultRandom().primaryKey().notNull(),
	subjectId: text("subject_id").notNull(),
	predicate: text().notNull(),
	objectId: text("object_id").notNull(),
	subjectType: text("subject_type").notNull(),
	objectType: text("object_type").notNull(),
	sourceRefKey: text("source_ref_key").notNull(),
	evidenceHash: text("evidence_hash").notNull(),
	extractorVersion: text("extractor_version").notNull(),
	confidence: real().notNull(),
	validFrom: timestamp("valid_from", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	validTo: timestamp("valid_to", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}).notNull(),
}, (table) => [
	index("idx_agf_object").using("btree", table.objectId.asc().nullsLast().op("text_ops"), table.predicate.asc().nullsLast().op("text_ops")),
	index("idx_agf_predicate").using("btree", table.predicate.asc().nullsLast().op("text_ops")),
	index("idx_agf_source_ref").using("btree", table.sourceRefKey.asc().nullsLast().op("text_ops")),
	index("idx_agf_subject").using("btree", table.subjectId.asc().nullsLast().op("text_ops"), table.predicate.asc().nullsLast().op("text_ops")),
	unique("atlas_graph_facts_subject_id_predicate_object_id_evidence_h_key").on(table.evidenceHash, table.objectId, table.predicate, table.subjectId),
]);

export const atlasOntologyConcepts = pgTable("atlas_ontology_concepts", {
	conceptId: text("concept_id").primaryKey().notNull(),
	canonicalLabel: text("canonical_label").notNull(),
	conceptType: text("concept_type").notNull(),
	description: text(),
	aliases: text().array().default([""]).notNull(),
	namespace: text().default('general').notNull(),
	schemaVersion: integer("schema_version").default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_atlas_ontology_concepts_aliases").using("gin", table.aliases.asc().nullsLast().op("array_ops")),
	index("idx_atlas_ontology_concepts_namespace").using("btree", table.namespace.asc().nullsLast().op("text_ops")),
	index("idx_atlas_ontology_concepts_type").using("btree", table.conceptType.asc().nullsLast().op("text_ops")),
	check("atlas_ontology_concepts_concept_type_check", sql`concept_type = ANY (ARRAY['concept'::text, 'alias'::text, 'instance'::text, 'category'::text, 'capability'::text, 'operation'::text, 'storage_system'::text, 'protocol'::text, 'artifact'::text, 'domain'::text, 'relationship'::text])`),
]);

export const atlasOntologyRelations = pgTable("atlas_ontology_relations", {
	relationId: uuid("relation_id").defaultRandom().primaryKey().notNull(),
	subjectConceptId: text("subject_concept_id").notNull(),
	predicate: text().notNull(),
	objectConceptId: text("object_concept_id").notNull(),
	evidence: text(),
	confidence: real().default(1).notNull(),
	extractorVersion: text("extractor_version").default('manual-v1').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_atlas_ontology_relations_object").using("btree", table.objectConceptId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_ontology_relations_subject").using("btree", table.subjectConceptId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.objectConceptId],
			foreignColumns: [atlasOntologyConcepts.conceptId],
			name: "atlas_ontology_relations_object_concept_id_fkey"
		}),
	foreignKey({
			columns: [table.subjectConceptId],
			foreignColumns: [atlasOntologyConcepts.conceptId],
			name: "atlas_ontology_relations_subject_concept_id_fkey"
		}),
	unique("atlas_ontology_relations_subject_concept_id_predicate_objec_key").on(table.objectConceptId, table.predicate, table.subjectConceptId),
	check("atlas_ontology_relations_confidence_check", sql`(confidence >= (0)::double precision) AND (confidence <= (1)::double precision)`),
	check("atlas_ontology_relations_predicate_check", sql`predicate = ANY (ARRAY['IS_A'::text, 'INSTANCE_OF'::text, 'ALIAS_OF'::text, 'IMPLEMENTS'::text, 'USES_SYSTEM'::text, 'CALLS'::text, 'FOLLOWS'::text, 'IMPROVES'::text, 'DEPENDS_ON'::text, 'PART_OF'::text, 'PRODUCES'::text, 'CONSUMES'::text, 'STORES_IN'::text, 'READS_FROM'::text])`),
]);

export const atlasFeatures = pgTable("atlas_features", {
	featureId: text("feature_id").primaryKey().notNull(),
	treeNodeId: text("tree_node_id").notNull(),
	featureNamespace: text("feature_namespace").notNull(),
	featureType: text("feature_type").notNull(),
	normalizedValue: jsonb("normalized_value").notNull(),
	labels: jsonb().default({}).notNull(),
	schemaId: text("schema_id").notNull(),
	schemaVersion: integer("schema_version").notNull(),
	extractorVersion: text("extractor_version").notNull(),
	confidence: real(),
	contentHash: text("content_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_af_labels_gin").using("gin", table.labels.asc().nullsLast().op("jsonb_ops")),
	index("idx_af_namespace_type").using("btree", table.featureNamespace.asc().nullsLast().op("text_ops"), table.featureType.asc().nullsLast().op("text_ops")),
	index("idx_af_tree_node_id").using("btree", table.treeNodeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.schemaId, table.schemaVersion],
			foreignColumns: [atlasSchemaRegistry.schemaId, atlasSchemaRegistry.schemaVersion],
			name: "atlas_features_schema_id_schema_version_fkey"
		}),
	foreignKey({
			columns: [table.treeNodeId],
			foreignColumns: [atlasAstNodes.treeNodeId],
			name: "atlas_features_tree_node_id_fkey"
		}),
]);

export const featureRecords = pgTable("feature_records", {
	featureId: uuid("feature_id").defaultRandom().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	featureType: text("feature_type").notNull(),
	version: text().notNull(),
	snapshotHash: text("snapshot_hash").notNull(),
	payload: jsonb().default({}).notNull(),
	scalarF32: real("scalar_f32"),
	vectorF32: text("vector_f32"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	supersededAt: timestamp("superseded_at", { withTimezone: true, mode: 'string' }),
	supersededBy: uuid("superseded_by"),
}, (table) => [
	index("idx_feature_records_packet").using("btree", table.packetKey.asc().nullsLast().op("text_ops"), table.featureType.asc().nullsLast().op("text_ops")).where(sql`(superseded_at IS NULL)`),
	index("idx_feature_records_payload").using("gin", table.payload.asc().nullsLast().op("jsonb_path_ops")),
	index("idx_feature_records_type_version").using("btree", table.featureType.asc().nullsLast().op("text_ops"), table.version.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	uniqueIndex("uq_feature_records_current").using("btree", table.packetKey.asc().nullsLast().op("text_ops"), table.featureType.asc().nullsLast().op("text_ops"), table.version.asc().nullsLast().op("text_ops")).where(sql`(superseded_at IS NULL)`),
	foreignKey({
			columns: [table.packetKey],
			foreignColumns: [atlasPackets.packetKey],
			name: "feature_records_packet_key_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.supersededBy],
			foreignColumns: [table.featureId],
			name: "feature_records_superseded_by_fkey"
		}),
]);

export const recommendationEvents = pgTable("recommendation_events", {
	eventId: bigserial("event_id", { mode: "bigint" }).primaryKey().notNull(),
	actorKey: text("actor_key"),
	sessionKey: text("session_key"),
	queryText: text("query_text"),
	queryHash: text("query_hash").notNull(),
	queryClusterId: text("query_cluster_id"),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	itemKind: text("item_kind").default('packet').notNull(),
	eventType: text("event_type").notNull(),
	eventValue: real("event_value"),
	position: integer(),
	rankedListId: text("ranked_list_id"),
	modelVersion: text("model_version").default('rrf-baseline-v1').notNull(),
	policyVersion: text("policy_version").default('default-v1').notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_rec_events_actor").using("btree", table.actorKey.asc().nullsLast().op("text_ops"), table.occurredAt.desc().nullsFirst().op("text_ops")).where(sql`(actor_key IS NOT NULL)`),
	index("idx_rec_events_cluster_packet").using("btree", table.queryClusterId.asc().nullsLast().op("text_ops"), table.packetKey.asc().nullsLast().op("text_ops")).where(sql`((query_cluster_id IS NOT NULL) AND (event_type = ANY (ARRAY['opened'::text, 'copied'::text, 'cited'::text, 'accepted'::text, 'dwell_time'::text])))`),
	index("idx_rec_events_packet").using("btree", table.packetKey.asc().nullsLast().op("timestamptz_ops"), table.eventType.asc().nullsLast().op("text_ops"), table.occurredAt.desc().nullsFirst().op("text_ops")),
	index("idx_rec_events_time").using("btree", table.occurredAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_rec_events_tool").using("btree", table.eventType.asc().nullsLast().op("text_ops"), table.packetKey.asc().nullsLast().op("text_ops")).where(sql`(event_type = ANY (ARRAY['tool_executed'::text, 'tool_failed'::text, 'repair_accepted'::text, 'repair_rejected'::text]))`),
]);

export const workflowEvents = pgTable("workflow_events", {
	eventId: uuid("event_id").defaultRandom().primaryKey().notNull(),
	runId: uuid("run_id").notNull(),
	actionId: uuid("action_id"),
	eventType: text("event_type").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sequenceNo: bigint("sequence_no", { mode: "number" }).notNull(),
	payload: jsonb().notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).notNull(),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_workflow_events_run").using("btree", table.runId.asc().nullsLast().op("int8_ops"), table.sequenceNo.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [agentRuns.runId],
			name: "workflow_events_run_id_fkey"
		}),
	unique("workflow_events_run_id_sequence_no_key").on(table.runId, table.sequenceNo),
]);

export const outboxEvents = pgTable("outbox_events", {
	outboxId: uuid("outbox_id").defaultRandom().primaryKey().notNull(),
	aggregateType: text("aggregate_type").notNull(),
	aggregateId: uuid("aggregate_id").notNull(),
	eventType: text("event_type").notNull(),
	payload: jsonb().notNull(),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_outbox_events_unpublished").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(published_at IS NULL)`),
]);

export const tokenArtifacts = pgTable("token_artifacts", {
	artifactId: uuid("artifact_id").defaultRandom().primaryKey().notNull(),
	sourceRef: text("source_ref").notNull(),
	tokenizerId: text("tokenizer_id").notNull(),
	tokenizerHash: text("tokenizer_hash").notNull(),
	contentHash: text("content_hash").notNull(),
	tokenCount: integer("token_count").notNull(),
	snapshotUri: text("snapshot_uri").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tokenOffsetStart: bigint("token_offset_start", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tokenOffsetEnd: bigint("token_offset_end", { mode: "number" }).notNull(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_token_artifacts_source").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	unique("token_artifacts_content_hash_tokenizer_hash_key").on(table.contentHash, table.tokenizerHash),
]);

export const atlasIndexRuns = pgTable("atlas_index_runs", {
	runId: text("run_id").primaryKey().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	status: text().notNull(),
	report: jsonb().default({}).notNull(),
});

export const atlasAcpProgress = pgTable("atlas_acp_progress", {
	id: serial().primaryKey().notNull(),
	totalDispatched: integer("total_dispatched").default(0),
	totalFailed: integer("total_failed").default(0),
	activeLanes: varchar("active_lanes", { length: 50 }).array(),
	avgConfidence: real("avg_confidence"),
	lastBatchTimestamp: timestamp("last_batch_timestamp", { mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const scenarioCache = pgTable("scenario_cache", {
	cacheId: uuid("cache_id").defaultRandom().primaryKey().notNull(),
	scenarioHash: varchar("scenario_hash", { length: 64 }).notNull(),
	pipelineKey: varchar("pipeline_key", { length: 255 }).notNull(),
	modelId: varchar("model_id", { length: 100 }).notNull(),
	modelVersion: varchar("model_version", { length: 64 }).notNull(),
	contextContractVersion: varchar("context_contract_version", { length: 64 }).notNull(),
	retrievalManifestHash: varchar("retrieval_manifest_hash", { length: 64 }).notNull(),
	cachedResponse: jsonb("cached_response").notNull(),
	ttlSeconds: integer("ttl_seconds").default(3600),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	hitCount: integer("hit_count").default(0),
}, (table) => [
	index("idx_scenario_cache_hit_count").using("btree", table.hitCount.desc().nullsFirst().op("int4_ops")),
	index("idx_scenario_cache_pipeline_key").using("btree", table.pipelineKey.asc().nullsLast().op("text_ops")),
	index("idx_scenario_cache_ttl").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	unique("scenario_cache_scenario_hash_pipeline_key_context_contract__key").on(table.contextContractVersion, table.pipelineKey, table.scenarioHash),
	check("scenario_cache_hit_count_check", sql`hit_count >= 0`),
]);

export const ldrResearchTasks = pgTable("ldr_research_tasks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	caseId: uuid("case_id"),
	query: text().notNull(),
	queryHash: varchar("query_hash", { length: 64 }).notNull(),
	status: varchar({ length: 20 }).default('pending'),
	rankModel: varchar("rank_model", { length: 20 }).default('xgboost'),
	includeWebSearch: boolean("include_web_search").default(true),
	includeLdr: boolean("include_ldr").default(true),
	topK: integer("top_k").default(5),
	sourceCounts: jsonb("source_counts"),
	totalCandidates: integer("total_candidates"),
	mlScore: real("ml_score"),
	synthesisModel: varchar("synthesis_model", { length: 100 }),
	synthesisLength: integer("synthesis_length"),
	errorMessage: text("error_message"),
	durationMs: integer("duration_ms"),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ldr_tasks_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("idx_ldr_tasks_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_ldr_tasks_user").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "ldr_research_tasks_user_id_fkey"
		}),
	unique("ldr_research_tasks_query_hash_key").on(table.queryHash),
]);

export const ldrResearchResults = pgTable("ldr_research_results", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	taskId: uuid("task_id").notNull(),
	rank: integer().notNull(),
	candidateId: varchar("candidate_id", { length: 255 }).notNull(),
	source: varchar({ length: 20 }).notNull(),
	title: varchar({ length: 500 }),
	text: text().notNull(),
	url: varchar({ length: 2048 }),
	upstreamScore: real("upstream_score"),
	mlScore: real("ml_score").notNull(),
	finalScore: real("final_score").notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ldr_results_task").using("btree", table.taskId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [ldrResearchTasks.id],
			name: "ldr_research_results_task_id_fkey"
		}).onDelete("cascade"),
]);

export const ldrSynthesis = pgTable("ldr_synthesis", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	taskId: uuid("task_id").notNull(),
	synthesisText: text("synthesis_text").notNull(),
	model: varchar({ length: 100 }).notNull(),
	confidence: real(),
	citedResultIds: text("cited_result_ids"),
	keyFindings: jsonb("key_findings"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [ldrResearchTasks.id],
			name: "ldr_synthesis_task_id_fkey"
		}).onDelete("cascade"),
	unique("ldr_synthesis_task_id_key").on(table.taskId),
]);

export const mlRankingCache = pgTable("ml_ranking_cache", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	queryHash: varchar("query_hash", { length: 64 }).notNull(),
	query: text().notNull(),
	model: varchar({ length: 20 }).notNull(),
	topKResults: jsonb("top_k_results").notNull(),
	modelVersion: varchar("model_version", { length: 50 }),
	accuracy: real(),
	cacheTtlMinutes: integer("cache_ttl_minutes").default(1440),
	hitCount: integer("hit_count").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
}, (table) => [
	index("idx_ml_cache_hash").using("btree", table.queryHash.asc().nullsLast().op("text_ops")),
	unique("ml_ranking_cache_query_hash_key").on(table.queryHash),
]);

export const mlClustering = pgTable("ml_clustering", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	taskId: uuid("task_id"),
	algorithm: varchar({ length: 30 }).notNull(),
	nClusters: integer("n_clusters").notNull(),
	vectorDim: integer("vector_dim").notNull(),
	nVectors: integer("n_vectors").notNull(),
	clusterIds: text("cluster_ids").notNull(),
	centroidsJson: jsonb("centroids_json"),
	inertia: real(),
	silhouetteScore: real("silhouette_score"),
	durationMs: integer("duration_ms"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [ldrResearchTasks.id],
			name: "ml_clustering_task_id_fkey"
		}).onDelete("set null"),
]);

export const deepResearchAuditLog = pgTable("deep_research_audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	taskId: uuid("task_id"),
	action: varchar({ length: 50 }).notNull(),
	details: jsonb(),
	durationMs: integer("duration_ms"),
	success: boolean().default(true),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_audit_task").using("btree", table.taskId.asc().nullsLast().op("uuid_ops")),
	index("idx_audit_user").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [ldrResearchTasks.id],
			name: "deep_research_audit_log_task_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "deep_research_audit_log_user_id_fkey"
		}).onDelete("cascade"),
]);

export const atlasFeaturePackets = pgTable("atlas_feature_packets", {
	packetKey: varchar("packet_key", { length: 255 }).primaryKey().notNull(),
	sourceRef: varchar("source_ref", { length: 512 }).notNull(),
	featureId: varchar("feature_id", { length: 255 }).notNull(),
	featureLabel: varchar("feature_label", { length: 512 }).notNull(),
	packetType: varchar("packet_type", { length: 50 }).notNull(),
	communityId: integer("community_id"),
	communitySource: varchar("community_source", { length: 100 }),
	communityConfidence: doublePrecision("community_confidence"),
	filePath: text("file_path"),
	treeNodeId: uuid("tree_node_id"),
	somCluster: integer("som_cluster"),
	permissions: jsonb().default({}).notNull(),
	metadata: jsonb().default({}).notNull(),
	topology: jsonb().default({}).notNull(),
	vectors: jsonb().default({}).notNull(),
	pagerank: real(),
	betweenness: real(),
	eigenvector: real(),
	lineageVersion: varchar("lineage_version", { length: 50 }).default('packet-identity-v2').notNull(),
	ledgerType: varchar("ledger_type", { length: 50 }).default('atlas:feature').notNull(),
	neo4JNodeId: varchar("neo4j_node_id", { length: 255 }),
	redisCentroidKey: varchar("redis_centroid_key", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("atlas_feature_packets_identity_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops"), table.sourceRef.asc().nullsLast().op("text_ops"), table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_betweenness").using("btree", table.betweenness.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_feature_eigenvector").using("btree", table.eigenvector.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_feature_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_feature_source").using("btree", table.featureId.asc().nullsLast().op("text_ops"), table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_file_path").using("btree", table.filePath.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_lineage").using("btree", table.lineageVersion.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_feature_neo4j_node_id").using("btree", table.neo4JNodeId.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_pagerank").using("btree", table.pagerank.asc().nullsLast().op("float4_ops")),
	index("idx_atlas_feature_permissions").using("gin", table.permissions.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_feature_redis_centroid_key").using("btree", table.redisCentroidKey.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_som_cluster").using("btree", table.somCluster.asc().nullsLast().op("int4_ops")),
	index("idx_atlas_feature_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_topology").using("gin", table.topology.asc().nullsLast().op("jsonb_ops")),
	index("idx_atlas_feature_tree_node_id").using("btree", table.treeNodeId.asc().nullsLast().op("uuid_ops")),
	index("idx_atlas_feature_tree_som_cluster").using("btree", table.treeNodeId.asc().nullsLast().op("int4_ops"), table.somCluster.asc().nullsLast().op("uuid_ops")).where(sql`((tree_node_id IS NOT NULL) AND (som_cluster IS NOT NULL))`),
	index("idx_atlas_feature_type").using("btree", table.packetType.asc().nullsLast().op("text_ops")),
	index("idx_atlas_feature_vectors").using("gin", table.vectors.asc().nullsLast().op("jsonb_ops")),
	foreignKey({
			columns: [table.treeNodeId],
			foreignColumns: [atlasTreeNodes.nodeId],
			name: "atlas_feature_packets_tree_node_id_fkey"
		}).onDelete("set null"),
]);

export const registryEnrichmentProjection = pgTable("registry_enrichment_projection", {
	id: serial().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	symbols: text().array().default([""]),
	astFacts: text("ast_facts").array().default([""]),
	keywords: text().array().default([""]),
	bm25Terms: text("bm25_terms").array().default([""]),
	identifiers: text().array().default([""]),
	fileTokens: text("file_tokens").array().default([""]),
	domainClass: text("domain_class"),
	materializationVersion: integer("materialization_version").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_enrichment_domain_class").using("btree", table.domainClass.asc().nullsLast().op("text_ops")),
	index("idx_enrichment_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_enrichment_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	unique("registry_enrichment_projection_packet_key_key").on(table.packetKey),
]);

export const registryEmbeddingIdentity = pgTable("registry_embedding_identity", {
	id: serial().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	embeddingModel: text("embedding_model").default('embeddinggemma:latest').notNull(),
	embeddingDimension: integer("embedding_dimension").default(768).notNull(),
	embeddingNormalized: boolean("embedding_normalized").default(true),
	embeddingContentHash: text("embedding_content_hash"),
	qdrantPointId: text("qdrant_point_id"),
	qdrantCollection: text("qdrant_collection").default('codebase_chunks_768'),
	materializationVersion: integer("materialization_version").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_embedding_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_embedding_qdrant_point_id").using("btree", table.qdrantPointId.asc().nullsLast().op("text_ops")),
	unique("registry_embedding_identity_packet_key_key").on(table.packetKey),
]);

export const registryTopologyProjection = pgTable("registry_topology_projection", {
	id: serial().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	treeNodeId: text("tree_node_id"),
	communityId: integer("community_id"),
	pageRankScore: real("page_rank_score"),
	somCluster: text("som_cluster"),
	kmeansCluster: integer("kmeans_cluster"),
	materializationVersion: integer("materialization_version").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_topology_community_id").using("btree", table.communityId.asc().nullsLast().op("int4_ops")),
	index("idx_topology_kmeans_cluster").using("btree", table.kmeansCluster.asc().nullsLast().op("int4_ops")),
	index("idx_topology_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_topology_page_rank").using("btree", table.pageRankScore.asc().nullsLast().op("float4_ops")),
	index("idx_topology_som_cluster").using("btree", table.somCluster.asc().nullsLast().op("text_ops")),
	unique("registry_topology_projection_packet_key_key").on(table.packetKey),
]);

export const registryOntologyTuples = pgTable("registry_ontology_tuples", {
	id: serial().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	subject: text().notNull(),
	predicate: text().notNull(),
	object: text().notNull(),
	tupleType: text("tuple_type").notNull(),
	confidence: real().notNull(),
	sources: text().array().default([""]),
	corroborationCount: integer("corroboration_count").default(0),
	materializationVersion: integer("materialization_version").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ontology_confidence").using("btree", table.confidence.desc().nullsFirst().op("float4_ops")),
	index("idx_ontology_corroboration").using("btree", table.corroborationCount.desc().nullsFirst().op("int4_ops")),
	index("idx_ontology_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_ontology_predicate").using("btree", table.predicate.asc().nullsLast().op("text_ops")),
	index("idx_ontology_subject").using("btree", table.subject.asc().nullsLast().op("text_ops")),
	index("idx_ontology_tuple_type").using("btree", table.tupleType.asc().nullsLast().op("text_ops")),
	unique("registry_ontology_tuples_packet_key_subject_predicate_objec_key").on(table.object, table.packetKey, table.predicate, table.subject),
	check("registry_ontology_tuples_tuple_type_check", sql`tuple_type = ANY (ARRAY['ast'::text, 'schema'::text, 'research'::text, 'verified'::text, 'candidate'::text])`),
]);

export const featureStructural = pgTable("feature_structural", {
	id: serial().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	symbolName: text("symbol_name").array().default([""]),
	symbolKind: text("symbol_kind").array().default([""]),
	astFacts: text("ast_facts").array().default([""]),
	treeDepth: integer("tree_depth").default(0),
	nodeCount: integer("node_count").default(0),
	language: text().default('typescript'),
	extractionMethod: text("extraction_method").default('tree-sitter'),
	confidence: real().default(1),
	materializationVersion: integer("materialization_version").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_feature_structural_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_feature_structural_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_feature_structural_symbol_name").using("gin", table.symbolName.asc().nullsLast().op("array_ops")),
	unique("feature_structural_packet_key_source_ref_key").on(table.packetKey, table.sourceRef),
]);

export const featureLexical = pgTable("feature_lexical", {
	id: serial().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	keywords: text().array().default([""]),
	bm25Terms: text("bm25_terms").array().default([""]),
	identifiers: text().array().default([""]),
	fileTokens: text("file_tokens").array().default([""]),
	tokenCount: integer("token_count").default(0),
	uniqueTokens: integer("unique_tokens").default(0),
	keywordDensity: real("keyword_density").default(0),
	extractionMethod: text("extraction_method").default('regex-tokenizer'),
	confidence: real().default(1),
	materializationVersion: integer("materialization_version").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_feature_lexical_bm25").using("gin", table.bm25Terms.asc().nullsLast().op("array_ops")),
	index("idx_feature_lexical_keywords").using("gin", table.keywords.asc().nullsLast().op("array_ops")),
	index("idx_feature_lexical_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_feature_lexical_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	unique("feature_lexical_packet_key_source_ref_key").on(table.packetKey, table.sourceRef),
]);

export const featureDomain = pgTable("feature_domain", {
	id: serial().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	domainClass: text("domain_class").notNull(),
	primarySource: text("primary_source").default('canonical'),
	secondarySources: text("secondary_sources").array().default([""]),
	confidence: real().default(1).notNull(),
	confidenceMethod: text("confidence_method").default('canonical'),
	materializationVersion: integer("materialization_version").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_feature_domain_class").using("btree", table.domainClass.asc().nullsLast().op("text_ops")),
	index("idx_feature_domain_confidence").using("btree", table.confidence.desc().nullsFirst().op("float4_ops")),
	index("idx_feature_domain_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_feature_domain_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	unique("feature_domain_packet_key_source_ref_key").on(table.packetKey, table.sourceRef),
]);

export const ontologyDomainTuples = pgTable("ontology_domain_tuples", {
	id: serial().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	domainClass: text("domain_class").notNull(),
	subject: text().notNull(),
	predicate: text().notNull(),
	object: text().notNull(),
	tupleType: text("tuple_type").default('domain').notNull(),
	confidence: real().default(0.8).notNull(),
	sources: text().array().default([""]),
	corroborationCount: integer("corroboration_count").default(1),
	materializationVersion: integer("materialization_version").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ontology_domain_class").using("btree", table.domainClass.asc().nullsLast().op("text_ops")),
	index("idx_ontology_domain_confidence").using("btree", table.confidence.desc().nullsFirst().op("float4_ops")),
	index("idx_ontology_domain_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_ontology_domain_predicate").using("btree", table.predicate.asc().nullsLast().op("text_ops")),
	index("idx_ontology_domain_subject").using("btree", table.subject.asc().nullsLast().op("text_ops")),
	index("idx_ontology_domain_tuple_type").using("btree", table.tupleType.asc().nullsLast().op("text_ops")),
	unique("ontology_domain_tuples_packet_key_domain_class_subject_pred_key").on(table.domainClass, table.object, table.packetKey, table.predicate, table.subject),
	check("ontology_domain_tuples_tuple_type_check", sql`tuple_type = ANY (ARRAY['domain'::text, 'legal'::text, 'technical'::text, 'structural'::text, 'semantic'::text])`),
]);

export const featureImplementations = pgTable("feature_implementations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	featureKey: text("feature_key").notNull(),
	featureName: text("feature_name").notNull(),
	description: text(),
	laneIds: text("lane_ids").array().default([""]),
	status: text().default('active').notNull(),
	confidence: real().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	packetKey: text("packet_key"),
	sourceRef: text("source_ref"),
	contentHash: text("content_hash"),
	processingPassId: uuid("processing_pass_id"),
}, (table) => [
	index("feature_implementations_packet_key_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops")).where(sql`(packet_key IS NOT NULL)`),
	index("feature_implementations_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")).where(sql`(source_ref IS NOT NULL)`),
	index("fi_fts_idx").using("gin", sql`to_tsvector('english'::regconfig, ((feature_name || ' '::text) `),
	index("fi_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	unique("feature_implementations_feature_key_key").on(table.featureKey),
	check("feature_implementations_confidence_check", sql`(confidence >= (0)::double precision) AND (confidence <= (1)::double precision)`),
	check("feature_implementations_status_check", sql`status = ANY (ARRAY['active'::text, 'deprecated'::text, 'wip'::text])`),
]);

export const featureFileEdges = pgTable("feature_file_edges", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	featureKey: text("feature_key").notNull(),
	filePath: text("file_path").notNull(),
	entryExport: text("entry_export"),
	role: text().default('primary').notNull(),
	lineStart: integer("line_start"),
	lineEnd: integer("line_end"),
	stableKey: text("stable_key").generatedAlwaysAs(sql`encode(sha256((((((feature_key || ':'::text) || file_path) || ':'::text) || COALESCE(entry_export, ''::text)))::bytea), 'hex'::text)`),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	packetKey: text("packet_key"),
	sourceRef: text("source_ref"),
	contentHash: text("content_hash"),
}, (table) => [
	index("feature_file_edges_packet_key_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops")).where(sql`(packet_key IS NOT NULL)`),
	index("feature_file_edges_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")).where(sql`(source_ref IS NOT NULL)`),
	index("ffe_feature_idx").using("btree", table.featureKey.asc().nullsLast().op("text_ops")),
	index("ffe_file_idx").using("btree", table.filePath.asc().nullsLast().op("text_ops")),
	index("ffe_role_idx").using("btree", table.role.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.featureKey],
			foreignColumns: [featureImplementations.featureKey],
			name: "feature_file_edges_feature_key_fkey"
		}).onDelete("cascade"),
	unique("feature_file_edges_feature_key_file_path_entry_export_key").on(table.entryExport, table.featureKey, table.filePath),
	check("feature_file_edges_role_check", sql`role = ANY (ARRAY['primary'::text, 'consumer'::text, 'test'::text, 'type'::text])`),
]);

export const featureLexicalFacts = pgTable("feature_lexical_facts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	featureKey: text("feature_key"),
	keywords: text().array().default([""]).notNull(),
	identifiers: text().array().default([""]).notNull(),
	symbols: text().array().default([""]).notNull(),
	importedModules: text("imported_modules").array().default([""]).notNull(),
	lexicalSummary: text("lexical_summary"),
	language: text().default('typescript'),
	contentHash: text("content_hash").notNull(),
	extractorVersion: text("extractor_version").default('phase-107-v1').notNull(),
	processingPassId: uuid("processing_pass_id"),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("feature_lexical_facts_keywords_idx").using("gin", table.keywords.asc().nullsLast().op("array_ops")),
	index("feature_lexical_facts_packet_key_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("feature_lexical_facts_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("feature_lexical_facts_symbols_idx").using("gin", table.symbols.asc().nullsLast().op("array_ops")),
	unique("feature_lexical_facts_packet_key_extractor_version_content__key").on(table.contentHash, table.extractorVersion, table.packetKey),
]);

export const featureDomainFacts = pgTable("feature_domain_facts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	featureKey: text("feature_key"),
	domainClass: text("domain_class").notNull(),
	domainConfidence: real("domain_confidence"),
	domainProbabilities: jsonb("domain_probabilities").default({}).notNull(),
	classifierKind: text("classifier_kind").default('legacy-backfill').notNull(),
	classifierVersion: text("classifier_version").default('atlas-packets-domain-class-v1').notNull(),
	modelHash: text("model_hash"),
	featureContractVersion: text("feature_contract_version"),
	contentHash: text("content_hash").notNull(),
	processingPassId: uuid("processing_pass_id"),
	evidence: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("feature_domain_facts_confidence_idx").using("btree", table.domainConfidence.desc().nullsFirst().op("float4_ops")),
	index("feature_domain_facts_domain_class_idx").using("btree", table.domainClass.asc().nullsLast().op("text_ops")),
	index("feature_domain_facts_packet_key_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("feature_domain_facts_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	unique("feature_domain_facts_packet_key_classifier_version_content__key").on(table.classifierVersion, table.contentHash, table.packetKey),
]);

export const featureStructuralFacts = pgTable("feature_structural_facts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	featureKey: text("feature_key"),
	treeNodeId: text("tree_node_id"),
	symbolName: text("symbol_name"),
	symbolKind: text("symbol_kind"),
	structuralPath: text("structural_path").array(),
	lineStart: integer("line_start"),
	lineEnd: integer("line_end"),
	imports: text().array().default([""]).notNull(),
	calls: text().array().default([""]).notNull(),
	exports: text().array().default([""]).notNull(),
	contentHash: text("content_hash").notNull(),
	parserVersion: text("parser_version").default('tree-sitter-v0').notNull(),
	processingPassId: uuid("processing_pass_id"),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("feature_structural_facts_imports_idx").using("gin", table.imports.asc().nullsLast().op("array_ops")),
	index("feature_structural_facts_packet_key_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("feature_structural_facts_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("feature_structural_facts_symbol_name_idx").using("btree", table.symbolName.asc().nullsLast().op("text_ops")),
]);

export const featureOntologyTuples = pgTable("feature_ontology_tuples", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref").notNull(),
	featureKey: text("feature_key"),
	subjectType: text("subject_type").notNull(),
	subjectId: text("subject_id").notNull(),
	predicate: text().notNull(),
	objectType: text("object_type").notNull(),
	objectId: text("object_id").notNull(),
	objectValue: jsonb("object_value"),
	confidence: real().default(1).notNull(),
	ontologyVersion: text("ontology_version").default('atlas-ontology-v1').notNull(),
	extractorVersion: text("extractor_version").default('phase-107-v1').notNull(),
	processingPassId: uuid("processing_pass_id"),
	evidence: jsonb().default({}).notNull(),
	validFrom: timestamp("valid_from", { withTimezone: true, mode: 'string' }),
	validTo: timestamp("valid_to", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("feature_ontology_tuples_confidence_idx").using("btree", table.confidence.desc().nullsFirst().op("float4_ops")),
	index("feature_ontology_tuples_object_idx").using("btree", table.objectType.asc().nullsLast().op("text_ops"), table.objectId.asc().nullsLast().op("text_ops")),
	index("feature_ontology_tuples_packet_key_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("feature_ontology_tuples_predicate_idx").using("btree", table.predicate.asc().nullsLast().op("text_ops")),
	index("feature_ontology_tuples_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("feature_ontology_tuples_subject_idx").using("btree", table.subjectType.asc().nullsLast().op("text_ops"), table.subjectId.asc().nullsLast().op("text_ops")),
	unique("feature_ontology_tuples_packet_key_subject_type_subject_id__key").on(table.objectId, table.objectType, table.ontologyVersion, table.packetKey, table.predicate, table.subjectId, table.subjectType),
]);

export const atlasRegistryAlignment = pgTable("atlas_registry_alignment", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	registryId: varchar("registry_id", { length: 255 }).notNull(),
	packetKey: varchar("packet_key", { length: 255 }).notNull(),
	sourceRef: varchar("source_ref", { length: 512 }).notNull(),
	featureId: varchar("feature_id", { length: 255 }),
	alignmentConfidence: real("alignment_confidence").default(0.97),
	somCluster: varchar("som_cluster", { length: 50 }),
	authorityScore: real("authority_score"),
	pagerankScore: real("pagerank_score"),
	communityId: varchar("community_id", { length: 100 }),
	materializedAt: timestamp("materialized_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("atlas_registry_alignment_registry_id_packet_key_key").on(table.packetKey, table.registryId),
]);

export const featurePacketBindings = pgTable("feature_packet_bindings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	featureId: text("feature_id"),
	packetKey: text("packet_key").notNull(),
	sourceRef: text("source_ref"),
	bindingType: text("binding_type").default('extracted'),
	confidence: doublePrecision().default(0.5),
	evidenceIds: text("evidence_ids").array().default([""]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	featureKey: text("feature_key"),
	bindingKind: text("binding_kind"),
	joinMethod: text("join_method"),
	evidence: jsonb().default({}).notNull(),
	processingPassId: uuid("processing_pass_id"),
}, (table) => [
	index("feature_packet_bindings_binding_type_idx").using("btree", table.bindingType.asc().nullsLast().op("float8_ops"), table.confidence.desc().nullsFirst().op("float8_ops")),
	index("feature_packet_bindings_feature_confidence_idx").using("btree", table.featureId.asc().nullsLast().op("float8_ops"), table.confidence.desc().nullsFirst().op("text_ops")),
	index("feature_packet_bindings_feature_idx").using("btree", table.featureKey.asc().nullsLast().op("text_ops")),
	uniqueIndex("feature_packet_bindings_identity_uq").using("btree", table.featureKey.asc().nullsLast().op("text_ops"), table.packetKey.asc().nullsLast().op("text_ops"), table.bindingKind.asc().nullsLast().op("text_ops")),
	index("feature_packet_bindings_kind_idx").using("btree", table.bindingKind.asc().nullsLast().op("text_ops")),
	index("feature_packet_bindings_packet_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("feature_packet_bindings_packet_key_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("feature_packet_bindings_source_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("feature_packet_bindings_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	unique("feature_packet_bindings_unique").on(table.featureId, table.packetKey, table.sourceRef),
]);

export const atlasGraphAuthorityRuns = pgTable("atlas_graph_authority_runs", {
	runId: uuid("run_id").primaryKey().notNull(),
	graphSnapshotId: uuid("graph_snapshot_id").notNull(),
	algorithm: text().notNull(),
	normalizationMethod: text("normalization_method").notNull(),
	expectedL1Sum: doublePrecision("expected_l1_sum").default(1).notNull(),
	observedL1Sum: doublePrecision("observed_l1_sum").notNull(),
	normalizationTolerance: doublePrecision("normalization_tolerance").notNull(),
	didConverge: boolean("did_converge").notNull(),
	ranIterations: integer("ran_iterations").notNull(),
	nodeCount: integer("node_count").notNull(),
	status: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	promotedAt: timestamp("promoted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_authority_runs_graph_snapshot").using("btree", table.graphSnapshotId.asc().nullsLast().op("uuid_ops")),
	index("idx_authority_runs_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	check("atlas_graph_authority_runs_algorithm_check", sql`algorithm = 'pagerank'::text`),
	check("atlas_graph_authority_runs_normalization_method_check", sql`normalization_method = 'L1Norm'::text`),
	check("atlas_graph_authority_runs_status_check", sql`status = ANY (ARRAY['building'::text, 'validating'::text, 'passed'::text, 'failed'::text, 'promoted'::text])`),
]);

export const vectorIndexRegistry = pgTable("vector_index_registry", {
	id: serial().primaryKey().notNull(),
	indexName: varchar("index_name", { length: 100 }).notNull(),
	indexType: varchar("index_type", { length: 50 }).notNull(),
	indexBackend: varchar("index_backend", { length: 50 }).notNull(),
	vectorDimension: integer("vector_dimension").notNull(),
	totalPoints: integer("total_points").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	lastValidation: timestamp("last_validation", { withTimezone: true, mode: 'string' }),
	validationStatus: varchar("validation_status", { length: 50 }).default('not_validated'),
	config: jsonb().notNull(),
}, (table) => [
	unique("vector_index_registry_index_name_key").on(table.indexName),
	check("vector_index_registry_index_type_check", sql`(index_type)::text = ANY ((ARRAY['dense_vector'::character varying, 'quantized_vector'::character varying, 'clustering'::character varying, 'topology'::character varying])::text[])`),
]);

export const atlasGraphSnapshotExclusionsV2 = pgTable("atlas_graph_snapshot_exclusions_v2", {
	exclusionId: uuid("exclusion_id").defaultRandom().primaryKey().notNull(),
	snapshotId: uuid("snapshot_id").notNull(),
	candidateKey: text("candidate_key"),
	packetKey: text("packet_key"),
	sourceRef: text("source_ref"),
	exclusionStage: text("exclusion_stage").notNull(),
	exclusionReason: text("exclusion_reason").notNull(),
	evidence: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.snapshotId],
			foreignColumns: [atlasGraphSnapshotsV2.snapshotId],
			name: "atlas_graph_snapshot_exclusions_v2_snapshot_id_fkey"
		}).onDelete("restrict"),
	unique("atlas_graph_snapshot_exclusio_snapshot_id_exclusion_stage_e_key").on(table.candidateKey, table.exclusionReason, table.exclusionStage, table.snapshotId),
]);

export const atlasGraphSnapshotsV2 = pgTable("atlas_graph_snapshots_v2", {
	snapshotId: uuid("snapshot_id").primaryKey().notNull(),
	schemaVersion: text("schema_version").notNull(),
	status: text().notNull(),
	sourceManifest: jsonb("source_manifest").notNull(),
	projectionPolicy: jsonb("projection_policy").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	nodeCount: bigint("node_count", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	edgeCount: bigint("edge_count", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	relationEventCount: bigint("relation_event_count", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	excludedCount: bigint("excluded_count", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unresolvedCount: bigint("unresolved_count", { mode: "number" }).default(0).notNull(),
	sourceHash: text("source_hash").notNull(),
	topologyHash: text("topology_hash").notNull(),
	policyHash: text("policy_hash").notNull(),
	eligibilityPredicate: text("eligibility_predicate").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finalizedAt: timestamp("finalized_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	check("atlas_graph_snapshots_v2_edge_count_check", sql`edge_count >= 0`),
	check("atlas_graph_snapshots_v2_excluded_count_check", sql`excluded_count >= 0`),
	check("atlas_graph_snapshots_v2_node_count_check", sql`node_count >= 0`),
	check("atlas_graph_snapshots_v2_relation_event_count_check", sql`relation_event_count >= 0`),
	check("atlas_graph_snapshots_v2_status_check", sql`status = ANY (ARRAY['BUILDING'::text, 'VALIDATED'::text, 'SUPERSEDED'::text, 'FAILED'::text])`),
	check("atlas_graph_snapshots_v2_unresolved_count_check", sql`unresolved_count >= 0`),
]);

export const atlasGraphResolutionIssuesV2 = pgTable("atlas_graph_resolution_issues_v2", {
	issueId: uuid("issue_id").defaultRandom().primaryKey().notNull(),
	snapshotId: uuid("snapshot_id").notNull(),
	issueFingerprint: text("issue_fingerprint").notNull(),
	packetKey: text("packet_key"),
	nodeKey: text("node_key"),
	treeNodeId: uuid("tree_node_id"),
	sourceRef: text("source_ref"),
	issueType: text("issue_type").notNull(),
	issueStatus: text("issue_status").notNull(),
	exclusionStage: text("exclusion_stage").notNull(),
	candidateMatches: jsonb("candidate_matches").default([]).notNull(),
	evidence: jsonb().default({}).notNull(),
	occurrenceCount: integer("occurrence_count").default(1).notNull(),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	topologyHash: text("topology_hash").notNull(),
}, (table) => [
	index("atlas_graph_resolution_issues_v2_status_idx").using("btree", table.issueStatus.asc().nullsLast().op("text_ops"), table.lastSeenAt.desc().nullsFirst().op("text_ops")),
	foreignKey({
			columns: [table.snapshotId],
			foreignColumns: [atlasGraphSnapshotsV2.snapshotId],
			name: "atlas_graph_resolution_issues_v2_snapshot_id_fkey"
		}).onDelete("restrict"),
	unique("atlas_graph_resolution_issues_snapshot_id_issue_fingerprint_key").on(table.issueFingerprint, table.snapshotId),
	check("atlas_graph_resolution_issues_v2_issue_status_check", sql`issue_status = ANY (ARRAY['OPEN'::text, 'RETRYABLE'::text, 'QUARANTINED'::text, 'IGNORED_BY_POLICY'::text, 'RESOLVED'::text, 'SUPERSEDED'::text])`),
	check("atlas_graph_resolution_issues_v2_occurrence_count_check", sql`occurrence_count > 0`),
]);

export const atlasGraphAuthorityRunsV2 = pgTable("atlas_graph_authority_runs_v2", {
	runId: uuid("run_id").primaryKey().notNull(),
	snapshotId: uuid("snapshot_id").notNull(),
	engine: text().notNull(),
	algorithm: text().notNull(),
	algorithmVersion: text("algorithm_version").notNull(),
	configuration: jsonb().notNull(),
	topologyHash: text("topology_hash").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	nodeCount: bigint("node_count", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	edgeCount: bigint("edge_count", { mode: "number" }).notNull(),
	resultHash: text("result_hash").notNull(),
	status: text().notNull(),
	didConverge: boolean("did_converge").notNull(),
	ranIterations: integer("ran_iterations").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.snapshotId],
			foreignColumns: [atlasGraphSnapshotsV2.snapshotId],
			name: "atlas_graph_authority_runs_v2_snapshot_id_fkey"
		}).onDelete("restrict"),
	unique("atlas_graph_authority_runs_v2_run_id_snapshot_id_key").on(table.runId, table.snapshotId),
	check("atlas_graph_authority_runs_v2_algorithm_check", sql`algorithm = 'pagerank'::text`),
	check("atlas_graph_authority_runs_v2_edge_count_check", sql`edge_count >= 0`),
	check("atlas_graph_authority_runs_v2_engine_check", sql`engine = ANY (ARRAY['networkx'::text, 'neo4j_gds'::text])`),
	check("atlas_graph_authority_runs_v2_node_count_check", sql`node_count >= 0`),
	check("atlas_graph_authority_runs_v2_ran_iterations_check", sql`ran_iterations >= 0`),
	check("atlas_graph_authority_runs_v2_status_check", sql`status = ANY (ARRAY['BUILDING'::text, 'VALIDATING'::text, 'PASSED'::text, 'FAILED'::text, 'SUPERSEDED'::text])`),
]);

export const atlasVectorRegistry = pgTable("atlas_vector_registry", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	sourceRef: text("source_ref").notNull(),
	packetKey: text("packet_key"),
	embeddingModel: text("embedding_model").default('embeddinggemma:latest').notNull(),
	embeddingDim: integer("embedding_dim").default(768).notNull(),
	vectorVersion: integer("vector_version").default(1).notNull(),
	qdrantPointId: uuid("qdrant_point_id"),
	contentHash: text("content_hash"),
	exportedArrow: boolean("exported_arrow").default(false).notNull(),
	exportedAt: timestamp("exported_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("avr_exported_idx").using("btree", table.exportedArrow.asc().nullsLast().op("bool_ops")).where(sql`(NOT exported_arrow)`),
	index("avr_packet_key_idx").using("btree", table.packetKey.asc().nullsLast().op("text_ops")).where(sql`(packet_key IS NOT NULL)`),
	index("avr_qdrant_idx").using("btree", table.qdrantPointId.asc().nullsLast().op("uuid_ops")).where(sql`(qdrant_point_id IS NOT NULL)`),
	unique("atlas_vector_registry_source_ref_vector_version_key").on(table.sourceRef, table.vectorVersion),
]);

export const atlasDocumentClassification = pgTable("atlas_document_classification", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceRef: text("source_ref").notNull(),
	packetKey: text("packet_key"),
	lexicalClass: text("lexical_class"),
	lexicalConfidence: real("lexical_confidence").default(0),
	astNodeType: text("ast_node_type"),
	astClass: text("ast_class"),
	astConfidence: real("ast_confidence").default(0),
	domainClass: text("domain_class"),
	domainConfidence: real("domain_confidence").default(0),
	primaryClass: text("primary_class"),
	secondaryClasses: text("secondary_classes").array(),
	finalConfidence: real("final_confidence").default(0),
	lexicalFeatures: jsonb("lexical_features"),
	astFeatures: jsonb("ast_features"),
	nlpFeatures: jsonb("nlp_features"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_doc_class_domain_class").using("btree", table.domainClass.asc().nullsLast().op("text_ops")),
	index("idx_doc_class_primary_class").using("btree", table.primaryClass.asc().nullsLast().op("text_ops")),
	index("idx_doc_class_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	unique("atlas_document_classification_source_ref_key").on(table.sourceRef),
	check("atlas_document_classification_ast_confidence_check", sql`(ast_confidence >= (0)::double precision) AND (ast_confidence <= (1)::double precision)`),
	check("atlas_document_classification_domain_confidence_check", sql`(domain_confidence >= (0)::double precision) AND (domain_confidence <= (1)::double precision)`),
	check("atlas_document_classification_final_confidence_check", sql`(final_confidence >= (0)::double precision) AND (final_confidence <= (1)::double precision)`),
	check("atlas_document_classification_lexical_confidence_check", sql`(lexical_confidence >= (0)::double precision) AND (lexical_confidence <= (1)::double precision)`),
]);

export const authorizationAuditLog = pgTable("authorization_audit_log", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	userId: text("user_id").notNull(),
	toolName: text("tool_name").notNull(),
	action: varchar({ length: 50 }).notNull(),
	permission: text(),
	userRole: text("user_role"),
	ipAddress: inet("ip_address"),
	userAgent: text("user_agent"),
	error: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_audit_action").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("idx_audit_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	index("idx_audit_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	check("chk_action", sql`(action)::text = ANY ((ARRAY['GRANT_DERIVED'::character varying, 'ACCESS_ALLOWED'::character varying, 'ACCESS_DENIED'::character varying, 'VALIDATION_FAILED'::character varying])::text[])`),
]);

export const taskSemanticPackets = pgTable("task_semantic_packets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	packetKey: varchar("packet_key", { length: 255 }).notNull(),
	sourceRef: varchar("source_ref", { length: 512 }).notNull(),
	featureId: varchar("feature_id", { length: 255 }).notNull(),
	featureLabel: varchar("feature_label", { length: 512 }).notNull(),
	aliasId: varchar("alias_id", { length: 255 }).notNull(),
	qdrantScore: real("qdrant_score").notNull(),
	clusterScore: real("cluster_score").notNull(),
	topologicalScore: real("topological_score").notNull(),
	fusionScore: real("fusion_score").notNull(),
	metadata: jsonb().notNull(),
	semanticVector: vector("semantic_vector", { dimensions: 768 }),
	validationStatus: varchar("validation_status", { length: 50 }).default('pending').notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_task_semantic_packets_alias_id").using("btree", table.aliasId.asc().nullsLast().op("text_ops")),
	index("idx_task_semantic_packets_feature_id").using("btree", table.featureId.asc().nullsLast().op("text_ops")),
	index("idx_task_semantic_packets_metadata").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_task_semantic_packets_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("idx_task_semantic_packets_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")),
	index("idx_task_semantic_packets_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("idx_task_semantic_packets_validation_status").using("btree", table.validationStatus.asc().nullsLast().op("text_ops")),
	unique("task_semantic_packets_packet_key_key").on(table.packetKey),
	check("packet_key_format", sql`(packet_key)::text ~ '^[a-zA-Z0-9_:.-]+$'::text`),
]);

export const domainTaxonomyV1 = pgTable("domain_taxonomy_v1", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	label: varchar({ length: 255 }).notNull(),
	domainId: varchar("domain_id", { length: 255 }).notNull(),
	version: integer().default(1).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	description: text(),
	parentDomainId: varchar("parent_domain_id", { length: 255 }),
	deprecatedAt: timestamp("deprecated_at", { withTimezone: true, mode: 'string' }),
	deprecationReason: text("deprecation_reason"),
	replacedBy: varchar("replaced_by", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_domain_taxonomy_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_domain_taxonomy_domain_id").using("btree", table.domainId.asc().nullsLast().op("text_ops")),
	index("idx_domain_taxonomy_label").using("btree", table.label.asc().nullsLast().op("text_ops")),
	unique("domain_taxonomy_v1_domain_id_version_key").on(table.domainId, table.version),
]);

export const evidenceTags = pgTable("evidence_tags", {
	evidenceId: uuid("evidence_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	primaryKey({ columns: [table.evidenceId, table.tagId], name: "evidence_tags_evidence_id_tag_id_pk"}),
]);

export const kagDagEdges = pgTable("kag_dag_edges", {
	runId: uuid("run_id").notNull(),
	fromNodeKey: text("from_node_key").notNull(),
	toNodeKey: text("to_node_key").notNull(),
	edgeType: text("edge_type").default('depends_on'),
	metadata: jsonb().default({}),
}, (table) => [
	foreignKey({
			columns: [table.runId],
			foreignColumns: [kagDagRuns.id],
			name: "kag_dag_edges_run_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.fromNodeKey, table.runId, table.toNodeKey], name: "kag_dag_edges_pkey"}),
]);

export const atlasHyperedgeMembers = pgTable("atlas_hyperedge_members", {
	hyperedgeId: uuid("hyperedge_id").notNull(),
	memberId: text("member_id").notNull(),
	memberType: text("member_type").notNull(),
	memberRole: text("member_role").notNull(),
	ordinal: integer(),
}, (table) => [
	index("idx_ahem_member_id").using("btree", table.memberId.asc().nullsLast().op("text_ops")),
	index("idx_ahem_member_type_role").using("btree", table.memberType.asc().nullsLast().op("text_ops"), table.memberRole.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.hyperedgeId],
			foreignColumns: [atlasHyperedges.hyperedgeId],
			name: "atlas_hyperedge_members_hyperedge_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.hyperedgeId, table.memberId, table.memberRole], name: "atlas_hyperedge_members_pkey"}),
]);

export const atlasGraphRelationParticipantsV2 = pgTable("atlas_graph_relation_participants_v2", {
	snapshotId: uuid("snapshot_id").notNull(),
	relationId: text("relation_id").notNull(),
	nodeKey: text("node_key").notNull(),
	role: text().notNull(),
	ordinal: integer().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.snapshotId, table.relationId],
			foreignColumns: [atlasGraphRelationEventsV2.snapshotId, atlasGraphRelationEventsV2.relationId],
			name: "atlas_graph_relation_participants__snapshot_id_relation_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.snapshotId, table.nodeKey],
			foreignColumns: [atlasGraphNodesV2.snapshotId, atlasGraphNodesV2.nodeKey],
			name: "atlas_graph_relation_participants_v2_snapshot_id_node_key_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.nodeKey, table.relationId, table.role, table.snapshotId], name: "atlas_graph_relation_participants_v2_pkey"}),
	check("atlas_graph_relation_participants_v2_ordinal_check", sql`ordinal >= 0`),
]);

export const codeFeatureEdges = pgTable("code_feature_edges", {
	fromFeatureId: text("from_feature_id").notNull(),
	toFeatureId: text("to_feature_id").notNull(),
	relation: text().notNull(),
	evidenceRef: text("evidence_ref"),
	confidence: real().default(1),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_code_feature_edges_from").using("btree", table.fromFeatureId.asc().nullsLast().op("text_ops")),
	index("idx_code_feature_edges_relation").using("btree", table.relation.asc().nullsLast().op("text_ops")),
	index("idx_code_feature_edges_to").using("btree", table.toFeatureId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.fromFeatureId],
			foreignColumns: [codeFeatures.featureId],
			name: "code_feature_edges_from_feature_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toFeatureId],
			foreignColumns: [codeFeatures.featureId],
			name: "code_feature_edges_to_feature_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.fromFeatureId, table.relation, table.toFeatureId], name: "code_feature_edges_pkey"}),
]);

export const codebaseRelationshipReports = pgTable("codebase_relationship_reports", {
	srcCommunity: integer("src_community").notNull(),
	dstCommunity: integer("dst_community").notNull(),
	summary: text(),
	purpose: text(),
	weight: integer(),
	builtAt: timestamp("built_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	primaryKey({ columns: [table.dstCommunity, table.srcCommunity], name: "codebase_relationship_reports_pkey"}),
]);

export const evaluationRelevance = pgTable("evaluation_relevance", {
	queryId: uuid("query_id").notNull(),
	chunkId: uuid("chunk_id").notNull(),
	grade: smallint().notNull(),
	sourceType: varchar("source_type", { length: 20 }).notNull(),
	extractorVersion: varchar("extractor_version", { length: 20 }).notNull(),
	confidence: real().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_evaluation_relevance_chunk").using("btree", table.chunkId.asc().nullsLast().op("uuid_ops")),
	index("idx_evaluation_relevance_confidence").using("btree", table.confidence.asc().nullsLast().op("float4_ops")),
	index("idx_evaluation_relevance_query").using("btree", table.queryId.asc().nullsLast().op("uuid_ops")),
	index("idx_evaluation_relevance_source_type").using("btree", table.sourceType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.queryId],
			foreignColumns: [evaluationQueries.id],
			name: "evaluation_relevance_query_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.chunkId, table.queryId], name: "evaluation_relevance_pkey"}),
	check("ck_confidence", sql`(confidence >= (0.0)::double precision) AND (confidence <= (1.0)::double precision)`),
	check("ck_grade", sql`(grade >= 0) AND (grade <= 3)`),
	check("ck_source_type", sql`(source_type)::text = ANY ((ARRAY['AST'::character varying, 'route'::character varying, 'schema'::character varying, 'test'::character varying])::text[])`),
]);

export const atlasGraphRelationEventsV2 = pgTable("atlas_graph_relation_events_v2", {
	snapshotId: uuid("snapshot_id").notNull(),
	relationId: text("relation_id").notNull(),
	relationType: text("relation_type").notNull(),
	sourceRef: text("source_ref").notNull(),
	evidenceSpan: text("evidence_span").notNull(),
	confidence: doublePrecision().notNull(),
	topologyHash: text("topology_hash").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.snapshotId],
			foreignColumns: [atlasGraphSnapshotsV2.snapshotId],
			name: "atlas_graph_relation_events_v2_snapshot_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.relationId, table.snapshotId], name: "atlas_graph_relation_events_v2_pkey"}),
	check("atlas_graph_relation_events_v2_confidence_check", sql`(confidence >= (0)::double precision) AND (confidence <= (1)::double precision) AND (confidence <> ALL (ARRAY['NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision]))`),
]);

export const atlasGraphNodesV2 = pgTable("atlas_graph_nodes_v2", {
	snapshotId: uuid("snapshot_id").notNull(),
	nodeKey: text("node_key").notNull(),
	nodeType: text("node_type").notNull(),
	packetKey: text("packet_key"),
	treeNodeId: uuid("tree_node_id"),
	sourceRef: text("source_ref"),
	contentHash: text("content_hash"),
	properties: jsonb().default({}).notNull(),
}, (table) => [
	uniqueIndex("atlas_graph_nodes_v2_tree_node_unique").using("btree", table.snapshotId.asc().nullsLast().op("uuid_ops"), table.treeNodeId.asc().nullsLast().op("uuid_ops")).where(sql`(tree_node_id IS NOT NULL)`),
	foreignKey({
			columns: [table.snapshotId],
			foreignColumns: [atlasGraphSnapshotsV2.snapshotId],
			name: "atlas_graph_nodes_v2_snapshot_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.nodeKey, table.snapshotId], name: "atlas_graph_nodes_v2_pkey"}),
	check("atlas_graph_nodes_v2_check", sql`(node_type <> 'packet'::text) OR (packet_key IS NOT NULL)`),
]);

export const atlasOntologyTuples = pgTable("atlas_ontology_tuples", {
	subjectId: text("subject_id").notNull(),
	predicate: text().notNull(),
	objectId: text("object_id").notNull(),
	tupleId: text("tuple_id"),
	schemaId: text("schema_id").default('atlas.ontology-linked-tuple').notNull(),
	packetKey: text("packet_key"),
	sourceRef: text("source_ref"),
	surfaceText: text("surface_text"),
	label: text("label"),
	labelKind: text("label_kind"),
	labelSource: text("label_source"),
	origin: text().notNull(),
	confidence: real().notNull(),
	version: text().notNull(),
	ontologyIds: text("ontology_ids").array().default([]).notNull(),
	conceptIds: text("concept_ids").array().default([]).notNull(),
	participants: jsonb().default([]).notNull(),
	evidenceRefs: text("evidence_refs").array().default([]).notNull(),
	evidenceState: text("evidence_state").default('ACTIVE_DEGRADED').notNull(),
	lifecycle: text().default('OBSERVED').notNull(),
	sourceRevision: text("source_revision"),
	workspaceRevision: text("workspace_revision"),
	featureRevision: text("feature_revision"),
	graphRevision: text("graph_revision"),
	ontologyRevision: text("ontology_revision"),
	metadata: jsonb().default({}).notNull(),
	provenance: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("atlas_ontology_object_idx").using("btree", table.objectId.asc().nullsLast().op("text_ops")),
	index("atlas_ontology_predicate_idx").using("btree", table.predicate.asc().nullsLast().op("text_ops")),
	index("atlas_ontology_source_ref_idx").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")),
	index("atlas_ontology_subject_idx").using("btree", table.subjectId.asc().nullsLast().op("text_ops")),
	primaryKey({ columns: [table.objectId, table.origin, table.predicate, table.subjectId, table.version], name: "atlas_ontology_tuples_pkey"}),
]);

export const atlasProjectionState = pgTable("atlas_projection_state", {
	knowledgeId: uuid("knowledge_id").notNull(),
	targetStore: text("target_store").notNull(),
	targetContract: text("target_contract").notNull(),
	projectedVersion: integer("projected_version").notNull(),
	projectionHash: text("projection_hash").notNull(),
	status: text().notNull(),
	projectedAt: timestamp("projected_at", { withTimezone: true, mode: 'string' }),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	lastError: text("last_error"),
}, (table) => [
	index("idx_aps_stale").using("btree", table.knowledgeId.asc().nullsLast().op("uuid_ops")).where(sql`(status = ANY (ARRAY['PENDING'::text, 'FAILED'::text, 'STALE'::text]))`),
	index("idx_aps_status").using("btree", table.targetStore.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.knowledgeId],
			foreignColumns: [atlasKnowledgeObjects.knowledgeId],
			name: "atlas_projection_state_knowledge_id_fkey"
		}),
	primaryKey({ columns: [table.knowledgeId, table.targetContract, table.targetStore], name: "atlas_projection_state_pkey"}),
	check("atlas_projection_state_status_check", sql`status = ANY (ARRAY['PENDING'::text, 'PROJECTED'::text, 'VERIFIED'::text, 'FAILED'::text, 'STALE'::text])`),
	check("atlas_projection_state_target_store_check", sql`target_store = ANY (ARRAY['QDRANT'::text, 'NEO4J'::text, 'TURBOVEC'::text, 'REDIS'::text])`),
]);

export const qdrantClusterMembers = pgTable("qdrant_cluster_members", {
	clusterKey: text("cluster_key").notNull(),
	stableKey: text("stable_key").notNull(),
	qdrantPointId: text("qdrant_point_id").notNull(),
	filePath: text("file_path"),
	directoryPath: text("directory_path"),
	membershipScore: doublePrecision("membership_score").default(1),
	tags: text().array().default([""]),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("qdrant_cluster_members_dir_idx").using("btree", table.directoryPath.asc().nullsLast().op("text_ops")),
	index("qdrant_cluster_members_file_idx").using("btree", table.filePath.asc().nullsLast().op("text_ops")),
	primaryKey({ columns: [table.clusterKey, table.stableKey], name: "qdrant_cluster_members_pkey"}),
]);

export const atlasSchemaRegistry = pgTable("atlas_schema_registry", {
	schemaId: text("schema_id").notNull(),
	schemaVersion: integer("schema_version").notNull(),
	schemaKind: text("schema_kind").notNull(),
	okfSource: text("okf_source").notNull(),
	jsonSchema: jsonb("json_schema").notNull(),
	schemaHash: text("schema_hash").notNull(),
	status: text().default('DRAFT').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	activatedAt: timestamp("activated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_asr_schema_id_status").using("btree", table.schemaId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	primaryKey({ columns: [table.schemaId, table.schemaVersion], name: "atlas_schema_registry_pkey"}),
	unique("atlas_schema_registry_schema_hash_key").on(table.schemaHash),
	check("atlas_schema_registry_schema_kind_check", sql`schema_kind = ANY (ARRAY['packet'::text, 'feature_envelope'::text, 'graph_fact'::text, 'embedding_contract'::text, 'qdrant_projection'::text, 'workflow_state'::text, 'source_ref_contract'::text, 'ast_node_contract'::text, 'ontology_concept_contract'::text])`),
	check("atlas_schema_registry_status_check", sql`status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'DEPRECATED'::text, 'RETIRED'::text])`),
]);

export const atlasGraphEdgesV2 = pgTable("atlas_graph_edges_v2", {
	snapshotId: uuid("snapshot_id").notNull(),
	edgeKey: text("edge_key").notNull(),
	sourceNodeKey: text("source_node_key").notNull(),
	targetNodeKey: text("target_node_key").notNull(),
	edgeType: text("edge_type").notNull(),
	weight: doublePrecision().notNull(),
	confidence: doublePrecision().notNull(),
	provenance: text().notNull(),
	properties: jsonb().default({}).notNull(),
}, (table) => [
	index("atlas_graph_edges_v2_source_idx").using("btree", table.snapshotId.asc().nullsLast().op("text_ops"), table.sourceNodeKey.asc().nullsLast().op("text_ops")),
	index("atlas_graph_edges_v2_target_idx").using("btree", table.snapshotId.asc().nullsLast().op("text_ops"), table.targetNodeKey.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.snapshotId],
			foreignColumns: [atlasGraphSnapshotsV2.snapshotId],
			name: "atlas_graph_edges_v2_snapshot_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.snapshotId, table.sourceNodeKey],
			foreignColumns: [atlasGraphNodesV2.snapshotId, atlasGraphNodesV2.nodeKey],
			name: "atlas_graph_edges_v2_snapshot_id_source_node_key_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.snapshotId, table.targetNodeKey],
			foreignColumns: [atlasGraphNodesV2.snapshotId, atlasGraphNodesV2.nodeKey],
			name: "atlas_graph_edges_v2_snapshot_id_target_node_key_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.edgeKey, table.snapshotId], name: "atlas_graph_edges_v2_pkey"}),
	check("atlas_graph_edges_v2_confidence_check", sql`(confidence >= (0)::double precision) AND (confidence <= (1)::double precision) AND (confidence <> ALL (ARRAY['NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision]))`),
	check("atlas_graph_edges_v2_weight_check", sql`(weight >= (0)::double precision) AND (weight <> ALL (ARRAY['NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision]))`),
]);

export const somAdjacencyMatrix = pgTable("som_adjacency_matrix", {
	sourceCellId: text("source_cell_id").notNull(),
	targetCellId: text("target_cell_id").notNull(),
	sourceRow: integer("source_row").notNull(),
	sourceCol: integer("source_col").notNull(),
	targetRow: integer("target_row").notNull(),
	targetCol: integer("target_col").notNull(),
	direction: text().notNull(),
	distance: doublePrecision().notNull(),
	weight: doublePrecision().notNull(),
	topologyVersion: text("topology_version").default('2026-07-19').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_som_adjacency_source").using("btree", table.sourceRow.asc().nullsLast().op("int4_ops"), table.sourceCol.asc().nullsLast().op("int4_ops")),
	index("idx_som_adjacency_target").using("btree", table.targetRow.asc().nullsLast().op("int4_ops"), table.targetCol.asc().nullsLast().op("int4_ops")),
	primaryKey({ columns: [table.sourceCellId, table.targetCellId], name: "som_adjacency_matrix_pkey"}),
]);

export const topologyPositions = pgTable("topology_positions", {
	snapshotId: uuid("snapshot_id").notNull(),
	stableKey: text("stable_key").notNull(),
	x: doublePrecision(),
	y: doublePrecision(),
	z: doublePrecision(),
	t: doublePrecision(),
	clusterKey: text("cluster_key"),
	topoByte: smallint("topo_byte"),
	sourceKind: text("source_kind"),
	sourceHash: text("source_hash"),
	metadata: jsonb().default({}).notNull(),
}, (table) => [
	index("topology_positions_topo_byte_idx").using("btree", table.topoByte.asc().nullsLast().op("int2_ops")),
	foreignKey({
			columns: [table.snapshotId],
			foreignColumns: [topologySnapshots.id],
			name: "topology_positions_snapshot_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.snapshotId, table.stableKey], name: "topology_positions_pkey"}),
]);

export const atlasGraphAuthorityScoresV2 = pgTable("atlas_graph_authority_scores_v2", {
	runId: uuid("run_id").notNull(),
	snapshotId: uuid("snapshot_id").notNull(),
	nodeKey: text("node_key").notNull(),
	packetKey: text("packet_key"),
	pagerankRaw: doublePrecision("pagerank_raw").notNull(),
	pagerankL1: doublePrecision("pagerank_l1").notNull(),
	authorityPercentile: doublePrecision("authority_percentile").notNull(),
	authorityBand: text("authority_band").notNull(),
	normalizationAppliedBy: text("normalization_applied_by").notNull(),
	topologyHash: text("topology_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("atlas_graph_authority_scores_v2_packet_idx").using("btree", table.snapshotId.asc().nullsLast().op("text_ops"), table.packetKey.asc().nullsLast().op("uuid_ops")).where(sql`(packet_key IS NOT NULL)`),
	foreignKey({
			columns: [table.runId, table.snapshotId],
			foreignColumns: [atlasGraphAuthorityRunsV2.runId, atlasGraphAuthorityRunsV2.snapshotId],
			name: "atlas_graph_authority_scores_v2_run_id_snapshot_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.snapshotId, table.nodeKey],
			foreignColumns: [atlasGraphNodesV2.snapshotId, atlasGraphNodesV2.nodeKey],
			name: "atlas_graph_authority_scores_v2_snapshot_id_node_key_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.nodeKey, table.runId], name: "atlas_graph_authority_scores_v2_pkey"}),
	check("atlas_graph_authority_scores_v2_authority_band_check", sql`authority_band = ANY (ARRAY['very-low'::text, 'low'::text, 'medium'::text, 'high'::text, 'very-high'::text])`),
	check("atlas_graph_authority_scores_v2_authority_percentile_check", sql`(authority_percentile >= (0)::double precision) AND (authority_percentile <= (1)::double precision)`),
	check("atlas_graph_authority_scores_v2_pagerank_l1_check", sql`(pagerank_l1 >= (0)::double precision) AND (pagerank_l1 <= (1)::double precision) AND (pagerank_l1 <> ALL (ARRAY['NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision]))`),
	check("atlas_graph_authority_scores_v2_pagerank_raw_check", sql`(pagerank_raw >= (0)::double precision) AND (pagerank_raw <> ALL (ARRAY['NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision]))`),
]);

export const atlasGraphAuthorityScores = pgTable("atlas_graph_authority_scores", {
	graphSnapshotId: uuid("graph_snapshot_id").notNull(),
	runId: uuid("run_id").notNull(),
	nodeKey: text("node_key").notNull(),
	packetKey: text("packet_key"),
	sourceRef: text("source_ref"),
	pagerankRaw: doublePrecision("pagerank_raw").notNull(),
	pagerankL1: doublePrecision("pagerank_l1").notNull(),
	authorityPercentile: doublePrecision("authority_percentile").notNull(),
	authorityBand: text("authority_band").notNull(),
	normalizationMethod: text("normalization_method").notNull(),
	normalizationAppliedBy: text("normalization_applied_by").notNull(),
	dampingFactor: doublePrecision("damping_factor").notNull(),
	maxIterations: integer("max_iterations").notNull(),
	tolerance: doublePrecision().notNull(),
	didConverge: boolean("did_converge").notNull(),
	ranIterations: integer("ran_iterations").notNull(),
	contractVersion: text("contract_version").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_authority_scores_band").using("btree", table.authorityBand.asc().nullsLast().op("text_ops")),
	index("idx_authority_scores_packet_key").using("btree", table.packetKey.asc().nullsLast().op("text_ops")).where(sql`(packet_key IS NOT NULL)`),
	index("idx_authority_scores_percentile").using("btree", table.authorityPercentile.desc().nullsFirst().op("float8_ops")),
	index("idx_authority_scores_run_id").using("btree", table.runId.asc().nullsLast().op("uuid_ops")),
	index("idx_authority_scores_source_ref").using("btree", table.sourceRef.asc().nullsLast().op("text_ops")).where(sql`(source_ref IS NOT NULL)`),
	primaryKey({ columns: [table.graphSnapshotId, table.nodeKey], name: "atlas_graph_authority_scores_pkey"}),
	check("atlas_graph_authority_scores_authority_band_check", sql`authority_band = ANY (ARRAY['very-low'::text, 'low'::text, 'medium'::text, 'high'::text, 'very-high'::text])`),
	check("atlas_graph_authority_scores_contract_version_check", sql`contract_version = 'atlas.pagerank-authority.v1'::text`),
	check("atlas_graph_authority_scores_normalization_method_check", sql`normalization_method = 'L1Norm'::text`),
]);

export const atlasSourceRefs = pgTable("atlas_source_refs", {
	sourceRefKey: text("source_ref_key").notNull(),
	repoId: text("repo_id").default('deeds-web-app').notNull(),
	sourceType: text("source_type").default('code').notNull(),
	relativePath: text("relative_path"),
	contentHash: text("content_hash").notNull(),
	qualifiedSymbol: text("qualified_symbol"),
	symbolKind: text("symbol_kind"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	startByte: bigint("start_byte", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	endByte: bigint("end_byte", { mode: "number" }),
	startLine: integer("start_line"),
	startColumn: integer("start_column"),
	endLine: integer("end_line"),
	endColumn: integer("end_column"),
	parentSourceRefKey: text("parent_source_ref_key"),
	fragments: jsonb().default([]).notNull(),
	parserName: text("parser_name"),
	parserVersion: text("parser_version"),
	commitSha: text("commit_sha"),
	corpusVersion: text("corpus_version"),
	effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: 'string' }),
	effectiveTo: timestamp("effective_to", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_atlas_source_refs_content_hash").using("btree", table.contentHash.asc().nullsLast().op("text_ops")),
	index("idx_atlas_source_refs_parent").using("btree", table.parentSourceRefKey.asc().nullsLast().op("text_ops")).where(sql`(parent_source_ref_key IS NOT NULL)`),
	index("idx_atlas_source_refs_repo_path").using("btree", table.repoId.asc().nullsLast().op("text_ops"), table.relativePath.asc().nullsLast().op("text_ops")),
	index("idx_atlas_source_refs_symbol_kind").using("btree", table.symbolKind.asc().nullsLast().op("text_ops")).where(sql`(symbol_kind IS NOT NULL)`),
	primaryKey({ columns: [table.repoId, table.sourceRefKey], name: "atlas_source_refs_pkey"}),
	check("atlas_source_refs_source_type_check", sql`source_type = ANY (ARRAY['code'::text, 'legal'::text, 'documentation'::text, 'git'::text, 'video'::text, 'transcript'::text, 'web'::text])`),
	check("atlas_source_refs_symbol_kind_check", sql`(symbol_kind = ANY (ARRAY['file'::text, 'module'::text, 'class'::text, 'interface'::text, 'type'::text, 'function'::text, 'method'::text, 'constructor'::text, 'parameter'::text, 'route'::text, 'schema'::text, 'test'::text, 'call_site'::text, 'import'::text, 'export'::text])) OR (symbol_kind IS NULL)`),
]);
export const vPacketCacheAudit = pgView("v_packet_cache_audit", {	packetKey: text("packet_key"),
	featureId: text("feature_id"),
	cacheState: text("cache_state"),
	cacheTier: integer("cache_tier"),
	retrievalCount: integer("retrieval_count"),
	cacheHits: integer("cache_hits"),
	hitRatePct: numeric("hit_rate_pct"),
	lastRetrieved: timestamp("last_retrieved", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT packet_key, feature_id, cache_state, CASE WHEN cache_state = 'L1:redis'::text THEN 1 WHEN cache_state = 'L2:bifrost'::text THEN 2 WHEN cache_state = 'L3:qdrant'::text THEN 3 WHEN cache_state = 'L4:disk'::text THEN 4 ELSE 5 END AS cache_tier, retrieval_count, cache_hits, CASE WHEN retrieval_count > 0 THEN round(100.0 * cache_hits::numeric / retrieval_count::numeric, 2) ELSE 0::numeric END AS hit_rate_pct, last_retrieved, updated_at FROM atlas_packet_registry WHERE status = 'active'::text ORDER BY ( CASE WHEN cache_state = 'L1:redis'::text THEN 1 WHEN cache_state = 'L2:bifrost'::text THEN 2 WHEN cache_state = 'L3:qdrant'::text THEN 3 WHEN cache_state = 'L4:disk'::text THEN 4 ELSE 5 END), retrieval_count DESC`);

export const vPacketHealthAudit = pgView("v_packet_health_audit", {	packetKey: text("packet_key"),
	featureId: text("feature_id"),
	embeddingStatus: text("embedding_status"),
	healthStatus: text("health_status"),
	qdrantLinked: text("qdrant_linked"),
	neo4JLinked: text("neo4j_linked"),
	cacheStatus: text("cache_status"),
	pagerankScore: real("pagerank_score"),
	authorityBlend: real("authority_blend"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT packet_key, feature_id, embedding_status, CASE WHEN embedding_status = 'complete'::text AND qdrant_point_id IS NOT NULL AND neo4j_node_id IS NOT NULL THEN 'HEALTHY'::text WHEN embedding_status = ANY (ARRAY['missing'::text, 'failed'::text]) THEN 'ERROR'::text WHEN qdrant_point_id IS NULL OR neo4j_node_id IS NULL THEN 'INCOMPLETE'::text ELSE 'WARNING'::text END AS health_status, COALESCE(qdrant_point_id::text, 'missing'::text) AS qdrant_linked, COALESCE(neo4j_node_id, 'missing'::text) AS neo4j_linked, COALESCE(valkey_cache_key, 'not_cached'::text) AS cache_status, pagerank_score, authority_blend, created_at, updated_at FROM atlas_packet_registry WHERE status = 'active'::text ORDER BY ( CASE WHEN embedding_status = 'complete'::text AND qdrant_point_id IS NOT NULL AND neo4j_node_id IS NOT NULL THEN 'HEALTHY'::text WHEN embedding_status = ANY (ARRAY['missing'::text, 'failed'::text]) THEN 'ERROR'::text WHEN qdrant_point_id IS NULL OR neo4j_node_id IS NULL THEN 'INCOMPLETE'::text ELSE 'WARNING'::text END), updated_at DESC`);

export const vAtlasIdHierarchyCoverage = pgView("v_atlas_id_hierarchy_coverage", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalPackets: bigint("total_packets", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	repositoryIdPopulated: bigint("repository_id_populated", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	directoryIdPopulated: bigint("directory_id_populated", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileIdPopulated: bigint("file_id_populated", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	moduleIdPopulated: bigint("module_id_populated", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	symbolIdPopulated: bigint("symbol_id_populated", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	chunkIdPopulated: bigint("chunk_id_populated", { mode: "number" }),
	repositoryIdPct: numeric("repository_id_pct"),
	directoryIdPct: numeric("directory_id_pct"),
	fileIdPct: numeric("file_id_pct"),
	moduleIdPct: numeric("module_id_pct"),
	symbolIdPct: numeric("symbol_id_pct"),
	chunkIdPct: numeric("chunk_id_pct"),
}).as(sql`SELECT count(*) AS total_packets, count(repository_id) AS repository_id_populated, count(directory_id) AS directory_id_populated, count(file_id) AS file_id_populated, count(module_id) AS module_id_populated, count(symbol_id) AS symbol_id_populated, count(chunk_id) AS chunk_id_populated, round(100.0 * count(repository_id)::numeric / count(*)::numeric, 2) AS repository_id_pct, round(100.0 * count(directory_id)::numeric / count(*)::numeric, 2) AS directory_id_pct, round(100.0 * count(file_id)::numeric / count(*)::numeric, 2) AS file_id_pct, round(100.0 * count(module_id)::numeric / count(*)::numeric, 2) AS module_id_pct, round(100.0 * count(symbol_id)::numeric / count(*)::numeric, 2) AS symbol_id_pct, round(100.0 * count(chunk_id)::numeric / count(*)::numeric, 2) AS chunk_id_pct FROM atlas_packets`);

export const vLatentVectorValidationGap = pgView("v_latent_vector_validation_gap", {	encoderId: text("encoder_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalPackets: bigint("total_packets", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	validated: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	invalid: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unchecked: bigint({ mode: "number" }),
	validationCoveragePct: numeric("validation_coverage_pct"),
}).as(sql`SELECT encoder_id, count(*) AS total_packets, count( CASE WHEN latent_embedding_valid = true THEN 1 ELSE NULL::integer END) AS validated, count( CASE WHEN latent_embedding_valid = false THEN 1 ELSE NULL::integer END) AS invalid, count( CASE WHEN latent_embedding_valid IS NULL THEN 1 ELSE NULL::integer END) AS unchecked, round(100.0 * count( CASE WHEN latent_embedding_valid = true THEN 1 ELSE NULL::integer END)::numeric / count(*)::numeric, 2) AS validation_coverage_pct FROM codebase_chunk_index WHERE latent_64 IS NOT NULL GROUP BY encoder_id ORDER BY encoder_id`);

export const vEncoderValidationSummary = pgView("v_encoder_validation_summary", {	encoderId: text("encoder_id"),
	encoderType: varchar("encoder_type", { length: 50 }),
	status: varchar({ length: 50 }),
	validationPassed: boolean("validation_passed"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsUsingEncoder: bigint("packets_using_encoder", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsValidated: bigint("packets_validated", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsInvalid: bigint("packets_invalid", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsUnchecked: bigint("packets_unchecked", { mode: "number" }),
	reconstructionMse: real("reconstruction_mse"),
	validationPassedAt: timestamp("validation_passed_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT ep.encoder_id, ep.encoder_type, ep.status, ep.validation_passed, count(DISTINCT cci.id) AS packets_using_encoder, count(DISTINCT CASE WHEN cci.latent_embedding_valid = true THEN cci.id ELSE NULL::uuid END) AS packets_validated, count(DISTINCT CASE WHEN cci.latent_embedding_valid = false THEN cci.id ELSE NULL::uuid END) AS packets_invalid, count(DISTINCT CASE WHEN cci.latent_embedding_valid IS NULL THEN cci.id ELSE NULL::uuid END) AS packets_unchecked, ep.reconstruction_mse, ep.validation_passed_at FROM encoder_provenance ep LEFT JOIN codebase_chunk_index cci ON ep.encoder_id = cci.encoder_id WHERE ep.status::text <> 'archived'::text GROUP BY ep.encoder_id, ep.encoder_type, ep.status, ep.validation_passed, ep.reconstruction_mse, ep.validation_passed_at ORDER BY ep.status DESC, ep.validation_passed DESC`);

export const mvClusterPacketInteractions = pgMaterializedView("mv_cluster_packet_interactions", {	queryClusterId: text("query_cluster_id"),
	packetKey: text("packet_key"),
	sourceRef: text("source_ref"),
	implicitScore: doublePrecision("implicit_score"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	eventCount: bigint("event_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	exposureCount: bigint("exposure_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	acceptanceCount: bigint("acceptance_count", { mode: "number" }),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT query_cluster_id, packet_key, source_ref, sum( CASE event_type WHEN 'cited'::text THEN 4.0::double precision WHEN 'accepted'::text THEN 4.0::double precision WHEN 'copied'::text THEN 2.0::double precision WHEN 'opened'::text THEN 1.0::double precision WHEN 'dwell_time'::text THEN LEAST(COALESCE(event_value, 0::real) * 0.1::double precision, 5.0::double precision) ELSE 0.0::double precision END) AS implicit_score, count(*) AS event_count, count(*) FILTER (WHERE event_type = 'exposed'::text) AS exposure_count, count(*) FILTER (WHERE event_type = ANY (ARRAY['opened'::text, 'copied'::text, 'cited'::text, 'accepted'::text])) AS acceptance_count, max(occurred_at) AS last_seen_at FROM recommendation_events WHERE query_cluster_id IS NOT NULL GROUP BY query_cluster_id, packet_key, source_ref`);

export const semanticSignalsAudit = pgView("semantic_signals_audit", {	id: uuid(),
	lifecycleState: varchar("lifecycle_state", { length: 50 }),
	stateReason: text("state_reason"),
	stateChangedAt: timestamp("state_changed_at", { withTimezone: true, mode: 'string' }),
	stateChangedBy: varchar("state_changed_by", { length: 255 }),
	eventId: uuid("event_id"),
	previousState: varchar("previous_state", { length: 50 }),
	newState: varchar("new_state", { length: 50 }),
	reason: text(),
	actorId: varchar("actor_id", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT ss.id, ss.lifecycle_state, ss.state_reason, ss.state_changed_at, ss.state_changed_by, sle.id AS event_id, sle.previous_state, sle.new_state, sle.reason, sle.actor_id, sle.created_at FROM semantic_signals ss LEFT JOIN semantic_lifecycle_events sle ON sle.entity_id = ss.id AND sle.entity_type::text = 'semantic_signal'::text ORDER BY sle.created_at DESC`);

export const semanticSignalHistory = pgView("semantic_signal_history", {	entityId: uuid("entity_id"),
	entityType: varchar("entity_type", { length: 50 }),
	previousState: varchar("previous_state", { length: 50 }),
	newState: varchar("new_state", { length: 50 }),
	reason: text(),
	actorId: varchar("actor_id", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT entity_id, entity_type, previous_state, new_state, reason, actor_id, created_at FROM semantic_lifecycle_events WHERE entity_type::text = 'semantic_signal'::text ORDER BY created_at DESC`);

export const ontologyCoverage = pgView("ontology_coverage", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsWithOntology: bigint("packets_with_ontology", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsWithNodeType: bigint("packets_with_node_type", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsWithTitle: bigint("packets_with_title", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsWithSummary: bigint("packets_with_summary", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsWithKeywords: bigint("packets_with_keywords", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsWithParameters: bigint("packets_with_parameters", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalPackets: bigint("total_packets", { mode: "number" }),
	enrichmentPct: numeric("enrichment_pct"),
}).as(sql`SELECT count(*) FILTER (WHERE ontology IS NOT NULL) AS packets_with_ontology, count(*) FILTER (WHERE (ontology -> 'node_type'::text) IS NOT NULL) AS packets_with_node_type, count(*) FILTER (WHERE (ontology ->> 'title'::text) IS NOT NULL) AS packets_with_title, count(*) FILTER (WHERE (ontology ->> 'summary'::text) IS NOT NULL) AS packets_with_summary, count(*) FILTER (WHERE (ontology -> 'keywords'::text) IS NOT NULL AND jsonb_array_length(ontology -> 'keywords'::text) > 0) AS packets_with_keywords, count(*) FILTER (WHERE (ontology -> 'parameters'::text) IS NOT NULL) AS packets_with_parameters, count(*) AS total_packets, round(100.0 * count(*) FILTER (WHERE ontology IS NOT NULL)::numeric / NULLIF(count(*), 0)::numeric, 2) AS enrichment_pct FROM atlas_packets`);

export const registryProjectionStats = pgView("registry_projection_stats", {	projectionType: text("projection_type"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalRows: bigint("total_rows", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	uniquePackets: bigint("unique_packets", { mode: "number" }),
	firstMaterialized: timestamp("first_materialized", { mode: 'string' }),
	lastUpdated: timestamp("last_updated", { mode: 'string' }),
}).as(sql`SELECT 'enrichment'::text AS projection_type, count(*) AS total_rows, count(DISTINCT registry_enrichment_projection.packet_key) AS unique_packets, min(registry_enrichment_projection.created_at) AS first_materialized, max(registry_enrichment_projection.updated_at) AS last_updated FROM registry_enrichment_projection UNION ALL SELECT 'embedding'::text AS projection_type, count(*) AS total_rows, count(DISTINCT registry_embedding_identity.packet_key) AS unique_packets, min(registry_embedding_identity.created_at) AS first_materialized, max(registry_embedding_identity.updated_at) AS last_updated FROM registry_embedding_identity UNION ALL SELECT 'topology'::text AS projection_type, count(*) AS total_rows, count(DISTINCT registry_topology_projection.packet_key) AS unique_packets, min(registry_topology_projection.created_at) AS first_materialized, max(registry_topology_projection.updated_at) AS last_updated FROM registry_topology_projection UNION ALL SELECT 'ontology'::text AS projection_type, count(*) AS total_rows, count(DISTINCT registry_ontology_tuples.packet_key) AS unique_packets, min(registry_ontology_tuples.created_at) AS first_materialized, max(registry_ontology_tuples.updated_at) AS last_updated FROM registry_ontology_tuples`);

export const featureExtractionCoverage = pgView("feature_extraction_coverage", {	extractionType: text("extraction_type"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsCovered: bigint("packets_covered", { mode: "number" }),
	coveragePct: numeric("coverage_pct"),
	avgAstNodes: numeric("avg_ast_nodes"),
	lastUpdated: timestamp("last_updated", { mode: 'string' }),
}).as(sql`SELECT 'structural'::text AS extraction_type, count(DISTINCT feature_structural.packet_key) AS packets_covered, count(DISTINCT feature_structural.packet_key)::numeric * 100.0 / (( SELECT count(*) AS count FROM atlas_packets))::numeric AS coverage_pct, avg(feature_structural.node_count) AS avg_ast_nodes, max(feature_structural.updated_at) AS last_updated FROM feature_structural UNION ALL SELECT 'lexical'::text AS extraction_type, count(DISTINCT feature_lexical.packet_key) AS packets_covered, count(DISTINCT feature_lexical.packet_key)::numeric * 100.0 / (( SELECT count(*) AS count FROM atlas_packets))::numeric AS coverage_pct, avg(feature_lexical.token_count) AS avg_ast_nodes, max(feature_lexical.updated_at) AS last_updated FROM feature_lexical UNION ALL SELECT 'domain'::text AS extraction_type, count(DISTINCT feature_domain.packet_key) AS packets_covered, count(DISTINCT feature_domain.packet_key)::numeric * 100.0 / (( SELECT count(*) AS count FROM atlas_packets))::numeric AS coverage_pct, count(DISTINCT feature_domain.domain_class) AS avg_ast_nodes, max(feature_domain.updated_at) AS last_updated FROM feature_domain`);

export const ontologyDomainCoverage = pgView("ontology_domain_coverage", {	domainClass: text("domain_class"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetsWithDomain: bigint("packets_with_domain", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalTuples: bigint("total_tuples", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	uniqueSubjects: bigint("unique_subjects", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	uniquePredicates: bigint("unique_predicates", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	uniqueObjects: bigint("unique_objects", { mode: "number" }),
	avgConfidence: doublePrecision("avg_confidence"),
	earliestTuple: timestamp("earliest_tuple", { mode: 'string' }),
	latestUpdate: timestamp("latest_update", { mode: 'string' }),
}).as(sql`SELECT domain_class, count(DISTINCT packet_key) AS packets_with_domain, count(*) AS total_tuples, count(DISTINCT subject) AS unique_subjects, count(DISTINCT predicate) AS unique_predicates, count(DISTINCT object) AS unique_objects, avg(confidence) AS avg_confidence, min(created_at) AS earliest_tuple, max(updated_at) AS latest_update FROM ontology_domain_tuples GROUP BY domain_class`);

export const featureLayerCoverage = pgView("feature_layer_coverage", {	tableName: text("table_name"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalRows: bigint("total_rows", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetKeyCount: bigint("packet_key_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceRefCount: bigint("source_ref_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	bothCount: bigint("both_count", { mode: "number" }),
}).as(sql`SELECT 'feature_implementations'::text AS table_name, count(*) AS total_rows, count( CASE WHEN feature_implementations.packet_key IS NOT NULL THEN 1 ELSE NULL::integer END) AS packet_key_count, count( CASE WHEN feature_implementations.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS source_ref_count, count( CASE WHEN feature_implementations.packet_key IS NOT NULL AND feature_implementations.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS both_count FROM feature_implementations UNION ALL SELECT 'feature_file_edges'::text AS table_name, count(*) AS total_rows, count( CASE WHEN feature_file_edges.packet_key IS NOT NULL THEN 1 ELSE NULL::integer END) AS packet_key_count, count( CASE WHEN feature_file_edges.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS source_ref_count, count( CASE WHEN feature_file_edges.packet_key IS NOT NULL AND feature_file_edges.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS both_count FROM feature_file_edges UNION ALL SELECT 'feature_lexical_facts'::text AS table_name, count(*) AS total_rows, count( CASE WHEN feature_lexical_facts.packet_key IS NOT NULL THEN 1 ELSE NULL::integer END) AS packet_key_count, count( CASE WHEN feature_lexical_facts.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS source_ref_count, count( CASE WHEN feature_lexical_facts.packet_key IS NOT NULL AND feature_lexical_facts.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS both_count FROM feature_lexical_facts UNION ALL SELECT 'feature_domain_facts'::text AS table_name, count(*) AS total_rows, count( CASE WHEN feature_domain_facts.packet_key IS NOT NULL THEN 1 ELSE NULL::integer END) AS packet_key_count, count( CASE WHEN feature_domain_facts.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS source_ref_count, count( CASE WHEN feature_domain_facts.packet_key IS NOT NULL AND feature_domain_facts.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS both_count FROM feature_domain_facts UNION ALL SELECT 'feature_structural_facts'::text AS table_name, count(*) AS total_rows, count( CASE WHEN feature_structural_facts.packet_key IS NOT NULL THEN 1 ELSE NULL::integer END) AS packet_key_count, count( CASE WHEN feature_structural_facts.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS source_ref_count, count( CASE WHEN feature_structural_facts.packet_key IS NOT NULL AND feature_structural_facts.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS both_count FROM feature_structural_facts UNION ALL SELECT 'feature_ontology_tuples'::text AS table_name, count(*) AS total_rows, count( CASE WHEN feature_ontology_tuples.packet_key IS NOT NULL THEN 1 ELSE NULL::integer END) AS packet_key_count, count( CASE WHEN feature_ontology_tuples.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS source_ref_count, count( CASE WHEN feature_ontology_tuples.packet_key IS NOT NULL AND feature_ontology_tuples.source_ref IS NOT NULL THEN 1 ELSE NULL::integer END) AS both_count FROM feature_ontology_tuples`);

export const parentAtlasDocuments = pgView("parent_atlas_documents", {	id: text(),
	sourceRef: text("source_ref"),
	relPath: text("rel_path"),
	featureId: text("feature_id"),
	lineCount: integer("line_count"),
	isRoute: boolean("is_route"),
	isSvelteComp: boolean("is_svelte_comp"),
	hasZod: boolean("has_zod"),
	drizzleRefs: text("drizzle_refs"),
	imports: text(),
	exports: text(),
	qdrantPointId: text("qdrant_point_id"),
	relatedFeatureIds: text("related_feature_ids"),
	hasAuth: boolean("has_auth"),
	routeHandlers: text("route_handlers"),
	tags: text(),
	clusterId: text("cluster_id"),
	centroidId: text("centroid_id"),
	packetKey: text("packet_key"),
	featureLabel: text("feature_label"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT packet_key AS id, source_ref, directory_path AS rel_path, feature_id, COALESCE((payload ->> 'line_count'::text)::integer, 0) AS line_count, COALESCE((payload ->> 'is_route'::text)::boolean, false) AS is_route, COALESCE((payload ->> 'is_svelte_comp'::text)::boolean, false) AS is_svelte_comp, COALESCE((payload ->> 'has_zod'::text)::boolean, false) AS has_zod, COALESCE(ARRAY( SELECT jsonb_array_elements_text(ap.payload -> 'drizzle_refs'::text) AS jsonb_array_elements_text), ARRAY[]::text[]) AS drizzle_refs, COALESCE(ARRAY( SELECT jsonb_array_elements_text(ap.payload -> 'imports'::text) AS jsonb_array_elements_text), ARRAY[]::text[]) AS imports, COALESCE(ARRAY( SELECT jsonb_array_elements_text(ap.payload -> 'exports'::text) AS jsonb_array_elements_text), ARRAY[]::text[]) AS exports, qdrant_point_id, COALESCE(ARRAY( SELECT jsonb_array_elements_text(ap.payload -> 'related_feature_ids'::text) AS jsonb_array_elements_text), ARRAY[]::text[]) AS related_feature_ids, COALESCE((payload ->> 'has_auth'::text)::boolean, false) AS has_auth, COALESCE(ARRAY( SELECT jsonb_array_elements_text(ap.payload -> 'route_handlers'::text) AS jsonb_array_elements_text), ARRAY[]::text[]) AS route_handlers, COALESCE(tags, ARRAY[]::text[]) AS tags, kmeans_cluster::text AS cluster_id, som_cluster AS centroid_id, packet_key, feature_label, created_at FROM atlas_packets ap WHERE source_ref IS NOT NULL`);

export const vAtlasPacketsMultiDomain = pgView("v_atlas_packets_multi_domain", {	packetKey: text("packet_key"),
	sourceRef: text("source_ref"),
	featureId: text("feature_id"),
	phase1SingleDomain: varchar("phase1_single_domain", { length: 255 }),
	phase15PrimaryDomain: text("phase1_5_primary_domain"),
	domainConfidence: doublePrecision("domain_confidence"),
	domainMemberships: jsonb("domain_memberships"),
	domainProbDatabase: real("domain_prob_database"),
	domainProbRetrieval: real("domain_prob_retrieval"),
	domainProbTypescript: real("domain_prob_typescript"),
	domainProbDistributed: real("domain_prob_distributed"),
	domainProbDocker: real("domain_prob_docker"),
	domainProbMachineLearning: real("domain_prob_machine_learning"),
	domainProbPython: real("domain_prob_python"),
	domainProbCuda: real("domain_prob_cuda"),
}).as(sql`SELECT packet_key, source_ref, feature_id, domain_class AS phase1_single_domain, primary_domain AS phase1_5_primary_domain, domain_confidence, domain_memberships, (domain_memberships ->> 'database'::text)::real AS domain_prob_database, (domain_memberships ->> 'retrieval'::text)::real AS domain_prob_retrieval, (domain_memberships ->> 'typescript'::text)::real AS domain_prob_typescript, (domain_memberships ->> 'distributed'::text)::real AS domain_prob_distributed, (domain_memberships ->> 'docker'::text)::real AS domain_prob_docker, (domain_memberships ->> 'machine_learning'::text)::real AS domain_prob_machine_learning, (domain_memberships ->> 'python'::text)::real AS domain_prob_python, (domain_memberships ->> 'cuda'::text)::real AS domain_prob_cuda FROM atlas_packets ap WHERE domain_memberships IS NOT NULL`);

export const vAtlasDomainRoutingStats = pgView("v_atlas_domain_routing_stats", {	domainKey: text("domain_key"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	packetCount: bigint("packet_count", { mode: "number" }),
	avgProbability: doublePrecision("avg_probability"),
	maxProbability: real("max_probability"),
	minProbability: real("min_probability"),
}).as(sql`SELECT domain_key, count(*) AS packet_count, avg(probability) AS avg_probability, max(probability) AS max_probability, min(probability) AS min_probability FROM ( SELECT ap.packet_key, d.domain_key, d.probability FROM atlas_packets ap CROSS JOIN LATERAL get_domain_probabilities(ap.domain_memberships) d(domain_key, probability)) domain_data GROUP BY domain_key ORDER BY (count(*)) DESC`);

export const toolExecutionStats7D = pgMaterializedView("tool_execution_stats_7d", {	toolId: text("tool_id"),
	successCount: integer("success_count"),
	failureCount: integer("failure_count"),
	avgLatencyMs: real("avg_latency_ms"),
	timeoutCount: integer("timeout_count"),
	schemaMismatchCount: integer("schema_mismatch_count"),
	rollingSuccessRate: real("rolling_success_rate"),
	lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT tool_id, sum( CASE WHEN success = 1 THEN 1 ELSE 0 END)::integer AS success_count, sum( CASE WHEN success = 0 THEN 1 ELSE 0 END)::integer AS failure_count, COALESCE(avg(latency_ms)::real, 0::real) AS avg_latency_ms, sum( CASE WHEN error_type = 'timeout'::text THEN 1 ELSE 0 END)::integer AS timeout_count, sum( CASE WHEN error_type = 'schema_mismatch'::text THEN 1 ELSE 0 END)::integer AS schema_mismatch_count, sum( CASE WHEN success = 1 THEN 1 ELSE 0 END)::real / NULLIF(count(*)::real, 0::double precision) AS rolling_success_rate, now() AS last_refreshed_at FROM tool_execution_log WHERE "timestamp" > (now() - '7 days'::interval) GROUP BY tool_id`);

export const signalsEligibleForArchive = pgView("signals_eligible_for_archive", {	id: uuid(),
	lifecycleState: varchar("lifecycle_state", { length: 50 }),
	stateChangedAt: timestamp("state_changed_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT id, lifecycle_state, state_changed_at FROM semantic_signals WHERE lifecycle_state::text = ANY (ARRAY['ACTIVE'::character varying, 'SUPERSEDED'::character varying]::text[])`);

export const signalsEligibleForPurge = pgView("signals_eligible_for_purge", {	id: uuid(),
	lifecycleState: varchar("lifecycle_state", { length: 50 }),
	retentionUntil: timestamp("retention_until", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT id, lifecycle_state, retention_until FROM semantic_signals WHERE lifecycle_state::text = 'PURGE_PENDING'::text AND retention_until < now()`);
