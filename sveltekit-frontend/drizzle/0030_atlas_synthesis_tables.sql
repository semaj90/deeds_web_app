CREATE TABLE "nes_chrom_kag_dag_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_id" uuid NOT NULL,
	"run_id" uuid,
	"chunk_id" text NOT NULL,
	"source_ref" text NOT NULL,
	"hit_type" text DEFAULT 'context' NOT NULL,
	"score" real,
	"node_key" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nes_chrom_packets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_key" text NOT NULL,
	"query_hash" text NOT NULL,
	"chunk_id" text NOT NULL,
	"source_ref" text NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feature_id" text NOT NULL,
	"packet_type" text DEFAULT 'nes_chrom' NOT NULL,
	"lane" text DEFAULT 'semantic_packet' NOT NULL,
	"model" text DEFAULT 'gemma4-rotorquant:latest' NOT NULL,
	"summary" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(768),
	"qdrant_point_id" text,
	"kag_dag_run_id" uuid,
	"kag_node_key" text,
	"token_budget" integer,
	"feature_ids" text[],
	"som_cluster" text,
	"lane_ids" text[],
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "nes_chrom_packets_packet_key_key" UNIQUE("packet_key")
);
--> statement-breakpoint
CREATE TABLE "atlas_feature_map" (
	"normalized_path" text PRIMARY KEY NOT NULL,
	"source_ref" text,
	"feature_id" text,
	"related_feature_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cluster_id" text,
	"centroid_id" text,
	"som_cluster" text,
	"qdrant_point_id" text,
	"neo4j_node_id" text,
	"nes_card_id" text,
	"lane_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"atlas_version" integer DEFAULT 1 NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "atlas_feature_dict" (
	"id" serial PRIMARY KEY NOT NULL,
	"feature_id" text NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "atlas_feature_dict_feature_id_unique" UNIQUE("feature_id")
);
--> statement-breakpoint
CREATE TABLE "atlas_feature_synthesis" (
	"id" serial PRIMARY KEY NOT NULL,
	"feature_id" text NOT NULL,
	"packet_count" integer DEFAULT 0 NOT NULL,
	"atlas_file_count" integer DEFAULT 0 NOT NULL,
	"qdrant_point_count" integer DEFAULT 0 NOT NULL,
	"avg_confidence" real,
	"max_confidence" real,
	"semantic_confidence" real,
	"behavior_score" real,
	"primary_cluster_id" text,
	"primary_centroid_id" text,
	"cluster_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_file_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synthesized_summary" text,
	"next_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dominant_status" text DEFAULT 'todo' NOT NULL,
	"has_blocked" boolean DEFAULT false NOT NULL,
	"atlas_version" text,
	"synthesized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_feature_synthesis_feature_id_unique" UNIQUE("feature_id")
);
--> statement-breakpoint
CREATE TABLE "atlas_lane_dict" (
	"id" serial PRIMARY KEY NOT NULL,
	"lane_id" text NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "atlas_lane_dict_lane_id_unique" UNIQUE("lane_id")
);
--> statement-breakpoint
CREATE TABLE "atlas_source_ref_dict" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_ref" text NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "atlas_source_ref_dict_source_ref_unique" UNIQUE("source_ref")
);
--> statement-breakpoint
CREATE TABLE "atlas_source_ref_synthesis" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_ref" text NOT NULL,
	"source_kind" text DEFAULT 'file' NOT NULL,
	"feature_id" text,
	"atlas_rank" real,
	"atlas_authority" real,
	"karpathy_blend" real,
	"pagerank_score" real,
	"attention_score" real,
	"qdrant_point_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cluster_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"som_cluster" text,
	"synthesized_summary" text,
	"synthesized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atlas_source_ref_synthesis_source_ref_unique" UNIQUE("source_ref")
);
--> statement-breakpoint
ALTER TABLE "library_documents" ALTER COLUMN "uploaded_by" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "research_summaries" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "research_summaries" ADD COLUMN "source_refs" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "research_summaries" ADD COLUMN "output_meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "nes_chrom_kag_dag_hits" ADD CONSTRAINT "nes_chrom_kag_dag_hits_packet_id_nes_chrom_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."nes_chrom_packets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nes_chrom_kag_dag_hits" ADD CONSTRAINT "nes_chrom_kag_dag_hits_run_id_kag_dag_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."kag_dag_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD CONSTRAINT "nes_chrom_packets_kag_dag_run_id_kag_dag_runs_id_fk" FOREIGN KEY ("kag_dag_run_id") REFERENCES "public"."kag_dag_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nes_chrom_kag_dag_hits_packet_idx" ON "nes_chrom_kag_dag_hits" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "nes_chrom_kag_dag_hits_run_idx" ON "nes_chrom_kag_dag_hits" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "nes_chrom_kag_dag_hits_chunk_idx" ON "nes_chrom_kag_dag_hits" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "nes_chrom_kag_dag_hits_source_ref_idx" ON "nes_chrom_kag_dag_hits" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "nes_chrom_kag_dag_hits_node_key_idx" ON "nes_chrom_kag_dag_hits" USING btree ("node_key");--> statement-breakpoint
CREATE INDEX "nes_chrom_kag_dag_hits_evidence_gin" ON "nes_chrom_kag_dag_hits" USING gin ("evidence");--> statement-breakpoint
CREATE INDEX "nes_chrom_kag_dag_hits_metadata_gin" ON "nes_chrom_kag_dag_hits" USING gin ("metadata");--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_query_hash_idx" ON "nes_chrom_packets" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_chunk_id_idx" ON "nes_chrom_packets" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_source_ref_idx" ON "nes_chrom_packets" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_feature_id_idx" ON "nes_chrom_packets" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_qdrant_point_idx" ON "nes_chrom_packets" USING btree ("qdrant_point_id");--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_kag_run_idx" ON "nes_chrom_packets" USING btree ("kag_dag_run_id");--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_source_refs_gin" ON "nes_chrom_packets" USING gin ("source_refs");--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_payload_gin" ON "nes_chrom_packets" USING gin ("payload");--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_embedding_hnsw" ON "nes_chrom_packets" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_feature_ids_gin" ON "nes_chrom_packets" USING gin ("feature_ids");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_som_cluster" ON "nes_chrom_packets" USING btree ("som_cluster");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_lane_ids_gin" ON "nes_chrom_packets" USING gin ("lane_ids");--> statement-breakpoint
CREATE INDEX "atlas_feature_map_feature_id_idx" ON "atlas_feature_map" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "atlas_feature_map_som_cluster_idx" ON "atlas_feature_map" USING btree ("som_cluster");--> statement-breakpoint
CREATE INDEX "atlas_feature_map_cluster_id_idx" ON "atlas_feature_map" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "atlas_feature_map_related_gin" ON "atlas_feature_map" USING gin ("related_feature_ids");--> statement-breakpoint
CREATE INDEX "atlas_feature_map_lane_ids_gin" ON "atlas_feature_map" USING gin ("lane_ids");--> statement-breakpoint
CREATE INDEX "idx_atlas_feature_synthesis_cluster_id" ON "atlas_feature_synthesis" USING btree ("primary_cluster_id");--> statement-breakpoint
CREATE INDEX "idx_atlas_feature_synthesis_synthesized_at" ON "atlas_feature_synthesis" USING btree ("synthesized_at");--> statement-breakpoint
CREATE INDEX "idx_atlas_source_ref_synthesis_feature_id" ON "atlas_source_ref_synthesis" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_atlas_source_ref_synthesis_karpathy" ON "atlas_source_ref_synthesis" USING btree ("karpathy_blend");--> statement-breakpoint
CREATE INDEX "rs_source_ref" ON "research_summaries" USING btree ("source_ref");
