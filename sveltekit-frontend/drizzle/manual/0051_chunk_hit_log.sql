-- Chunk Hit Log — Feedback Loop A: Retrieval Analytics
-- Tracks which chunks were selected by workers and ranked by the ACE pipeline.
-- Powers demand_score feedback signal for improving retrieval rank weights.

CREATE TABLE IF NOT EXISTS chunk_hit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  trace_id uuid NOT NULL,
  query_hash varchar(8) NOT NULL,
  packet_key varchar(255),
  source_ref varchar(255),
  feature_id varchar(255),
  lane varchar(50) NOT NULL,
  rank integer NOT NULL,
  score real,
  used_in_answer boolean DEFAULT false NOT NULL,
  demand_score real DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_chunk_hit_log_trace_id ON chunk_hit_log(trace_id);
CREATE INDEX idx_chunk_hit_log_query_hash ON chunk_hit_log(query_hash);
CREATE INDEX idx_chunk_hit_log_packet_key ON chunk_hit_log(packet_key);
CREATE INDEX idx_chunk_hit_log_lane ON chunk_hit_log(lane);
CREATE INDEX idx_chunk_hit_log_demand_score ON chunk_hit_log(demand_score DESC);
