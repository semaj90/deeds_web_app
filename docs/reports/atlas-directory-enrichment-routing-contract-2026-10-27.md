# Atlas Directory Enrichment and Routing Contract

## Decision

Keep the current directory key/value generator as a deterministic, local analytics-preparation step. Its outputs are directory-level metadata hints, not document extraction results, symbol identities, relations, or ACE packets. Do not route them into canonical storage or attach them to an ACE packet until the authorized composer supplies a real packet key and revision-bound section evidence.

## Proposed deterministic routing

Route using an admitted inventory row, normalized extension, bounded MIME/signature inspection where applicable, requested capability, and an explicit owner map. Do not use the Naive Bayes domain classifier to decide parser ownership. Unknown or conflicting classifications go to quarantine/review.

| Input class | Primary owner | Optional enrichment | Output boundary |
| --- | --- | --- | --- |
| `.svelte` | Svelte compiler AST | ast-grep script analysis; Svelte LSP when responsive | Exact source spans and proposal-only structural facts |
| `.ts`, `.js` | TypeScript/JavaScript parser and existing ast-grep path | ts-morph for bounded cross-file enrichment | Revision-qualified symbol/relation proposals |
| PDF/Office documents | Existing document-extraction owner | Xberg only as a separately evaluated challenger; OCR when needed | Extracted text/layout evidence with source/page provenance |
| CSV/JSON/Parquet | Existing structured-data owner; Polars/DuckDB CLI for bounded analytics | cuDF/cuML/cuVS only after GPU availability and format checks | Derived feature tables, never identity authority |
| Images/scans | Existing image/OCR owner | NLP after text extraction | OCR/layout proposals with page/region evidence |
| Unsupported, ambiguous, or unsafe input | Quarantine/review | None automatically | No extraction or promotion |

The router produces a typed lane decision and reason, not a work-queue message. RabbitMQ is unnecessary for a local read-only run; queue delivery is a separate transport concern and must not imply admission.

## Directory K/V and ACE boundary

`python/atlas_directory_kv_enrichment_v1.py` groups hash-qualified inventory rows by directory and emits long K/V Parquet, a wide analytics table, and JSONL hints. The hints use `status=HINT`, `packet_identity=null`, `canonicalAuthority=false`, and `writesPerformed=false`. This is suitable for local Polars/DuckDB analysis. cuDF/cuML/cuVS compatibility, document-content extraction, model quality, and S3 upload of these derived outputs remain unverified.

ACE is not a directory packet format. `atlas.ace-packet.v3` requires a canonical `packet_key`, source identity, and revision-qualified sections. A future composer may attach validated directory facts as a HINT section only after it obtains that identity and revision from the canonical owner; this report does not create or authorize that packet.

## Revision-qualified v2 proposal

The generator now requires a SHA-256 workspace revision, a SHA-256 inventory-manifest digest, and a non-empty producer revision. It rejects unqualified member digests and negative byte lengths. Outputs declare `atlas.kv-enrichment.v2` / `atlas.directory-enrichment-hint.v2`; directory hints still explicitly have `packet_identity: null`, `canonicalAuthority: false`, and `writesPerformed: false`.

The additive v2 SQL draft stores each typed key/value tuple with workspace revision, inventory-manifest digest, producer revision, and per-directory evidence digest. Idempotency includes producer revision so a changed enrichment implementation can retain a separate history row for the same source snapshot. It is separate from ACE packet tables and remains unapplied. The database draft is not an ACE packet composer and does not authorize an ACE packet association. The prior v1 draft is preserved unchanged.

`proposeDirectoryEnrichmentAceLinkV1` creates a checksummed, proposal-only link to an already-valid ACE v3 packet. It requires exact workspace-revision equality and exact parent-directory equality against the packet source path. It records the existing packet checksum and directory evidence digest; it does not mutate or reseal the ACE packet, persist the link, or invent packet identity.

## Verification performed for this note

- Added a small synthetic test for deterministic grouping, totals, duplicate-digest accounting, null-free wide output, and proposal-only hint flags.
- `py -3.13 -m pytest -q python/test_atlas_directory_kv_enrichment_v1.py`: 3 passed, including deterministic replay, provenance rejection, and proposal-only hint checks.
- Parent Atlas TypeScript build and `packages/parent-atlas/test/ace-packet-v3.test.mjs`: 16 passed, including exact directory/revision matching and mismatch rejection for the proposal link.
- The v2 SQL draft applied twice in a disposable PostgreSQL 18.6 container; a qualified test tuple appeared in the latest-value view and an invalid status was rejected. The container was removed; the live database was not contacted.
- Draft-review regression test: the same evidence is retained for two distinct producer revisions, while an exact duplicate for the same producer is rejected. The v2 table/view remain absent from the live database.
- Live v1 readback after the approved additive index operation: 17,655 rows across 1,605 directories; all rows HINT/non-canonical with valid digests. Added a concurrent covering index; `EXPLAIN (ANALYZE, BUFFERS)` used an Index Only Scan for the bounded numeric lookup (95 results, 0 heap fetches, 0.060 ms). Existing v1 rows were not reloaded.
- The existing ledger describes a full 7,396-file enrichment replay and DuckDB/Polars agreement. Those results are inherited evidence and were not independently reproduced in this turn because the scratch Parquet inputs/outputs were not present in the checked workspace paths.
- No S3 writes, GPU jobs, service changes, Graphify runs, or canonical datastore writes were performed.

## Next gates

1. Supply the actual admitted workspace revision and inventory manifest digest from the canonical snapshot owner; do not infer either from directory names or timestamps.
2. Add a pure router test with supported, conflicting, and unknown inputs, then run bounded read-only samples for one code file, one structured dataset, and one document through existing owners.
3. Verify extracted document evidence against original artifact digests before any semantic enrichment.
4. Prove cuDF/cuML/cuVS reads only after checking the approved GPU slot and Arrow/Parquet dtype compatibility; keep CPU Polars/DuckDB as the baseline.
5. Keep ACE composition, queue publication, and canonical relation writes behind their separate identity, authorization, and readback gates.

`likely_cause`: Directory-level metadata is useful for batch analytics but does not provide document semantics or canonical ACE identity.

`evidence`: `python/atlas_directory_kv_enrichment_v1.py`, `python/test_atlas_directory_kv_enrichment_v1.py`, `packages/parent-atlas/src/core/directory-enrichment-ace-link-v1.ts`, the disposable PostgreSQL 18.6 v2-draft rehearsal, and OpenSpec §6.M58.

`patch_targets`: `python/atlas_directory_kv_enrichment_v1.py`, `python/test_atlas_directory_kv_enrichment_v1.py`, `packages/parent-atlas/src/core/directory-enrichment-ace-link-v1.ts`, `packages/parent-atlas/test/ace-packet-v3.test.mjs`, `sveltekit-frontend/drizzle/manual/20261028_atlas_enrichment_kv_v2_DRAFT.sql`, and `openspec/changes/atlas-directory-first-analysis-v1/tasks.md`.

`safe_next_command`: `py -3.13 -m pytest -q python/test_atlas_directory_kv_enrichment_v1.py`.

`smoke_command`: `py -3.13 -m pytest -q python/test_atlas_directory_kv_enrichment_v1.py`.

`report_path`: `docs/reports/atlas-directory-enrichment-routing-contract-2026-10-27.md`.
