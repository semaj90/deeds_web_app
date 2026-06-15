-- Agentic Error Fixing: P1 Clustering + Recommendations Schema
-- Created: 2026-06-15 (Session 66 continued)
-- Purpose: Enable error clustering and LLM-powered fix recommendations

-- ════════════════════════════════════════════════════════════════════════════
-- Error Clusters (Fingerprint-based grouping)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS error_clusters (
  cluster_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Clustering
  error_category text NOT NULL,                    -- from error_logs.error_category
  fingerprint text NOT NULL,                       -- hash(category + message pattern)
  occurrence_count int DEFAULT 1,

  -- Linkage to codebase
  packet_key text REFERENCES atlas_codebase_packets(packet_key),
  source_ref text,
  feature_id text,

  -- Temporal tracking
  first_seen timestamptz DEFAULT now() NOT NULL,
  last_seen timestamptz DEFAULT now() NOT NULL,

  -- Metadata (flexible layer)
  metadata jsonb DEFAULT '{}'::jsonb,
  -- Expected keys:
  -- {
  --   "affected_routes": ["/api/embed", "/api/rag/search"],
  --   "severity_distribution": {"CRITICAL": 2, "ERROR": 5},
  --   "root_cause_hypotheses": ["Ollama timeout", "GPU OOM"],
  --   "fix_confidence": 0.75
  -- }

  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_error_clusters_fingerprint ON error_clusters(fingerprint);
CREATE INDEX IF NOT EXISTS idx_error_clusters_category ON error_clusters(error_category);
CREATE INDEX IF NOT EXISTS idx_error_clusters_packet_key ON error_clusters(packet_key);
CREATE INDEX IF NOT EXISTS idx_error_clusters_source_ref ON error_clusters(source_ref);
CREATE INDEX IF NOT EXISTS idx_error_clusters_metadata_gin ON error_clusters USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_error_clusters_last_seen ON error_clusters(last_seen DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- Error Recommendations (LLM-powered fix suggestions)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS error_recommendations (
  recommendation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES error_clusters(cluster_id) ON DELETE CASCADE,

  -- Linkage to codebase
  packet_key text REFERENCES atlas_codebase_packets(packet_key),
  source_ref text,
  feature_id text,

  -- Recommendation content
  recommendation_text text NOT NULL,
  fix_strategy text,                               -- 'pattern', 'ast', 'semantic', 'manual'
  confidence double precision DEFAULT 0.5,         -- 0.0 - 1.0

  -- Application status
  status text DEFAULT 'planned',                   -- 'planned', 'in_progress', 'applied', 'rejected', 'needs_review'
  priority text DEFAULT 'P2',                      -- 'P0', 'P1', 'P2', 'P3'

  -- Metadata (execution details)
  metadata jsonb DEFAULT '{}'::jsonb,
  -- Expected keys:
  -- {
  --   "roi_score": 0.85,
  --   "effort_minutes": 15,
  --   "estimated_impact": "high",
  --   "applied_at": "2026-06-16T10:30:00Z",
  --   "validation_gates_passed": 4,
  --   "regression_detected": false
  -- }

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  applied_at timestamptz,
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_error_recommendations_cluster ON error_recommendations(cluster_id);
CREATE INDEX IF NOT EXISTS idx_error_recommendations_status ON error_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_error_recommendations_priority ON error_recommendations(priority);
CREATE INDEX IF NOT EXISTS idx_error_recommendations_packet_key ON error_recommendations(packet_key);
CREATE INDEX IF NOT EXISTS idx_error_recommendations_source_ref ON error_recommendations(source_ref);
CREATE INDEX IF NOT EXISTS idx_error_recommendations_metadata_gin ON error_recommendations USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_error_recommendations_confidence ON error_recommendations(confidence DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- Task Board (Kanban-style work tracking)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS atlas_tasks (
  task_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core task info
  title text NOT NULL,
  description text,
  task_type text,                                  -- 'backfill', 'fix', 'verify', 'audit'
  status text NOT NULL DEFAULT 'planned',          -- 'planned', 'in_progress', 'blocked', 'done'
  priority text DEFAULT 'P2',

  -- Linkage to codebase
  packet_key text REFERENCES atlas_codebase_packets(packet_key),
  source_ref text,
  feature_id text,
  feature_label text,
  tree_node_id uuid REFERENCES atlas_tree_nodes(tree_node_id),

  -- Workflow
  lane text,                                       -- 'retrieval', 'inference', 'storage', 'verification'
  blocker text,                                    -- reference to blocking task or issue

  -- Metadata (flexible execution context)
  metadata jsonb DEFAULT '{}'::jsonb,
  -- Expected keys:
  -- {
  --   "estimated_hours": 2,
  --   "assigned_to": "claude",
  --   "pr_number": 142,
  --   "related_issues": [123, 456],
  --   "rollback_plan": "revert commit abc123",
  --   "success_criteria": ["all tests pass", "no regressions"]
  -- }

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atlas_tasks_status ON atlas_tasks(status);
CREATE INDEX IF NOT EXISTS idx_atlas_tasks_priority ON atlas_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_atlas_tasks_task_type ON atlas_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_atlas_tasks_lane ON atlas_tasks(lane);
CREATE INDEX IF NOT EXISTS idx_atlas_tasks_packet_key ON atlas_tasks(packet_key);
CREATE INDEX IF NOT EXISTS idx_atlas_tasks_source_ref ON atlas_tasks(source_ref);
CREATE INDEX IF NOT EXISTS idx_atlas_tasks_feature_id ON atlas_tasks(feature_id);
CREATE INDEX IF NOT EXISTS idx_atlas_tasks_metadata_gin ON atlas_tasks USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_atlas_tasks_status_priority ON atlas_tasks(status, priority);

-- ════════════════════════════════════════════════════════════════════════════
-- VIEWS: Kanban + Reporting
-- ════════════════════════════════════════════════════════════════════════════

-- Work queue (what's in flight?)
CREATE OR REPLACE VIEW v_atlas_kanban_board AS
SELECT
  task_id,
  title,
  status,
  priority,
  lane,
  metadata->>'assigned_to' as assigned_to,
  metadata->>'estimated_hours' as estimated_hours,
  created_at,
  updated_at
FROM atlas_tasks
ORDER BY
  CASE status
    WHEN 'in_progress' THEN 1
    WHEN 'blocked' THEN 2
    WHEN 'planned' THEN 3
    WHEN 'done' THEN 4
  END,
  CASE priority
    WHEN 'P0' THEN 1
    WHEN 'P1' THEN 2
    WHEN 'P2' THEN 3
    WHEN 'P3' THEN 4
  END;

-- Error cluster summary
CREATE OR REPLACE VIEW v_error_clusters_summary AS
SELECT
  cluster_id,
  error_category,
  fingerprint,
  occurrence_count,
  COUNT(DISTINCT r.recommendation_id) as recommendation_count,
  SUM(CASE WHEN r.status = 'applied' THEN 1 ELSE 0 END)::int as applied_count,
  ROUND(AVG(r.confidence)::numeric, 2) as avg_confidence,
  first_seen,
  last_seen
FROM error_clusters c
LEFT JOIN error_recommendations r ON c.cluster_id = r.cluster_id
GROUP BY c.cluster_id
ORDER BY last_seen DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- AUDIT: Verify schema is live
-- ════════════════════════════════════════════════════════════════════════════

-- Run this to verify:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('error_clusters', 'error_recommendations', 'atlas_tasks')
-- ORDER BY table_name;
