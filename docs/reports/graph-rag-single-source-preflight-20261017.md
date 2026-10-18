# GraphRAG single-source preflight — 2026-10-17

Owner: `openspec/changes/parent-atlas-ontology-kernel/tasks.md`, NEXT-08 / NEXT-09.
Verdict: **EXTRACTION_BYTES_VERIFIED / CANONICAL_PARTICIPANT_ADMISSION_BLOCKED**.

## Fresh observations

- Source: `sveltekit-frontend/src/routes/api/ace/summarize/+server.ts`, 5,076 exact bytes.
- Source revision: `sha256:c0a5801cbd48e22333b97ce38496cda5753d4bcb4f77d19651a9d31248628476`.
- Existing extractor: `scripts/atlas/extract-route-ast-nodes-v2-dry-run-v1.mts`; parser: ast-grep 0.45.3, built-in TypeScript grammar.
- Five observations: one file, two schemas, one POST handler, and one inline `locals.user` auth guard. Every node's byte-slice SHA-256, strict UTF-8-to-UTF-16 offsets, parent containment, and source digest passed a separate readback command.
- Receipt: `.tmp/atlas/ast-nodes-v2-route-extraction-dry-run-7ad19a05-a9ea-4246-881d-a441c99d41b0.json`.
- Receipt payload checksum: `14d7cd015a8c27ab69036b580dd268f3c1754390e2cdce3673c79421ea264a01`; independent JSON readback: MATCH. This checksum covers `JSON.stringify` of the receipt without its `receiptChecksum` field.
- A fresh PostgreSQL READ ONLY transaction on `legal_ai_db` found `public.atlas_ast_nodes` present and both `public.atlas_ast_nodes_v2` and `public.atlas_ast_nodes_v2_current` absent. Transaction ended with ROLLBACK.
- Extractor diagnostics found two packet rows across frontend-root/repo-root path namespaces. The receipt leaves packet identity unresolved. Per NEXT-05's existing decision, this observation does not authorize new alias rows or selecting a packet by path alone.
- `workspaceRevision` is null in this extraction receipt. The source-file digest is not an admitted workspace snapshot revision.

## Boundary matrix

| Boundary | Existing owner/caller | Observed state | First remaining requirement |
|---|---|---|---|
| Source bytes to AST observations | Route extractor / ast-grep | Five byte-verified observations | Persisted AST ownership and admitted workspace binding |
| AST-v2 schema | Existing draft migration | Live table/view absent | Migration-owner review and separately authorized deployment |
| AST-v2 producer | Extractor proposes rows; optional rollback canary exists | Dry-run only; canary not invoked here | Reviewed idempotent writer and exact independent readback |
| Canonical participant resolution | `prove-nary-participant-resolution-v1.mts` / existing resolver | Proof script queries v1 only | Explicit v2 reader contract before rerunning NEXT-09 |
| Packet/chunk identity | Existing PostgreSQL identity/lineage owners | Packet diagnostic remains unresolved | Exact canonical path, source/workspace revision, span and identity joins |
| N-ary relation to GraphV2 | Existing admission/materializer owners | Not exercised | At least three admitted role-bearing participants and evidence |
| Graph expansion to Top-K and ACE | Existing SearchRuntime / ContextManifest | Not exercised | Qualified live relation and independent retrieval/context readback |

## Changes and validation

The existing extractor now bounds parser processes to 30 seconds, checks the version probe and process errors, limits database connection/query time, and creates a uniquely named receipt with exclusive creation. It seals the receipt payload and reopens it for checksum verification, preserving earlier receipts. These changes do not alter tree-node minting, packet resolution, or admission rules.

Executed the single-source extractor without `--verify-db`; no DDL or INSERT path ran. A separate readback verified all five node hashes and both coordinate systems against the current source bytes. `npx --no-install openspec validate parent-atlas-ontology-kernel --strict` and scoped `git diff --check` passed. No broad test suite or application typecheck ran.

No canonical database, graph, cache, embedding, model, or GPU writes/execution occurred. Local diagnostic receipt and repository file writes are the only mutations.

## Ordered next gate

Review the existing draft's migration ownership, path policy and parent/revision constraints; define the idempotent v2 writer and explicit reader selection together. Its current path CHECK rejects any `..` substring, including valid SvelteKit rest segments, so the existing shared path-validation policy must be reconciled before deployment. An AST-v2 row with a null workspace revision or packet binding remains diagnostic. Applying the DDL alone cannot close NEXT-09.

Then use one admitted workspace binding to qualify source bytes, persisted AST coordinates, packet/chunk identity and participants through the existing owners. Preserve the v1 legacy rows and the existing NEXT-05 namespace decision. Keep graph persistence and projection authorization separate from parser success.

## Closeout

- likely_cause: The extraction dry-run can produce exact spans, but persisted v2 rows and their admitted workspace/packet bindings are absent; the participant proof caller still reads v1.
- evidence: Fresh single-source receipt, independent byte/checksum readback, read-only PostgreSQL catalog query, existing draft SQL and proof caller source.
- patch_targets: `scripts/atlas/extract-route-ast-nodes-v2-dry-run-v1.mts`; this report; the existing ontology-kernel ledger.
- safe_next_command: `rg -n 'atlas_ast_nodes_v2|workspace_revision|relative_path' sveltekit-frontend/drizzle/manual/20261017_atlas_ast_nodes_v2_DRAFT.sql scripts/atlas/prove-nary-participant-resolution-v1.mts`
- smoke_command: `npx --no-install tsx scripts/atlas/extract-route-ast-nodes-v2-dry-run-v1.mts src/routes/api/ace/summarize/+server.ts`
- report_path: `docs/reports/graph-rag-single-source-preflight-20261017.md`
