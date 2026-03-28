ALTER TABLE "embedding_cache" ADD COLUMN "embedding" vector(768) NOT NULL;--> statement-breakpoint ALTER TABLE
"legal_documents" ADD COLUMN "embedding" vector(768);
