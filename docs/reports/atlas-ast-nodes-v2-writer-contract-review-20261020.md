# Atlas AST Nodes V2 Writer Contract Review

Status: `SCHEMA_WRITER_CONTRACT_READY_NOT_APPLIED`

Scope: contract and canary review for a new V2 AST evidence table. The V2 DDL and fixture rows were exercised inside an explicit PostgreSQL transaction and rolled back; independent catalog readback confirmed V2 remains absent. No migration or AST row was committed; no packet, cache, graph, or vector was written.

## Verified state

- Live PostgreSQL contains `public.atlas_ast_nodes`; `public.atlas_ast_nodes_v2` is absent. V1 uses `tree_node_id` as its primary key and has a unique key on `(repo_id, relative_path, node_kind, qualified_symbol, normalized_node_hash)`. Its spans and `source_revision` are nullable; it has no `workspace_revision` column.
- The V1 writer (`scripts/atlas/lib/atlas-ast-nodes-writer.mjs`) computes IDs from repository name, normalized path, parser language, kind, symbol, parent ID, and an empty final component. It does not bind source/workspace revisions or byte spans into that ID. Its `ON CONFLICT DO NOTHING` can hide conflicts from the caller.
- The V2 draft now requires non-null SHA-256 `workspace_revision` and `source_revision`, a non-legacy 64-hex V2 ID, `identity_revision='atlas.ast-node.v2.identity.v2'`, an explicit occurrence, a SHA-256 extraction-contract revision, and the source span digest emitted by the proposal builder. Its natural uniqueness scope includes repository/workspace/source revisions, path, parser/grammar/extractor revisions, node kind/symbol/occurrence/span, and parent.
- The V2 parent foreign key now includes repository, workspace ID/revision, path namespace/path, and source revision, preventing cross-file or cross-revision parent links. SQL still cannot prove span-to-source-byte correspondence, UTF-8 boundary correctness, UTF-16 conversion, or parent-span containment; the pure proposal validator does those checks before producing a row proposal.
- The new `scripts/atlas/sql/prove-atlas-ast-nodes-v2-contract-canary-v2.sql` passed inside a transaction with the draft. It exercised qualified root/child inserts, NULL workspace rejection, cross-source parent rejection, duplicate observation rejection, legacy-ID rejection, immutability, supersession/current-view behavior, and V1 row-count preservation. The transaction rolled back and an independent catalog query confirmed `atlas_ast_nodes_v2` remained absent. This is schema/canary evidence, not committed persistence or independent post-commit readback.
- Both provider receipts contain source reference, exact byte digest/length, source revision, and workspace revision. The TypeScript receipt is for `src/routes/api/admin/demo-list/route.ts`; the Svelte receipt is for `src/routes/admin/cache/+page.svelte`. They are diagnostic receipts, not persistence envelopes, and contain no V2 node IDs or independent database readback.
- A fresh read-only authority check resolves the referenced workspace revision to exactly one `graphify_execution_authority` row, but its state is `LEGACY_IMPORTED`, not `SELECTED`. The repository UUID mapping is unique. Therefore the identity lookup is exact, but this workspace is not proven as the currently selected/admitted Graphify execution; the prior proposal artifact must not be described as an admitted-workspace proof.
- A fresh read-only census found zero rows in `graphify_execution_authority` with `authority_state='SELECTED'`. The two exact source bindings for the TypeScript and Svelte samples both join to the same `LEGACY_IMPORTED` workspace/revision. Existing checksummed proposals were left unchanged; the admission finding is recorded here and is not retroactively added to those artifacts.
- The bounded batch driver (`scripts/atlas/audit-indexed-source-batch-v1.mjs` → `scripts/atlas/lib/indexed-source-batch-v1.mjs`) performs a read-only binding SELECT, runs per-source diagnostics, validates receipt checksums/identity, and emits a local batch receipt. It has no AST writer or persistence/readback call. The only inspected caller of `writeAtlasAstNodes` is the separately gated declaration canary. Thus the exact missing integration boundary is provider AST facts → approved writer input; the later V1 independent readback helper is available but does not convert diagnostic receipts into persisted rows.
- A pure proposal validator now exists at `scripts/atlas/lib/atlas-ast-nodes-v2-proposal-contract-v1.mjs`. It verifies source-byte digest equality, strict UTF-8 boundaries, UTF-16 and line offsets, bounded paths, parent containment/cycles, supported node kinds, deterministic node IDs, and proposal checksums. It performs no I/O and always returns `DRY_RUN_VALIDATED_NOT_INDEXED`.
- The validator was exercised on two frozen source receipts. It produced 5 nodes (file + 4 LSP function/method facts) for `src/routes/api/admin/demo-list/route.ts` and 4 nodes (file + 2 imports + embedded-TS `loadStats`) for `src/routes/admin/cache/+page.svelte`. Exact source bytes, hashes, receipt checksums, repository UUID, and workspace ID/revision were checked. The matched authority row is `LEGACY_IMPORTED`, so this is a revision-bound proposal, not proof of a currently selected/admitted workspace. `VariableStatement` and other unmapped facts remain excluded; the V2 draft has no `variable` node kind.
- A pure adapter now converts complete TypeScript or Svelte diagnostic provider facts into deterministic V2 dry-run proposals. It rejects partial providers and source-digest mismatch, maps supported kinds only, validates original-file spans through the proposal contract, deduplicates repeated facts, and assigns occurrences in stable span order. It has no production caller and performs no I/O or persistence.
- `atlas-ast-nodes-v2-row-contract-v1.mjs` maps each validated proposal to the V2 insert columns and leaves `packet_key` NULL rather than guessing. Its independent-readback comparator distinguishes exact replay, missing/unexpected rows, duplicate IDs, and immutable-payload conflicts. It is pure: it does not connect to or write a database.

## Required V2 contract before writer approval

1. Keep V1 as the legacy owner. New V2 rows require non-null repo/workspace identity, SHA-256 workspace/source/extractor revisions, exact source byte length/digest, explicit path namespace, and proposal-only admission state until a canonical packet resolver succeeds.
2. The deterministic ID recipe is `SHA256(UTF8(JSON.stringify([...]))`, tagged `atlas.ast-node.v2.identity.v2`, over repository UUID, workspace ID/revision, namespace/path, source revision, parser name/version/language, grammar and extraction revisions, node kind, qualified symbol, parent ID, occurrence, and byte span. V1 ID forms are rejected; JavaScript fixtures prove workspace, source, parser, grammar, and extraction changes alter IDs.
3. The unique replay key covers the same revision/parser/extractor/span scope. A future V2 writer must treat `ON CONFLICT` as a lookup, compare every persisted payload field, accept only byte-for-byte identical replay, and return a typed conflict for any difference. The pure readback comparator implements that comparison contract; no database writer is connected yet.
4. The proposal builder validates exact source digest, strict UTF-8 boundaries, UTF-16 and line coordinates, and parent containment/cycles. The schema enforces byte ranges and same-revision/file parent references. The row mapper carries the source-span digest and exact parser/extractor revisions.
5. Source/workspace binding must be re-resolved by the writer/readback owner; packet keys are not inferred from paths and remain NULL in these proposal rows.
6. Independent committed readback must query V2 by expected IDs, reject duplicate/missing/unexpected rows, compare all immutable fields, re-open exact source bytes, recompute source/span/identity hashes, and verify the canonical workspace-source binding. The rollback canary proves only transactional schema behavior, not that readback.

## Decision and next gate

The schema/writer contract is ready for migration-owner review and remains unapplied. The draft, deterministic ID recipe, row mapping, conflict/readback behavior, focused tests, and rollback-only canary now agree. Production indexing remains a separate gate: no V2 writer/caller or committed readback exists, and the live Graphify authority census has zero `SELECTED` rows (the sample workspace is `LEGACY_IMPORTED`). No AST persistence or P20 chunk-revision write is authorized by this readiness result.

## Evidence

- `sveltekit-frontend/drizzle/manual/20261017_atlas_ast_nodes_v2_DRAFT.sql`
- `scripts/atlas/lib/atlas-ast-nodes-writer.mjs`
- `scripts/atlas/apply-ast-declaration-canary-v1.mjs`
- `scripts/atlas/sql/prove-atlas-ast-nodes-v2-contract-canary-v2.sql`
- `.tmp/atlas/indexed-source-provider-diagnostic-1792542643757.json`
- `.tmp/atlas/indexed-source-provider-diagnostic-1792542655379.json`
- Live PostgreSQL 18.4 catalog inspection ran inside `BEGIN READ ONLY` / `ROLLBACK`.
- `node --test scripts/atlas/lib/indexed-source-batch-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-independent-readback-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-writer-v1.test.mjs`: 22/22 passed. These prove helper contracts only, not live persistence.
- The bounded `scripts/atlas` batch after `scripts/atlas/duckdb/build-domain-snapshot.mts` returned 16 completed diagnostics, `datastoreWritesPerformed: false`; status is partial because the page limit truncated the scan.
- `node --test scripts/atlas/lib/atlas-ast-nodes-v2-row-contract-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-v2-diagnostic-adapter-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-v2-proposal-contract-v1.test.mjs scripts/atlas/lib/indexed-source-batch-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-independent-readback-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-writer-v1.test.mjs`: 36/36 passed. Tests cover pure mapping/comparison and existing helpers, not committed persistence.
- V2 DDL/canary transaction: `AST_NODES_V2_CONTRACT_CANARY_ALL_PASS`; explicit rollback; catalog readback `ABSENT`.
- Two-source local proposal artifact: `.tmp/atlas/ast-nodes-v2-proposal-two-source-20261020-v2.json`; both entries remain `DRY_RUN_VALIDATED_NOT_INDEXED`.

`likely_cause`: Source diagnostics and V2 row proposals are validated, but durable persistence remains intentionally separate because the V2 writer is not wired and current Graphify execution authority is not selected.

`evidence`: V2 schema/canary passed in a rolled-back PostgreSQL transaction; 36 focused tests passed; live catalog still has V1 only and zero Graphify `SELECTED` authority rows.

`patch_targets`: V2 proposal/adapter/row-contract modules and tests; unapplied V2 SQL draft and rollback-only contract canary.

`safe_next_command`: Have the migration owner review this contract; keep V2 unapplied and request separate authorization before any durable writer or row test.

`smoke_command`: `node --test scripts/atlas/lib/atlas-ast-nodes-v2-row-contract-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-v2-diagnostic-adapter-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-v2-proposal-contract-v1.test.mjs scripts/atlas/lib/indexed-source-batch-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-independent-readback-v1.test.mjs scripts/atlas/lib/atlas-ast-nodes-writer-v1.test.mjs` (36 focused tests; no persistence).

`report_path`: `docs/reports/atlas-ast-nodes-v2-writer-contract-review-20261020.md`.
