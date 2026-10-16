# Parent Atlas function/topology search index

This index maps searchable concepts to their existing owners. It is an inventory and diagnostic contract, not a new canonical registry, production ranking lane, or database migration.

| Search concept | Existing owner | Join / use | Qualification boundary |
|---|---|---|---|
| Callable function metadata | `repo_function_registry` | `source_ref`, `feature_id`, `feature_label`, keywords, lanes, metadata | Enrichment catalog; not revision-authoritative symbol identity |
| Stable symbol identity and version | `atlas_symbol_registry`, `atlas_symbol_versions` | `stable_symbol_id` → `symbol_version_id`; packet key and source/span fields | Canonical symbol/source qualification remains with the PostgreSQL loader and Function Registry gate |
| 4D topology projection | `atlas_topology_index` | `packet_key` → x_cosine, y_graph, z_som, w_authority | Derived projection; topology version does not prove source/workspace revision match |
| 20×20 SOM feature coordinates | `atlas_feature_vectors.som_x/som_y`; packet/topology `som_row/som_col` | Exact `packet_key`, with tree-node consistency check where available | A 0–19 coordinate is structurally valid, not evidence of complete/current coverage |
| Lexical repository search | `search/rg-pool.ts` and existing SearchRuntime lexical lane | Bounded query terms and repository paths | `rg` is candidate discovery; SearchRuntime remains fusion owner |
| Radix sort | `scripts/atlas/ace-radix-01/` | Packed-key benchmark and fixtures | Experimental ordering primitive; not a deployed function-search index |
| Inverse citation lookup | `graph/phase109a-inverse-lookup.ts` | Neo4j `CITES` edge lookup | Derived graph query; not canonical PostgreSQL identity |

The read-only helper `retrieval/function-topology-subhelpers-v1.ts` exercises exact packet-key joins, rejects ambiguous or inconsistent projection rows, validates SOM coordinates, and labels all matches `canonicalAuthority=false` and `revisionQualified=false`. It deliberately does not fuse scores or authorize ContextManifest admission.

No additional combined table is recommended until a read-only census proves the existing joins' coverage and revision semantics. Any eventual retrieval integration must preserve PostgreSQL identity, use the existing `rg`/SearchRuntime lanes, and keep the 4D/SOM values as optional derived metadata.
