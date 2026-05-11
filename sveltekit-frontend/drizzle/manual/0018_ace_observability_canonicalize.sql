-- 0018_ace_observability_canonicalize.sql
-- Date:    2026-05-11
-- Status:  CARVED FROM AUDIT — migrate-now bucket only (5 of 34 candidates).
-- Authored against docs/audit/2026-05-11_feature-spec-implementation-audit.md
--
-- Scope (carved from the broader 34-table generated proposal):
--   - ace_retrieval_runs       — ACE retrieval pass header
--   - ace_retrieval_hits       — per-chunk scoring detail for a run
--   - memory_gain_audits       — gain-vs-existing-memory audit log
--   - metadata_envelopes       — canonical envelope spine (AGENTS.md / chunks / diagnostics)
--   - code_llm_index           — code LLM output cache (PRIOR ANSWER lane)
--
-- Idempotency:
--   - CREATE TABLE IF NOT EXISTS for every table
--   - CREATE INDEX IF NOT EXISTS for every index
--   - safe JSONB defaults
--   - timestamps default now()
--   - no DROP / ALTER COLUMN / destructive ops
--
-- NOT included from the 34-table proposal:
--   - 7 duplicates of tablesFilter-protected tables (drizzle.config.ts band-aid)
--   - 22 deferred-feature scaffolding (legal/RAPTOR/KAG/code-analysis cache)
--   - per-feature review required before any future carve
--
-- Hard rules respected:
--   - Does NOT touch users.id / cases.user_id identity strategy.
--   - Does NOT run drizzle push.
--   - Apply manually via:
--       docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db \
--         < sveltekit-frontend/drizzle/manual/0018_ace_observability_canonicalize.sql

-- 1. ace_retrieval_runs
CREATE TABLE IF NOT EXISTS ace_retrieval_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	query text NOT NULL,
	intent text,
	mode text,
	model text,
	query_embedding_model text,
	expanded_terms text[] DEFAULT '{}',
	context_budget_tokens integer,
	final_context_tokens integer,
	metadata jsonb DEFAULT '{}'::jsonb,
	created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ace_retrieval_runs_created_at_idx ON ace_retrieval_runs (created_at);
CREATE INDEX IF NOT EXISTS ace_retrieval_runs_intent_idx ON ace_retrieval_runs (intent);

-- 2. ace_retrieval_hits
CREATE TABLE IF NOT EXISTS ace_retrieval_hits (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid REFERENCES ace_retrieval_runs(id) ON DELETE CASCADE,
	stable_key text NOT NULL,
	chunk_id text,
	file_path text,
	source text NOT NULL,
	vector_score double precision,
	graph_score double precision,
	tag_score double precision,
	recency_score double precision,
	error_relevance_score double precision,
	final_score double precision,
	rank integer,
	reason text,
	metadata jsonb DEFAULT '{}'::jsonb,
	created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ace_retrieval_hits_run_id_idx ON ace_retrieval_hits (run_id);
CREATE INDEX IF NOT EXISTS ace_retrieval_hits_stable_key_idx ON ace_retrieval_hits (stable_key);
CREATE INDEX IF NOT EXISTS ace_retrieval_hits_final_score_idx ON ace_retrieval_hits (final_score);

-- 3. memory_gain_audits
CREATE TABLE IF NOT EXISTS memory_gain_audits (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	query text NOT NULL,
	topic text,
	candidate_hash text NOT NULL,
	existing_memory_ids text[] DEFAULT '{}',
	gain_score double precision,
	decision text NOT NULL,
	accuracy_score double precision,
	density_score double precision,
	clarity_score double precision,
	novelty_score double precision,
	reasoning text,
	improvements text[] DEFAULT '{}',
	metadata jsonb DEFAULT '{}'::jsonb,
	created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memory_gain_audits_query_idx ON memory_gain_audits (query);
CREATE INDEX IF NOT EXISTS memory_gain_audits_decision_idx ON memory_gain_audits (decision);
CREATE INDEX IF NOT EXISTS memory_gain_audits_score_idx ON memory_gain_audits (gain_score);

-- 4. metadata_envelopes
CREATE TABLE IF NOT EXISTS metadata_envelopes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	source_type text NOT NULL,
	stable_key text NOT NULL UNIQUE,
	repo_root text,
	file_path text,
	directory_path text,
	name text,
	language text,
	content_hash text,
	schema_version integer NOT NULL DEFAULT 1,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	features jsonb NOT NULL DEFAULT '{}'::jsonb,
	relations jsonb NOT NULL DEFAULT '[]'::jsonb,
	diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb,
	embedding_model text,
	qdrant_collection text,
	qdrant_point_id text,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now(),
	indexed_at timestamptz
);
CREATE INDEX IF NOT EXISTS metadata_envelopes_source_type_idx ON metadata_envelopes (source_type);
CREATE INDEX IF NOT EXISTS metadata_envelopes_file_path_idx ON metadata_envelopes (file_path);
CREATE INDEX IF NOT EXISTS metadata_envelopes_metadata_gin ON metadata_envelopes USING gin (metadata);
CREATE INDEX IF NOT EXISTS metadata_envelopes_features_gin ON metadata_envelopes USING gin (features);
CREATE INDEX IF NOT EXISTS metadata_envelopes_relations_gin ON metadata_envelopes USING gin (relations);

-- 5. code_llm_index
CREATE TABLE IF NOT EXISTS code_llm_index (
	path_hash varchar(16) PRIMARY KEY,
	path text NOT NULL,
	is_dir boolean NOT NULL DEFAULT false,
	llm_output text NOT NULL,
	source varchar(32) NOT NULL DEFAULT 'ace',
	query text,
	glyph_cluster_id integer,
	som_bmu_row integer,
	som_bmu_col integer,
	hit_count integer NOT NULL DEFAULT 0,
	token_count integer,
	output_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
	generated_at timestamptz NOT NULL DEFAULT now(),
	last_hit_at timestamptz NOT NULL DEFAULT now(),
	refreshed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS code_llm_index_cluster_idx ON code_llm_index (glyph_cluster_id);
CREATE INDEX IF NOT EXISTS code_llm_index_last_hit_idx ON code_llm_index (last_hit_at);
CREATE INDEX IF NOT EXISTS code_llm_index_hit_count_idx ON code_llm_index (hit_count);
CREATE INDEX IF NOT EXISTS code_llm_index_source_idx ON code_llm_index (source);

-- Manual indexes for code_llm_index (Drizzle cannot express these natively)
CREATE INDEX IF NOT EXISTS code_llm_index_output_meta_gin ON code_llm_index USING gin (output_meta jsonb_path_ops);
CREATE INDEX IF NOT EXISTS code_llm_index_confidence_idx
	ON code_llm_index (((output_meta->>'confidence')::real))
	WHERE output_meta ? 'confidence';
CREATE INDEX IF NOT EXISTS code_llm_index_grounding_idx
	ON code_llm_index (((output_meta->>'groundingScore')::real))
	WHERE output_meta ? 'groundingScore';
