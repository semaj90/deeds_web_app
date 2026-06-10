-- Citation annotation + evidence edge flow sidecar migration
-- Reason: keeps migration sidecar-style and avoids journal churn while adding JSONB-rich tables.

CREATE TABLE IF NOT EXISTS saved_citation_annotations (
  id text PRIMARY KEY,
  citation_id uuid NOT NULL REFERENCES saved_citations(id) ON DELETE CASCADE,
  user_id text,
  annotation_type text NOT NULL DEFAULT 'comment',
  body text NOT NULL,
  logic text NOT NULL DEFAULT 'add_comment_under_saved_citation',
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  chunk_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  llm_output text,
  token_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_citation_annotations_citation_idx
  ON saved_citation_annotations (citation_id);

CREATE INDEX IF NOT EXISTS saved_citation_annotations_user_idx
  ON saved_citation_annotations (user_id);

CREATE INDEX IF NOT EXISTS saved_citation_annotations_created_idx
  ON saved_citation_annotations (created_at);

CREATE TABLE IF NOT EXISTS evidence_board_edges (
  id text PRIMARY KEY,
  board_id text,
  from_node_id text NOT NULL,
  to_node_id text NOT NULL,
  relation_type text NOT NULL,
  citation_id uuid REFERENCES saved_citations(id) ON DELETE SET NULL,
  annotation_id text REFERENCES saved_citation_annotations(id) ON DELETE SET NULL,
  confidence real NOT NULL DEFAULT 0.5,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_board_edges_citation_idx
  ON evidence_board_edges (citation_id);

CREATE INDEX IF NOT EXISTS evidence_board_edges_annotation_idx
  ON evidence_board_edges (annotation_id);

CREATE INDEX IF NOT EXISTS evidence_board_edges_board_idx
  ON evidence_board_edges (board_id);
