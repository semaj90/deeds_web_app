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

## DB-CATALOG-01 implementation (2026-10-08)
- [x] `scripts/atlas/audit-live-ontology-tuple-lineage-v1.mjs`: catalog-only PostgreSQL transaction with `SET TRANSACTION READ ONLY`; no assumed join, table write or migration. Separately inventories `atlas_ontology_tuples` and `atlas_ontology_linked_tuples`, plus available evidence and symbol relations.
- [x] `scripts/atlas/audit-live-ontology-tuple-lineage-v1.spec.mjs`: five source tests covering dual tables, missing evidence relations, shape and readback tampering.
- [ ] Execute the script locally with a **fresh** scratch filename; validate deployed table/column/constraint inventory and record the report checksum.
- [ ] Determine the tuple writer/reader owner from actual application call sites. A table's existence does not establish runtime authority.
- [ ] TUPLE-LINEAGE-02: create a *separate* bounded read-only query for one exact tuple/provenance and authoritative source bytes after catalog results reveal real join keys.
- [ ] TUPLE-STORE-03: independently re-read persisted lineage, then check Python/Pydantic/Arrow serialization parity. No writes.
- [ ] OAK-CALLER-04: request-scoped resolver for admitted tuple and version-qualified external vocabulary.
- [ ] RETRIEVAL-DAG-05: real SearchRuntime ordinal-map provider, ContextManifest readback and deployed CAS/approval adapter.

From the repo root (Node dependencies including `pg` available):
```sh
node --test scripts/atlas/audit-live-ontology-tuple-lineage-v1.spec.mjs
ATLAS_CATALOG_REPORT=.tmp/atlas/ontology-tuple-catalog-001.json node scripts/atlas/audit-live-ontology-tuple-lineage-v1.mjs
```
The audit's output uses exclusive file creation. Supply a new report path on subsequent runs. **Do not run** `prove-ontology-linked-tuple-persistence.mjs` for this read-only gate: it performs INSERT/DELETE.

## TUPLE-STORE-03 read-only implementation (2026-10-08)
- [x] `scripts/atlas/prove-one-ontology-tuple-readback-v1.mjs` selects exactly one persisted `atlas_ontology_linked_tuples` record by explicit `ATLAS_TUPLE_ID`, in a read-only transaction, after checking the deployed column list. It checks optional lineage fields in JSONB provenance and emits a new checksummed scratch receipt.
- [x] `scripts/atlas/prove-one-ontology-tuple-readback-v1.spec.mjs` covers missing provenance, checksum/readback tampering, expected provenance mismatch, non-admission, absent tuple and missing fields.
- [ ] Run catalog audit before the persisted tuple audit; establish the exact deployed owner and a real tuple ID. This script intentionally does not query the other KAG tuple surface.
- [ ] Independently re-open authoritative source bytes; compare `evidenceSpanChecksum` over the original byte slice (the stored JSONB digest alone is not source proof).
- [ ] Resolve the actual evidence receipts/card/task owner and exact packet-key-bound source execution membership, from *real catalog metadata*. Do not infer from `atlas_evidence` naming.
- [ ] Verify Pydantic/Arrow live readback with the same persisted JSONB body; the earlier fixture-level mirrors are not database readback.
- [ ] Only after admitted evidence is independently verified: request-scoped OaK invocation, canonical CandidateOrdinalMapV1 retrieval, ContextManifest checksum and separately approved durable DAG CAS.

Run locally (Node with `pg` package and a known existing tuple ID):
```sh
node --test scripts/atlas/prove-one-ontology-tuple-readback-v1.spec.mjs
ATLAS_TUPLE_ID='REAL_TUPLE_ID' ATLAS_TUPLE_READBACK_REPORT=.tmp/atlas/ontology-tuple-readback-001.json node scripts/atlas/prove-one-ontology-tuple-readback-v1.mjs
```
**Never run** the legacy write-capable `prove-ontology-linked-tuple-persistence.mjs` as part of this read-only check. No migration or persistent-store mutation is necessary.
