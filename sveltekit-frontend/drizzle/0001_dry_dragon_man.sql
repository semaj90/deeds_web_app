CREATE TABLE "ace_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "ace_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"fetched_at" timestamp with time zone DEFAULT now(),
	"content_type" text,
	"minio_raw_key" text NOT NULL,
	"minio_clean_key" text,
	"tokens" integer,
	"lang" text,
	"summary" text,
	"summary_updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ace_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text DEFAULT 'web' NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text,
	"domain" text,
	"first_seen" timestamp with time zone DEFAULT now(),
	"last_crawled" timestamp with time zone,
	"crawl_status" text DEFAULT 'new',
	"etag" text,
	"content_hash" text
);
--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "password_hash" TO "hashed_password";--> statement-breakpoint
ALTER TABLE "ace_chunks" ADD CONSTRAINT "ace_chunks_doc_id_ace_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."ace_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ace_docs" ADD CONSTRAINT "ace_docs_source_id_ace_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ace_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ace_chunks_doc_idx" ON "ace_chunks" USING btree ("doc_id","chunk_index");--> statement-breakpoint
CREATE INDEX "ace_chunks_embedding_idx" ON "ace_chunks" USING ivfflat ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "ace_docs_source_idx" ON "ace_docs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "ace_docs_fetched_idx" ON "ace_docs" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "ace_sources_url_idx" ON "ace_sources" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "ace_sources_domain_idx" ON "ace_sources" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "ace_sources_status_idx" ON "ace_sources" USING btree ("crawl_status");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "name";