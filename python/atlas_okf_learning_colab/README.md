# Parent Atlas .okf / LDR learning experiment

This folder is a **local planning and Colab shadow-training artifact**, not a repository patch, a crawler, or an approved training model. Nothing here has canonical authority.

## Which notebook to use
| File | Status |
|---|---|
| `Parent_Atlas_OKF_GRU_Shadow_Colab_v2.ipynb` | **Use this.** Three-way split, tuned baseline, data-size gate, fuller receipt. |
| `Parent_Atlas_OKF_GRU_Shadow_Colab.ipynb` | v1, kept for history. Its synthetic fixture leaked the label (`"<DOMAIN> demo"`) and it scored the same split it selected on, so its demo scores are inflated. Do not cite them. |

### What v2 changes
1. Synthetic labels carry no domain information (a hash of the id).
2. Train / validation / test split **by source group** (>= 5 groups per domain). Epoch and regularization are chosen on validation; the test split is scored once.
3. The TF-IDF + logistic baseline is tuned on the same validation set as the GRU, plus a majority-class reference.
4. Data-size gate (>= 200 rows and >= 30 per class, the repo floor): below it the status is `INSUFFICIENT_DATA`, never a held-out result. A synthetic run is `DEMO_ONLY`.
5. Longer GRU training with patience (80 epochs, patience 15).
6. Receipt `atlas.okf.learning-shadow-receipt.v2`: library versions, palette revision, split and class counts, source-group counts, chosen hyperparameters, per-class test report, `calibration: NOT_PERFORMED`.
7. Colab is detected explicitly (`COLAB_RELEASE_TAG` / `google.colab`), not by whether a `/content` folder exists. v1 wrote into an unrelated `C:\content` on a Windows machine that had one.

## Use
1. Open the v2 notebook in https://colab.research.google.com/ (or run its code cells in a clean local Python with torch and scikit-learn).
2. Run once without uploads to smoke-test the synthetic demonstration. The status will be `DEMO_ONLY`; the metrics are chance-level plumbing checks.
3. Produce a **reviewed, nonsensitive** `atlas_reviewed_training_examples.jsonl` with `scripts/atlas/export-okf-reviewed-domain-examples-v1.mjs` (see below). Upload it next to the notebook.
4. Upload the existing `scripts/atlas/data/nes-domain-palette-v1.json` under its existing name. The notebook verifies its SHA-256 checksum and will not synthesize a palette.
5. Read `atlas_okf_shadow_outputs/learning-shadow-receipt.json`, `domain-proposals.jsonl` (test split only) and `byte_gru_proposal_state.pt`.

## Producing the reviewed training file
Domain labels come from **human review**, not from rules or from `feature_label`:

1. Build the review sheet with `node scripts/atlas/build-domain-review-sheet-v1.mjs` and label rows in the browser; export the JSONL.
2. Run the exporter on that export:
   `node scripts/atlas/export-okf-reviewed-domain-examples-v1.mjs --input <review-export.jsonl> --out-dir .tmp/atlas/okf-reviewed-export`
3. It writes the notebook's training file and a receipt. It rejects rows without a human review, an allowed palette domain, a `sha256:` source revision, a workspace revision, or a verifiable source span, and it drops a source group that was labelled with two different domains.
4. Status `READY_FOR_HELD_OUT_EVAL` needs the size gate above; otherwise `INSUFFICIENT_DATA`. With no reviewed rows the status is `BLOCKED_NO_REVIEWED_INPUT`.

### Existing project owners to reuse
- `python/atlas_okf_docs_pipeline.py` owns bounded docs crawling; use `--help` before choosing the validated manifest shape.
- `scripts/atlas/ldr-report-v1.mjs` owns bounded LDR reports; research output is advisory.
- `.okf/corpora/keyword-corpus.schema.json` defines the **reference_only** vocabulary; do not modify it to add training labels.
- `scripts/atlas/data/nes-domain-palette-v1.json` is the only domain to NES byte owner.
- PostgreSQL/OpenSpec and the feature registry own actual `feature_label`, task identities and admission.

### Important limitations
- A passing smoke run proves the notebook executes. It is not evidence of classifier quality.
- Grouped split prevents exact group leakage but cannot replace time-based or repository-held-out validation.
- Softmax confidence is uncalibrated; the 0.70 threshold is an illustrative abstention rule.
- `torch.save()` saves a Python/PyTorch checkpoint; load it only from trusted sources.
- No PostgreSQL, Qdrant, Neo4j, Valkey or model-server action is performed.
- Keep private legal evidence and code out of Colab unless third-party cloud processing is permitted.
- `research-sources.example.yaml` is illustrative and must be adapted to the crawler's real schema before use. LDR connectivity is not a completed research job.
- Keep GPU learning experiments on Colab or CPU: the local card has only a few hundred MiB free while `:8090` is resident.
