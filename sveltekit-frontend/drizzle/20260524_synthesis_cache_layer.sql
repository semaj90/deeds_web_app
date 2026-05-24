ALTER TABLE "synthesis_logs" ADD COLUMN IF NOT EXISTS "cache_layer_used" text DEFAULT 'none' NOT NULL;
CREATE INDEX IF NOT EXISTS "synthesis_logs_cache_layer_idx" ON "synthesis_logs" ("cache_layer_used");
