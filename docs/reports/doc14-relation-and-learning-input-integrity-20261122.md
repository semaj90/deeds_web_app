# DOC-14 relation and learning-input integrity

Date: 2026-11-22

## Change

The GraphRAG/OAK feature compiler previously accepted relation-shaped dictionaries without checking their admission state. Its CLI also consumed pending proposal samples as graph edges, attached the same hardcoded concept labels to every document, and supplied a constant placeholder graph revision. Separately, the candidate-pair exporter labeled fixed heuristic score differences as GRPO pairs, while the MCTS path reported `EXTERNAL_VERIFIED` despite defaulting absent reward fields to zero.

The compiler now requires each supplied graph relation to be explicitly `GRAPH_ADMITTED`, canonical, bound to the selected graph revision, and accompanied by source/evidence identity and endpoints. The CLI only selects rows already explicitly admitted; it no longer makes proposal rows into edges or invents OAK mappings. Its local graph input checksum is labeled as derived and noncanonical.

Heuristic ranking pairs are now labeled `atlas.doc14-ranking-pair-diagnostic.v1`, `FIXED_FEATURE_HEURISTIC`, and `trainingEligible=false`. The preference diagnostic loader requires independently verified reward provenance, a receipt ID, evidence references, and finite chosen/rejected rewards. Its output is explicitly `mcts-preference-diagnostic` (`trainingRunPerformed=false`, `policyUpdated=false`), not a PPO/GRPO trainer; it cannot promote or write canonical state.

## Verification

Command:

```powershell
C:\Python313\python.exe -m pytest python/tests/test_graphrag_oak_matrix_compiler_v1.py python/tests/test_mcts_grpo_array_queue_v1.py -q
```

Result: **6 passed**.

## Limits

This proves local rejection/labeling contracts. It does not prove a live admitted documentation edge, OAK mapping/admission, production ACE use, actual DSPy RLM execution, GEPA optimization, DPO/PPO training, or persistent graph/cache writes. No OpenSpec task checkbox was changed.

## OAK candidate review handoff

Added `build_doc14_oak_mapping_review_v1` to join the current `atlas.api-document-fact.v1` proposal with the existing `atlas.oaklib-candidate-bundle.v1` returned by `search_oaklib_label_candidates_v1`. The helper independently checks the expected normalized-document SHA-256, source revision, source identity, UTF-8 evidence span, pending `DOCUMENTED_BY` proposal shape, OAK ontology/producer revisions, and exact search-term-to-candidate IDs. It emits a checksummed `atlas.doc14-oak-mapping-review.v1` with candidates marked `SUGGESTED_REQUIRES_REVIEW`; it intentionally does not choose an ontology ID or admit an edge.

The join accepts both the flat existing adapter result and the sidecar's exact `atlas.oaklib-label-search-response.v1` shape. It checks the response and nested bundle revisions/status/authority flags. A service-shaped test caught that OAK-generated evidence refs include the server's ontology source selector (a local path); the review serializer now replaces that selector with a stable checksum before emitting refs.

Verification: the focused compiler/review/learning-input suite passed 12 tests. The OAK sidecar route, API-fact extractor, and OKF writer regression suite passed 35 tests. The composed producer tests use fixture/mocked OAK dependencies; the separate live probe is recorded below. No store write occurred.

Follow-up live probe: `GET http://127.0.0.1:8095/health` returned a healthy sidecar, but a read-only `POST /ontology/oaklib/search` for `dspy.RLM` returned HTTP 503 with `OAKLIB_SOURCE_NOT_CONFIGURED`. This is the current live blocker for a real OAK candidate bundle. No service configuration or data was changed.

## Optional actual DSPy Predict adapter

Added `make_dspy_predict_synthesizer_v1` to the existing bounded DOC-14 recommender. It lazily imports DSPy, constructs a typed `dspy.Signature` and one `dspy.Predict`, and sends only the already verified citation spans as bounded JSON. The model returns an answer plus supporting chunk IDs; the adapter rejects IDs outside the verified citation set, and the recommender returns only the selected verified citations. No tools or interpreter are exposed. The old public runner name remains for caller compatibility, but its documentation now explicitly says it is not DSPy RLM.

Verification: combined focused tests passed 17/17, including fixture-injected `Predict` invocation and rejection of an invented citation ID. The Windows and WSL package probes both report `dspy` absent, so this is adapter/fake-module contract evidence only. No actual DSPy model invocation, ACE manifest transport, semantic claim-to-citation entailment check, or GEPA run was performed. The next gate is a real DSPy dependency/runtime and model call over a current admitted ACE manifest with independent response validation.

## Official implementation references checked

- DSPy RLM exposes explicit `max_iters`, `max_llm_calls`, and `max_output_chars`; its host-provided tools retain their own privileges. The documented `LocalInterpreter` is not a security sandbox, so a production RLM path needs an isolated interpreter/service and narrow read-only tools: https://dspy.ai/current/api/modules/RLM/ and https://dspy.ai/current/diving-deeper/rlm/.
- DSPy GEPA is a reflective program/prompt optimizer that relies on a metric/feedback and validation set; it should remain offline until reviewed train/validation/held-out examples and a promotion receipt exist: https://github.com/stanfordnlp/dspy/blob/main/docs/docs/api/optimizers/GEPA/overview.md and https://github.com/stanfordnlp/dspy/blob/main/docs/docs/getting-started/gepa-optimization.md.
- OAK describes mappings as cross-ontology connections and uses SSSOM to retain mapping metadata; a lexical candidate is therefore a review suggestion, not a truth/admission signal: https://incatools.github.io/ontology-access-kit/guide/mappings.html.
- DPO requires comparative preference examples; PPO is on-policy RL based on sampled trajectories and rewards. Neither is unsupervised. Keep both deferred until the corresponding independently reviewed data exists: https://proceedings.neurips.cc/paper_files/paper/2023/file/a85b405ed65c6477a4fe8302b5e06ce7-Paper-Conference.pdf and https://spinningup.openai.com/en/latest/algorithms/ppo.html.

## ContextManifestV2 handoff verification (2026-11-22)

Added `run_bounded_dspy_recommendation_with_ace_manifest_v1` to bind the recommender to the existing ContextManifestV2 contract. The adapter recomputes the identity checksum using the TypeScript-compatible canonical encoding; checks exact query equality, V1 required fields, evidence-revision fields, selected node/evidence allowlists, independently readback chunk status/hash, and source-revision-set checksum; then enforces the lower of the manifest token budget and caller cap before calling the typed DSPy Predict adapter.

Verification:

- `C:\Python313\python.exe -m pytest python/tests/test_doc14_bounded_rlm_recommender_v1.py -q`: **6 passed**.
- `C:\Python313\python.exe -m pytest python/tests/test_api_document_fact_v1.py python/tests/test_graphrag_oak_matrix_compiler_v1.py python/tests/test_mcts_grpo_array_queue_v1.py -q`: **12 passed**. Combined with the recommender tests: **18 passed**.
- `openspec validate parent-atlas-versioned-doc-intelligence --strict`: valid.
- `node scripts/atlas/gan-validation-hook.mjs`: PASS, 349 rows (69 done, 62 partial, 218 open). This is an advisory census, not DOC-14 completion proof.
- `git diff --check` reported unrelated existing trailing whitespace in `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml`; it did not provide a clean whole-worktree check.

Limits: Windows Python does not have DSPy installed, so Predict is fixture-injected. The OAK source is still unconfigured at live :8095. This does not prove live OAK resolution, a production caller, current authorized Postgres readback, an actual model call, claim-to-span entailment, ACE packet/Valkey write-readback, Graphify admission, GEPA, or preference/RL training. No task checkbox or persistent store was changed.
