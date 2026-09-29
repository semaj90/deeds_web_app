# Tasks: parent-atlas-code-intel-e2e

All five gates below are **NOT_PROVEN** — none has been started. Each requires its own read-first
audit (grep for existing owners per this repo's Duplication Prevention rule) before any code is
written. Do not implement out of order; each depends on the one before it per the brief's own
dependency chain (source → symbol → AST/LSP → graph → retrieval → ContextManifest → MCP).

- [ ] **SOURCE-SYMBOL-AUTHORITY-01** — Close current-source → symbol-version ownership. Foundation
      gate; every other gate below depends on this resolving cleanly. Before implementing: audit
      `atlas_source_refs`, `atlas_symbol_versions`, and whatever currently claims "current source
      revision" authority — this repo's own workboard already flags this join as incomplete.

      **Audit portion DONE (2026-09-27), consolidation/repair portion still open — gate stays
      unchecked.** Ran two existing, real, read-only audit scripts live
      (`scripts/atlas/audit-symbol-producer-ownership-v1.mjs`,
      `scripts/atlas/audit-symbol-revision-producer-census-v1.mts` — both already existed in this
      repo before this session, neither was written for this pass) and verified their output
      against a fresh direct Postgres query (no drift found). Full, hard-evidenced picture:

      - **The canonical writer contract is real and sound**: `packages/parent-atlas/src/core/
        symbol-registry-repository.ts`'s `promoteNomination()` requires explicit `allow_create`,
        derives `stableSymbolId`/`symbolVersionId` deterministically from
        `(language, kind, symbol_key)` / `(stableSymbolId, source_revision, upstream_node_id,
        declaration_hash)`, and writes `source_ref`/`source_revision`/`workspace_revision`
        straight from the caller's nomination object — no `latest`/`HEAD`/path-only/fuzzy
        fallback found in the file.
      - **One legitimate caller reaches it**: `scripts/atlas/symbol-reconciliation-writer-v1.mts`
        imports it via the compiled `packages/parent-atlas/dist/core/symbol-registry-repository.js`
        output — this is the intended call path, not a rival writer. This caller's rows (194,
        `producer_revision = symbol-reconciliation-writer-v1`) are 100% sha256-qualified on both
        `source_revision` and `workspace_revision`.
      - **3 legacy scripts still bypass the canonical owner with direct SQL** and remain
        runnable: `scripts/atlas/promote-ast-symbols-to-registry.mjs` (writes
        `atlas_symbol_registry` rows with the literal placeholder `workspace:0`, no validation, no
        fabrication of its own — it passes through unqualified upstream input verbatim);
        `scripts/atlas/materialize-ast-symbol-versions.mjs` (writes `atlas_symbol_versions`; when
        fed today's qualified nominations input it produces good sha256-qualified rows — 208 of
        them — but it ALSO previously wrote 77 rows still carrying `workspace:0` from an older,
        now-defunct input artifact, and has no mechanism to repair those after the fact);
        `scripts/atlas/apply-current-tree-bound-symbol-registry-canary-v1.mjs` (wrote 90
        `atlas_symbol_registry` rows keyed on a Git **commit** oid — confirmed via
        `git cat-file -t <oid>` → `commit` — a repo-level revision, not a per-file content
        revision, and not convertible to a real sha256 content revision after the fact).
      - **Current live totals** (re-verified directly against Postgres 2026-09-27, matches the
        2026-09-22 repair receipt `docs/reports/symbol-revision-repair-apply-v1.json` exactly, no
        drift): `atlas_symbol_versions` — 479 total, 402 qualified (84%), 77 still `workspace:0`
        placeholder (left unrepaired on purpose — no valid re-derivable source existed for them),
        **0 rows have `upstream_file_id` populated** (100% null, even after the 2026-09-22 repair
        — this column is a second, separate, still-fully-open gap). `atlas_symbol_registry` —
        10,504 total, only 194 qualified (1.8%), 10,220 carry the `workspace:0` placeholder
        (10,170 `active` + 50 `retired`), 90 carry a Git commit oid — **registry repair has not
        been attempted at all** (the 2026-09-22 repair only touched `atlas_symbol_versions`,
        explicitly confirmed unchanged via its own `registryFence` before/after checksum match).
      - **A separate real identity-granularity mismatch, found independently this session**:
        `atlas_source_refs.source_ref_key` uses path+fragment-anchored keys (e.g.
        `src/lib/server/db/schema-postgres.ts#case_note_evidence_refs`, 46,945 rows, richly
        populated), while `atlas_symbol_versions.source_ref` uses bare filenames with no fragment
        (e.g. `ACE-BITFROST-WORKER-INTEGRATION.md`) — only 60/69 (87%) of `atlas_symbol_versions`'
        distinct `source_ref` values even string-match an `atlas_source_refs.source_ref_key` at
        all. These two tables use genuinely different key granularities for "source ref," not
        just different formatting of the same concept — a real, separate join gap beyond the
        revision-qualification problem above.
      - **Fixed a real bug found while auditing, not by design**: the existing regression guard
        `sveltekit-frontend/src/lib/server/atlas/indexing/symbol-canonical-writer-owner-v1.spec.ts`
        was itself broken 3 ways (search scope missing repo-root `scripts/atlas/` — the exact
        directory the bypass writers live in; its "one writer" regex missed schema-qualified
        `INSERT INTO public.atlas_symbol_registry`; its `.spec.ts`-only exclusion let a
        `.test.mjs` fixture's own string-literal search target get misclassified as a second
        writer). This is the same too-narrow-search-scope failure mode already documented
        elsewhere in root `CLAUDE.md` (`LIBTORCH-DEPENDENCY-CENSUS-01`'s correction) recurring in
        a different guard. Fixed all 3 bugs and updated the test's assertion from a false
        "exactly one writer" to an accurate "canonical owner + the 7 known legacy/direct-SQL
        files" census (naming all 7, including 3 repair-tooling scripts that also match the
        SQL-writer regex but don't fabricate placeholder data themselves). Verified:
        `npx vitest run src/lib/server/atlas/indexing/symbol-canonical-writer-owner-v1.spec.ts` —
        **3/3 pass** (was 2/3 failing before the fix).

      **What remains open, why the gate stays unchecked**: (1) registry repair — 10,310
      unqualified/legacy `atlas_symbol_registry` rows (98%) need a real repair path, none exists
      yet; (2) the 77 unrepairable `atlas_symbol_versions` placeholder rows need a decision
      (re-derive from current source, or explicitly quarantine); (3) `upstream_file_id` is 100%
      null across all 479 `atlas_symbol_versions` rows — no backfill exists; (4) the 3 legacy
      bypass writers are still runnable and could add more unqualified rows on their next
      invocation — no retirement/deprecation has happened; (5) the `atlas_source_refs` vs.
      `atlas_symbol_versions` source-ref key-granularity mismatch (path+fragment vs. bare
      filename) has no resolution plan yet. No writes were made to any of these tables this
      session — only the test file was edited (test-only, zero runtime/data impact).

      **Historical status correction (2026-09-28):** the preceding “What remains open” list is
      the state at the time of that original audit, not the current state. The registry revision
      repair and all 77 symbol-version placeholder repairs were subsequently applied and
      independently verified; see `SYMBOL-VERSION-QUARANTINE-01` below. The remaining blockers
      are the separately gated stable-file identity population/binding and source-ref grain
      convergence. Do not treat the old “unstarted” wording above as current status.

      **Frozen audit-vs-consolidation split** (per an operator-reviewed correction that clarified
      the reconciliation writer is a legitimate caller through the canonical owner, not a rival
      authority):
      ```
      AUDIT          canonical owner identified DONE / legitimate caller identified DONE /
                     bypass writers identified DONE / live contamination quantified DONE /
                     regression guard corrected DONE / strict OpenSpec validation PASS
      CONSOLIDATION  retire bypass writers DONE (see LEGACY-SYMBOL-WRITER-RETIREMENT-01 below) /
                     repair registry rows OPEN / decide 77 irrecoverable version rows OPEN /
                     populate upstream_file_id OPEN / reconcile source_ref granularity OPEN
      GATE STATUS    remains OPEN
      ```

      **`LEGACY-SYMBOL-WRITER-RETIREMENT-01` — DONE (2026-09-27), reversible, non-destructive.**
      Checked reachability first (npm scripts + cross-script callers) before touching anything:
      `materialize-ast-symbol-versions.mjs` is wired into `sveltekit-frontend/package.json`
      (`atlas:features:ast-symbol-versions:apply`) — real, documented reachability;
      `promote-ast-symbols-to-registry.mjs` has no npm-script or cross-script caller (ad-hoc
      invocation only); `apply-current-tree-bound-symbol-registry-canary-v1.mjs` was found
      already self-gated (`ATLAS_AUTHORIZE_SYMBOL_REGISTRY_CANARY=1` required, accepts only a
      fixed 5-row reviewed canary input) — left unchanged, no redundant guard added. Added a
      fail-closed guard to the other two (matching the canonical owner's own
      `SYMBOL_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE` pattern): `--apply` now throws/exits 1
      unless `ALLOW_LEGACY_SYMBOL_VERSION_BYPASS_WRITE=1` /
      `ALLOW_LEGACY_SYMBOL_REGISTRY_BYPASS_WRITE=1` is explicitly set, with a message naming the
      finding and pointing to the canonical owner + its intended caller. Not a deletion or
      archive — fully reversible, dry-run/read-only behavior on both scripts is completely
      unaffected (verified live: both scripts' no-`--apply` output unchanged). Verified live:
      `--apply` without the override now fails closed with the intended message on both scripts;
      the `SYMBOL-WRITER-OWNER-01` guard test still passes 3/3 unchanged (the guard matches on
      static SQL text, not on whether the script can execute, so this was expected). No repair,
      no registry changes, no data touched — this closes only the "no NEW contamination" half of
      consolidation, not the "existing contamination" half.

      **`SYMBOL-REGISTRY-REPAIR-PLAN-01` — classification DONE (2026-09-27), read-only, zero
      writes. Repair itself NOT applied — this is the plan, not the fix.** Classified all 10,310
      unqualified `atlas_symbol_registry` rows (10,220 `workspace:0` + 90 Git-commit-oid) using
      direct, ground-truth checks rather than a proxy join — this mattered: a first attempt
      joined against `atlas_source_refs.relative_path` and found 469+90=559 rows "unmatched,"
      which would have been a real, wrong overclaim of irrecoverability. Two real reasons the
      proxy join was misleading, found and corrected before recording anything:
      1. **Case-sensitivity bug**: `atlas_source_refs.relative_path` is lowercased
         (`evidencecustodymachine.ts`) while `atlas_symbol_registry.created_from_source_ref`
         preserves real case (`evidenceCustodyMachine.ts`) — exact-string join silently drops
         every mixed-case filename. A case-insensitive join recovered all 10,220 `workspace:0`
         rows immediately (1,179 distinct files, all present in `atlas_source_refs` once case is
         ignored).
      2. **A `content_hash`-ambiguity check on the remaining rows was itself methodologically
         wrong on the first pass** and was caught before being recorded: grouping
         `atlas_source_refs` by `lower(relative_path)` found 3,315 files with multiple distinct
         `content_hash` values, which looked like a real repair-blocking ambiguity — but
         `atlas_source_refs` is fragment-scoped (one row per symbol/fragment within a file, per
         its own `source_ref_key` format), so `content_hash` is very likely per-fragment, not
         per-file. Verified directly: restricting to `symbol_kind = 'file'` (the genuine
         whole-file rows) dropped the ambiguous-file count from 3,315 to **1** out of 844. Also
         found none of the 1,185 actual repair-target files even have a `symbol_kind='file'` row
         at all — meaning `atlas_source_refs` cannot supply a trustworthy whole-file hash for any
         of these targets regardless, so the correct repair mechanism is to **sha256 the file's
         current on-disk bytes directly**, never copy an existing `atlas_source_refs` fragment
         hash.
      Final result, verified via direct filesystem + git history checks (ground truth, not a
      database proxy): **1,180 of 1,185 distinct target files exist on disk at their exact
      recorded path right now.** The remaining 5 were traced through git history (`git log -1
      --diff-filter=D`) to a single bulk-restructure commit (`d06bc93f08`, "Session 56... archive
      dead code") that moved `src/lib/services/*` → `src/lib/server/services/*` — all 5 confirmed
      to have a live equivalent at the `server/`-prefixed path. **Bottom line: 0 rows are
      genuinely irrecoverable.** All 10,310 rows are re-derivable — 10,220 directly at their
      recorded (case-corrected) path, 90 directly at their recorded path, and the ~5-file subset
      needing a one-time path-rename correction before hashing. No `quarantine`/`retire`/
      `irrecoverable` bucket has any members. This does **not** mean repair is trivial or done —
      it means the repair script (not built in this pass) has a clean, unambiguous source of
      truth (current file bytes) to hash for every row, with no invented/inferred/latest-commit
      revision needed anywhere. **Nothing was written to any table** — every check above was a
      `SELECT`, a filesystem `stat`, or a read-only `git log`.

      **`SYMBOL-REGISTRY-REPAIR-APPLY-01` — DONE (2026-09-27), applied and independently
      verified.** Built two real, auditable scripts matching this repo's existing
      preview→checksum-locked-manifest→transactional-apply rigor
      (`apply-symbol-revision-repair-v1.mjs`'s pattern from the 2026-09-22 version repair):
      - `scripts/atlas/preview-symbol-registry-revision-repair-v1.mjs` — read-only. Resolves
        every target row's current file (applying the 5 known renames), hashes each of the 1,185
        distinct files' exact current bytes **in parallel across a bounded `worker_threads` pool**
        (`scripts/atlas/lib/hash-file-worker.mjs`, one worker per CPU core — ran with 16 workers
        live), and writes a checksummed manifest
        (`docs/reports/symbol-registry-revision-repair-manifest-v1.json`). Refuses to proceed if
        any target file can't be resolved (none could not be resolved — matches the plan's
        finding of 0 irrecoverable rows).
      - `scripts/atlas/apply-symbol-registry-revision-repair-v1.mjs` — requires an exact apply
        token as argv, re-verifies the manifest checksum, **re-hashes every target file's current
        bytes again at apply time** (defends against drift between preview and apply), then
        applies in bounded batches (250 rows/transaction here) — each batch locks its rows
        `FOR UPDATE`, revalidates the exact precondition (`stable_symbol_id` + old revision) per
        row, updates by primary key (`atlas_symbol_registry_pkey` — always indexed, no table scan
        needed for the WHERE clause), and rolls back the whole batch on any anomaly. Fences the
        total registry row count before/after (must be unchanged — this is a revision repair,
        never a row insert/delete).
      - **Live result**: `status: "REPAIR_APPLIED"`, `updatedRows: 10310/10310`,
        `registryFence: {before: 10504, after: 10504}` (unchanged, as required). **Independently
        re-verified directly against Postgres (not just the script's own self-report)**:
        `atlas_symbol_registry` now has **10,504/10,504 (100%) rows with a real
        sha256-qualified `created_from_source_revision`** — up from 194/10,504 (1.8%) before this
        session. Receipt: `docs/reports/symbol-registry-revision-repair-apply-v1.json`.
      - This closes the registry-repair half of consolidation cleanly. The revision now stored
        for each row is the literal sha256 of that file's current on-disk bytes — not copied from
        any `atlas_source_refs` fragment hash, not inferred, not a repo commit oid.

      **Still open, unstarted**: `SYMBOL-VERSION-QUARANTINE-01` (decide fate of the 77
      `workspace:0` version rows in `atlas_symbol_versions`, same never-synthesize rule — not yet
      classified the way the registry rows just were, though the same direct-file-hash technique
      built above should generalize directly); `UPSTREAM-FILE-ID-BINDING-01` (populate only where
      exact source ownership is proven); `SOURCE-REF-KEY-CONVERGENCE-01` (resolve the
      path+fragment vs. bare-filename mismatch — likely needs an adapter distinguishing file
      identity / sub-file span / symbol identity as three separate concerns, not forcing one
      column's shape onto the other). `SOURCE-SYMBOL-AUTHORITY-01` itself closes only after all of
      the above prove exact
      ownership, per this file's own dependency order.

- [ ] **AST-LIVE-JOIN-01** — Produce one real, current ast-grep/Tree-sitter observation that
      resolves against the admitted same-revision AST snapshot. Depends on
      SOURCE-SYMBOL-AUTHORITY-01. Before implementing: check whether a live AST observation path
      already exists and where it currently fails to join (this repo has prior findings on exactly
      this gap — search `AST-AUTH-01`, `AST-LIVE-JOIN` style task IDs across other changes first).

- [ ] **CLANG-SEMANTIC-CHALLENGER-01** — Add libclang/clangd evidence for a small, bounded C/C++
      canary set. Do NOT persist anything initially — challenger/comparison only, per
      `DEPENDENCY-CAPABILITY-GUARD-01` (root CLAUDE.md): no new dependency without a proven
      capability gap. Compare Tree-sitter vs. Clang for definition/reference/type resolution on the
      canary set only. Clang is a semantic-evidence lane, never a second canonical identity
      authority (parser/LSP observation ≠ canonical identity, per the Parent Atlas Frozen Identity
      Contract). Depends on AST-LIVE-JOIN-01 existing as a comparison baseline.

- [ ] **CODE-IMPACT-01** — For one bounded symbol, return: definition, references, callers,
      callees, imports/includes, semantic neighbors — each with exact evidence refs (source_ref +
      source_revision + byte_start/byte_end, not inferred). Depends on SOURCE-SYMBOL-AUTHORITY-01
      and AST-LIVE-JOIN-01. Before implementing: check `parent-atlas-graph-retrieval-proof` and
      `parent-atlas-unified-symbol-ranking` (already closed) for reusable pieces — do not rebuild a
      call/reference graph traversal that already exists.

- [ ] **MCP-CODE-INTEL-01** — Expose `CODE-IMPACT-01`'s result through one existing MCP tool owner
      (do not add a new MCP server — this repo already has 108+ registered TRACE MCP tools; extend
      one, per this file's own Duplication Prevention rule #5: "new agent-facing capabilities
      register in ACP, not just HTTP"). Depends on CODE-IMPACT-01.

## Exit condition

Once all five gates above pass with live evidence (not fixture-only), Parent Atlas has one MCP
operation directly comparable to SocratiCode's core value proposition
("what calls this function and what breaks if I change it"), fully revision-qualified. That is the
`PA-CODE-INTEL-E2E-01` user story from the proposal.

## Explicitly out of scope for this change

- Installing SocratiCode, Clang toolchains, or any new parser/graph-DB/embedding model beyond the
  bounded canary in `CLANG-SEMANTIC-CHALLENGER-01`.
- The `pageRankGPU` graph-construction decision for `gemma4-semantic-embedding-cache.mts` (separate,
  smaller, already-flagged-to-operator decision from the same session — see proposal.md's Session
  state section).
- Reopening `parent-atlas-unified-symbol-ranking` (closed, has its own retrospective).

## Portfolio-wide readiness roadmap received, recorded not verified (2026-09-27)

An operator-pasted whole-Parent-Atlas readiness assessment (per-area 0-100% estimates + a P0-P10
priority sequence) argued the system is architecturally ~66-70% built but only ~45-50%
end-to-end-proven, because the gap is concentrated in **7 authority joins**, not missing
components. **Recorded for cross-reference, not independently verified — same discipline as the
SESSION-207 checklist in `parent-atlas-nlp-sidecar-feature-compiler/tasks.md`.**

**The 7 claimed root blockers** (most load-bearing first): (1) current-source authority
(`workspaceRevision -> sourceRef -> sourceRevision -> byte interval -> symbolVersionId/treeNodeId`
as one required chain — this repo's own `SOURCE-SYMBOL-AUTHORITY-01` above is exactly this);
(2) Graphify structural producer -> persisted-row proof (this repo's own `AST-LIVE-JOIN-01` above
is exactly this — the brief's proposed name `TREE-NODE-PERSISTENCE-LINEAGE-01` is a duplicate
gate name for the same thing, do not create it separately); (3) semantic representation binding
(already tracked as `SEMANTIC-REPRESENTATION-BINDING-01` in
`parent-atlas-repair-candidate-feature-matrix/tasks.md`, with real prior-art cross-reference to
`SummaryEmbeddingReceiptV1` already recorded there); (4) production feature-source owner /
per-ordinal lane-mask proof (already the explicit reason `ACE-FSO-02-NULLABILITY-AND-PRESENCE-01`
stays open in that same file, even after this session's own `CFM-PRESENCE-NULLABILITY-01` closed
its string-blankness half); (5) embedding runtime authority (`EMBED_RUNTIME_AVAILABLE` vs.
`TOKENIZER_REVISION_QUALIFIED` as two independent booleans, never conflated — already recorded in
`parent-atlas-repair-candidate-feature-matrix/tasks.md`'s `EMB-SERVICE-V2-DEPLOY-01`); (6) one
clean E2E spine (proposed `PA-E2E-SPINE-01` / `E2E-SPINE-PROOF-01` — this is exactly this change's
own `PA-CODE-INTEL-E2E-01` exit condition above, already the master gate); (7) runtime registry
convergence (proposed minimum vocabulary `{capabilityId, owner, runtime, revision, status,
evidenceRef, canonicalAuthority}` per registry — overlaps with the still-unverified
`FEATURE-REGISTRY-OWNER-CONVERGENCE-01` proposal recorded in
`parent-atlas-nlp-sidecar-feature-compiler/tasks.md`'s SESSION-207 note).

**Per-area readiness table** (claimed, unverified, engineering-judgment estimates only):

| Area | Claimed readiness | What's claimed missing |
|---|---|---|
| Canonical identity/revisions | 58% | current-source authority, exact producer->row lineage |
| AST/Tree-sitter/ast-grep | 82% | producer->persisted `tree_node_id` proof |
| LSP/language registry | 70% | exact revision binding, one owner |
| `semantic_768` | 48% | model/tokenizer/input/representation binding to current chunk |
| Qdrant projection | 58% | revision/uniqueness/content agreement insufficient |
| CandidateFeatureMatrix | 78% | production feature-source owner + per-ordinal lane-mask proof |
| Retrieval lanes/RRF | 82% | live lineage-qualified inputs, registry/router binding |
| Graphify/graph intelligence | 72% | current graph-revision provenance, producer-row proof |
| NetworkX/cuGraph parity | 82% | remaining shared-fixture parity, owner consolidation |
| cuVS/CAGRA | 80% | qualified-corpus promotion/eval, not capability |
| KMeans/SOM | 80% | promoted revision-qualified pipeline (algorithms already work) |
| Hypergraph/GraphRAG | 65% | one admitted current-revision graph/retrieval spine |
| ACE residency/LOD | 85% | live qualified inputs, production admission |
| BitFrost | 68% | production qualified warming/readback |
| ContextManifest/Prefill | 75% | one real lineage-clean E2E context build |
| Ornith 1.5 / :8090 | 85% runtime | evidence/model revision propagation through surrounding lanes |
| LangExtract :8095 | 60% | `/analyze/grounded` execution + current revision propagation |
| Embedding runtime :8081 | 35% currently | service unavailable + tokenizer-revision qualification |
| Agentic repair/tournament | 65% | current-evidence packet -> edits -> validation -> recommendation E2E |
| OpenSpec governance | 75% | many items exist as parts, lack closure receipts |
| Full product E2E proof | 45% | one revision through source->symbol->AST->graph->retrieval->ContextManifest->tool |

**P0-P10 proposed sequence** (claimed, unstarted except where cross-referenced above):
P0 `QDRANT-PAYLOAD-IDENTITY-CENSUS-01` / P1 `QDRANT-PAYLOAD-CANONICAL-CROSSWALK-01` — **a
concurrent agent session is actively running exactly this against
`parent-atlas-candidate-feature-execution-fabric` as of this same session (live 100-point sample
already reported: 99/100 Qdrant `chunk_id`s resolved a Postgres row, 94 unique chunk identities,
10 content-hash agreements, 0 with all three required revisions) — do not duplicate, check that
change's tasks.md for its result before starting P0/P1 independently.** P2
`REPRESENTATION-BINDING-OWNER-REUSE-01` / P3 `SEMANTIC-REPRESENTATION-BINDING-01` — tracked above.
P4 `TREE-NODE-PERSISTENCE-LINEAGE-01` — duplicate name for this change's own `AST-LIVE-JOIN-01`,
which itself depends on `SOURCE-SYMBOL-AUTHORITY-01` (still `[ ]` unstarted) per this file's own
dependency order — do not start P4 before that foundation gate. P5
`PRODUCTION-FEATURE-SOURCE-01` — overlaps `ACE-FSO-02-NULLABILITY-AND-PRESENCE-01`'s open half. P6
`LIVE-CANDIDATE-FEATURE-MATRIX-01` / P7 `CONTEXT-MANIFEST-E2E-01` / P8
`ORNITH-RECOMMENDATION-E2E-01` / P9 `AGENTIC-EDIT-TOURNAMENT-01` / P10 `E2E-SPINE-PROOF-01` — none
started, no existing cross-reference found for P6-P9 specifically.

**Per-technology triage** (claimed, unverified, recorded for completeness): NetworkX stays
CPU/reference oracle only; cuGraph/RAPIDS is GPU execution, not a second identity owner; PyTorch/
ATen is tensor-op execution only; cuVS exact/CAGRA/Qdrant-HNSW/TurboVec are **one semantic lane**,
never independent RRF votes; cuDF/cuML are batch/offline only, not critical-path; KMeans/SOM
algorithms already work, only provenance (input representation revision, cohort checksum,
params, seed, output revision) is missing before `cluster_id` can enter the feature matrix; UMAP/
4D-manifold/tricubic stays `EXPERIMENTAL_NONCANONICAL` (a prior PF14 correction already noted
Manhattan-radius + cubic-scalar-weighting is not true tricubic interpolation — do not let a
`--tricube` flag name imply math it doesn't perform); XGBoost and RL are explicitly **post-
lineage** optimization, not blockers, and must not be trained on unstable/contaminated
provenance; hypergraph-RAG should derive hyperedges from existing canonical IDs, never mint a
second identity system; file-editing for agentic repair needs a deterministic
`EditProposalV1 -> validator -> isolated worktree -> format/typecheck/tests -> diff -> receipt`
layer — the model recommends, it never directly mutates files; TensorRT-RTX/CUDA 13.4 stays an
isolated Windows-native challenger lane (matches this repo's own already-recorded policy in root
CLAUDE.md); cuTile/SIMT only after a built-in CUDA implementation is measured insufficient.

**Not done in this pass**: no row/claim above independently checked, no code changed, no gate
opened or closed on the strength of this roadmap alone, no live-data-touching work started (this
change's own `AST-LIVE-JOIN-01`/`SOURCE-SYMBOL-AUTHORITY-01` remain `[ ]`). The one concrete
action taken was cross-referencing this roadmap's proposed gate names against gates this repo
already has, to prevent duplicate gate creation — consistent with this file's own Duplication
Prevention discipline.

## SYMBOL-VERSION-QUARANTINE-01 — DONE (2026-09-27), applied, independently verified

No quarantine bucket needed: all 77 remaining `atlas_symbol_versions` placeholder rows (both
`source_revision` AND `workspace_revision` carried `workspace:0`) resolved to 9 real, currently
existing files. Built a small self-contained repair (`scripts/atlas/repair-symbol-version-workspace-placeholder-v1.mjs`,
same technique as `SYMBOL-REGISTRY-REPAIR-APPLY-01`: hash current on-disk bytes directly, no
worker pool needed at this size) — syntax-checked (`node --check`), dry-run verified all 9 files
resolved with zero missing before any write, then applied under the same rigor (exact apply
token, row-locked transaction, per-row precondition revalidation, primary-key update via
`symbol_version_id`, before/after row-count fence).

**Live result, independently re-verified against Postgres**: `status: "REPAIR_APPLIED"`,
`updatedRows: 77/77`, table row count unchanged (479→479). `atlas_symbol_versions` is now
**479/479 (100%) qualified on both `source_revision` and `workspace_revision`** — up from 402/479
(84%) at the start of this session. Receipt:
`docs/reports/symbol-version-workspace-placeholder-repair-apply-v1.json`.

**`SOURCE-SYMBOL-AUTHORITY-01` consolidation status now**: registry repair DONE, version repair
DONE, `upstream_file_id` backfill still OPEN (100% null, unaffected by this repair — a separate
column, separate task, `UPSTREAM-FILE-ID-BINDING-01`), `SOURCE-REF-KEY-CONVERGENCE-01` (path+fragment
vs. bare-filename mismatch) still OPEN. The gate itself stays unchecked until both close.

**Dependency correction (2026-09-28; read-only cross-board trace):** `upstream_file_id` is a text
observation in the current Drizzle symbol-version schema, not yet a canonical stable-file ID. The
canonical stable-file population is a separate, frozen but unapplied S01-08K gate; its ledger
requires the exact operator token `apply S01-08K stable file population` before any writes. The
retrieval-lineage board then places the `atlas_symbol_versions.upstream_file_id` FK at S01-08M,
after S01-08K population and S01-08L lifecycle proof. Therefore `UPSTREAM-FILE-ID-BINDING-01`
must not fill values from paths, Graphify/Qdrant IDs, or the text currently in this column; it is
blocked on the canonical stable-file identity sequence and its explicit authorization. Keep
`SOURCE-REF-KEY-CONVERGENCE-01` separate: resolving file identity versus fragment/symbol locators
does not itself authorize or mint stable-file IDs.

- [x] Hardened the S01-09 pure identity audit so a non-empty `upstream_file_id` no longer proves a
  stable-file link. The audit now requires exact membership in `atlas_stable_file_identity`,
  reports membership as unverified when that evidence is absent, and the read-only DB adapter loads
  IDs only when the canonical table exists. Focused tests cover unverified, matching, and mismatched
  IDs (7/7 pass); targeted TypeScript checking and strict OpenSpec validation pass. GAN status:
  audit contract CREATED, WIRED to the read-only CLI, and unit-PROVEN; no live readback was run
  because the script updates its fixed report pointer. The source-authority gate remains open.

- [x] Added `--no-pointer` to `scripts/atlas/audit-symbol-identity-v1.mts` and ran a fresh
  repeatable-read, read-only identity audit without replacing `docs/reports/symbol-identity-v1.json`.
  Receipt: `docs/reports/symbol-identity-v1.e1ea9c686c0b.json`. Current readback: all 10,504
  registry revisions and all 479 version source/workspace revisions are SHA-256-qualified; all
  479 versions still lack `upstream_file_id`, so stable-file membership is blocked. The audit also
  reports 22 shared `upstream_node_id` values, no observed multi-revision symbols or move/rename
  aliases, and no proof that active symbol-key hashes are path-independent. This is a refreshed
  blocker receipt, not gate closure; no DB writes or fixed-pointer update occurred.
