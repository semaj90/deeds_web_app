# DOC-14 DSPy native ACE wiring (2026-11-22)

## Result

The bounded DOC-14 ACE recommender now resolves/configures its model through the existing ACE recommender owner. With no injected model, synthesis discovers the served model from `/v1/models` and constructs DSPy's native `lm15` client. Resolution is lazy: it occurs only when synthesis is invoked, after the ContextManifest and evidence joins and token-budget checks. Tests can inject a resolver or LM without network access.

The shared ACE resolver honors `DSPY_LM_API_BASE` and accepts either a service root or a `/v1` URL. `DSPY_LM_MODEL`, when supplied, must match the currently served model. No new provider path or database/cache writer was added.

## Verification

- Windows Python 3.13: DSPy `3.5.0`, LiteLLM `1.78.7` installed. This is the host interpreter, not the repair-worker container.
- Read-only model discovery: `gemma4-legal-iq4xs-direct.gguf` was returned by the configured endpoint; the native `lm15` client constructed with API base `http://127.0.0.1:8090/v1`.
- `C:\Python313\python.exe -m pytest python/tests/test_doc14_bounded_rlm_recommender_v1.py -q`: 8 passed.
- `C:\Python313\python.exe -m pytest python/tests/test_dspy_predict_ace_recommender_v1.py -q`: 3 passed.
- `openspec validate parent-atlas-versioned-doc-intelligence --strict`: valid.
- `node scripts/atlas/gan-validation-hook.mjs`: PASS; census 349 total / 69 done / 62 partial / 218 open. This is an advisory census, not DOC-14 completion proof.
- Read-only indexing audit: `tmp/atlas-indexing-surfaces-live-doc14-20261122.json` (PostgreSQL 18.4; 274,428/274,465 embedding rows; source packet binding still absent for this request).

## Limits and remaining gates

No inference request was sent. The running Docker worker was not inspected or rebuilt. There is still no demonstrated current, independently admitted ACE ContextManifest for this corpus, no semantic claim-entailment review, no OAK-backed reviewed relation admitted to Graphify/PostgreSQL, no authorized ACE/Valkey write/readback, and no reviewed relevance labels for GEPA or supervised ranking. DPO/PPO remain out of scope until valid preference or reward data exists. No task checkbox was changed.

A read-only PostgreSQL indexing-surface audit confirmed PostgreSQL `18.4` and `274,428/274,465` populated `content_embedding_768` rows, while noting that embeddings still require source binding. Exact `find_source_refs` calls for the recommender modules and task ledger returned `NO_PACKET`. A live Atlas `build_agentic_rag_context` call returned `MISSING_SOURCE_REVISION`, `UNADMITTED_RETRIEVAL_CANDIDATES`, and `proofUsable=false` (4 ranked hits, only 1 identity-bound). These results are diagnostic and were not sent to DSPy. They confirm that the dense corpus being populated does not supply a current packet-bound context for this request; local fixtures cannot substitute for that canonical ContextManifest.

The existing read-only workspace-source observer produced `.tmp/atlas/doc14-ace-source-binding-observation-20261122.json`: 37,748 source bindings, 233 skipped sources, and a dirty current tree. It confirms the changed DOC-14 Python modules/tests are untracked at the base Git commit, while `tasks.md` is a modified tracked file. These exact-byte bindings remain noncanonical observations; publishing source packets still requires the existing indexing/admission path and independent readback.

`likely_cause`: The DOC-14 Predict adapter previously depended on injected LM/global DSPy configuration, so its ACE path was not explicitly bound to the live native model owner.

`evidence`: Existing `dspy_predict_ace_recommender_v1.py` resolver; Windows DSPy 3.5.0; read-only served-model discovery; 7 DOC-14 tests and 3 ACE resolver tests passed.

`patch_targets`: `python/atlas_graph_runtime/doc14_bounded_rlm_recommender_v1.py`; `python/atlas_graph_runtime/dspy_predict_ace_recommender_v1.py`; `python/tests/test_doc14_bounded_rlm_recommender_v1.py`; `openspec/changes/parent-atlas-versioned-doc-intelligence/tasks.md`.

`safe_next_command`: `C:\Python313\python.exe -m pytest python/tests/test_doc14_bounded_rlm_recommender_v1.py python/tests/test_dspy_predict_ace_recommender_v1.py -q`

`smoke_command`: `C:\Python313\python.exe -c "import sys; sys.path.insert(0,'python'); from atlas_graph_runtime.dspy_predict_ace_recommender_v1 import build_native_dspy_lm_v1; lm=build_native_dspy_lm_v1(); print(lm.engine, lm.model)"`

`report_path`: `docs/reports/doc14-dspy-native-ace-lm15-wiring-20261122.md`
