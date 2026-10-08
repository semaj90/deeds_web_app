# Integration owner handoff (CPU source-only)

These adapters intentionally stop short of production activation. A local test
with caller-supplied objects cannot prove live DB lineage, admitted ontology
facts, SearchRuntime retrieval, ContextManifest readback or deployed DAG
transactions.

| Gate | Existing owner to invoke | Precondition | Current output |
| --- | --- | --- | --- |
| LINEAGE | source execution / symbol registry read-only owner | exact source/AST node and native symbol version, revisions, source execution | SNAPSHOT_PROPOSAL or BLOCKED |
| ONTOLOGY | OaK external adapter + strict Pydantic producer | admitted grounded fact, mapping + taxonomy/ontology revision | UNKNOWN or BLOCKED |
| RETRIEVAL | SearchRuntime, CandidateOrdinalMapV1 [C,25] adapter, ContextManifest | admitted ordinal map, matching profiles, exact checksums | RETRIEVAL_CALLER_UNVERIFIED |
| EXECUTION | durable journal and authorized Mastra/DAG tool owner | deployed schema, CAS, approval, immutable terminal receipt | EXECUTION_BLOCKED |

TODO implementation checklist:
- [ ] Inspect fresh local dirty checkout before merging this branch; do not overwrite its hardened ordinal-map adapter or 500-row audit.
- [ ] Read-only transactional DB lineage query with explicit workspace/execution and exact packet-key-bound joins; record exact receipt and source revision.
- [ ] Real Tree-sitter/ast-grep extraction from identical source bytes; preserve syntax boundary mismatches as diagnostic.
- [ ] Strict Pydantic ontology tuple and OaK resolver readback; UNKNOWN remains UNKNOWN without strong evidence.
- [ ] Trace production SearchRuntime provider to admitted candidate ordinal map and profile input. Zero fabricated rows or executor votes.
- [ ] ContextManifest checksum and evidence readback using existing owner, independent from the producer.
- [ ] Durable DAG deploy/transactional writer gate with approval, CAS, immutable attempt receipt and supersession; HMM predictions never authorize.
- [ ] Before training/fine-tuning, freeze evaluation dataset, model/feature/taxonomy revisions, and prove exact/semantic retrieval recall separately.
- [ ] Execute focused Python tests and relevant frontend Vitest suites in their supported roots, with toolchain versions and outputs in scratch receipts.

Run: `python -m unittest -v test_agentic_integration_gates.py`

NO database migrations, indexing, native addon compilation, model downloads,
source modifications or service activation occur in this scaffold.
