-- Parent Atlas graph traversal indexes.
-- Keeps forward and reverse multi-hop expansion snapshot-qualified and edge-type aware.

CREATE INDEX IF NOT EXISTS atlas_graph_edges_v2_forward_typed_idx
  ON atlas_graph_edges_v2 (snapshot_id, source_node_key, edge_type, target_node_key);

CREATE INDEX IF NOT EXISTS atlas_graph_edges_v2_reverse_typed_idx
  ON atlas_graph_edges_v2 (snapshot_id, target_node_key, edge_type, source_node_key);

CREATE INDEX IF NOT EXISTS atlas_graph_nodes_v2_snapshot_type_node_idx
  ON atlas_graph_nodes_v2 (snapshot_id, node_type, node_key);

CREATE INDEX IF NOT EXISTS atlas_graph_nodes_v2_snapshot_source_ref_idx
  ON atlas_graph_nodes_v2 (snapshot_id, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_graph_relation_participants_v2_node_role_idx
  ON atlas_graph_relation_participants_v2 (snapshot_id, node_key, role, relation_id);
