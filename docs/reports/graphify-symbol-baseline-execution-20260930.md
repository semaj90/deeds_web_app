# Graphify structural baseline execution — 2026-09-30

## Result

The existing symbol extractor has processed the frozen backlog in bounded, resumable shards.
The fresh canonical audit at `2026-09-30T16:24:42.629Z` measures **18,850/21,584 supported admitted
sources PROCESSED (87.33%)**, versus 5,185/21,584 (24.02%) before this tranche. The increase is
13,665 source refs, or 63.31 percentage points. This is status coverage, not a complete parser
readback proof. Overall admission remains **NOT_SAFE_TO_PROJECT, 4/11 PASS**.

The final read-only sweep ended at `2026-09-30T16:28:06.707Z`. All 14,531 frozen members were
visited; 13,195 have independent exact-observation readback. **Baseline seal is false**.
The 91.35% conditional ceiling was not attained, and byte parity alone was not treated as success.

## Authority and frozen cohort

- Owner: `scripts/atlas/graphify-symbol-extractor-v1.mts`, with the existing `graphify_symbols`
  and `atlas_ast_nodes` writers. No second canonical extractor or source registry was introduced.
- Exact canonical workspace binding, Graphify `code_source_revision`, current raw source digest,
  live row identity, and per-file write guards are required. Legacy Graphify workspace metadata
  is diagnostic, not a substitute for the canonical binding.
- Workspace: `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`.
- Current manifest: `docs/reports/graphify-symbol-baseline-20260930-v5.json`.
- Manifest checksum: `sha256:84cbf95f0258bb69985473f0c1fdb83b7a58a3d1585d18358b81b54f6aa6fb3d`.
- Producer checksum: `sha256:4a719216fe9353057d60cc9a3502912b10f8becb934f22b0ac75c2e49fde3487`.
- All five retained producer-bound manifest revisions have the same ordered 14,531 identities:
  row-array digest `bd369aaa1eff71d4385ddbe7a1d6d8f17461ac448563fe03bbcbf2222863a795`.
  Rebinding changed producer evidence, not source membership or admission.
- 59 fixed shards: 58 of 250 files and one of 31. Code and frontend source take priority over
  generated JSON. No moving `UNPROCESSED LIMIT 250` denominator.
- Shard descriptors are `PLANNED_NOT_ENQUEUED`. No Kanban scheduling was applied.

## Two different censuses

Independent PostgreSQL read-only census of exact manifest UUID/source/revision tuples at
`2026-09-30T16:27:19.837Z`:

| Live manifest status | Files | Under `sveltekit-frontend/src` |
| --- | ---: | ---: |
| PROCESSED | 13,665 | 4,127 |
| UNPROCESSED | 859 | 301 |
| PARSE_FAILED | 7 | 0 |
| Total | 14,531 | 4,428 |

The final current-producer observation readback is stricter:

| Outcome | Files | Meaning |
| --- | ---: | --- |
| PROCESSED_WITH_SYMBOLS | 7,342 | Stored symbol identities, hashes, fingerprints and raw spans match |
| PROCESSED_STRUCTURE_ONLY | 5,624 | Stored AST observations and parser provenance match |
| PROCESSED_NO_EVIDENCE | 229 | Valid processed binding; no unexpected observations |
| IDENTITY_CONFLICT_DEFERRED | 589 | 225 code / 364 Markdown; duplicate expected local observation identities |
| RESOURCE_LIMIT_DEFERRED | 297 | JSON exceeds bounded file/observation workload; not silently truncated |
| READBACK_FAILED | 443 | 12 code / 431 JSON stored observations differ from current producer |
| DEFERRED_PARSE_FAILED | 7 | Existing failed state retained for exact repair |

Thus 13,195 verified + 1,336 unresolved = 14,531. Of the resource deferrals, 27 are already
PROCESSED but cannot be verified under the bounded reader; 270 remain UNPROCESSED. All 589
identity conflicts remain UNPROCESSED, and all 443 readback failures are PROCESSED. A status
count must not hide these 470 processed-but-unverified members. Thirty-four of 59 shards have
every member independently verified; the others remain incomplete.

Machine-readable evidence:

- `docs/reports/graphify-symbol-baseline-run-1790785686707.json`: complete read-only sweep,
  zero commits, 59 receipt paths, current producer binding.
- `docs/reports/graphify-symbol-baseline-report-1790785706923/summary.json`: derived census and
  checksums of all selected receipts; explicitly not a fresh database audit or canonical authority.
- `docs/reports/graphify-symbol-baseline-report-1790785706923/gaps.json`: every unresolved file
  identity, source revision, classification, observation mismatch and receipt locator.
- `docs/reports/atlas-canonical-projection-fabric-audit-2026-09-30.json`: fresh live admission audit.

## Defects found and fixed in the existing producers

1. Ambient TypeScript modules were missing from symbol ancestry, causing distinct exports to
   collide. The existing compiler extractor now includes module ancestry.
2. Compiler/string offsets and CRLF Markdown offsets were not consistently raw byte spans.
   UTF-8/BOM/UTF-16 mapping now preserves actual source byte positions; split surrogate boundaries
   fail explicitly. Markdown fenced code retains source line/byte provenance.
3. JSON locations relied on approximate text searches and repeated value serialization.
   The existing installed TypeScript JSON parser now provides exact property/array locations;
   strict JSON validation is retained. Large numeric arrays defer before constructing observation
   locations. Raw byte conversion uses a per-file lookup table rather than repeated prefix scans.
4. Execution previously stopped after one small alphabetical batch. The existing owner now accepts
   a checksummed fixed plan, bounded consecutive shards, resumable member readback, and explicit
   producer rebinding after code changes. It rejects changed authority, source bytes, duplicate
   identities, unknown members, and out-of-range shards.

The initial canary committed three files before a fourth-file transaction failed. Subsequent
canaries and resumptions retained that partial-commit reality. The first broad worker finished
55 shard receipts, then became CPU-stalled in a generated JSON shard. Only that worker's verified
PID was stopped; PostgreSQL was not running a long query. Some shard-56 commits lacked a completed
batch receipt. The subsequent exact live census and current-producer read-only sweep reconcile
them. The 13,665 increase comes from live exact-cohort readback, not summed partial receipts.
Old manifests and receipts are retained. No previously stored observation was deleted or blindly
rewritten to make the current reader pass.

## Seven failed members: exact errors, not seven malformed sources

These are in the frozen cohort, distinct from the four older JSON failures outside it:

| Source ref | Stored error / classification |
| --- | --- |
| `sveltekit-frontend/drizzle/sidecar-audit-report.json` | Bad escaped character, position 905, line 20 column 79 |
| `sveltekit-frontend/drizzle/sidecar-audit-validated.json` | Bad escaped character, position 684, line 14 column 79 |
| `sveltekit-frontend/svelte-errors.json` | Non-JSON `Loading sv...` prefix |
| `sveltekit-frontend/svelte-errors-utf8.json` | Non-JSON `Loading sv...` prefix |
| `sveltekit-frontend/tsconfig.frontend.json` | Comment rejected by current strict-JSON policy; JSONC capability needs explicit treatment |
| `sveltekit-frontend/.vscode/tasks.json` | Comment rejected by current strict-JSON policy; JSONC capability needs explicit treatment |
| `sveltekit-frontend/PACKAGE_SCRIPTS_SNIPPET.json` | `SOURCE_TEXT_ENVELOPE_OFFSET_SPLITS_SURROGATE`; parser/location failure, not established malformed JSON |

The last member was not automatically reset or retried after the JSON location fix. Its failure
must be reconciled through an exact-revision guarded retry. A supplemental read-only error query
initially rejected diagnostic strings containing `\u0000`; retrying with only identity/revision/
outcome fields succeeded. No database field or source identity was changed to accommodate it.

## Remaining scope and next repairs

The global supported-source census is now: 18,850 PROCESSED, 1,564 UNPROCESSED, 11 PARSE_FAILED,
1,159 lacking an exact Graphify revision row, zero duplicate exact Graphify rows. Within the
unprocessed count, 859 belong to this manifest and 705 were excluded for byte drift. The inventory
gaps still split into 616 absent rows and 543 other/null revision rows. These populations were not
repaired by manufacturing revisions or widening admission.

- Reconcile the 443 stored-observation mismatches through the existing observation owner with
  preservation/archival semantics; do not blind-upsert or count them as verified.
- Classify the 589 collisions at the existing stable-key owner. Valid overloads/repeated headings
  need owner-qualified identity rules, not a dedup heuristic or new canonical source IDs.
- Give 297 oversized generated JSON files an explicit bounded streaming/workload policy. Do not
  silently drop them from the admitted denominator or remove resource safeguards.
- Handle the seven exact failures by content/parser policy and guarded retry; don't label all
  seven malformed or replace admitted source revisions with current guesses.
- Resolve the separate 705 byte-drift and 1,159 inventory gaps through existing admission/inventory
  owners. Baseline sealing remains open until every frozen member has verified terminal evidence.
- Kanban lease/fencing/receipt completion and incremental source-revision scheduling remain open;
  the present implementation is manual bounded execution, not a production scheduler. The existing
  `graphify:incremental` alias has no corresponding script; no parallel indexer was created.

Ordinal remains 14,564/16,151. Symbol extraction does not supply the missing 1,586 physical chunks
or resolve the duplicate canonical chunk ID. Semantic writer/input provenance, latent promotion,
projection checksums, BitFrost derivation and ACE production grounding remain independent gates.

## Validation and operation

Forty-two focused tests passed across plan validation, exact source selection, observation readback,
AST writer, module ancestry, JSON locations, raw-byte envelopes and Markdown spans. Standalone
extractor TypeScript checking and report-tool syntax checking passed. Strict OpenSpec validation
passed for `parent-atlas-ace-rlm-bitfrost-integration`; scoped tracked-diff whitespace checks and
new-file whitespace/conflict checks also passed.

Read-only resume/check of a single shard (substitute the admitted revision from the saved receipt):

```powershell
$symbolAdmission = Get-Content docs/reports/workspace-revision-tournament-admission-v1.json -Raw | ConvertFrom-Json
node --import tsx scripts/atlas/graphify-symbol-extractor-v1.mts --workspace-revision $symbolAdmission.workspaceRevision --plan docs/reports/graphify-symbol-baseline-20260930-v5.json --shard 1 --batches 1
node scripts/atlas/report-graphify-symbol-baseline-v1.mjs --manifest docs/reports/graphify-symbol-baseline-20260930-v5.json
node scripts/atlas/audit-canonical-projection-fabric.mjs
```

Applying adds `--apply`; it must remain a deliberate bounded operation. Do not use `graphify:daily`
as this backlog worker, bypass admission, reset failed statuses broadly, or rebind a different
source cohort under the same manifest. Producer changes require explicit read-only rebinding.

This tranche wrote structural observations and their existing Graphify processed/failure status
only. There were no model, embedding, training, checkpoint, physical chunk, lineage, ordinal,
Qdrant, Redis/Valkey, Neo4j, ACE or BitFrost writes; no DDL/migration, service restart, Docker
prune, WSL compaction or GPU workload. Disk reserve is checked before each bounded apply write.
Earlier service/capacity changes recovered independently; they were not caused by this task.

## Required handoff

- likely_cause: One-batch alphabetical selection and lack of a frozen resumable loop limited
  throughput; wider execution exposed independent parser identity, span, resource and old-readback gaps.
- evidence: Frozen same-member manifest v1–v5; current 59-shard read-only sweep; independent exact
  PostgreSQL status/error readback; fresh 4/11 admission audit; 42 focused tests.
- patch_targets: Existing extractor and JSON/Markdown/compiler/span helpers; plan/readback helper
  and reporting tool; focused tests; deep-audit/checklist/OpenSpec ledger.
- safe_next_command: `node scripts/atlas/audit-canonical-projection-fabric.mjs`
- smoke_command: `node --test scripts/atlas/lib/graphify-symbol-batch-plan-v1.test.mjs scripts/atlas/lib/json-symbol-extractor-location.test.mjs scripts/atlas/lib/source-text-raw-span-v1.test.mjs scripts/graphify/lib/ts-ast-extractor-module.test.mjs`
- report_path: `docs/reports/graphify-symbol-baseline-execution-20260930.md`
