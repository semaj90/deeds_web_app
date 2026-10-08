# CPU integration proposal — Tree-sitter, MLP and DAG

## Existing authority
`packages/parent-atlas` supplies reusable contracts; root `scripts/atlas` supplies repo probes; SvelteKit owns application composition. Do not create a second packet registry, fusion owner, ContextManifest owner, or GPU executor. This is an independent, optional fixture layer.

## Tree-sitter integration
Upstream: https://github.com/Consiliency/treesitter-chunker
Documented Python API: `from chunker import chunk_text, chunk_file`; `chunk_text(text, language="python", file_path="src/a.py")`.
`CodeChunk` exposes `byte_start`, `byte_end`, `start_line`, `end_line`, `content`, `node_type`, `language`, `chunk_id`.
`chunker_adapter.py` validates UTF-8 byte spans and content before producing a proposal. The caller must pass source content as an exact snapshot and a stable source_ref. It derives only a source-content checksum, **not** canonical source/workspace/packet revisions. Never infer symbol IDs or membership from chunk IDs.
Requires Python >=3.11; library is optional. Language parser downloads may occur on first use, so offline environments require prefetch. Do not automatically install the package or run it in the production sidecar.

## CPU reference components
- `cpu_mlp.py`: deterministic dictionary feature registry, tanh hidden layer, sigmoid classification + linear regression heads, SGD backprop; training fixture, not Adam/production training.
- `cpu_dag.py`: deterministic topological sort, cycle rejection and bounded reachability; NetworkX parity oracle can be added later.
- `test_cpu_helpers.py`: isolated unit checks; does not prove actual upstream chunk extraction.

## Deferred owner-aligned integration
1. Compare real chunker output with existing Tree-sitter/AST symbol owners and packet-source revisions.
2. Map ordered feature keys to canonical [C,25] feature schema; do not replace the runtime owner.
3. Expose a **new opt-in** FastAPI CPU route only after the sidecar's existing app/port is located and authenticated/read-only policy reviewed.
4. Keep TurboVec a challenger under the existing semantic lane. No independent fusion vote.
5. Existing simdjson N-API/C++ bridge requires a native binding audit; do not introduce a second parser bridge.
6. GPU/cuVS/RAPIDS and QLoRA only after admission and idle-GPU approval.
7. Kafka, gRPC/QUIC, indexed retrieval, and executable DAG actions require idempotency, validation, bounded payloads, and receipts.
8. Exact citations require source spans + source/workspace revisions, not similarity or an upstream chunk ID.

## Validation commands
```sh
cd experiments/atlas-helper-proofs
python -m unittest -v test_cpu_helpers.py
# Optional, when treesitter-chunker is installed:
python -c "from chunker import chunk_text; print(chunk_text('def f(): pass\n', language='python', file_path='fixture.py'))"
```

## CPU C25 parity adapter (new)
`cpu_candidate_matrix.py` mirrors **only** the explicit 25 feature positions from
`sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts`.
It distinguishes measured zero (presence=1) from unavailable (presence=0),
casts to binary32, and rejects duplicate packet keys, mixed workspace revisions,
unknown feature keys, and nonfinite coefficients. Checksums are labeled
experiment-specific, not canonical adapter checksums. It does not fabricate
`featureRevision`, executor provenance, source execution membership or
an admitted EvidenceCard. SvelteKit still owns runtime feature/profile projection.

```sh
cd experiments/atlas-helper-proofs
python -m unittest -v test_cpu_helpers.py test_cpu_candidate_matrix.py
```

The optional `treesitter-chunker` adapter still needs one installed-parser
integration run. A passing synthetic CodeChunk normalizer fixture does not prove
the installed grammar set, extraction coverage, or parity with the current AST
producer. The adapter is not wired to FastAPI, Graphify or the production writer.

## Additional opt-in scaffolds
- `source_symbol_crosswalk.py`: exact `source_ref/source_revision/byte-span` match against **caller-supplied, already authoritative** SourceMember records; no DB reads, fuzzy membership or packet-key minting.
- `cpu_sidecar_router.py`: `build_router()` factory. Existing FastAPI owner must deliberately call `app.include_router(build_router())`; routes remain disabled unless `ATLAS_CPU_HELPERS_ENABLED=1`. No automatic import or service startup.
- `cpu_dag_fsm.py`: pure PLAN -> PLAN_VALIDATED checksum guard. This is not cross-turn persistence, replay protection or the existing execution-spine owner.
- `cpu_capability_probe.py`: filesystem-only report on simdjson, TurboVec, symbol and sidecar paths; optional Python dependency discovery is not a runtime capability guarantee.
- `test_cpu_remaining.py`: tests for exact/ambiguous/missing source membership, plan checks and static census.

All scaffolds use proposal-only semantics. Before service integration: review existing authentication, CPU concurrency bounds, source membership authority, deployed Pydantic/FastAPI versions, health/readiness, and evidence admission. Do not expose these experimental endpoints publicly by default.

```sh
cd experiments/atlas-helper-proofs
python -m unittest discover -p 'test_*.py' -v
python -c "from cpu_capability_probe import probe; print(probe())"
```

## AST/CST and NetworkX parity scaffold (2026-10-07)

Optional modules: `ast_graph_alignment.py`, `run_real_ast_alignment.py`,
and `test_ast_graph_alignment.py`. The upstream ast-grep Python API uses
`SgRoot(source, language).root().find_all(kind=...)` and each node's
`range().start.index` / `range().end.index` for source coordinates.
Compare these against `treesitter-chunker`'s `byte_start/byte_end` on the
same immutable UTF-8 source snapshot. Content and source checksums must agree
before declaring `EXACT_SYNTAX_SPAN`; a syntactic span is **not** a canonical
symbol or packet identity.

`explicit_graph` accepts only already-grounded directed edges and uses
NetworkX's acyclic check and lexicographical topological order. It does not
invent edges from parsing or assert admitted HyperRAG incidence.

Run locally after verifying Python 3.11+ and installing or reusing compatible
`treesitter-chunker`, `ast-grep-py` and `networkx` in an isolated CPU venv:

```sh
cd experiments/atlas-helper-proofs
python -m unittest -v test_ast_graph_alignment.py
python run_real_ast_alignment.py --source ../../python/miniforge_nlp_sidecar.py --ref python/miniforge_nlp_sidecar.py --language python --kind function_definition
```

Use actual tracked TypeScript and Svelte files with supported grammar names and
a verified ast-grep kind; do not assume grammar coverage from parser load alone.
Exact span matches can be zero even when both parsers are correct because
their semantic chunk boundaries differ. Broader parent-child or intersecting
spans must be labeled diagnostic, not exact identity parity.

## CPU PyTorch/ATen and graph-rank evaluation (2026-10-07)
- `cpu_graph_rank_features.py` uses NetworkX PageRank and PageRank on the reversed directed graph (CheiRank-style score). Typed, revision-qualified edges must come from an existing graph owner; these graph results are not admitted evidence.
- `cpu_torch_alignment.py` lazily imports torch, allocates only CPU tensors, and provides deterministic toy Lloyd KMeans, a SiLU MLP and AdamW classification baseline. Neither implementation is a production cuVS replacement, and neither trains a language model.
- The current graph scores are non-authoritative derived signals. Only attach them to [C,25] after resolving node-to-packet membership, graph revision, normalization/calibration and receipt parity.
- TODO: compare torch tensor output against the existing [C,25] Float32Array and uint8 presence mask using explicit row ordinals; do not feed padded missing values into training without the mask.
- TODO: separate query-group train/validation/test splits, fit normalization only on training data, record optimizer and torch versions, evaluate macro-F1/unknown abstention, and save reproducible CPU checkpoints.
- TODO: verify CheiRank reversed-edge convention, dangling node treatment and alpha with the production Graphify owner.
- TODO: test 0/1 clusters, empty clusters, repeated-point degeneracy, label stability, and final-center assignment consistency before any promotion.
- GPU parity/cuVS, CUDA scheduling, safetensors persistence, and OaK ontology-grounded evidence remain open.

Local optional test:
```sh
cd experiments/atlas-helper-proofs
python -m unittest -v test_cpu_graph_torch.py
```

## Graph rank and masked learning alignment (2026-10-07)
- `cpu_rank_row_alignment.py` maps already qualified graph node scores to exact packet row ordering; mixed graph revisions, unmatched nodes and duplicate packet rows reject. It does not derive graph revisions or source execution membership.
- `cpu_train_eval.py` adds group-disjoint deterministic holdout, **train-only imputation of missing features**, and classification metrics including abstention. This is preparation for a trained CPU classifier, not completed training or calibration.
- `test_rank_train_alignment.py` adds 6 regression checks for row ordering, stale revisions, missing nodes, group split, imputation and metric calculation.
- TODO: freeze the graph node-to-packet identity map and compare NetworkX reversed-graph CheiRank with the existing Graphify owner.
- TODO: compare raw Python float32 [C,25] bytes and mask with the TypeScript owner; exact row keys and featureRevision must match.
- TODO: verify KMeans center/label readback, empty cluster and repeated points, then compare with cuVS after approved idle GPU handoff.
- TODO: add model training and safetensors export only with dataset split and optimizer receipts; maintain explicit UNKNOWN calibration thresholds.

```sh
cd experiments/atlas-helper-proofs
python -m unittest -v test_rank_train_alignment.py
```
