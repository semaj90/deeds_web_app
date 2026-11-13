# Parent Atlas identity and feature authority reconciliation

**Status: PARTIAL; acceptance is not met.** The OpenSpec, workboard, execution receipt, verifier, and feature records do not yet form a complete revision-qualified identity chain. This audit was read-only against PostgreSQL 18.4. It did not change schema, rows, task status, Valkey, or runtime admission.

## Source revision

- Current `HEAD`: `709d41148c2cf53aab2820a16dc281357827bab7`.
- Requested starting commit `8d01ce3a6cead9b7ae5895ee66356aaa616c0e1d` is an ancestor of that HEAD.
- The worktree was already dirty with 41 entries when inspected. The stdout-only workboard projection reflects the current worktree; it does not claim a clean-commit snapshot. Existing edits were preserved.

## Findings by gate

| Gate | Result | Evidence |
| --- | --- | --- |
| OpenSpec identity | **Partial** | Current projection has 14,000 tasks and 14,000 unique `stableKey`s. The live source index contains 5,640 rows from a snapshot created 2026-10-19. |
| Stable key → Kanban | **Partial** | 4,337 current stable keys exactly equal a `kanban_tasks.task_id`. Kanban has 4,514 rows, but all have `source_revision IS NULL`. |
| Source index → Kanban | **Not directly linked** | All 5,640 indexed rows have a `canonical_task_key_candidate`, but exact equality to `kanban_tasks.task_id` yields 0 matches. There are 61 duplicate candidate values. |
| Current source → index → Kanban | **Partial exact subset** | 3,678 current task source references exactly match an indexed `source_ref`; 3,128 also match the indexed task block hash. Of those, 2,467 also match Kanban by the generated stable key. Within those triples, 2,377 candidate IDs are unique and 29 candidate IDs map to multiple stable keys. |
| Execution receipt verification | **Pass for 32 verifier rows** | 32 receipts join to independent verifier rows; all 32 are `VERIFIED_PASS`, evidence-resolved, source-revision-equal, and digest-equal after removing the verifier's `sha256:` prefix. There are 45 receipt rows total; 13 have no strict verifier row. |
| Kanban task → receipt | **Unverified** | 147 Kanban attempt rows have receipt references, but 0 match `atlas_test_execution_receipts.execution_receipt_id`. The 32 verified test receipts have no task/stableKey field. |
| Feature identity | **Not admitted** | `FeatureResolutionV1` is a contract, not a registry. The approved Feature Registry spec exists, but Feature Identity V2 SQL is draft/unapplied and its four tables are absent live. No inspected candidate table contains approved/canonical rows. |
| Runtime admission | **Not proven** | No current authorization + task/source revision + independently verified task receipt + reviewed feature binding chain exists to admit. |

The current generated `stableKey` is a SHA-256-derived change/title key, with `~2`, `~3`, etc. for repeated titles; the occurrence suffix depends on ordering. It is suitable as the workboard migration key when unique in the current snapshot, but is not the same identity as the source index's `openspec-task:openspec://...` candidate. Do not join them by label or path alone.

The 2,467 exact triples use the exact source reference **and** exact task-block hash to connect a current task to the older source-index row, then exact stable-key equality to Kanban. This is evidence for that bounded subset, not proof that the stale index is current or that every task is reconciled. The 29 ambiguous candidate IDs remain unresolved.

### Current source-index preview

The November 11 census file failed the source-index owner's freshness guard with `WORKSPACE_SNAPSHOT_STALE` (exit 1); it wrote no output receipt. I then called the same census builder and `buildSourceRows` functions in memory against the current worktree and used a read-only database connection for comparison. No scratch report or database row was written.

- Current source revision: `709d41148c2cf53aab2820a16dc281357827bab7`; OpenSpec workspace revision: `sha256:d344ed63726d13f2d80c60c90fd09c35bfa82b578e2b734e64e75f10d8c09e59`.
- The fresh census is `DIAGNOSTIC_ONLY_NOT_PROMOTABLE`, with 15,068 task rows and 6,328 unchecked tasks.
- The source-index plan has 6,328 rows, 0 invalid rows, and is below the 10,000-row apply cap. Identity states: 3,564 `DECLARED_ID`, 2,554 `DERIVED_ID`, 210 `AMBIGUOUS`.
- Current source refs and block hashes match the workboard on 5,770 rows; 4,331 of those also match a Kanban task through its generated `stableKey`.
- In that exact subset, 4,246 candidate IDs occur; 47 are ambiguous across multiple stable keys and 4,199 map to one stable key. Direct candidate-ID equality to Kanban `task_id` remains 0.

This makes a bounded source-index apply structurally eligible under the indexer's row-level checks, but the overall census remains diagnostic-only. I did **not** apply it. The 14,000-row workboard projection and 15,068-row evidence census have different enumeration scopes; exact reference/hash intersections above are the comparison, not an assertion that their total counts should match.

## Feature identity authority

The OpenSpec `atlas-feature-registry` spec says canonical feature identity is stable and independent of paths, graph IDs, cluster IDs, and labels. `feature-resolution-v1.ts` expresses `CANONICAL`, `PROPOSED`, and unresolved output shapes, but does not own or persist approvals.

The V2 proposal defines the intended authority chain: approved concept identity; namespace-qualified local identity; a revisioned source-to-concept crosswalk; reviewed evidence and reviewer; and a current label revision. Its live tables are absent. The existing live `atlas_fi_features` table has 7 rows, no approved/canonical/reviewed statuses, and no source revisions. The 59-row domain vocabulary crosswalk has 0 `canonical=true` rows; it is not an application feature identity registry. The 2 task semantic packets also have 0 canonical rows.

Therefore, **no feature binding can be promoted to `CANONICAL` from this evidence**. Keep observed labels as `PROPOSED`. `WITHDRAWN` must be an explicit, revisioned review decision; it must suppress the prior binding instead of falling back to an older approval.

## Exact read-only SQL used

All queries ran inside `BEGIN TRANSACTION READ ONLY` and ended with `ROLLBACK`.

Latest source-index snapshots:

```sql
SELECT snapshot_id, workspace_revision, input_checksum, source_row_count, snapshot_status, created_at
FROM openspec_task_source_snapshots_v1
ORDER BY created_at DESC
LIMIT 5;
```

Candidate identity directly joined to Kanban task identity:

```sql
SELECT count(*) AS source_rows,
       count(*) FILTER (WHERE i.canonical_task_key_candidate IS NOT NULL) AS candidate_rows,
       count(*) FILTER (WHERE k.task_id IS NOT NULL) AS exact_matches,
       count(*) FILTER (WHERE i.canonical_task_key_candidate IS NOT NULL AND k.task_id IS NULL) AS unmatched
FROM openspec_task_source_index_v1 i
JOIN openspec_task_source_snapshots_v1 s USING (snapshot_id)
LEFT JOIN kanban_tasks k ON k.task_id = i.canonical_task_key_candidate
WHERE i.snapshot_id = 'sha256:88c34023ae0a8a0a07920b939d9c6e7ea4b080f4d828db7393d5943d0eeb24ab';
```

Strict verifier readback for test execution receipts:

```sql
SELECT count(*) AS joined,
       count(*) FILTER (WHERE v.verification_status = 'VERIFIED_PASS' AND v.evidence_resolved) AS verified_pass_with_evidence,
       count(*) FILTER (WHERE v.source_revision IS DISTINCT FROM r.source_revision) AS source_revision_mismatches,
       count(*) FILTER (WHERE replace(v.computed_digest, 'sha256:', '') = replace(r.report_checksum, 'sha256:', '')) AS digest_matches
FROM atlas_test_execution_receipts r
JOIN atlas_receipt_verifier_results_v1 v
  ON v.execution_receipt_id = r.execution_receipt_id;
```

Kanban attempt receipts against the test receipt owner:

```sql
SELECT count(*) FILTER (WHERE a.execution_receipt_id IS NOT NULL) AS attempt_receipt_refs,
       count(*) FILTER (WHERE a.execution_receipt_id IS NOT NULL AND r.execution_receipt_id IS NOT NULL) AS exact_test_receipt_matches
FROM kanban_task_attempts a
LEFT JOIN atlas_test_execution_receipts r
  ON r.execution_receipt_id = a.execution_receipt_id;
```

Feature Identity V2 live table presence:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'atlas_feature_concepts',
    'atlas_feature_source_identities',
    'atlas_feature_concept_crosswalk',
    'atlas_feature_labels'
  );
```

The complete machine-readable receipt records the selected snapshot, exact counts, source paths, and check results in the adjacent JSON file.

Additional exact reads used for the in-memory current workboard crosswalk and candidate/feature counts:

```sql
SELECT source_ref, task_hash, canonical_task_key_candidate, identity_status
FROM openspec_task_source_index_v1
WHERE snapshot_id = $1;

SELECT task_id, source_refs, source_revision
FROM kanban_tasks;

SELECT count(*) AS duplicate_candidate_values
FROM (
  SELECT canonical_task_key_candidate
  FROM openspec_task_source_index_v1
  WHERE canonical_task_key_candidate IS NOT NULL
  GROUP BY canonical_task_key_candidate
  HAVING count(*) > 1
) d;

SELECT 'atlas_fi_features' AS owner,
       count(*) AS rows,
       count(*) FILTER (WHERE upper(status) IN ('APPROVED','CANONICAL','REVIEWED')) AS approved_or_canonical,
       count(DISTINCT feature_id) AS distinct_ids,
       count(DISTINCT source_revision) AS source_revisions
FROM atlas_fi_features
UNION ALL
SELECT 'atlas_domain_vocabulary_crosswalk_v1', count(*), count(*) FILTER (WHERE canonical),
       count(DISTINCT source_value), count(DISTINCT crosswalk_version)
FROM atlas_domain_vocabulary_crosswalk_v1
UNION ALL
SELECT 'task_semantic_packets', count(*), count(*) FILTER (WHERE canonical),
       count(DISTINCT feature_id), count(DISTINCT validation_status)
FROM task_semantic_packets;
```

The returned index and Kanban rows were compared in memory with the stdout-only workboard snapshot. The join admitted only exact `sourceRef` equality plus exact task block-hash equality; source path alone was not used. Direct source-index-candidate equality to `task_id` remained a separate zero-match result.

## Verification

- Command: `node scripts/atlas/build-openspec-workboard-v1.mjs --task-snapshot-stdout` — succeeded; 14,000 task rows, no duplicate stable keys. Stdout-only mode; no generated workboard file was replaced.
- Command: `npx vitest run src/lib/server/atlas/board/task-proof-line-v1.spec.ts src/lib/server/atlas/board/task-proof-line-v1.snapshot.spec.ts src/lib/server/atlas/cache/receipt-dictionary-v1.spec.ts` — exit 0; 3 files, 28 tests passed.
- Command: `npm run check` — exit 0; `svelte-check found 0 errors and 0 warnings`.
- Command: `node --test scripts/atlas/index-openspec-task-sources-v1.test.mjs` — exit 0; 6 tests passed.
- Database: PostgreSQL 18.4 read-only SELECTs only; no persistent database operation.

These tests validate the existing pure projection and receipt dictionary contracts. They do **not** prove that the 32 verified receipts belong to specific Kanban tasks.

## Next work

1. Refresh the OpenSpec source index through its existing snapshot owner and pin the result to a qualified source/workspace revision; preserve historical snapshots.
2. Build an explicit stableKey ↔ source-index identity crosswalk with exact source reference, task hash, and revision checks. Reject duplicate candidate identities.
3. Identify the authoritative receipt family referenced by `kanban_task_attempts`; require exact task ID, receipt ID, and source revision binding to the independent verifier result.
4. Use the existing Feature Registry spec and V2 proposal as the design owner. Review a small set of concept IDs and source bindings explicitly; do not promote labels automatically.
5. Admit runtime use only after authorization, current source/workspace revision, verified task receipt, and reviewed feature binding all resolve uniquely.

**likely_cause:** The workboard stableKey, OpenSpec source-index candidate ID, Kanban task ID, and test receipt ID use separate identity schemes with no complete revision-qualified persisted crosswalk.

**evidence:** Current workboard stdout projection; PostgreSQL 18.4 read-only catalog and joins; task/source-index and Kanban Drizzle schemas; receipt/verifier schemas; Feature Registry spec, V1 resolution contract, and unapplied V2 SQL.

**patch_targets:** `docs/reports/parent-atlas-identity-feature-reconciliation-2026-11-12.md`, `docs/reports/parent-atlas-identity-feature-reconciliation-2026-11-12.json`.

**safe_next_command:** Review the report and JSON receipt, then run the existing OpenSpec source-index snapshot owner in dry-run mode.

**smoke_command:** `cd sveltekit-frontend; npx vitest run src/lib/server/atlas/board/task-proof-line-v1.spec.ts src/lib/server/atlas/board/task-proof-line-v1.snapshot.spec.ts src/lib/server/atlas/cache/receipt-dictionary-v1.spec.ts`.

**report_path:** `docs/reports/parent-atlas-identity-feature-reconciliation-2026-11-12.md`.
