# Parent Atlas .okf / LDR learning experiment

This bundle is a **local planning and Colab shadow-training artifact**, not a repository patch, a crawler, or an approved training model.

## Use
1. Open `Parent_Atlas_OKF_GRU_Shadow_Colab.ipynb` at https://colab.research.google.com/.
2. Run once without uploads to smoke-test the synthetic demonstration. It makes no network calls to Atlas and writes only Colab-local proposal files.
3. Export a **reviewed, nonsensitive** `atlas_reviewed_training_examples.jsonl` with the columns described in the notebook. Upload it to `/content/` (or the notebook working directory).
4. Upload the existing `scripts/atlas/data/nes-domain-palette-v1.json` under its existing name. The notebook verifies its SHA-256 checksum; it will not synthesize a palette.
5. Optionally upload `.okf/corpora/keyword-corpus.yaml` and `.okf/corpora/keyword-corpus.schema.json` to inspect the reference corpus. The notebook never treats corpus topics as reviewed domain labels.
6. Compare `tfidf_logistic_macro_f1` against `gru_macro_f1`. The results are only valid for the held-out selection and source groups used; require a larger judged set before promotion.
7. Read local outputs `atlas_okf_shadow_outputs/learning-shadow-receipt.json`, `domain-proposals.jsonl`, and `byte_gru_proposal_state.pt`.

### Existing project owners to reuse
- `python/atlas_okf_docs_pipeline.py` owns bounded docs crawling; use `--help` before choosing the repository's validated manifest shape.
- `scripts/atlas/ldr-report-v1.mjs` owns bounded LDR reports; research output is advisory.
- `.okf/corpora/keyword-corpus.schema.json` defines the existing **reference_only** vocabulary; do not modify that schema just to add training labels.
- `scripts/atlas/data/nes-domain-palette-v1.json` is the only domain→NES byte owner.
- PostgreSQL/OpenSpec and the feature registry own actual `feature_label`, task identities and admission.

### Important limitations
- The example fixture is synthetic; output metrics do not demonstrate quality.
- Grouped split prevents exact group leakage but cannot substitute for time-based, repository-held-out validation.
- Confidence from softmax is uncalibrated; the 0.70 threshold is an illustrative abstention rule.
- `torch.save()` saves a Python/PyTorch checkpoint; load it only from trusted sources.
- No live PostgreSQL, Qdrant, Neo4j, Valkey or model server action is performed.
- Keep actual legal evidence/private code out of Colab unless permitted for third-party cloud processing.
- `research-sources.example.yaml` is illustrative only and must be adapted to the existing crawler's actual schema before use.
