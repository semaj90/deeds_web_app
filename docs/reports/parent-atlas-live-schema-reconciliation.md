# Parent Atlas Live Schema Reconciliation

- Generated: 2026-07-19T22:25:59.164Z
- Status: PASS_WITH_WARNINGS
- Signature: `089f704796c4540c1a80156d2c0c78a60a24c9bad64ecad34694277f229045ea`

## Totals
- Tables checked: 3
- Missing tables: 0
- Canonical groups present: 28/29
- Alias-only groups: 1
- Missing groups: 0
- Type mismatches: 0
- Indexes found: 9/9
- Indexes missing: 0

## Tree Nodes (atlas_tree_nodes)
- Exists: yes
- Rows: 116608
- Canonical groups: 14/14
- Alias-only groups: 0
- Missing groups: 0
- Indexes found: 3/3
  - node_id: CANONICAL
  - packet_key: CANONICAL
  - root_id: CANONICAL
  - parent_id: CANONICAL
  - source_ref: CANONICAL
  - file_path: CANONICAL
  - page_index_path: CANONICAL
  - node_type: CANONICAL
  - tree_depth: CANONICAL
  - title: CANONICAL
  - summary: CANONICAL
  - metadata: CANONICAL
  - ledger_type: CANONICAL
  - lineage_version: CANONICAL

## Summary Layers (atlas_summary_layers)
- Exists: yes
- Rows: 18423
- Canonical groups: 7/8
- Alias-only groups: 1
- Missing groups: 0
- Indexes found: 2/2
  - packet_key: CANONICAL
  - summary_type: ALIAS_ONLY (summary_level)
  - summary_text: CANONICAL
  - embedding: CANONICAL
  - keywords: CANONICAL
  - metadata: CANONICAL
  - generated_at: CANONICAL
  - model_name: CANONICAL

## Topology Index (atlas_topology_index)
- Exists: yes
- Rows: 63895
- Canonical groups: 7/7
- Alias-only groups: 0
- Missing groups: 0
- Indexes found: 4/4
  - packet_key: CANONICAL
  - x_cosine: CANONICAL
  - y_graph: CANONICAL
  - z_som: CANONICAL
  - w_authority: CANONICAL
  - community_id: CANONICAL
  - tree_node_id: CANONICAL

## Recommended actions
- [alias] Normalize callsites to summary_type and preserve summary_level only as compatibility aliases.
