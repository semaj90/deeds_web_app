-- Parent Atlas V2 graph persistence.
-- Additive only: legacy graph authority tables and atlas_packets score columns remain untouched.

CREATE TABLE IF NOT EXISTS atlas_graph_snapshots_v2 (
  snapshot_id uuid PRIMARY KEY,
  schema_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('BUILDING', 'VALIDATED', 'SUPERSEDED', 'FAILED')),
  source_manifest jsonb NOT NULL,
  projection_policy jsonb NOT NULL,
  node_count bigint NOT NULL DEFAULT 0 CHECK (node_count >= 0),
  edge_count bigint NOT NULL DEFAULT 0 CHECK (edge_count >= 0),
  relation_event_count bigint NOT NULL DEFAULT 0 CHECK (relation_event_count >= 0),
  excluded_count bigint NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
  unresolved_count bigint NOT NULL DEFAULT 0 CHECK (unresolved_count >= 0),
  source_hash text NOT NULL,
  topology_hash text NOT NULL,
  policy_hash text NOT NULL,
  eligibility_predicate text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);

CREATE TABLE IF NOT EXISTS atlas_graph_nodes_v2 (
  snapshot_id uuid NOT NULL REFERENCES atlas_graph_snapshots_v2(snapshot_id) ON DELETE RESTRICT,
  node_key text NOT NULL,
  node_type text NOT NULL,
  packet_key text,
  tree_node_id uuid,
  source_ref text,
  content_hash text,
  properties jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (snapshot_id, node_key),
  CHECK (node_type <> 'packet' OR packet_key IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS atlas_graph_nodes_v2_tree_node_unique
  ON atlas_graph_nodes_v2 (snapshot_id, tree_node_id)
  WHERE tree_node_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS atlas_graph_edges_v2 (
  snapshot_id uuid NOT NULL REFERENCES atlas_graph_snapshots_v2(snapshot_id) ON DELETE RESTRICT,
  edge_key text NOT NULL,
  source_node_key text NOT NULL,
  target_node_key text NOT NULL,
  edge_type text NOT NULL,
  weight double precision NOT NULL CHECK (weight >= 0 AND weight NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1 AND confidence NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  provenance text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (snapshot_id, edge_key),
  FOREIGN KEY (snapshot_id, source_node_key) REFERENCES atlas_graph_nodes_v2(snapshot_id, node_key) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id, target_node_key) REFERENCES atlas_graph_nodes_v2(snapshot_id, node_key) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS atlas_graph_relation_events_v2 (
  snapshot_id uuid NOT NULL REFERENCES atlas_graph_snapshots_v2(snapshot_id) ON DELETE RESTRICT,
  relation_id text NOT NULL,
  relation_type text NOT NULL,
  source_ref text NOT NULL,
  evidence_span text NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1 AND confidence NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  topology_hash text NOT NULL,
  PRIMARY KEY (snapshot_id, relation_id)
);

CREATE TABLE IF NOT EXISTS atlas_graph_relation_participants_v2 (
  snapshot_id uuid NOT NULL,
  relation_id text NOT NULL,
  node_key text NOT NULL,
  role text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (snapshot_id, relation_id, node_key, role),
  FOREIGN KEY (snapshot_id, relation_id) REFERENCES atlas_graph_relation_events_v2(snapshot_id, relation_id) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id, node_key) REFERENCES atlas_graph_nodes_v2(snapshot_id, node_key) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS atlas_graph_snapshot_exclusions_v2 (
  exclusion_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES atlas_graph_snapshots_v2(snapshot_id) ON DELETE RESTRICT,
  candidate_key text,
  packet_key text,
  source_ref text,
  exclusion_stage text NOT NULL,
  exclusion_reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, exclusion_stage, exclusion_reason, candidate_key)
);

CREATE TABLE IF NOT EXISTS atlas_graph_resolution_issues_v2 (
  issue_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES atlas_graph_snapshots_v2(snapshot_id) ON DELETE RESTRICT,
  issue_fingerprint text NOT NULL,
  packet_key text,
  node_key text,
  tree_node_id uuid,
  source_ref text,
  issue_type text NOT NULL,
  issue_status text NOT NULL CHECK (issue_status IN ('OPEN', 'RETRYABLE', 'QUARANTINED', 'IGNORED_BY_POLICY', 'RESOLVED', 'SUPERSEDED')),
  exclusion_stage text NOT NULL,
  candidate_matches jsonb NOT NULL DEFAULT '[]',
  evidence jsonb NOT NULL DEFAULT '{}',
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  topology_hash text NOT NULL,
  UNIQUE (snapshot_id, issue_fingerprint)
);

CREATE TABLE IF NOT EXISTS atlas_graph_authority_runs_v2 (
  run_id uuid PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES atlas_graph_snapshots_v2(snapshot_id) ON DELETE RESTRICT,
  engine text NOT NULL CHECK (engine IN ('networkx', 'neo4j_gds')),
  algorithm text NOT NULL CHECK (algorithm = 'pagerank'),
  algorithm_version text NOT NULL,
  configuration jsonb NOT NULL,
  topology_hash text NOT NULL,
  node_count bigint NOT NULL CHECK (node_count >= 0),
  edge_count bigint NOT NULL CHECK (edge_count >= 0),
  result_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('BUILDING', 'VALIDATING', 'PASSED', 'FAILED', 'SUPERSEDED')),
  did_converge boolean NOT NULL,
  ran_iterations integer NOT NULL CHECK (ran_iterations >= 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  UNIQUE (run_id, snapshot_id)
);

CREATE TABLE IF NOT EXISTS atlas_graph_authority_scores_v2 (
  run_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  node_key text NOT NULL,
  packet_key text,
  pagerank_raw double precision NOT NULL CHECK (pagerank_raw >= 0 AND pagerank_raw NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  pagerank_l1 double precision NOT NULL CHECK (pagerank_l1 >= 0 AND pagerank_l1 <= 1 AND pagerank_l1 NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  authority_percentile double precision NOT NULL CHECK (authority_percentile >= 0 AND authority_percentile <= 1),
  authority_band text NOT NULL CHECK (authority_band IN ('very-low', 'low', 'medium', 'high', 'very-high')),
  normalization_applied_by text NOT NULL,
  topology_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, node_key),
  FOREIGN KEY (run_id, snapshot_id) REFERENCES atlas_graph_authority_runs_v2(run_id, snapshot_id) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id, node_key) REFERENCES atlas_graph_nodes_v2(snapshot_id, node_key) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION atlas_graph_snapshot_v2_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('VALIDATED', 'SUPERSEDED', 'FAILED') THEN
    IF (to_jsonb(NEW) - 'status' - 'finalized_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'finalized_at') THEN
      RAISE EXCEPTION 'validated graph snapshot content is immutable';
    END IF;
    IF OLD.status = 'VALIDATED' AND NEW.status NOT IN ('VALIDATED', 'SUPERSEDED') THEN
      RAISE EXCEPTION 'validated graph snapshot can only become SUPERSEDED';
    END IF;
    IF OLD.status = 'SUPERSEDED' AND NEW.status <> 'SUPERSEDED' THEN
      RAISE EXCEPTION 'superseded graph snapshot status is immutable';
    END IF;
    IF OLD.status = 'FAILED' AND NEW.status <> 'FAILED' THEN
      RAISE EXCEPTION 'failed graph snapshot status is immutable';
    END IF;
  ELSIF OLD.status = 'BUILDING' AND NEW.status NOT IN ('BUILDING', 'VALIDATED', 'FAILED') THEN
    RAISE EXCEPTION 'invalid graph snapshot transition from BUILDING to %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS atlas_graph_snapshot_v2_immutable ON atlas_graph_snapshots_v2;
CREATE TRIGGER atlas_graph_snapshot_v2_immutable
BEFORE UPDATE ON atlas_graph_snapshots_v2
FOR EACH ROW EXECUTE FUNCTION atlas_graph_snapshot_v2_guard();

CREATE INDEX IF NOT EXISTS atlas_graph_edges_v2_source_idx ON atlas_graph_edges_v2 (snapshot_id, source_node_key);
CREATE INDEX IF NOT EXISTS atlas_graph_edges_v2_target_idx ON atlas_graph_edges_v2 (snapshot_id, target_node_key);
CREATE INDEX IF NOT EXISTS atlas_graph_resolution_issues_v2_status_idx ON atlas_graph_resolution_issues_v2 (issue_status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS atlas_graph_authority_scores_v2_packet_idx ON atlas_graph_authority_scores_v2 (snapshot_id, packet_key) WHERE packet_key IS NOT NULL;
