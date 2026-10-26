# OpenSpec–Package Candidate Graph Overlay

Date: 2026-10-23

## Outcome

The overlay demonstrates a bounded two-hop **candidate** path from a task reference to a file and then to package-import candidates. It is not canonical graph evidence, a semantic dependency graph, or an admitted workspace snapshot. `DIR-INDEX-08A` remains open.

## Inputs

- Existing package graph: `.tmp/atlas/directory-intelligence/dir-graph-wholerepo-20261023-v1/manifest.json`, receipt SHA-256 `d5fd2277816be886dbf1697c66224aa3ba18a4ca6ccd92529309cdeefbaa0c90`.
- Frozen task path run: `.tmp/atlas/directory-intelligence/openspec-source-path-edges/openspec-paths-graph-20261023T010130Z/manifest.json`, manifest-body SHA-256 `97f0940bd9888195761690ff406259f588976452c82fae436cf44fb95a138076`.
- Task-path independent readback SHA-256 `2915a201cebf3122335c977fb037f4bf2657287e12722d080714c796b9aa6848`.
- Task path rows SHA-256 `66891005977f748f5748ca87d731089469a455a39d57afeaac2b05efef0e85aa`.

## Results

Final graph manifest: `.tmp/atlas/directory-intelligence/openspec-package-candidate-graph/openspec-package-final-20261023T010453Z/manifest.json`.

- Manifest-body SHA-256: `14327bdfecd95a48a490ac27bcde9f60b393271359d9cb7eca4f4b3fd6796e05`.
- 17,713 nodes and 30,430 edges: 13,218 directory containment, 3,674 task-to-file path candidates, and 13,538 package-import candidates.
- All 13,538 retained package-import spans match current source bytes and the exact captured import-specifier span. One stale package source edge was excluded for a digest mismatch; no import-span mismatches occurred.
- All 3,674 task-path edges still resolve to current regular files with matching captured sizes and, where available, content digests. 961 task-reference rows join to files in the package graph.
- Bounded traversal uses `maxHops=2`, `maxFanout=20`: 782 task nodes reach package candidates across 68 package nodes. Four task traversals report fanout truncation. The most frequently reached candidate package nodes are `pg` (344 tasks), `zod` (182), `numpy` (90), and `ioredis` (79); these are lexical/reference reach counts, not relevance or runtime-use scores.

Independent readback: `.tmp/atlas/directory-intelligence/openspec-package-candidate-graph/openspec-package-final-20261023T010453Z/independent-readback.json`, SHA-256 `6c2dea4e5736752d7e01b56ac92746429764b5d9ba242a33da3398180024d8a8`. It independently verified all graph endpoints and ordinals, all task spans and block/file digests, all package import spans against current bytes, and recomputed the bounded package reach counts.

## Limits

- Task paths are literal references, not dependency or requirement-authority edges.
- Package edges are exact-span source observations, not proof that a dependency executes at runtime.
- Task, file, package, and ordinal labels remain run-local candidates; there is no workspace revision or canonical identity binding.
- Four traversals were fanout-truncated and remain explicitly flagged.
- No database, cache, Graphify, Neo4j, ACE, or model writes occurred. No GPU computation was run because these candidate edges are not qualified semantic graph inputs.
