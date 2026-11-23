# DOC-14 DSPy claim-to-span validation

Date: 2026-11-22

## Change

The optional DSPy `Predict` output now has to provide a bounded JSON list of atomic claims. Each claim must name a selected chunk and include a quote found exactly in that chunk's already verified UTF-8 evidence span. The adapter derives the quote's byte offsets and binds them to the source reference and revision. The recommender independently checks the quote, byte offsets, source identity, and that the returned answer is exactly the listed claims joined together.

The receipt labels these results `EXACT_QUOTE_MATCH_REVIEW_REQUIRED`. Exact text matching demonstrates that the quoted bytes exist; it does not establish that the quote semantically entails the claim. Human/independent semantic review remains required.

## LiteLLM and DSPy runtime findings

- The attached trace shows DSPy's default XML adapter failing to parse free-form text from the local model endpoint. It also shows that allowing a model to emit a valid chunk ID does not ensure that its answer is supported by that chunk.
- Current app configuration sets `LITELLM_ENABLED=false`; Docker Compose describes Bifrost as the replacement. However, `docker/atlas-dspy-repair-worker/requirements.lock.txt` still pins `litellm==1.105.1`, so complete dependency removal is not established.
- LiteLLM's official incident report identifies `1.107.0` as the compromised October 2026 PyPI release. This does not establish the safety of every other version; the remaining lock needs independent review before that worker is used.
- No LiteLLM model call, repository dependency update, live model inference, database write, ACE publication, or ontology/Graphify admission occurred in this pass.

## Verification

- WSL2 `atlas-rapids-cu13` (Python's pytest 9.1.1): `test_doc14_bounded_rlm_recommender_v1.py` and `test_api_document_fact_v1.py`: **13 passed**.
- `openspec validate parent-atlas-versioned-doc-intelligence --strict`: valid.
- GAN hook: PASS, census 349 total / 69 done / 62 partial / 218 open. This is a census result, not proof that this DOC-14 work is done.
- No OpenSpec task checkbox was changed.

## Still open

Actual DSPy inference through an explicitly approved non-LiteLLM transport, semantic claim-entailment evaluation, live PostgreSQL authorization/readback, live OAK source configuration, graph admission, and authorized ACE/Valkey write/readback remain unproven.

## Follow-up: typed claim output

- Corrected the DSPy output schema from a JSON-encoded string to a typed list of `Doc14SupportingClaimV1` records. The adapter still independently checks each claim's chunk ID, exact quote, source revision, byte offsets, and answer-to-claims coverage.
- Re-ran the focused WSL2 suite after the change: **13 passed** (`test_doc14_bounded_rlm_recommender_v1.py` and `test_api_document_fact_v1.py`).
- A separate local DSPy 3.5.0 `DummyLM` probe exercised JSONAdapter schema parsing without calling the model endpoint; it returned the expected chunk and byte offset. This does not count as live DSPy inference.
- The temporary probe environment reports DSPy 3.5.0 and LiteLLM 1.110.2 installed; this probe did not select or call LiteLLM. The repair-worker lock remains DSPy 3.4.1 / LiteLLM 1.105.1 and has not been changed.
