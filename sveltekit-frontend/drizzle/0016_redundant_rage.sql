CREATE TYPE "public"."case_link_category" AS ENUM('charged_under', 'cited_authority', 'defense_authority', 'court_ruling', 'related_regulation', 'constitutional_basis', 'sentencing_guideline', 'glossary_concept');--> statement-breakpoint
CREATE TYPE "public"."citation_type" AS ENUM('statutory', 'constitutional', 'regulatory', 'judicial', 'other');--> statement-breakpoint
CREATE TYPE "public"."corpus_type" AS ENUM('constitution', 'statute', 'regulation', 'bill', 'case', 'glossary', 'treatise', 'other');--> statement-breakpoint
CREATE TYPE "public"."legal_node_type" AS ENUM('document', 'title', 'article', 'amendment', 'chapter', 'part', 'section', 'subsection', 'paragraph', 'clause', 'definition', 'appendix', 'note');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('queued', 'extracting', 'ocr', 'structuring', 'chunking', 'embedding', 'graphing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('upload', 'govinfo', 'state_official', 'openstates', 'lii_reference');--> statement-breakpoint
CREATE TYPE "public"."authority_level" AS ENUM('primary', 'persuasive', 'secondary', 'fictional');--> statement-breakpoint
CREATE TYPE "public"."courtroom_anim_type" AS ENUM('idle', 'speaking', 'objection', 'walk', 'gesture', 'point', 'sit', 'stand', 'present_evidence', 'react_surprised', 'react_angry', 'react_sad', 'nod', 'shake_head');--> statement-breakpoint
CREATE TYPE "public"."fictional_actor_role" AS ENUM('defendant', 'prosecutor', 'judge', 'defense_attorney', 'witness', 'victim', 'agent', 'expert_witness', 'informant');--> statement-breakpoint
CREATE TYPE "public"."fictional_case_category" AS ENUM('wire_fraud', 'drug_trafficking', 'firearms', 'cybercrime', 'obstruction', 'verbal_contracts', 'tort_federal', 'federal_employee_liability');--> statement-breakpoint
CREATE TYPE "public"."inference_backend" AS ENUM('ollama', 'tensorrt', 'bifrost', 'litellm', 'pytorch', 'onnx');--> statement-breakpoint
CREATE TYPE "public"."model_capability" AS ENUM('chat', 'embedding', 'vlm', 'code', 'summarization', 'rerank');--> statement-breakpoint
CREATE TYPE "public"."service_tier" AS ENUM('core', 'data', 'inference', 'future');--> statement-breakpoint
ALTER TYPE "public"."case_status" ADD VALUE 'active';--> statement-breakpoint
ALTER TYPE "public"."case_status" ADD VALUE 'pending';--> statement-breakpoint
ALTER TYPE "public"."case_status" ADD VALUE 'under_review';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'investigator';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'viewer';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'user';--> statement-breakpoint
CREATE TABLE "case_library_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"document_id" uuid,
	"node_id" uuid,
	"category" "case_link_category" DEFAULT 'cited_authority' NOT NULL,
	"relevance_score" real,
	"citation_text" text,
	"notes" text,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunk_hit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chunk_id" text NOT NULL,
	"relative_path" text DEFAULT '' NOT NULL,
	"gpu_cluster" integer,
	"som_cluster" integer,
	"pipeline" text NOT NULL,
	"query_hash" varchar(16) NOT NULL,
	"score" real,
	"rerank_score" real,
	"user_id" uuid,
	"case_id" uuid,
	"hit_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"stage" "processing_status" DEFAULT 'queued' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"progress" numeric(5, 2) DEFAULT '0',
	"error_text" text,
	"metrics_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"parent_id" bigserial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jurisdictions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "legal_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_node_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"token_count" integer,
	"page_start" integer,
	"page_end" integer,
	"char_start" integer,
	"char_end" integer,
	"embedding" vector(768),
	"summary" text,
	"qdrant_point_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_chunks_node_chunk_uniq" UNIQUE("legal_node_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "legal_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_node_id" uuid NOT NULL,
	"to_node_id" uuid,
	"citation_text" text NOT NULL,
	"citation_type" "citation_type" DEFAULT 'other' NOT NULL,
	"normalized_target" text,
	"confidence" real DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"normalized_term" text NOT NULL,
	"defined_in_node_id" uuid,
	"definition_text" text NOT NULL,
	"confidence" real DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid,
	"parent_node_id" uuid,
	"node_type" "legal_node_type" DEFAULT 'section' NOT NULL,
	"ordinal" text,
	"heading" text,
	"citation_label" text,
	"node_path" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"char_start" integer,
	"char_end" integer,
	"full_text" text NOT NULL,
	"text_clean" text NOT NULL,
	"tags_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_label" text,
	"source_date" timestamp,
	"is_current" boolean DEFAULT false,
	"parent_version_id" uuid,
	"diff_summary" text,
	"amendment_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" "source_type" DEFAULT 'upload' NOT NULL,
	"corpus_type" "corpus_type" DEFAULT 'other' NOT NULL,
	"jurisdiction_id" integer,
	"title" text NOT NULL,
	"short_title" text,
	"citation" text,
	"official_url" text,
	"source_hash" text,
	"source_confidence" text DEFAULT 'medium',
	"source_kind" text DEFAULT 'uploaded_pdf',
	"mime_type" text DEFAULT 'application/pdf',
	"minio_key" text NOT NULL,
	"minio_key_normalized" text,
	"page_count" integer,
	"effective_date" timestamp,
	"updated_at_source" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	"is_official" boolean DEFAULT false,
	"processing_status" "processing_status" DEFAULT 'queued' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"image_minio_key" text,
	"extracted_text" text,
	"ocr_text" text,
	"final_text" text,
	"has_native_text" boolean DEFAULT false,
	"ocr_confidence" numeric(5, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_artifacts_doc_page_uniq" UNIQUE("document_id","page_number")
);
--> statement-breakpoint
CREATE TABLE "qlora_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text,
	"query_hash" varchar(16) NOT NULL,
	"instruction" text NOT NULL,
	"context_chunks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"graph_summary" text,
	"response" text NOT NULL,
	"quality_tier" varchar(20),
	"response_score" real,
	"avg_rerank_score" real,
	"gpu_clusters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"som_clusters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pipeline_hits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"entity_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_version" varchar(50),
	"dataset_split" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "query_variance_pairs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"query_hash_a" varchar(16) NOT NULL,
	"query_hash_b" varchar(16) NOT NULL,
	"query_a" text NOT NULL,
	"query_b" text NOT NULL,
	"similarity" real NOT NULL,
	"hit_count" integer DEFAULT 1 NOT NULL,
	"pipeline" text,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_query_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"case_id" uuid,
	"query" text NOT NULL,
	"query_hash" varchar(16) NOT NULL,
	"entity_statutes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entity_cases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_entity_tags" integer DEFAULT 0 NOT NULL,
	"total_found" integer DEFAULT 0 NOT NULL,
	"search_time_ms" integer,
	"rerank_time_ms" integer,
	"rerank_l0_hit" boolean DEFAULT false NOT NULL,
	"rerank_l1_hits" integer DEFAULT 0 NOT NULL,
	"rerank_fresh_scored" integer DEFAULT 0 NOT NULL,
	"top_chunk_id" varchar(255),
	"top_chunk_score" real,
	"top_rerank_score" real,
	"dag_enabled" boolean DEFAULT true NOT NULL,
	"dag_status" varchar(20),
	"hybrid_search" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" text NOT NULL,
	"user_id" uuid,
	"rating" varchar(4) NOT NULL,
	"pipeline" text,
	"chunk_ids" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "state_constitution_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"state_code" text NOT NULL,
	"state_name" text NOT NULL,
	"discovery_url" text NOT NULL,
	"source_url" text,
	"format" text DEFAULT 'html',
	"is_official" boolean DEFAULT false,
	"source_confidence" text DEFAULT 'medium',
	"crawler_type" text DEFAULT 'html',
	"last_fetched_at" timestamp with time zone,
	"last_hash" text,
	"last_fetch_status" text,
	"document_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "state_constitution_sources_state_code_unique" UNIQUE("state_code")
);
--> statement-breakpoint
CREATE TABLE "user_analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" varchar(100),
	"event_type" varchar(100) NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ace_context_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" text NOT NULL,
	"user_id" uuid,
	"policy_tier" varchar(30) NOT NULL,
	"context_json" jsonb NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cache_source" varchar(20) DEFAULT 'miss' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"endpoint" varchar(255) NOT NULL,
	"model" varchar(100) NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"cached" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"user_id" uuid,
	"session_id" varchar(255),
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar(64),
	"method" varchar(10) NOT NULL,
	"path" varchar(500) NOT NULL,
	"status_code" integer NOT NULL,
	"duration_ms" integer,
	"user_id" uuid,
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"request_body_size" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"duration" real NOT NULL,
	"full_text" text NOT NULL,
	"segment_count" integer DEFAULT 0 NOT NULL,
	"whisper_model" varchar(50),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" varchar(200) NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"token_count" integer,
	"semantic_label" varchar(200),
	"domains" jsonb DEFAULT '[]'::jsonb,
	"key_terms" jsonb DEFAULT '[]'::jsonb,
	"embedding" vector(768),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_chunks_chunk_id_unique" UNIQUE("chunk_id")
);
--> statement-breakpoint
CREATE TABLE "canonical_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"doc_type" varchar(100) NOT NULL,
	"citation" varchar(500),
	"jurisdiction" "jurisdiction" NOT NULL,
	"authority_level" "authority_level" NOT NULL,
	"source_url" text,
	"source_name" varchar(200),
	"license_tag" varchar(100),
	"retrieved_at" timestamp with time zone,
	"full_text" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_document_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_session_id" uuid NOT NULL,
	"document_id" uuid,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"file_type" varchar(100),
	"minio_path" varchar(500),
	"upload_timestamp" timestamp with time zone DEFAULT now(),
	"embedding_status" varchar(50) DEFAULT 'pending',
	"qdrant_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "cluster_narratives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" integer NOT NULL,
	"k" integer DEFAULT 20 NOT NULL,
	"summary" text NOT NULL,
	"purpose" text NOT NULL,
	"patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cross_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"dominant_ast_cluster" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"narrative_embedding" vector(768),
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cluster_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" text DEFAULT 'default' NOT NULL,
	"gpu_cluster" integer NOT NULL,
	"summary" text NOT NULL,
	"purpose" text,
	"patterns" text[],
	"warnings" text[],
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"representative_chunk_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"centroid_distance_mean" real,
	"summary_model" varchar(100),
	"summary_embedding" vector(768),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cluster_summaries_repo_cluster_uq" UNIQUE("repo_id","gpu_cluster")
);
--> statement-breakpoint
CREATE TABLE "codebase_audit_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"created_by" uuid,
	"report_type" varchar(50) DEFAULT 'full' NOT NULL,
	"cuda_available" boolean DEFAULT false NOT NULL,
	"gpu_memory_mb" integer,
	"gpu_memory_free_mb" integer,
	"graph_analysis" jsonb,
	"evidence_analysis" jsonb,
	"codebase_analysis" jsonb,
	"duration_ms" integer NOT NULL,
	"graph_duration_ms" integer,
	"evidence_duration_ms" integer,
	"codebase_duration_ms" integer,
	"status" varchar(32) DEFAULT 'completed' NOT NULL,
	"error" text,
	"cache_key" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codebase_chunk_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qdrant_id" varchar(64),
	"repo_id" uuid,
	"relative_path" text NOT NULL,
	"symbol" varchar(255),
	"kind" varchar(50),
	"domain" varchar(50),
	"language" varchar(20),
	"extension" varchar(20),
	"line_start" integer,
	"line_end" integer,
	"token_count" integer,
	"content" text,
	"content_hash" text,
	"summary" text,
	"gpu_cluster" integer,
	"som_cluster" integer,
	"neo4j_gpu_cluster" integer,
	"community_id" integer,
	"page_rank_score" real,
	"semantic_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"neo4j_meta" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding_model" varchar(100),
	"summary_model" varchar(100),
	"summary_embedding" vector(768),
	"signature_embedding" vector(768),
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enriched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codebase_chunk_index_qdrant_id_key" UNIQUE("qdrant_id")
);
--> statement-breakpoint
CREATE TABLE "context_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" text DEFAULT '' NOT NULL,
	"event_type" text NOT NULL,
	"pipeline" text DEFAULT 'ace' NOT NULL,
	"summary_id" uuid,
	"hyperedge_hash" varchar(8),
	"signal" text,
	"grpo_reward" real,
	"pipeline_weight_after" real,
	"triggered_rebuild" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courtroom_animations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"anim_type" "courtroom_anim_type" NOT NULL,
	"animation_url" varchar(500) NOT NULL,
	"duration_ms" integer NOT NULL,
	"loop" boolean DEFAULT false NOT NULL,
	"blend_weight" real DEFAULT 1 NOT NULL,
	"skeleton_type" varchar(50) DEFAULT 'mixamo' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courtroom_keyframes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"time_ms" integer NOT NULL,
	"character_role" varchar(50) NOT NULL,
	"anim_type" "courtroom_anim_type" NOT NULL,
	"animation_id" uuid,
	"pos_x" real,
	"pos_y" real,
	"pos_z" real,
	"rot_y" real,
	"camera_view" varchar(50),
	"dialogue_turn" integer,
	"effect" varchar(50),
	"evidence_url" varchar(500),
	"phase" varchar(50),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courtroom_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" varchar(50) NOT NULL,
	"model_url" varchar(500) NOT NULL,
	"thumbnail_url" varchar(500),
	"skeleton_type" varchar(50) DEFAULT 'mixamo' NOT NULL,
	"scale_x" real DEFAULT 1 NOT NULL,
	"scale_y" real DEFAULT 1 NOT NULL,
	"scale_z" real DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnosis_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_path" varchar(255),
	"file_path" varchar(500),
	"query" text NOT NULL,
	"mode" varchar(20) DEFAULT 'route' NOT NULL,
	"probable_root_cause_type" varchar(50) DEFAULT 'unknown' NOT NULL,
	"risk_level" varchar(10) DEFAULT 'medium' NOT NULL,
	"diagnosis" text NOT NULL,
	"likely_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"impacted_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fix_plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ranked_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_tests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"needs_human_review" boolean DEFAULT true NOT NULL,
	"unsafe_to_auto_patch" boolean DEFAULT false NOT NULL,
	"cached" boolean DEFAULT false NOT NULL,
	"total_ms" integer,
	"stages" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_id" uuid,
	"feedback_accurate" boolean,
	"feedback_helpful" boolean,
	"query_embedding" vector(768),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichment_jobs" (
	"job_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" text,
	"job_type" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"cursor" text,
	"total_processed" integer DEFAULT 0 NOT NULL,
	"total_upserted" integer DEFAULT 0 NOT NULL,
	"total_failed" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_analysis_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid,
	"analysis_type" varchar(50) NOT NULL,
	"result" jsonb NOT NULL,
	"result_embedding" vector(768),
	"confidence" real DEFAULT 0,
	"object_count" integer DEFAULT 0,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"llm_escalated" boolean DEFAULT false,
	"processing_time_ms" integer DEFAULT 0,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(50) NOT NULL,
	"changes" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid,
	"entity_text" text NOT NULL,
	"entity_label" varchar(50) NOT NULL,
	"confidence" real,
	"start_offset" integer,
	"end_offset" integer,
	"source" varchar(20) DEFAULT 'llm',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_forensic_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid,
	"flag_type" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"severity" varchar(10) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" varchar(255),
	"description" text,
	"metadata" jsonb,
	"changed_by" uuid,
	"change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failed_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue" varchar(100) NOT NULL,
	"dlq_queue" varchar(100) NOT NULL,
	"reason" varchar(100) DEFAULT 'unknown' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"dead_lettered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fictional_case_actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fictional_case_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"role" "fictional_actor_role" NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "fictional_case_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fictional_case_id" uuid NOT NULL,
	"charge_name" varchar(300) NOT NULL,
	"statute" varchar(200),
	"elements" jsonb DEFAULT '[]'::jsonb,
	"canon_chunk_ids" jsonb DEFAULT '[]'::jsonb,
	"is_primary" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "fictional_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fictional_case_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"event_date" date,
	"description" text,
	"canon_chunk_ids" jsonb DEFAULT '[]'::jsonb,
	"order_index" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "fictional_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" varchar(200) NOT NULL,
	"category" "fictional_case_category" NOT NULL,
	"charge" varchar(300) NOT NULL,
	"primary_statute" varchar(200),
	"defendant_name" varchar(200) NOT NULL,
	"incident_date" date,
	"jurisdiction_city" varchar(200),
	"jurisdiction" "jurisdiction",
	"financial_loss" real,
	"narrative" text NOT NULL,
	"disclaimer" text,
	"is_fictional" boolean DEFAULT true NOT NULL,
	"generated_by" varchar(100),
	"guardrail_triggered" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fictional_cases_case_id_unique" UNIQUE("case_id")
);
--> statement-breakpoint
CREATE TABLE "glyph_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"glyph_id" text NOT NULL,
	"source_id" text NOT NULL,
	"case_id" uuid,
	"kind" varchar(30) NOT NULL,
	"section" varchar(30) DEFAULT 'UNKNOWN' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"som_cluster" integer,
	"centroid_id" integer,
	"grpo_reward_score" real,
	"summary" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kag_neighbors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dag_prev" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dag_next" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topology" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"render" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"record_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_buffers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"cluster_id" integer,
	"k" integer DEFAULT 20 NOT NULL,
	"buffer_jsonb" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"token_estimate" integer DEFAULT 0 NOT NULL,
	"compression_ratio" real DEFAULT 1 NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_buffers_scope_cluster_k" UNIQUE("scope","cluster_id","k")
);
--> statement-breakpoint
CREATE TABLE "knowledge_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" varchar(30) NOT NULL,
	"source_id" text NOT NULL,
	"summary" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embed_text" text,
	"som_cluster" integer,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" varchar(300) NOT NULL,
	"domain" varchar(100) NOT NULL,
	"jurisdiction" "jurisdiction",
	"formal_definition" text NOT NULL,
	"plain_definition" text,
	"related_chunk_ids" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"backend" "inference_backend" NOT NULL,
	"capability" "model_capability" DEFAULT 'chat' NOT NULL,
	"version" varchar(50),
	"parameter_count" bigint,
	"quantization" varchar(50),
	"context_window" integer,
	"embedding_dims" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"health_endpoint" varchar(500),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_registry_name_backend_unique" UNIQUE("name","backend")
);
--> statement-breakpoint
CREATE TABLE "persons_of_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"aliases" text[],
	"description" text DEFAULT '',
	"threat_level" varchar DEFAULT 'low' NOT NULL,
	"status" varchar DEFAULT 'surveillance' NOT NULL,
	"relationship" text,
	"ai_profile" jsonb,
	"who" jsonb,
	"what" jsonb,
	"why" jsonb,
	"how" jsonb,
	"risk" jsonb,
	"confidence" real,
	"model_version" text,
	"generated_at" timestamp,
	"last_updated" timestamp,
	"crimes" text[],
	"case_ids" text[],
	"case_id" uuid,
	"profile_data" jsonb DEFAULT '{}'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"position" jsonb DEFAULT '{}'::jsonb,
	"photo_url" text,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "poi_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poi_id_1" uuid NOT NULL,
	"poi_id_2" uuid NOT NULL,
	"relationship_type" varchar(100) DEFAULT 'unknown' NOT NULL,
	"strength" numeric(3, 2) DEFAULT '0.70',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" varchar(255),
	"content" text,
	"metadata" jsonb,
	"changed_by" uuid,
	"change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"pipeline" text DEFAULT 'ace' NOT NULL,
	"entity_type" text NOT NULL,
	"query" text NOT NULL,
	"query_hash" varchar(8) NOT NULL,
	"title" text,
	"url" text,
	"collection" text,
	"citation_label" text,
	"section_path" text,
	"jurisdiction" text,
	"summary" text NOT NULL,
	"entity_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"relevance_score" real DEFAULT 0 NOT NULL,
	"embedding" vector(768),
	"user_id" uuid,
	"saved_citation_id" uuid,
	"manifold4" real[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_name" varchar(100) NOT NULL,
	"tier" "service_tier" NOT NULL,
	"port" integer,
	"health_endpoint" varchar(500),
	"fallback_service" varchar(100),
	"is_required" boolean DEFAULT false NOT NULL,
	"docker_profile" varchar(50),
	"last_health_check" timestamp with time zone,
	"last_health_status" boolean,
	"last_latency_ms" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "svc_capabilities_name_unique" UNIQUE("service_name")
);
--> statement-breakpoint
CREATE TABLE "synthesis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"query" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"cache_hit" varchar(10),
	"latency_ms" integer,
	"confidence" real,
	"grpo_reward_score" real,
	"policy_tier" varchar(30),
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "term_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_id" uuid NOT NULL,
	"example_text" text NOT NULL,
	"relationship" varchar(50) NOT NULL,
	"source_chunk_id" varchar(200),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poi_id" uuid,
	"case_id" uuid,
	"title" varchar(500) NOT NULL,
	"description" text,
	"event_date" timestamp with time zone NOT NULL,
	"event_type" varchar(100) DEFAULT 'general',
	"location" varchar(500),
	"severity" varchar(20) DEFAULT 'low',
	"metadata" jsonb,
	"timestamp" timestamp,
	"type" varchar(100),
	"evidence_ids" jsonb DEFAULT '[]'::jsonb,
	"person_ids" jsonb DEFAULT '[]'::jsonb,
	"location_ids" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_research_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" text,
	"title" text NOT NULL,
	"self_prompt" text NOT NULL,
	"pipeline_hint" text DEFAULT 'ace' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_text" text,
	"summary" text,
	"result" jsonb,
	"notified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "whisper_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transcript_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"segment_index" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"language" varchar(10),
	"embedding" vector(768),
	"embedding_model" varchar(50),
	"qdrant_point_id" varchar(200),
	"speaker" varchar(100),
	"confidence" real,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persons" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "persons" CASCADE;--> statement-breakpoint
ALTER TABLE "ace_chunks" DROP CONSTRAINT "ace_chunks_doc_id_ace_docs_id_fk";
--> statement-breakpoint
DROP INDEX "ace_chunks_doc_idx";--> statement-breakpoint
DROP INDEX "ace_chunks_embedding_idx";--> statement-breakpoint
ALTER TABLE "ace_chunks" ALTER COLUMN "chunk_index" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_reports" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "attachment_verifications" ALTER COLUMN "verified_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "auto_tags" ALTER COLUMN "confirmed_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "canvas_annotations" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "case_activities" ALTER COLUMN "assigned_to" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "case_activities" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "case_embeddings" ALTER COLUMN "embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "case_note_versions" ALTER COLUMN "edited_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "case_notes" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "case_scores" ALTER COLUMN "calculated_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "chat_embeddings" ALTER COLUMN "embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "content_embeddings" ALTER COLUMN "embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "embedding_cache" ALTER COLUMN "embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "evidence_board_connections" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "evidence_vectors" ALTER COLUMN "vector" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "hash_verifications" ALTER COLUMN "verified_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "legal_analysis_sessions" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "content_embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "legal_glossary" ALTER COLUMN "embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "legal_research" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "poi_photos" ALTER COLUMN "face_embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "rag_sessions" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "saved_reports" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "statute_chunks" ALTER COLUMN "embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "themes" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "user_embeddings" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "user_embeddings" ALTER COLUMN "embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "vector_outbox" ALTER COLUMN "vector" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "workspace_notes" ALTER COLUMN "embedding" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "workspace_notes" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "ace_chunks" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "ace_chunks" ADD COLUMN "content" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ace_chunks" ADD COLUMN "chunk_type" text;--> statement-breakpoint
ALTER TABLE "ace_chunks" ADD COLUMN "source_document_id" uuid;--> statement-breakpoint
ALTER TABLE "ace_chunks" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "ace_chunks" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "ace_chunks" ADD COLUMN "pipeline_version" text;--> statement-breakpoint
ALTER TABLE "ace_chunks" ADD COLUMN "quality_score" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ace_chunks" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "ace_chunks" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "citation_type" varchar(100);--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "title" varchar(500);--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "annotation" text;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "is_key_authority" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "evidence_number" varchar(50);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "type" varchar(100);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "pos_x" integer;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "pos_y" integer;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "collected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "collected_by" varchar(255);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "ai_tags" jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "ai_analysis" jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "status" varchar(50) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "extracted_text" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "entities" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "keywords" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "type" varchar(64);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "report_type" varchar(100);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "format" varchar(50) DEFAULT 'html';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "has_completed_onboarding" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_step" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "case_library_links" ADD CONSTRAINT "case_library_links_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_library_links" ADD CONSTRAINT "case_library_links_document_id_library_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."library_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_library_links" ADD CONSTRAINT "case_library_links_node_id_legal_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."legal_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_document_id_library_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."library_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_chunks" ADD CONSTRAINT "legal_chunks_legal_node_id_legal_nodes_id_fk" FOREIGN KEY ("legal_node_id") REFERENCES "public"."legal_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_citations" ADD CONSTRAINT "legal_citations_from_node_id_legal_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."legal_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_citations" ADD CONSTRAINT "legal_citations_to_node_id_legal_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."legal_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_definitions" ADD CONSTRAINT "legal_definitions_defined_in_node_id_legal_nodes_id_fk" FOREIGN KEY ("defined_in_node_id") REFERENCES "public"."legal_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_nodes" ADD CONSTRAINT "legal_nodes_document_id_library_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."library_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_nodes" ADD CONSTRAINT "legal_nodes_version_id_library_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."library_document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_document_versions" ADD CONSTRAINT "library_document_versions_document_id_library_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."library_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_documents" ADD CONSTRAINT "library_documents_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_artifacts" ADD CONSTRAINT "page_artifacts_document_id_library_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."library_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_constitution_sources" ADD CONSTRAINT "state_constitution_sources_document_id_library_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."library_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_transcripts" ADD CONSTRAINT "audio_transcripts_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_chunks" ADD CONSTRAINT "canonical_chunks_document_id_canonical_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."canonical_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_document_attachments" ADD CONSTRAINT "chat_document_attachments_chat_session_id_yorha_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."yorha_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_document_attachments" ADD CONSTRAINT "chat_document_attachments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_audit_reports" ADD CONSTRAINT "codebase_audit_reports_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_audit_reports" ADD CONSTRAINT "codebase_audit_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_timeline" ADD CONSTRAINT "context_timeline_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_timeline" ADD CONSTRAINT "context_timeline_summary_id_research_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."research_summaries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courtroom_keyframes" ADD CONSTRAINT "courtroom_keyframes_animation_id_courtroom_animations_id_fk" FOREIGN KEY ("animation_id") REFERENCES "public"."courtroom_animations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_audit_log" ADD CONSTRAINT "evidence_audit_log_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_audit_log" ADD CONSTRAINT "evidence_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_entities" ADD CONSTRAINT "evidence_entities_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_entities" ADD CONSTRAINT "evidence_entities_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_forensic_flags" ADD CONSTRAINT "evidence_forensic_flags_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_forensic_flags" ADD CONSTRAINT "evidence_forensic_flags_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_versions" ADD CONSTRAINT "evidence_versions_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_versions" ADD CONSTRAINT "evidence_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fictional_case_actors" ADD CONSTRAINT "fictional_case_actors_fictional_case_id_fictional_cases_id_fk" FOREIGN KEY ("fictional_case_id") REFERENCES "public"."fictional_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fictional_case_charges" ADD CONSTRAINT "fictional_case_charges_fictional_case_id_fictional_cases_id_fk" FOREIGN KEY ("fictional_case_id") REFERENCES "public"."fictional_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fictional_case_events" ADD CONSTRAINT "fictional_case_events_fictional_case_id_fictional_cases_id_fk" FOREIGN KEY ("fictional_case_id") REFERENCES "public"."fictional_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poi_relationships" ADD CONSTRAINT "poi_relationships_poi_id_1_persons_of_interest_id_fk" FOREIGN KEY ("poi_id_1") REFERENCES "public"."persons_of_interest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poi_relationships" ADD CONSTRAINT "poi_relationships_poi_id_2_persons_of_interest_id_fk" FOREIGN KEY ("poi_id_2") REFERENCES "public"."persons_of_interest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_summaries" ADD CONSTRAINT "research_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_summaries" ADD CONSTRAINT "research_summaries_saved_citation_id_citations_id_fk" FOREIGN KEY ("saved_citation_id") REFERENCES "public"."citations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_examples" ADD CONSTRAINT "term_examples_term_id_legal_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."legal_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_poi_id_persons_of_interest_id_fk" FOREIGN KEY ("poi_id") REFERENCES "public"."persons_of_interest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_research_tasks" ADD CONSTRAINT "user_research_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whisper_segments" ADD CONSTRAINT "whisper_segments_transcript_id_audio_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."audio_transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whisper_segments" ADD CONSTRAINT "whisper_segments_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_lib_links_case_idx" ON "case_library_links" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_lib_links_doc_idx" ON "case_library_links" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "case_lib_links_node_idx" ON "case_library_links" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "chunk_hit_pipeline_cluster_idx" ON "chunk_hit_log" USING btree ("pipeline","gpu_cluster","hit_at");--> statement-breakpoint
CREATE INDEX "chunk_hit_query_hash_idx" ON "chunk_hit_log" USING btree ("query_hash","hit_at");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_doc_idx" ON "ingestion_jobs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_jurisdictions_code" ON "jurisdictions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_jurisdictions_level" ON "jurisdictions" USING btree ("level");--> statement-breakpoint
CREATE INDEX "legal_chunks_node_idx" ON "legal_chunks" USING btree ("legal_node_id");--> statement-breakpoint
CREATE INDEX "legal_chunks_embed_hnsw" ON "legal_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_legal_citations_from" ON "legal_citations" USING btree ("from_node_id");--> statement-breakpoint
CREATE INDEX "idx_legal_citations_to" ON "legal_citations" USING btree ("to_node_id");--> statement-breakpoint
CREATE INDEX "idx_legal_citations_target" ON "legal_citations" USING btree ("normalized_target");--> statement-breakpoint
CREATE INDEX "legal_defs_term_idx" ON "legal_definitions" USING btree ("normalized_term");--> statement-breakpoint
CREATE INDEX "idx_legal_definitions_node_id" ON "legal_definitions" USING btree ("defined_in_node_id");--> statement-breakpoint
CREATE INDEX "legal_nodes_doc_idx" ON "legal_nodes" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "legal_nodes_parent_idx" ON "legal_nodes" USING btree ("parent_node_id");--> statement-breakpoint
CREATE INDEX "legal_nodes_path_idx" ON "legal_nodes" USING btree ("document_id","node_path");--> statement-breakpoint
CREATE INDEX "idx_legal_nodes_citation" ON "legal_nodes" USING btree ("citation_label");--> statement-breakpoint
CREATE INDEX "library_docs_jurisdiction_idx" ON "library_documents" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE INDEX "library_docs_corpus_idx" ON "library_documents" USING btree ("corpus_type");--> statement-breakpoint
CREATE INDEX "library_docs_status_idx" ON "library_documents" USING btree ("processing_status");--> statement-breakpoint
CREATE UNIQUE INDEX "library_docs_source_hash_uidx" ON "library_documents" USING btree ("source_hash");--> statement-breakpoint
CREATE INDEX "page_artifacts_doc_idx" ON "page_artifacts" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "qlora_examples_query_hash_idx" ON "qlora_examples" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "qlora_examples_quality_idx" ON "qlora_examples" USING btree ("quality_tier","response_score");--> statement-breakpoint
CREATE INDEX "qlora_examples_created_idx" ON "qlora_examples" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "query_variance_pairs_pair_idx" ON "query_variance_pairs" USING btree (LEAST("query_hash_a", "query_hash_b"),GREATEST("query_hash_a", "query_hash_b"));--> statement-breakpoint
CREATE INDEX "query_variance_pairs_a_idx" ON "query_variance_pairs" USING btree ("query_hash_a");--> statement-breakpoint
CREATE INDEX "rag_query_log_user_created_idx" ON "rag_query_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "rag_query_log_hash_idx" ON "rag_query_log" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "response_feedback_hash_idx" ON "response_feedback" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "response_feedback_user_idx" ON "response_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "response_feedback_hash_user_idx" ON "response_feedback" USING btree ("query_hash","user_id");--> statement-breakpoint
CREATE INDEX "idx_scs_state_code" ON "state_constitution_sources" USING btree ("state_code");--> statement-breakpoint
CREATE INDEX "idx_scs_document_id" ON "state_constitution_sources" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "ace_context_cache_query_hash_idx" ON "ace_context_cache" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "ace_context_cache_user_idx" ON "ace_context_cache" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_log_user_idx" ON "ai_usage_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_log_endpoint_idx" ON "ai_usage_log" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "ai_usage_log_created_at_idx" ON "ai_usage_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_log_model_idx" ON "ai_usage_log" USING btree ("model");--> statement-breakpoint
CREATE INDEX "analytics_events_event_type_idx" ON "analytics_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_user_id_idx" ON "analytics_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_audit_created_at_idx" ON "api_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_audit_user_id_idx" ON "api_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_audit_path_idx" ON "api_audit_log" USING btree ("path");--> statement-breakpoint
CREATE INDEX "api_audit_status_code_idx" ON "api_audit_log" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "audio_transcripts_evidence_idx" ON "audio_transcripts" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "audio_transcripts_case_idx" ON "audio_transcripts" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "canonical_chunks_document_idx" ON "canonical_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "canonical_chunks_chunk_id_idx" ON "canonical_chunks" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "canonical_chunks_semantic_label_idx" ON "canonical_chunks" USING btree ("semantic_label");--> statement-breakpoint
CREATE INDEX "canonical_docs_jurisdiction_idx" ON "canonical_documents" USING btree ("jurisdiction");--> statement-breakpoint
CREATE INDEX "canonical_docs_authority_idx" ON "canonical_documents" USING btree ("authority_level");--> statement-breakpoint
CREATE INDEX "canonical_docs_doc_type_idx" ON "canonical_documents" USING btree ("doc_type");--> statement-breakpoint
CREATE INDEX "canonical_docs_citation_idx" ON "canonical_documents" USING btree ("citation");--> statement-breakpoint
CREATE INDEX "chat_attachments_session_idx" ON "chat_document_attachments" USING btree ("chat_session_id");--> statement-breakpoint
CREATE INDEX "chat_attachments_status_idx" ON "chat_document_attachments" USING btree ("embedding_status");--> statement-breakpoint
CREATE INDEX "chat_attachments_document_idx" ON "chat_document_attachments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "cluster_narratives_cluster_idx" ON "cluster_narratives" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "cluster_summaries_repo_cluster_idx" ON "cluster_summaries" USING btree ("repo_id","gpu_cluster");--> statement-breakpoint
CREATE INDEX "codebase_audit_reports_case_idx" ON "codebase_audit_reports" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "codebase_audit_reports_status_idx" ON "codebase_audit_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "codebase_audit_reports_type_idx" ON "codebase_audit_reports" USING btree ("report_type");--> statement-breakpoint
CREATE INDEX "codebase_audit_reports_created_idx" ON "codebase_audit_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "codebase_chunk_index_repo_id_idx" ON "codebase_chunk_index" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "codebase_chunk_index_gpu_cluster_idx" ON "codebase_chunk_index" USING btree ("gpu_cluster");--> statement-breakpoint
CREATE INDEX "codebase_chunk_index_domain_idx" ON "codebase_chunk_index" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "codebase_chunk_index_extension_idx" ON "codebase_chunk_index" USING btree ("extension");--> statement-breakpoint
CREATE INDEX "ctx_user_created" ON "context_timeline" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ctx_session_created" ON "context_timeline" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "ctx_event_type" ON "context_timeline" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "ctx_pipeline_reward" ON "context_timeline" USING btree ("pipeline","grpo_reward");--> statement-breakpoint
CREATE INDEX "ctx_hyperedge" ON "context_timeline" USING btree ("hyperedge_hash");--> statement-breakpoint
CREATE INDEX "courtroom_anims_type_idx" ON "courtroom_animations" USING btree ("anim_type");--> statement-breakpoint
CREATE INDEX "courtroom_kf_session_time_idx" ON "courtroom_keyframes" USING btree ("session_id","time_ms");--> statement-breakpoint
CREATE INDEX "courtroom_kf_session_role_idx" ON "courtroom_keyframes" USING btree ("session_id","character_role");--> statement-breakpoint
CREATE INDEX "courtroom_models_role_idx" ON "courtroom_models" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_diagnosis_events_route" ON "diagnosis_events" USING btree ("route_path");--> statement-breakpoint
CREATE INDEX "idx_diagnosis_events_mode" ON "diagnosis_events" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "idx_diagnosis_events_root_cause" ON "diagnosis_events" USING btree ("probable_root_cause_type");--> statement-breakpoint
CREATE INDEX "idx_diagnosis_events_created" ON "diagnosis_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "enrichment_jobs_status_idx" ON "enrichment_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enrichment_jobs_job_type_idx" ON "enrichment_jobs" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX "evidence_analysis_cache_evidence_id_idx" ON "evidence_analysis_cache" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "evidence_analysis_cache_case_id_idx" ON "evidence_analysis_cache" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "evidence_analysis_cache_type_idx" ON "evidence_analysis_cache" USING btree ("analysis_type");--> statement-breakpoint
CREATE INDEX "evidence_analysis_cache_case_type_idx" ON "evidence_analysis_cache" USING btree ("case_id","analysis_type");--> statement-breakpoint
CREATE INDEX "evidence_audit_log_evidence_id_idx" ON "evidence_audit_log" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "evidence_audit_log_user_id_idx" ON "evidence_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "evidence_audit_log_timestamp_idx" ON "evidence_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "evidence_audit_log_action_idx" ON "evidence_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "evidence_entities_evidence_id_idx" ON "evidence_entities" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "evidence_entities_case_id_idx" ON "evidence_entities" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "evidence_entities_label_idx" ON "evidence_entities" USING btree ("entity_label");--> statement-breakpoint
CREATE INDEX "evidence_entities_text_label_idx" ON "evidence_entities" USING btree ("entity_text","entity_label");--> statement-breakpoint
CREATE INDEX "evidence_forensic_flags_evidence_id_idx" ON "evidence_forensic_flags" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "evidence_forensic_flags_case_id_idx" ON "evidence_forensic_flags" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "evidence_forensic_flags_type_idx" ON "evidence_forensic_flags" USING btree ("flag_type");--> statement-breakpoint
CREATE INDEX "evidence_forensic_flags_severity_idx" ON "evidence_forensic_flags" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "evidence_versions_evidence_id_idx" ON "evidence_versions" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "evidence_versions_version_idx" ON "evidence_versions" USING btree ("evidence_id","version");--> statement-breakpoint
CREATE INDEX "failed_jobs_queue_idx" ON "failed_jobs" USING btree ("queue");--> statement-breakpoint
CREATE INDEX "failed_jobs_dead_lettered_at_idx" ON "failed_jobs" USING btree ("dead_lettered_at");--> statement-breakpoint
CREATE INDEX "failed_jobs_resolved_at_idx" ON "failed_jobs" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "fictional_actors_case_idx" ON "fictional_case_actors" USING btree ("fictional_case_id");--> statement-breakpoint
CREATE INDEX "fictional_actors_role_idx" ON "fictional_case_actors" USING btree ("role");--> statement-breakpoint
CREATE INDEX "fictional_charges_case_idx" ON "fictional_case_charges" USING btree ("fictional_case_id");--> statement-breakpoint
CREATE INDEX "fictional_events_case_idx" ON "fictional_case_events" USING btree ("fictional_case_id");--> statement-breakpoint
CREATE INDEX "fictional_events_type_idx" ON "fictional_case_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "fictional_cases_case_id_idx" ON "fictional_cases" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "fictional_cases_category_idx" ON "fictional_cases" USING btree ("category");--> statement-breakpoint
CREATE INDEX "fictional_cases_jurisdiction_idx" ON "fictional_cases" USING btree ("jurisdiction");--> statement-breakpoint
CREATE INDEX "glyph_records_glyph_id_idx" ON "glyph_records" USING btree ("glyph_id");--> statement-breakpoint
CREATE INDEX "glyph_records_source_idx" ON "glyph_records" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "glyph_records_case_idx" ON "glyph_records" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "glyph_records_cluster_idx" ON "glyph_records" USING btree ("som_cluster");--> statement-breakpoint
CREATE INDEX "glyph_records_centroid_idx" ON "glyph_records" USING btree ("centroid_id");--> statement-breakpoint
CREATE INDEX "glyph_records_section_idx" ON "glyph_records" USING btree ("section");--> statement-breakpoint
CREATE INDEX "glyph_records_reward_idx" ON "glyph_records" USING btree ("grpo_reward_score");--> statement-breakpoint
CREATE INDEX "knowledge_artifacts_source_idx" ON "knowledge_artifacts" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "knowledge_artifacts_cluster_idx" ON "knowledge_artifacts" USING btree ("som_cluster");--> statement-breakpoint
CREATE INDEX "legal_terms_term_idx" ON "legal_terms" USING btree ("term");--> statement-breakpoint
CREATE INDEX "legal_terms_domain_idx" ON "legal_terms" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "model_registry_backend_idx" ON "model_registry" USING btree ("backend");--> statement-breakpoint
CREATE INDEX "model_registry_capability_idx" ON "model_registry" USING btree ("capability");--> statement-breakpoint
CREATE INDEX "model_registry_active_idx" ON "model_registry" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "poi_relationships_poi1_idx" ON "poi_relationships" USING btree ("poi_id_1");--> statement-breakpoint
CREATE INDEX "poi_relationships_poi2_idx" ON "poi_relationships" USING btree ("poi_id_2");--> statement-breakpoint
CREATE INDEX "report_versions_report_id_idx" ON "report_versions" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_versions_version_idx" ON "report_versions" USING btree ("report_id","version");--> statement-breakpoint
CREATE INDEX "rs_pipeline_score_id" ON "research_summaries" USING btree ("pipeline","relevance_score","id");--> statement-breakpoint
CREATE INDEX "rs_entity_type_score" ON "research_summaries" USING btree ("entity_type","relevance_score","id");--> statement-breakpoint
CREATE INDEX "rs_source_score" ON "research_summaries" USING btree ("source","relevance_score","id");--> statement-breakpoint
CREATE INDEX "rs_user_created" ON "research_summaries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "rs_query_hash" ON "research_summaries" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "svc_capabilities_tier_idx" ON "service_capabilities" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "synthesis_runs_user_idx" ON "synthesis_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "synthesis_runs_created_idx" ON "synthesis_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "term_examples_term_idx" ON "term_examples" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "term_examples_relationship_idx" ON "term_examples" USING btree ("relationship");--> statement-breakpoint
CREATE INDEX "idx_timeline_events_poi_id" ON "timeline_events" USING btree ("poi_id");--> statement-breakpoint
CREATE INDEX "idx_timeline_events_case_id" ON "timeline_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_timeline_events_event_date" ON "timeline_events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "urt_user_status" ON "user_research_tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "urt_user_created" ON "user_research_tasks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "urt_session" ON "user_research_tasks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "whisper_segments_evidence_segment_idx" ON "whisper_segments" USING btree ("evidence_id","segment_index");--> statement-breakpoint
CREATE INDEX "whisper_segments_case_idx" ON "whisper_segments" USING btree ("transcript_id");--> statement-breakpoint
CREATE INDEX "whisper_segments_evidence_time_idx" ON "whisper_segments" USING btree ("evidence_id","start_ms");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_metadata" ADD CONSTRAINT "chat_metadata_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ace_chunks_case_id" ON "ace_chunks" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_ace_chunks_type" ON "ace_chunks" USING btree ("chunk_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ace_chunks_case_hash_type" ON "ace_chunks" USING btree ("case_id","content_hash","chunk_type");--> statement-breakpoint
CREATE INDEX "idx_ace_chunks_pipeline_version" ON "ace_chunks" USING btree ("pipeline_version");--> statement-breakpoint
CREATE INDEX "idx_ace_chunks_read_path" ON "ace_chunks" USING btree ("case_id","pipeline_version","quality_score","created_at");--> statement-breakpoint
CREATE INDEX "idx_ace_chunks_embedding_hnsw" ON "ace_chunks" USING hnsw (("embedding"::halfvec(768)) halfvec_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_chat_messages_case_id" ON "chat_messages" USING btree ("case_id");--> statement-breakpoint
ALTER TABLE "ace_chunks" DROP COLUMN "doc_id";--> statement-breakpoint
ALTER TABLE "ace_chunks" DROP COLUMN "text";--> statement-breakpoint
ALTER TABLE "document_chunks" DROP COLUMN "embedding";