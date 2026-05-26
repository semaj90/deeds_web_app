CREATE TABLE "semantic_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_hash" text NOT NULL,
	"prompt_text" text NOT NULL,
	"response_text" text NOT NULL,
	"embedding" vector(768),
	"model" text NOT NULL,
	"similarity_threshold" real DEFAULT 0.9,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "semantic_cache_prompt_hash_unique" UNIQUE("prompt_hash")
);
--> statement-breakpoint
CREATE INDEX "semantic_cache_embed_hnsw" ON "semantic_cache" USING hnsw ("embedding" vector_cosine_ops);