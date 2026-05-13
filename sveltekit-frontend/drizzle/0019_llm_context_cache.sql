-- NanoFlow-style ACE context reuse cache (logical KV cache, no raw KV tensors)

CREATE TABLE IF NOT EXISTS llm_context_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  model_name text NOT NULL,
  model_quant text,
  backend text NOT NULL,
  tokenizer_hash text NOT NULL,
  system_prompt_hash text NOT NULL,
  tool_definitions_hash text NOT NULL,
  repo_git_sha text,
  corpus_hash text,
  rag_bundle_hash text,
  graph_snapshot_hash text,
  context_pack_json jsonb NOT NULL,
  summary text NOT NULL,
  chunk_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  graph_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_prefix_tokens integer NOT NULL DEFAULT 0,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_context_cache_model_backend_idx
  ON llm_context_cache (model_name, backend);

CREATE INDEX IF NOT EXISTS llm_context_cache_graph_snapshot_idx
  ON llm_context_cache (graph_snapshot_hash);
