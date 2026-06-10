ALTER TABLE "synthesis_logs" ADD COLUMN IF NOT EXISTS "cache_layer_used" text DEFAULT 'none' NOT NULL;
CREATE INDEX IF NOT EXISTS "synthesis_logs_cache_layer_idx" ON "synthesis_logs" ("cache_layer_used");

CREATE TABLE IF NOT EXISTS "intent_synthesis" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "query_hash" text NOT NULL,
  "context_pack_key" text,
  "source_refs" jsonb DEFAULT '[]'::jsonb,
  "chunk_ids" jsonb DEFAULT '[]'::jsonb,
  "summary_ids" jsonb DEFAULT '[]'::jsonb,
  "authority" jsonb DEFAULT '{}'::jsonb,
  "retrieval_trace" jsonb DEFAULT '{}'::jsonb,
  "cached_steps" jsonb DEFAULT '[]'::jsonb,
  "reward_score" numeric DEFAULT 0,
  "degraded" boolean DEFAULT false,
  "degraded_reason" text,
  "created_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "intent_synthesis_query_hash_idx" ON "intent_synthesis" ("query_hash");
CREATE INDEX IF NOT EXISTS "intent_synthesis_context_pack_key_idx" ON "intent_synthesis" ("context_pack_key");
