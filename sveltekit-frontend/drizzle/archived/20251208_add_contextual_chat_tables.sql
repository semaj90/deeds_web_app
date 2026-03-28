-- Phase 72: Contextual AI Chat Tables
-- Supports YoRHa Detective chat with evidence attachment, RAG/KAG context, and analytics

-- Chat turns table: stores each conversation turn
CREATE TABLE IF NOT EXISTS chat_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  message text NOT NULL,
  llm_output jsonb NOT NULL,
  rag_context jsonb,
  kag_context jsonb,
  did_you_mean jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Chat turn evidence: links uploaded/retrieved evidence to chat turns
CREATE TABLE IF NOT EXISTS chat_turn_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_turn_id uuid REFERENCES chat_turns(id) ON DELETE CASCADE NOT NULL,
  evidence_id uuid REFERENCES evidence(id) ON DELETE CASCADE NOT NULL,
  object_uri text,
  role text CHECK (role IN ('uploaded', 'retrieved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Chat analytics: tracks user behavior and query patterns
CREATE TABLE IF NOT EXISTS chat_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_turn_id uuid REFERENCES chat_turns(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  query_embedding_source text DEFAULT 'embeddinggemma:latest',
  response_latency_ms integer,
  rag_results_count integer,
  kag_facts_count integer,
  suggestions_count integer,
  user_feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_chat_turns_case_id ON chat_turns(case_id);
CREATE INDEX idx_chat_turns_user_id ON chat_turns(user_id);
CREATE INDEX idx_chat_turns_created_at ON chat_turns(created_at DESC);
CREATE INDEX idx_chat_turn_evidence_chat_turn_id ON chat_turn_evidence(chat_turn_id);
CREATE INDEX idx_chat_turn_evidence_evidence_id ON chat_turn_evidence(evidence_id);
CREATE INDEX idx_chat_analytics_user_id ON chat_analytics(user_id);
CREATE INDEX idx_chat_analytics_case_id ON chat_analytics(case_id);
CREATE INDEX idx_chat_analytics_created_at ON chat_analytics(created_at DESC);

-- JSONB indexes for faster queries
CREATE INDEX idx_chat_turns_llm_output ON chat_turns USING GIN (llm_output);
CREATE INDEX idx_chat_turns_rag_context ON chat_turns USING GIN (rag_context);
CREATE INDEX idx_chat_turns_kag_context ON chat_turns USING GIN (kag_context);
CREATE INDEX idx_chat_turns_did_you_mean ON chat_turns USING GIN (did_you_mean);
