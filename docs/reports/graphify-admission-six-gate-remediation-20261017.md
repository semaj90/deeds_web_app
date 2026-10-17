# Graphify Admission: Six-Gate Remediation Review — 2026-10-17

**Verdict: NOT_SAFE_TO_PROJECT.** This review is source/report analysis only; no database, projection, cache, or Graphify refresh writes were performed.

## Current gate evidence

The admission receipt `docs/reports/atlas-canonical-projection-fabric-audit-2026-10-17.json` reports five PASS predicates and six predicates below PASS. `ORDINAL_MAP_SEALED` is PASS in this receipt, superseding the older `NOT_PROVEN` ordinal snapshot. The receipt is still blocked by:

| Predicate | Current evidence | Safe remediation boundary |
|---|---|---|
| `SYMBOLS_RESOLVED` | 18,881/20,744 supported refs processed; 704 unprocessed; 1,155 lack exact Graphify source-revision rows; 4 parse failures. | Use the existing extractor's frozen, exact-revision planning and bounded shards only after confirming its admitted snapshot. Do not run `--apply` to chase 100%: the missing-revision cohort cannot be repaired by parsing current disk bytes or inventing revisions. |
| `SEMANTIC_OWNER_PROVEN` | `codebase_chunk_index.content_embedding_768` is the contract target, but `atlas_packets.embedding` and `codebase_chunk_index.content_embedding` remain unresolved; writer owner is not proven. | Establish unique writer, row-level representation provenance, revision-qualified reads, and independent projection readback. Do not retire columns or treat the audit script as a promotion receipt. |
| `LATENT_FAMILY_PROVEN` | Artifact digests and producer chain are cross-checked; no per-row input-digest ledger; lifecycle remains CANDIDATE. | Recover the exact training-input snapshot from existing immutable receipts/checkpoints. If absent, preserve `PARTIAL_PROVEN`; do not synthesize an input digest or promote the representation. |
| `PROJECTIONS_CHECKSUM_ALIGNED` | No existing per-run receipt binds the same input and ordinal-map checksums across projections. | Emit a receipt through existing projection owners after a frozen cohort and independent readback. Do not create a parallel registry; a reindex plan is not proof of applied alignment. |
| `BITFROST_KEYS_DERIVABLE` | Both current v1 and legacy packet namespaces have zero observed keys. | First prove the admitted ACE packet-key producer/caller and deterministic key derivation; only then consider a separately authorized bounded cache write/readback. Zero keys is not itself a reason to warm the cache. |
| `ACE_EVIDENCE_GROUNDED` | `ace_context_sources` is legacy diagnostic; no canonical retrieval→AcePacketV3→ContextManifest receipt/readback is established. | Prove the current SearchRuntime selection and ACE/ContextManifest handoff with exact evidence identities, revisions, checksums, and independent readback. Do not use a legacy canary or table row count as substitute evidence. |

Tree-sitter and ast-grep can improve structural observations and extraction coverage, but cannot supply missing source revisions or make a symbol canonical. PyTorch can produce latent vectors and model checksums, but cannot reconstruct which semantic input snapshot trained an existing checkpoint. Neither tool closes the projection, cache, or ACE gates by itself.

## Daily runner and stale-hook correction

`require-canonical-projection-admission-v1.mjs` runs the audit, then throws `GRAPHIFY_PROMOTION_ADMISSION_BLOCKED` unless the report verdict is `SAFE_TO_PROJECT` and every required predicate is PASS. The ordinary `graphify:daily` path reaches lifecycle and apply-capable stages only after that gate. Do not bypass it.

The proposed root-vs-frontend hook explanation is not supported by the current checkout. `.claude/settings.json` resolves its graph path under `sveltekit-frontend/docs/graph/codebase-graph.json`. A fresh `graphify:daily:inspect` at 2026-10-17T11:17:15Z found that same frontend artifact at 0.85 hours old, while the distinct tracked root artifact `docs/graph/codebase-graph.json` was 1,144.5 hours old. The hook and fast-indexer target are therefore aligned; the stale root copy is a separate artifact. The inspect output was diagnostic only and reports no source/datastore writes.

Do not describe `graphify:daily:dry` as globally mutation-free without auditing each child. The startup terminal route also opens/completes a lifecycle row, and the dry child includes additional stages. The discovery `inspect` mode is the verified read-only command used here.

## Validation performed

- `sparse-incidence-tensor-v1.spec.ts`: 3/3 tests passed. The current assertion uses `toBeCloseTo` for Float32 values; no edit was needed in this turn.
- `npm run graphify:daily:inspect`: `DIAGNOSTIC_COMPLETE`; 140 physical root directories, 35,091 tracked paths; no datastore/source writes, no promotion authorization.
- Existing bounded extractor dry-run `docs/reports/graphify-symbol-extractor-v1-1792235747295.json`, SHA-256 `21b4b15a0775f8ad643fb23d39f4094e1353ec01f5d5bb57d6574c3bcc346ca1`: 50 rows from the 704 unprocessed refs were read from the materialized admitted snapshot (`sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b`) under workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`; 50/50 source byte checks matched, 726 symbols were proposed, 0 parsed rows were committed, 0 failures, and `datastoreWriteAttempted=false`. The old `graphify_files.workspace_revision` differed for all 50, but the exact current `atlas_workspace_source_bindings` join supplied the admitted workspace revision; retain that mismatch as diagnostic and do not rewrite it here. This is a bounded feasibility result, not closure of `SYMBOLS_RESOLVED`.
- No live services, model, GPU, database mutation, cache warming, extractor apply, migration, or daily apply chain was run.

## Next safe gate

Reconcile each predicate against its existing owner and immutable receipts. Continue the read-only exact-revision symbol plan over the remaining 654 of the 704 unprocessed refs, using the same materialized snapshot and exact binding join; keep the 1,155 missing-revision refs explicitly excluded. Do not apply extraction under the post-P20 source-revision deferral. Then establish semantic writer ownership and latent input provenance before preparing any projection binding. ACE must be proven before BitFrost cache warming. Re-run the full admission audit only after evidence changes; do not force a PASS by changing the gate.

```yaml
likely_cause: The six remaining admission predicates require missing lineage or independent end-to-end receipts; parser/model execution alone cannot provide that evidence.
evidence:
  - docs/reports/atlas-canonical-projection-fabric-audit-2026-10-17.json
  - scripts/atlas/require-canonical-projection-admission-v1.mjs
  - scripts/startup/run-graphify-daily-startup.mjs
  - .claude/settings.json
  - graphify:daily:inspect output observed 2026-10-17T11:17:15Z
patch_targets:
  - openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md
safe_next_command: npm run graphify:daily:inspect
smoke_command: npx vitest run src/lib/server/atlas/tensors/sparse-incidence-tensor-v1.spec.ts --reporter=dot --pool=forks --poolOptions.forks.singleFork=true
report_path: docs/reports/graphify-admission-six-gate-remediation-20261017.md
```

## Fresh verification — 2026-10-17

The read-only admission audit was rerun into `.tmp/atlas/current-admission-audit-20261017/` to avoid overwriting the existing untracked report in `docs/reports/`. It again returned `NOT_SAFE_TO_PROJECT` with six predicates below PASS. `ORDINAL_MAP_SEALED` is now PASS, so any older ordinal `NOT_PROVEN` diagnosis is stale.

A frozen-plan extraction dry-run emitted only shard `GRAPHIFY-BASELINE-c7d1cadcab08-0001`: 250 candidates, 3,124 proposed symbols, zero source-revision mismatches, `apply=false`, zero datastore writes, and `shardCompletionProven=false`. A three-shard invocation remained CPU-bound past 15 minutes after this first shard and was interrupted; no evidence exists for shards 2–3. Keep `SYMBOLS_RESOLVED` open. Do not run `--apply`: the missing 1,155 exact-revision rows and post-P20 source-revision deferral cannot be repaired by current-disk parsing.

The other five gates remain evidence/ownership gaps, not missing compute tasks: semantic writer uniqueness/readback; latent input-snapshot provenance; same-input projection checksums; ACE packet-key derivation before any separately authorized BitFrost cache readback; and a live, independently read-back SearchRuntime → AcePacketV3 → ContextManifest chain. This pass performed no canonical database, cache, or projection writes and did not run `graphify:daily`.

### Semantic embedding ownership recheck

The read-only census `scripts/atlas/audit-semantic-768-writer-ownership-v1.mjs --output=.tmp/atlas/current-admission-audit-20261017/semantic-768-writer-ownership.json` returned `OWNER_NOT_PROVEN` and 18 writer candidates. Live counts were 219,998 populated `content_embedding_768` rows, 55,169 populated legacy `content_embedding` rows, and 61,659 populated `atlas_packets.embedding` rows. Among the 219,998 canonical-target rows, 0 have source revision, workspace revision, representation revision, or lineage producer revision; all have `content_hash` and embedding model labels. This confirms that the missing proof is ownership plus row-level provenance, not an absent vector column. Do not backfill current revisions from present-day files or retire legacy columns based on the target column's existence.

### Audit identity reconciliation

Compared the canonical admission and latent identity receipts against a live read-only database identity probe. Both use the same `legal_ai_db` database, `public` schema, search path `"$user", public`, and PostgreSQL server `172.18.0.20:5432` (host endpoint `127.0.0.1:5434`). `graphify_symbols` exists in both audits; the earlier interpretation that the latent audit found it absent was incorrect. `atlas_representation_records` is absent, but this is not a conflict: the existing `atlas_representations` registry is present and is the canonical audit's representation owner. The latent sample's `source_ref_joined_count=0` remains a distinct unresolved query/cohort finding and is not yet a proven lineage defect. Updated the latent audit to record database, schema, search path, and server identity in future receipts. The probe transaction was READ ONLY and rolled back.

The follow-up traced `source_ref_joined_count=0`: `atlas_ast_nodes.source_ref_key` is not file-grain. A live read-only census found 519,769/519,769 non-null keys contain a `#` node/field locator, and zero are plain file paths. Therefore the latent audit's exact join of packet file paths to this table cannot establish file-source lineage; its zero is an incompatible-key-granularity diagnostic, not proof that packet sources have no lineage. This does not close source or symbol qualification: the audit still lacks a canonical packet-to-symbol-version join and must use the proper file-level source binding owner for that proof.

The audit now checks file-level packet references against `atlas_workspace_source_bindings`, while keeping node-locator counts separate. In the deterministic 1,000-packet latent sample, 292 packets match a binding path, 272 match both path and exact source revision, and 272 match path, source revision, and packet workspace revision key. This is bounded file-binding evidence only: the canonical `source_version_id` join, symbol-version join, and full-cohort admission remain unproven. The final receipt is `.tmp/atlas/current-admission-audit-20261017/latent-file-binding/latent-representation-identity-audit-2026-10-17.json` (SHA-256 `a33e0d787db1c2851252f7cb12f4834717b04481fb187a911b300eeb6ff351cf`). It confirms `graphify_symbols` exists but is not joined by this audit, and clarifies that `atlas_representations` is the existing representation registry but is not joined here. All relevant qualification gates remain open.

### Indexed PostgreSQL source provider diagnostic

Added `scripts/atlas/audit-indexed-source-providers-v1.mjs` and focused AST-grep, LSP, and NLP adapters under `scripts/atlas/lib/`. The runner selects exactly one `atlas_workspace_source_bindings` row joined to `graphify_files` by canonical path and exact source revision in a PostgreSQL `READ ONLY` transaction; it then validates the source bytes against that revision before invoking providers. Its provider response is diagnostic/proposal-only (`canonicalAuthority=false`); it does not invoke symbol projection, packet mutation, graph projection, cache warming, or admission.

One bounded run used `scripts/api-cleanup/recovery.ts` at source revision `sha256:9075e99e99c7f818385a0fd645a0545cf1656e7fbb251440b459b6fdeed0d1f1` within workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`. PostgreSQL returned one exact binding and `graphify_files` row (`PROCESSED`); 4,631 source bytes matched SHA-256. Tree-sitter returned 32 chunks; ast-grep returned 10 matches, each enclosed by a native chunk (0 exact-span matches, 0 disagreements); LSP returned 3 document symbols; the NLP sidecar returned 4 source-revision-bound passes and a revision-bound classification proposal. The NLP helper and `/analyze` path are inference/diagnostic only; no persistence API was called. The receipt `.tmp/atlas/indexed-source-provider-diagnostic-1792238789172.json` recomputes to SHA-256 `ffa357cc1915e8fc810e0d186df2fb848770679f3f396e191d339d8b0d1b19d1` and reports `DIAGNOSTIC_COMPLETE_NOT_ADMITTED`.

This proves the bounded indexed-source-to-provider diagnostic path, not exact AST span parity or a canonical packet-to-symbol-version join. The working-tree source matched the indexed revision; no immutable snapshot root was configured for this run. Preserve the 10 enclosed-but-not-exact ast-grep matches as observations; do not promote them as source coordinates. No canonical database, Qdrant, Neo4j, Valkey, Graphify, or projection writes were performed. Keep all six admission predicates below PASS as previously reported.

Focused subhelper tests pass 4/4, all four JavaScript files pass `node --check`, and strict OpenSpec validation passes. The tests cover revision mismatch rejection, unsupported LSP language skipping, advisory revision-bound NLP proposals, and the 50,000-byte NLP request cap. They are contract tests, not live corpus or production admission proof.

### Symbol-version source crosswalk correction

The prior latent identity audit compared packet file paths with `atlas_ast_nodes.source_ref_key`, which is node-fragment grain, and left the packet-to-symbol-version fields hard-coded to zero. Replaced that section with a bounded exact join through `atlas_workspace_source_bindings` → `graphify_files` → `graphify_symbols` → `atlas_symbol_versions` → active `atlas_symbol_registry`. The candidate check follows the existing symbol-writer tuple: exact source and workspace revisions, upstream symbol ID, qualified name, declaration hash, and half-open byte span. A source binding is not represented as a `source_version_id`; that gate remains unproven.

The fresh 1,000-row latent-packet sample has 272 exact file/source/workspace bindings, 157 exact-revision Graphify symbol-bearing packets, and 0 exact symbol-version tuple joins. Across all 479 existing symbol-version rows, all 479 have SHA-256-shaped source and workspace revisions; 208 match an exact workspace source binding, 198 match an exact Graphify file revision, 144 match a packet identity, and 285 carry a packet key. However, 0 match the current Graphify upstream symbol ID; only 34 share a same-file qualified name, and 0 of those match both current span and declaration hash. Thus valid-looking revision fields do not establish AST identity or span correctness.

One concrete row is `symbol-version:6f2a2793b1f99ad0a14c20814f7b67c421a7d0724669bbc8716dd4a979287cdf` for `packages/atlas-core/src/packet-reader.ts`. Its database source revision `sha256:d4083d3c5b3fa768657b4d7122200ba726ef7abcfbc418b6c9c28d80964b0024` matches the current file bytes. The row records producer `atlas-ast-symbol-version-materializer-v1`, `upstream_symbol_id=null`, and stored `PacketReader` span `[1029,4978)`; the current same-revision Graphify symbol is `[1059,5180)` with a different declaration hash. The producer metadata identifies the historical writer, but the exact origin of its incorrect range/hash is not established. Do not replay the retired direct-SQL writer, fill the missing ID, or repair these rows from current source bytes.

The refreshed read-only receipt is `.tmp/atlas/current-admission-audit-20261017/latent-symbol-crosswalk-v6/latent-representation-identity-audit-2026-10-17.json`; PostgreSQL rolled back the READ ONLY transaction, Qdrant was read-only, and no canonical writes occurred. Keep `LAT_AUDIT6_SOURCE_VERSION_JOIN` and `LAT_AUDIT8_SYMBOL_JOIN` as `NOT_PROVEN`; fix the upstream producer/input-coordinate reconciliation before any symbol or latent projection is admitted.
