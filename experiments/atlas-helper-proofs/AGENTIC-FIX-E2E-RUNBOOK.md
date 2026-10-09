# Agentic fix CPU E2E probe — read-only

Run the existing test harness first:
```bash
cd experiments/atlas-helper-proofs
python -m unittest -v test_agentic_fix_end_to_end_probe.py
python -m unittest discover -p 'test_*.py' -v
```

Provide an **existing** membership JSON snapshot complying with
`atlas.symbol-membership-snapshot.v1`. Do not fabricate canonical IDs from
source path, AST chunk ID or regex:

```bash
python agentic_fix_end_to_end_probe.py \
  --source ../../python/miniforge_nlp_sidecar.py \
  --source-ref python/miniforge_nlp_sidecar.py \
  --language python --workspace-revision WORKSPACE_REVISION \
  --diagnostic 'TypeError: example' --membership-json /path/to/read-only-membership.json \
  --parser-mode real --kind function_definition
```

Parameters are explicit so a missing source/execution/grammar cannot silently fall back.
`--parser-mode off` emits `NOT_RUN`, not a fake pass. Real mode requires
`treesitter-chunker` and `ast-grep-py` installed in the existing suitable
Python environment. Parser load/extraction is not admission; zero matching
chunk/AST boundaries is a valid diagnostic outcome.

## Integration TODO
- [ ] Replace caller-supplied membership snapshot with **read-only** production source-execution membership adapter and independent receipt readback.
- [ ] Verify exact native AST coordinate origin, source revision and stable upstream identity; handle Svelte through supported parser.
- [ ] Bind strict Pydantic/OaK taxonomy resolution to admitted source facts; keep UNKNOWN non-authoritative.
- [ ] Resolve actual SearchRuntime candidate/provider to canonical CandidateOrdinalMapV1; do not create a second [C,25] owner.
- [ ] Bind Mastra/DAG existing planner with authorization and immutable terminal outcome receipts before patch attempts.
- [ ] Run local CPU tests, parser extraction smoke and strict OpenSpec validations. No GPU required.
