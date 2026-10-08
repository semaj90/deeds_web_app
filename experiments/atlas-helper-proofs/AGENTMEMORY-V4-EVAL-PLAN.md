# Parent Atlas vs agentmemory V4 — evaluation adapter and training inventory

## Existing source owners (requires proof in live checkout)
- Reranker training scripts: `scripts/atlas/train-policy-reranker.py`, `scripts/atlas/train-xgboost-reranker.py`. An owned training script or report is not proof of a trained, deployed cross-encoder model.
- Embeddings: `sveltekit-frontend/src/lib/server/vector/embeddinggemma-contracts.ts`, `python/train_latent_autoencoder.py`, `sveltekit-frontend/src/lib/server/retrieval/latent-derive.ts`.
- Ornith: `scripts/atlas/lib/workstation-ornith-adapter.mjs`, `scripts/atlas/audit-llama-server-chat-ownership-v1.mjs`, `scripts/atlas/smoke-ornith-summary-leak-v1.mjs`.
- LangExtract: `LANGEXTRACT_GEMMA4_INTEGRATION.md`, `scripts/atlas/prove-retrieval-summarization-flow.mjs`.
- Mastra: `sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.ts` and `.spec.ts`.

## Architecture distinction
1. **EmbeddingGemma** is a bi-encoder that creates independent query/document vectors. Supported native MRL dimensions 768/512/256/128. 64 is an experimental learned projection, not directly interchangeable with MRL-128. Re-normalize after truncation and freeze embedding model/source revisions.
2. **XGBoost / feature MLP** are feature rankers on the canonical [C,25] candidate matrix, not a pairwise text cross-encoder. A custom cross-encoder needs query-document training pairs, negatives, tokenizer version, sequence model weights and its own held-out reranking eval.
3. **Ornith llama-server** is generator/summarizer for evidence-grounded answer synthesis, not the authority on retrieved packet identity. LangExtract supplies grounded candidate spans, not auto-admitted evidence.
4. **Mastra** is optional orchestration/evaluation. Use existing registered workflow owner and scorer API; do not add a second agent execution authority.

## Evaluation protocol
- [x] Source-only `agentmemory_v4_eval.py` consumes independent frozen candidate lists and relevance labels and compares semantic vs hybrid scores; does not fetch datasets, call a generator or claim LongMemEval accuracy.
- [ ] Freeze dataset/snapshot, source revisions, embeddings, label provenance, caller versions, query-group splits and retrieval budgets.
- [ ] Add first-stage retrieval (true ANN/full exact/lexical) rather than assuming gold is already among candidates. Current fixture only evaluates **ranking**. It cannot measure retrieval recall if the relevant packet never made candidate generation.
- [ ] Reuse actual RRF combiner and cross-encoder model owner; collect Recall@K/MRR/nDCG, p50/p95 latency, source-identity correctness, leakage controls.
- [ ] Run benchmark quality classes: exact symbols, multi-source aggregation, temporal updates, abstention, typed-graph reasoning and superseded facts.
- [ ] Instrument actual Ornith synthesis on retrieved-only ContextManifest; prohibit hidden original transcript, oracle IDs and labels. Judge quality independently and keep generation-cost accounting separate.
- [ ] Only then run a genuine LongMemEval subset/full evaluation with separately ingested haystacks, real retrieval, official scoring rules and per-case receipts.
- [ ] Compare native MRL-128/256/768 against learned latent64/128/256, measuring Recall@K, MRR, model revision, truncation renormalization, and hardware cost before using any routing shortcut.
- [ ] Record trained artifact manifest/reload parity if a local reranker model checkpoint actually exists. Do not claim one from a training script.

## Run local tests
```sh
cd experiments/atlas-helper-proofs
python -m unittest -v test_agentmemory_eval.py
```
