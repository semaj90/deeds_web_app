# Four CPU ML gates — implementation contracts and local tests

**C25-01** `gate_c25_float32.py`: runs the Python fixture owner and the original SvelteKit TypeScript builder through `npx tsx`; checks packet-row order, 25-wide mask, and little-endian float32 bit identity. Requires node modules and `tsx` available in the frontend working environment. This is NOT yet a ContextManifest proof and does not verify runtime featureRevision.

**KMEANS-01** `gate_kmeans_readback.py`: recomputes nearest-center labels and squared-distance inertia on final centroids; rejects stale assignments, malformed shapes and NaN. TODO: change `cpu_torch_alignment.py::kmeans_cpu` to call this function after final update; verify repeated points, empty clusters, finite center checksum. Note: readback compares Python float distances against PyTorch binary32 values; prefer explicit tolerance bounds for production parity.

**DATA-01** `gate_dataset_manifest.py`: freezes already-labeled rows with deterministic group-wise split and content digests. No generated labels; outputs one-time JSON plus independent checksum readback. TODO: enforce labels, revision format, per-value/mask validation, class coverage and dataset snapshot source provenance before actual training. Do not train on synthetic labels.

**CLS-01** `gate_unknown_calibration.py`: held-out threshold selector with empirical false-accept and coverage; abstain if below threshold. This is NOT a probability calibrator, statistical risk guarantee, or proof of ontology equivalence. TODO: add logits-based temperature/isotonic calibration on independent groups, margin/ontology revision and out-of-distribution negative controls.

Run the full CPU fixture suite (user-run only):
```sh
cd experiments/atlas-helper-proofs
python -m unittest -v test_four_ml_gates.py
python -m unittest discover -p 'test_*.py' -v
python gate_c25_float32.py
```

The `gate_c25_float32.py` command invokes the original TS builder and may need a compatible `tsx` runner; it does not install packages intentionally. Never permit these experiments to write Postgres, Qdrant, Graphify or GPU services.
