ALTER TABLE "feature_registry" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "feature_registry" ADD COLUMN "chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_registry" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_registry" ADD COLUMN "retry_queries" jsonb DEFAULT '[]'::jsonb NOT NULL;