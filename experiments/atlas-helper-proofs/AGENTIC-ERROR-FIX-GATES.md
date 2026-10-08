# Agentic error-fixing source crosswalk and implementation gates

The local proof notes (2026-10-08) report fixture-only TS/dataclass/Pydantic parity, CPU GNN results, a hardened CandidateOrdinalMapV1 adapter and 500-row read-only lineage classification. They explicitly do **not** establish admitted runtime callers, successful GPU parity, or journal activation. GitHub branch state may lag the local dirty Windows checkout: reconcile before merging.

## Existing implementation owners (do not duplicate)
- `scripts/atlas/run-agentic-error-fixing-v1.mjs`, `agentic-error-domain-ontology.mjs`, `audit-nlp-agentic-error-readiness-v1.mjs`
- `packages/parent-atlas/src/core/symbol-registry-repository.ts` and existing symbol/packet reconciliation scripts
- `docs/.okf/schema.yaml`, `scripts/atlas/audit-okf-runtime-ownership.mjs`, existing OaK ontology tuple resolvers and Python sidecar
- `sveltekit-frontend/src/lib/server/retrieval/candidate-feature-matrix-adapter-v1.ts` and canonical CandidateOrdinalMapV1
- `packages/parent-atlas/src/core/oak-context-manifest-owner-v1.ts` and established execution/journal receipts

## IMPLEMENTATION TODO (source-adjacent)
- [ ] GATE AST-01: Use existing Tree-sitter Chunker and ast-grep Python modules on the *same frozen byte snapshot*. Record parser versions, CST node kind, AST span, content hash; do not assume equal semantic chunk boundaries.
- [ ] GATE AST-02: Use ts-morph only for TypeScript/Svelte script AST symbol analysis through an existing TS owner; Svelte markup needs its supported parser. `sed`/regex are search/diagnostic hints only, never evidence of symbol identity.
- [ ] GATE ID-03: Fetch exact symbol registry entries + source execution membership read-only; require packet_key, symbol_version_id, workspace/source revisions and native treeNodeId. No fabricated IDs, fuzzy canonical joins or write requests.
- [ ] GATE KAG-04: Read versioned `.okf` taxonomy and existing OaK ontology tuple API. When no exact concept mapping, emit `UNKNOWN` with candidates and evidence references; no ontology mutation.
- [ ] GATE NLP-05: Validate request/response with strict existing Pydantic contract. Evaluate LangExtract grounded spans and FastAPI sidecar owner; no direct agent-supplied arbitrary code execution.
- [ ] GATE RANK-06: Use existing [C,25] ordinal-map adapter and featureRevision, not the outdated independent experimental matrix as source of truth.
- [ ] GATE PLAN-07: Allow LangChain Deep Agents/Mastra only as orchestration atop a bounded tool registry; default to read-only investigation. HMM predicted state is not authorization.
- [ ] GATE APPLY-08: Require approved revision-bound patch plan, CAS/source checksum, sandbox test receipts, independent readback, immutable terminal outcome and supersession. No automatic production write.
- [ ] GATE PROOF-09: Run producer-to-consumer caller trace for AST/CST → symbol registry → KAG/OaK tuple → evidence admission → ContextManifest → agentic patch action. Print explicit TODO for absent caller.

## Running locally
```sh
cd experiments/atlas-helper-proofs
python -m unittest -v test_agentic_fix_pipeline.py
python agentic_fix_preflight.py --repo-root ../..
python -m unittest discover -p 'test_*.py' -v
```

**No new database tables, remote calls, automatic model downloads, sidecar startup or agent mutations.** Source-only tests cannot establish deployed functionality.

## New source snapshot membership gate (2026-10-08)
- [x] SOURCE `agentic_fix_membership_gate.py` requires exact source SHA-256, workspace revision, source coordinates, slice checksum, source execution ID, packet key, symbol version and native tree-node ID in caller-supplied snapshot records.
- [x] SOURCE `agentic_fix_smoke.py` accepts explicit file and snapshot arguments, emits proposal-only report to stdout. No SQL, model execution or source edits.
- [x] TEST `test_agentic_fix_membership_gate.py`: 6 fixture assertions (exact, absent, ambiguous, stale, tampered, missing tree ID).
- [ ] TODO: do not confuse `EXACT_SNAPSHOT_MEMBERSHIP` with live canonical admission; use the existing source-execution authority and check DB lineage under a read-only snapshot.
- [ ] TODO: fetch actual native AST coordinates from Tree-sitter/ast-grep owners, verify span parity and use current symbol revisions; source chunk boundaries can differ.
- [ ] TODO: run these tests in your checkout and record a revision-bound immutable receipt.
- [ ] TODO: resolve owner drift between newer dirty Windows checkout and remote branch before merging.

```sh
cd experiments/atlas-helper-proofs
python -m unittest -v test_agentic_fix_membership_gate.py test_agentic_fix_pipeline.py
python agentic_fix_smoke.py --help
```
