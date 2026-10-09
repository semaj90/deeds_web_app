# Parent Atlas workstation — ORF → NLP → ContextManifest gate crosswalk (2026-10-09)

This is a scoped implementation checklist, **not** a proof or a new canonical registry. Do not promote diagnostic receipts into task/fact admission.

## Observed from the user's local workstation report (not rerun by this GitHub-only change)

- ORF proposal 7/7; alignment 1/1; approval boundary 9/9; ast-grep mapping proof 3/3; seven mapped AST kinds; `enum_declaration` deliberately unmapped.
- Frozen proposal checksum `dbb614dc…c72abb`, registry checksum `f0f85acf…56032c4f` (abbreviated: recover **full** digests from the current artifact before authorization).
- Proposal-only, no reviewer identity / trust key / signed approval receipt, runtime eligibility false.
- `:8095` live module digest mismatches checkout: grounding runner correctly aborts before extraction.
- `ACE-ASSEMBLER-BEHAVIOR-01` one task admitted in a reported `1/11,094` census; this does **not** admit ORF or NLP facts.
- Bounded Ornith source summary has readback; remains diagnostic until accepted ContextManifest.
- NumPy CPU Top-K tests 5/5 in **existing** `.venv`, Python 3.11.9 and NumPy 1.26.4; default Python 3.14 not a dependency target. Do not install globally.

## Workstation / implementation gates

- [ ] **WORK-01** Freeze the full proposal/registry digests and immutable mapping artifact; verify against parser-output evidence and source/producer revisions. Reject altered input.
- [ ] **WORK-02** Identify authorized human reviewer and verifiable trust mechanism; test forged, unsigned, stale, mismatched and revoked approvals. **No simulated approval accepted.**
- [ ] **WORK-03** Wire the existing production ORF loader to the approval verifier: proposal-only until signature, scope, identity, exact checksums and expiry/revocation policy pass; fail closed.
- [ ] **WORK-04** Confirm `:8095` deployed module source digests and capabilities against checkout by independent readback. Deployment/restart requires authorization; do not suppress mismatch or infer readiness from `/health` alone.
- [ ] **WORK-05** Run the bounded grounded NLP request on one explicit, behavior-backed relation-bearing source span; require exact offsets/roles/source revision; a concept mention is **not** a relation.
- [ ] **WORK-06** Resolve domain labels via existing taxonomy and OaK ontology revision, with `EXACT`, `ALIAS_PROPOSED`, `UNKNOWN` and `AMBIGUOUS` separate. Never mint canonical packet IDs.
- [ ] **WORK-07** Validate Python Pydantic ↔ TS Zod contracts using `scripts/atlas/prove-okf-domain-python-zod-parity-v1.mts`; extend to the actual production output schema and YAML owner/path census. No duplicate authority.
- [ ] **WORK-08** Reuse `python` NumPy CPU oracle; test deterministic cosine Top-K, zero-norm, NaN, ties and masks; frozen-vector vs cuVS exact/CAGRA parity separately. Do not treat 5/5 CPU tests as GPU admission.
- [ ] **WORK-09** Build independently verified task-scoped EvidenceReceipt binding task, source, workspace revisions and actual behavior; reuse canonical census. The ACE task receipt is a **separate** passed proof.
- [ ] **WORK-10** Verify ontology tuple / KAG projection and readback only after source-verified fact admission and explicitly authorized writes.
- [ ] **WORK-11** Show that one admitted fact is retrieved via the existing SearchRuntime and included in an accepted ContextManifest with evidence refs/checksum readback.
- [ ] **WORK-12** Execute Ornith against that accepted ContextManifest and prove model digest, prompt/template revision, evidence coverage, output checksum and readback. Keep earlier scratch summaries diagnostic.
- [ ] **WORK-13** Keep EmbeddingGemma ONNX QInt8 `NOT_ADMITTED` until same-artifact discrimination, GGUF Q8_0 cross-runtime and frozen-corpus retrieval parity pass; leave 852 PostgreSQL embeddings unchanged.
- [ ] **WORK-14** Gemma browser sampler tests must isolate pure greedy tie-breaking from unavailable ONNX runtime; do not count stalled/uncolllected Vitest as passed. Incomplete 647KB local model is not a verified complete runtime artifact.

## Test commands (in the existing checkout)

```powershell
npm run atlas:observation:feature-registry:proposal:test
npm run atlas:observation:feature-registry:alignment:test
npm run atlas:observation:feature-registry:approval:test
py -3.13 -m unittest python.tests.test_orf_ast_grep_mapping_proof_v1 -v
$env:PYTHONPATH=(Resolve-Path python).Path
.\.venv\Scripts\python.exe -m unittest discover -s python/tests -p test_atlas_numpy_cpu_reference_v1.py -v
.\.venv\Scripts\python.exe -m unittest discover -s python -p test_atlas_okf_domain_parity_oracle_v1.py -v
$env:ATLAS_PYTHON=(Resolve-Path .\.venv\Scripts\python.exe).Path
npx tsx scripts/atlas/prove-okf-domain-python-zod-parity-v1.mts
```

The GitHub-only implementation cannot probe `127.0.0.1:8095` or the user's Windows environment. All runtime gates remain pending until local test/receipt evidence is supplied.
