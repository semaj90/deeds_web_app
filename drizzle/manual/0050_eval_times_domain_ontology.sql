-- Phase 20.5 — atlas_retrieval_eval_times: add domain_class, ontology_label, topology_label
-- These columns separate capability identity (feature_id) from domain/ontology classification.
--
--   feature_id      = stable capability identifier  e.g. retrieval.hyperrag.packet_rpc
--   domain_class    = knowledge domain bucket       e.g. retrieval_pipeline / graph_topology
--   ontology_label  = ontology classification       e.g. hyperrag_fusion / som_cluster
--   topology_label  = structural graph role         e.g. core_search_entrypoint / cache_mirror

ALTER TABLE atlas_retrieval_eval_times
  ADD COLUMN IF NOT EXISTS domain_class    text,
  ADD COLUMN IF NOT EXISTS ontology_label  text,
  ADD COLUMN IF NOT EXISTS topology_label  text;

CREATE INDEX IF NOT EXISTS idx_eval_times_domain_class
  ON atlas_retrieval_eval_times (domain_class);

CREATE INDEX IF NOT EXISTS idx_eval_times_ontology_label
  ON atlas_retrieval_eval_times (ontology_label);

COMMENT ON COLUMN atlas_retrieval_eval_times.feature_id     IS 'Stable capability/function identity, e.g. retrieval.hyperrag.packet_rpc';
COMMENT ON COLUMN atlas_retrieval_eval_times.domain_class   IS 'Domain/ontology bucket, e.g. retrieval_pipeline, graph_topology, runtime_evidence';
COMMENT ON COLUMN atlas_retrieval_eval_times.ontology_label IS 'Ontology classification, e.g. hyperrag_fusion, som_cluster, ace_context';
COMMENT ON COLUMN atlas_retrieval_eval_times.topology_label IS 'Structural graph role, e.g. core_search_entrypoint, cache_mirror, graph_neighbor';
