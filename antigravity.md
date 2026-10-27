# ANTIGRAVITY.md — Parent Atlas Operational Invariants & Live Receipts

> **Operational Order**: Run the validators first, inspect what each validator writes, and make documentation corrections only with verifiable citations to their generated receipt paths.

---

## 1. Verified Diagnostic & Validation Receipts

| Validation Gate | Receipt Path | Status | Verification Summary |
| :--- | :--- | :--- | :--- |
| **HISTORICAL CHUNK 01** | `docs/reports/historical-chunk-resolver-receipt-v2.json` | **PROVEN (Read-Only)** | [`scripts/atlas/historical-chunk-resolver-v2.mjs`](file:///C:/Users/james/Videos/deeds-web-app/scripts/atlas/historical-chunk-resolver-v2.mjs) passed 6/6 tests ([`historical-chunk-resolver-v2.spec.mjs`](file:///C:/Users/james/Videos/deeds-web-app/scripts/atlas/historical-chunk-resolver-v2.spec.mjs)). Evaluates Git history attribution without modifying database records. |
| **Containment Scan** | `.tmp/atlas/historical-chunk-receipt-v1.json` | **RECORDED** | [`scripts/atlas/historical-chunk-receipt-v1.mjs`](file:///C:/Users/james/Videos/deeds-web-app/scripts/atlas/historical-chunk-receipt-v1.mjs) scanned 2,000 live chunks: **1,613 contained in current line window**, **386 not contained** (stale/historical), **1 source missing**. |
| **DIGEST SCOPE 01** | `docs/reports/historical-chunk-resolver-receipt-v2.json` | **DECLARED** | Explicit scope: `SHA256` over normalized UTF-8 bytes (`\r\n` $\rightarrow$ `\n`, boundary trim). Byte spans distinguished from LSP UTF-16 code units. |
| **SOURCE JOIN 01** | `docs/reports/historical-chunk-resolver-receipt-v2.json` | **SPECIFIED** | 5 discrete states in `evaluateChunkHistoricalLineage`: `CURRENT_SOURCE_VERIFIED`, `HISTORICAL_SOURCE_MATCH`, `SOURCE_CONTENT_MISMATCH`, `AMBIGUOUS_SOURCE_MATCH`, `UNVERIFIED_DIGEST_SCOPE`. |
| **Label Taxonomy Reconciliation** | `src/lib/server/atlas/classification/label-taxonomy-reconciliation.spec.ts` | **PASSING (8 passed, 3 todo)** | Verified 8 passing test cases; 3 reserved todos for source-level split tests. |
| **Feature Identity Derivation** | `scripts/atlas/lib/derive-feature-identityv2.test.mjs` | **PASSING (11/11)** | Stored feature label can no longer self-confirm as `CANONICAL` without independent source evidence; requires review. |
| **Parent-Atlas Symbol Smoke** | `packages/parent-atlas/test/svelte-typescript-symbol-smoke.test.mjs` | **13 passed, 3 skipped** | 13 unit tests passing; 3 live `:8095` tests skipped when `ATLAS_8095_FIXTURE_URL` is unset. |

---

## 2. Unproven Boundaries & Explicit Gaps

> [!CAUTION]
> The following items are **NOT PROVEN** for production authority. Do not claim completion or trigger database mutations based on fixture-level passes.

1. **The 3 Skipped Live :8095 Tests (`NOT PROVEN LIVE`)**:
   - In `packages/parent-atlas`, 3 live 8095 tests are marked `# SKIP` unless `ATLAS_8095_FIXTURE_URL` is explicitly configured. Passing 13/16 does not prove live `:8095` end-to-end extraction against production SvelteKit source components.
2. **Stable-File UUID Minting (`0 ROWS IN DB`)**:
   - `atlas_stable_file_identity` currently contains **0 rows**. Per-file UUIDs are not yet minted.
   - `atlas_repository_identity` holds 1 row (`01a13137-1378-7df9-9968-53738dbf0e48`, `deeds-web-app`, UUIDv7).
   - Populating file UUIDs requires explicit approval and a validated dry-run script.
3. **HyperGraph in Neo4j (`NOT EVIDENCED`)**:
   - Live probe shows **0 hyper-labelled nodes** in Neo4j. The writer in `hypergraph-store.ts` exists on disk but has never executed against the live Neo4j database.
4. **HyperGraphRAG Retrieval (`CONTRACT ONLY`)**:
   - `sveltekit-frontend/src/lib/server/atlas/retrieval/hypergraph-retrieval-v1.ts` is a Zod schema contract; it does not connect to or query Neo4j.
5. **NetworkX Live Parity (`FIXTURE ONLY`)**:
   - Zero-hop, multi-hop, and cycle BFS parity is proven only against static fixtures (`atlas-resident-bfs-proof-2026-10-13.json`). Live parity requires an admitted graph snapshot (`atlas_graph_snapshots_v2`).
6. **Workspace Binding Disambiguation**:
   - `atlas_workspace_source_bindings` holds **24,253 rows** matching commit `c63620c4` (out of 93,500 total across 5 revisions). The workspace is bound, but stable-file identity remains unpopulated.

---

## 3. Standing Architectural Rules

- **No Index Rebuilds**: Evaluators run with `readOnly: true`, `writesPerformed: false`, and `canonicalAuthority: false`. Zero mutations sent to `codebase_chunk_index` or PostgreSQL tables.
- **Agent Stale Chunk Editing Block**: Non-contained and historical chunks are quarantined into `recommendedRebuildCohort` and marked `BLOCKED_FROM_REPAIR` to prevent agents from patching files against stale code bodies.
- **Immutability of Historical Evidence**: Historical chunk bodies preserve their original stored hashes; Git commit hashes (`currentGitRevision` vs parent commits) are linked as external metadata rather than rewriting canonical fields.
- **No Self-Confirmation**: A stored feature label can no longer validate itself as `CANONICAL` when it is the only evidence; independent source evidence is required.
- **Token Identification**: Token IDs come strictly from the model tokenizer, never from symbol hashes or candidate ordinals.
- **Separation of Concerns**: Dense search keeps its current behavior until a shadow comparison proves otherwise.

---

## 4. Live Environment Surfaces (Verified 2026-10-27)

```text
PostgreSQL 18.4 (Port :5434)  -->  legal-ai-postgres (Healthy, 24,253 c63620c4 bindings)
Neo4j Mirror   (Port :7474)  -->  legal-ai-neo4j (Healthy, 165k context nodes, 0 hyperedges)
Tree-sitter    (Port :8095)  -->  provenance-v2 (Healthy, Ornith-1.5-9b, AST-grep 0.45.3)
GPU Accelerator              -->  RTX 3060 Ti 8GB (CUDA 13.0, LibTorch cu130, RAPIDS cuVS)
```
