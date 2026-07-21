# Phase 107 Unresolved File Edges

Status: audit complete.

The six unresolved `feature_file_edges` rows split into two causes:

- Five rows are path-normalization mismatches. The file exists under `sveltekit-frontend/...`, while the edge stores `scripts/...` or `src/...` without the app prefix.
- One row is registry drift. The recorded path points at an old location and does not resolve to a candidate packet even after prefix normalization.

## Rows

| feature_key | file_path | role | candidate_count | candidate_packet_keys | cause | evidence |
|---|---|---:|---:|---|---|---|
| `hypergraph.4d` | `scripts/run-hypergraph.ts` | consumer | 1 | `packet:b95a210a8bcc` | PATH_NORMALIZATION_MISMATCH | Canonical packet path is `sveltekit-frontend/scripts/run-hypergraph.ts`; raw edge path is missing the app prefix. |
| `hyperrag.lane.feature_atlas` | `scripts/seed-feature-atlas.mjs` | primary | 1 | `packet:46b372ea79f6` | PATH_NORMALIZATION_MISMATCH | Canonical packet path is `sveltekit-frontend/scripts/seed-feature-atlas.mjs`; raw edge path is missing the app prefix. |
| `hyperrag.lane.graph_neighbors` | `src/lib/server/graph/graph-informed-retrieval.ts` | consumer | 0 | _none_ | REGISTRY_DRIFT | The tracked file is `sveltekit-frontend/src/lib/server/retrieval/graph-informed-retrieval.ts`, which is a different path and directory. |
| `mcp.trace_server` | `scripts/ensure-mcp-server.mjs` | consumer | 1 | `packet:1c80ac554be1` | PATH_NORMALIZATION_MISMATCH | Canonical packet path is `sveltekit-frontend/scripts/ensure-mcp-server.mjs`; raw edge path is missing the app prefix. |
| `synth.loop` | `scripts/synth/handoff-to-claude.mjs` | consumer | 1 | `packet:445fd8315e93` | PATH_NORMALIZATION_MISMATCH | Canonical packet path is `sveltekit-frontend/scripts/synth/handoff-to-claude.mjs`; raw edge path is missing the app prefix. |
| `synth.loop` | `scripts/synth/run-loop.mjs` | primary | 1 | `packet:a3889fb32f1a` | PATH_NORMALIZATION_MISMATCH | Canonical packet path is `sveltekit-frontend/scripts/synth/run-loop.mjs`; raw edge path is missing the app prefix. |

## Evidence summary

- Total `feature_file_edges` rows: 34
- Resolved rows: 28
- Unresolved rows: 6
- Candidate packet matches after restoring the `sveltekit-frontend/` prefix: 5
- Candidate packet matches without the prefix: 0

IMPLEMENTED
- Read-only unresolved-edge census completed.

PROVEN
- Five unresolved rows are prefix normalization mismatches.
- One unresolved row is stale registry drift.

EXPECTED GAPS
- No binding was created for the ambiguous or stale row.

UNRESOLVED
- Whether `hyperrag.lane.graph_neighbors` should be remapped to the retrieval path or retired.

UNSAFE CONSTRAINTS
- Do not auto-bind any of the six rows yet.
- Do not treat a single ambiguous packet candidate as sufficient.

NOT YET PROVEN
- Which downstream consumer owns the stale `graph-informed-retrieval` path.

NEXT SAFE ACTION
- Add the additive `feature_packet_bindings` table, then let the materializer consume it as a labeled bridge instead of forcing direct packet projection.
