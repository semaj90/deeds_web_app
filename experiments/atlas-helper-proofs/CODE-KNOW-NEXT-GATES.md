# REVIEW / TODO — taxonomy, OaK tuples, model training, and agent routing

These are implementation gates, NOT an assertion that the pipeline works.

- [ ] TEST-01 Run real Tree-sitter Chunker and ast-grep against tracked Python, TypeScript, and Svelte fixtures; compare byte slices, parser grammar versions, and revisions.
- [ ] TEST-02 Resolve one exact SourceMember via live read-only canonical source/packet/symbol owner and independently read back the join. Do not accept path-only or overlapping spans as canonical identity.
- [ ] TEST-03 Compare Python and existing SvelteKit [C,25] matrices on identical fixture values, presence masks and float32 binary encodings.
- [ ] REVIEW-04 Review `docs/.okf/schema.yaml`, root `.okf/` concepts, `atlas/domain-taxonomy.ts` and canonical ontology-resolution-boundary owner. Use a versioned taxonomy snapshot; do not load arbitrary YAML as an executable policy.
- [ ] IMPLEMENT-05 Replace experimental domain LUT with an adapter reading an already validated taxonomy projection. Unknown/ambiguous remain UNKNOWN; never automatically create ontology IDs.
- [ ] IMPLEMENT-06 Reuse `python/parent_atlas_ontology/oaklib_external_adapter.py` and existing ontology-linked-tuple contracts; resolve proposed labels with an explicit allowed vocabulary, mapping provenance, ontology revision and evidence references.
- [ ] TEST-07 Negative controls: unknown concept, multiple possible IDs, old ontology revision, stale source, absent ontology mapping and non-admitted evidence.
- [ ] IMPLEMENT-08 Strict Pydantic mirror for resolved tuple candidate / evidence citations; reject extra fields and fabricated source spans.
- [ ] REVIEW-09 Locate already-running NLP FastAPI owner and mount optional bounded router only after authentication and resource policy audit. No automatic installation or port change.
- [ ] REVIEW-10 LangChain Deep Agents: optional orchestration over bounded, registered tool calls only; no separate canonical memory, no free-form shell execution or unreviewed subagent store mutation.
- [ ] TRAIN-11 Build frozen labeled train/eval splits by query group and time/revision. Compare deterministic LUT baseline, logistic regression, CPU MLP, then optional PyTorch multihead model. Track macro-F1, unknown abstention, calibration and recall; prevent label leakage.
- [ ] TRAIN-12 Save learned model weights with safetensors only after stable feature registry, tokenizer, optimizer and dataset manifests are checksum-qualified. Never treat weights as evidence authority.
- [ ] RESEARCH-13 Keep SiGLU/SwiGLU, AdamW, UMAP/t-SNE and QLoRA separate controlled experiments. t-SNE/UMAP visualize embeddings; they do not establish grounded classification.
- [ ] PROOF-14 Complete one admitted source/symbol → ontology tuple → retrieval candidate → ContextManifest → DAG proposal readback; preserve revision and receipt identity at each stage.

Existing `ontology_unknown_router.py` is LUT-based proposal fallback, not oaklib execution, classifier training, or semantic verification.
