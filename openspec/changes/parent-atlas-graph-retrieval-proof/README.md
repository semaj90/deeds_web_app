# parent-atlas-graph-retrieval-proof

Graph identity and retrieval proof change for Parent Atlas. This change separates provisional `tree_node_id` lineage from canonical symbol identity and defines the proof gates required before any graph snapshot is promoted.

The companion workstation board now carries an explicit `0-100` completeness view for each major gate so the master todo can track partial progress without collapsing everything into pass/fail.

**See also**: `parent-atlas-retrieval-lod-algorithm-taxonomy` domains 2–3 (graph traversal, graph
structural features) are explicitly blocked on this change's identity split landing — do not design
those domains' APIs against `tree_node_id` before that proof completes.
