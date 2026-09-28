# Agentic Sub-Helper Playbook: Closing OpenSpec `tasks.md` Gaps

**Status**: DESIGN — a playbook, not a new tool. Every mechanism it names already exists in this
repo (scripts, MCP tools, agent/workflow primitives). Nothing here should be built before checking
whether it's already built — see §1.

## TL;DR

The repo already has a working census layer (`scripts/atlas/audit-openspec-*.mjs` + one built
`docs/reports/openspec-workboard-v1.json`, 9,619 tasks tracked, 66.2% checkbox-complete, 2,431
actionable now, 764 blocked on upstream, 53 superseded). What's missing is not more auditing — it's
a disciplined **sub-helper dispatch loop** that takes one actionable task at a time, checks for an
existing owner/decision before touching anything, proposes a patch as a rehearsed diff, and only
updates the `tasks.md` checkbox after an *independent* re-audit confirms the claim — never on the
sub-agent's own say-so. This document is that loop, plus the safety rails this session's two
near-misses (wrong packet-key identity scheme, a `git stash` that nearly ate 57 files of concurrent
work) made non-optional.

---

## 1. What already exists — reuse, don't rebuild

Per this repo's own Duplication Prevention rule, grepped before writing anything below. 35+
OpenSpec-specific scripts already exist under `scripts/atlas/`; the relevant ones for this playbook:

| Script | Role |
|---|---|
| `build-openspec-workboard-v1.mjs` / `build-parent-atlas-workstation-openspec-workboard-v2.mjs` | Builds the master receipt — `docs/reports/openspec-workboard-v1.json` |
| `audit-openspec-progress-v2.mjs`, `audit-openspec-capability-progress-v1.mjs` | Read-only completion census per change |
| `audit-openspec-actionable-readiness-v2.mjs` | Classifies which open tasks are actually startable now vs. blocked |
| `audit-openspec-duplicate-task-ids-v1.mjs` | Catches duplicate/conflicting task IDs across changes |
| `audit-openspec-supersession-v1.mjs`, `reconcile-openspec-portfolio-v2.mjs` | Finds changes that supersede/duplicate each other |
| `audit-openspec-step-burndown-v1.mjs` | Per-lane burn-down (what's closing over time) |
| `run-openspec-execution-controller-atomic-v1.mjs` | The atomic apply path for controller-driven task execution |
| `repair-openspec-missing-deltas-v1.mjs` | Fixes structurally malformed OpenSpec delta files |
| `audit-openspec-file-task-fanout-v1.mjs` | Maps which real source files a task item actually touches |

**Live numbers from the existing receipt** (`docs/reports/openspec-workboard-v1.json`, read this
session, not fabricated): 108 root-level changes + 17 under `sveltekit-frontend/openspec/changes/`.
9,619 total task lines. 6,369 checked. 2,431 `actionableTasks` (open, unblocked, dependencies met).
764 `waitingTasks` (open but blocked on an upstream item). 53 `supersededTasks` (checked-looking
but actually replaced by a later change — don't "fix" these, archive-reference them). The receipt
already carries `promotionCriticalRank`, `laneDependencies`, and a `dailyGraphifyKanban` view —
i.e. prioritization data already exists; don't recompute it ad hoc per sub-agent.

**Before adding a 36th script**: run the existing ones first. Most aren't wired to an npm alias
(only `atlas:graphify-draft:dry`/`:apply` are) — invoke directly via `node ../scripts/atlas/<name>.mjs`
from `sveltekit-frontend/`, per this repo's own NPX Execution Context rule.

---

## 2. The actual problem this solves

A checked `- [x]` box in `tasks.md` is a claim, not evidence. This repo's own Status Language rules
(`CREATED` / `WIRED` / `DRY_RUN_PROVEN` / `APPLY_PROVEN` / `NOT_PROVEN`) exist because checkbox state
and proof state have drifted before — this session alone found a predicate (`SEMANTIC_OWNER_PROVEN`)
regress due to an unrelated concurrent edit, and a packet-admission "fix" that was itself wrong. The
job for a sub-helper fleet is not "make more boxes checked" — it's:

1. Find tasks whose checkbox state doesn't match their evidence state (stale-checked, or
   checked-but-never-independently-verified).
2. Find tasks that are genuinely actionable now (per the dependency graph, not vibes).
3. For each, do the minimum real work to move it to a state an *independent* re-audit confirms.
4. Never let a sub-agent mark its own homework.

---

## 3. Architecture: three tiers, escalating trust

```
Tier 0 — CENSUS (deterministic scripts, no LLM)
  audit-openspec-*.mjs → docs/reports/openspec-workboard-v1.json
  Read-only. Regenerate before every dispatch round — it's the shared source of truth
  the whole fleet reads from, and it goes stale the moment anyone commits.

Tier 1 — TRIAGE sub-agents (read-only, one per lane/program)
  Input:  one `byProgram` bucket from the workboard (e.g. ACE_MEMORY: 282 open)
          + that program's actionableTasks slice
  Output: a ranked findings list — NOT a patch. Each finding: task text, file/line in tasks.md,
          candidate owner file(s) found via grep, classification
          (ABSENT / STALE_CHECKED / GENUINELY_BLOCKED / DUPLICATE_OF / ACTIONABLE_NOW),
          and — critically — whether an existing decision doc already settles it
          (see §5.1; this is where this session's packet-key mistake happened).

Tier 2 — FIX sub-agents (propose only, one per task or tight task cluster)
  Input:  one Tier-1 finding classified ACTIONABLE_NOW
  Output: a diff (never applied), a rehearsal plan, and the exact audit command that will
          independently confirm the fix if applied.

Tier 3 — APPLY gate (human- or explicit-flag-gated, never a sub-agent decision)
  Applies the Tier-2 diff via the repo's existing rehearse→commit discipline
  (transaction + readback for DB, `git diff` review for code), then updates the tasks.md
  checkbox in the SAME change as the fix — never a separate "mark done" commit — and re-runs
  the Tier-0 census to confirm the state actually moved.
```

Tier 0 and Tier 3 are mechanical/scripted. Tier 1 and Tier 2 are where LLM sub-helper agents add
value — narrow, bounded, single-purpose dispatches, not open-ended "go fix openspec" agents.

---

## 4. Dispatch unit contract

Every Tier-1/Tier-2 sub-agent gets the same shape of input and must return the same shape of output
— this is what makes fan-out (many agents at once) safe to aggregate:

**Input (given to the sub-agent, never assumed)**:
- The exact `tasks.md` path + line range for the item(s) in scope.
- The relevant slice of `docs/reports/openspec-workboard-v1.json` (its program bucket only — not
  the whole 9,619-task file, to keep context bounded).
- Explicit instruction: **grep for an existing owner/decision doc before proposing any new
  identity, schema, or scheme** (see §5.1) — this is not optional guidance, it's the literal
  correction this session had to apply after skipping it once.
- Explicit instruction: read-only for Tier 1, propose-only for Tier 2 — no tool that writes to
  Postgres, Qdrant, Redis, or checks out/mutates files is available to these agents.

**Output (required fields, machine-checkable)**:
```json
{
  "taskRef": "openspec/changes/<change>/tasks.md#L<line>",
  "classification": "ABSENT | STALE_CHECKED | GENUINELY_BLOCKED | DUPLICATE_OF | ACTIONABLE_NOW",
  "existingOwnerFound": "<path or null>",
  "existingOwnerSearchCommand": "<the exact grep/rg run to prove the search happened>",
  "proposedDiff": "<unified diff, Tier 2 only, null for Tier 1>",
  "rehearsalPlan": "<exact command(s) to dry-run/rollback before commit>",
  "verificationCommand": "<exact audit script + expected field/value that proves the fix>",
  "confidence": "LOW | MEDIUM | HIGH",
  "risksIfWrong": "<one sentence>"
}
```
A finding without `existingOwnerSearchCommand` filled in is rejected before it reaches Tier 2 —
this is the single control that would have caught this session's packet-key mistake before any
write happened.

---

## 5. Safety rails (non-negotiable, grounded in this session's actual failures)

### 5.1 Grep for an owner-decision before minting anything

This session inserted 7,259 wrong-scheme packet rows because it evaluated a plausible-looking
option (5 empirical samples matched) without first searching for
`docs/reports/packet-key-owner-decision-v1.json`, a real, dated, settled decision that specified a
different scheme. **Rule for every Tier-1/2 sub-agent**: before proposing any new identity scheme,
table, key format, cache namespace, or algorithm, search `docs/reports/*owner-decision*.json`,
`docs/reports/*-v1.json`, and the target directory's own recent commits for an existing settled
call. If one exists, use it or explicitly flag the conflict — never silently pick the
locally-plausible option.

### 5.2 Never `git stash` in this repo

A scoped `git stash` swept all 57 concurrently-modified files from other live sessions this
session, and the chained `pop` failed, leaving it stuck. **Rule**: sub-agents never call `git
stash`. If isolation is needed, use `Agent` with `isolation: "worktree"` (a real git worktree, not
a stash) so concurrent sessions' uncommitted state is never touched.

### 5.3 Rehearse, then apply — always

Every DB/file mutation this session that avoided a real mistake did so via transaction + exact
readback + `ROLLBACK`, then a separate real `COMMIT` only after the rehearsal matched expectations
exactly (this is what caught the duplicate-`chunk_id` collision in the lineage freeze). Tier 2's
`rehearsalPlan` field is mandatory, not optional, and Tier 3 must execute it and diff the actual
result against the *predicted* result before applying for real.

### 5.4 Duplication Prevention applies to sub-agents too

A sub-agent proposing "build a script to do X" must first search `scripts/atlas/` for an existing
X (per §1's table — this repo already has 35+ OpenSpec scripts because past sessions built ad hoc
instead of searching first). Classify anything found as `CANONICAL_OWNER` / `BACKEND` / `ADAPTER` /
`EXPERIMENT` / `COMPATIBILITY` / `FIXTURE_ONLY` / `DEAD` per this repo's existing governance
vocabulary before adding a peer.

### 5.5 Status Language is enforced on sub-agent output, not just on humans

A Tier-2/3 fix is not "done" because the sub-agent says so. The only valid completion state is
Tier-0's independent re-audit reporting the new state. A sub-agent claiming `WIRED` or
`production-ready` from its own diff, with no audit-script confirmation, is a rejected report —
same standard this repo already applies to itself (see the AGENT EXECUTION INTEGRITY rules in
CLAUDE.md: no claim without tool evidence, no percentage without observable counts).

### 5.6 Never let a sub-agent touch `DEV_BYPASS_AUTH`-adjacent hardening inline

Per existing project direction, auth/Zod-validation gaps (G4/G5 findings) found incidentally while
fixing something else get *recorded* in the CLAUDE.md tracking table, not fixed inline — that's a
deliberate later production-hardening pass, not scope for an OpenSpec task-fixing sub-agent.

---

## 6. Concrete orchestration mechanics available in this environment

- **`Agent` tool, `subagent_type: "general-purpose"` or `"Explore"`**: the right primitive for a
  single Tier-1 triage or Tier-2 propose dispatch. Use `isolation: "worktree"` for anything that
  will touch files, per §5.2.
- **`Workflow` tool**: the right primitive for fanning out many Tier-1 triage agents in parallel
  (one per `byProgram` bucket) and pipelining Tier-1 → Tier-2 → verify, per its own
  `pipeline`/`parallel` API. **Requires explicit user opt-in** (the word "workflow" or "ultracode"
  in the request, or a saved workflow) — this playbook documents the shape, it does not authorize
  running one. Canonical shape for this specific loop:
  ```js
  export const meta = {
    name: 'openspec-tasks-fix-loop',
    description: 'Triage actionable OpenSpec tasks, propose rehearsed fixes, verify independently',
    phases: [{ title: 'Triage' }, { title: 'Propose' }, { title: 'Verify' }],
  }
  const programs = Object.keys(workboard.completionTracking.byProgram)
  const findings = await pipeline(
    programs,
    p => agent(triagePrompt(p), { label: `triage:${p}`, phase: 'Triage', schema: FINDING_SCHEMA }),
    findingsForProgram => parallel(
      findingsForProgram.filter(f => f.classification === 'ACTIONABLE_NOW').map(f => () =>
        agent(proposePrompt(f), { label: `propose:${f.taskRef}`, phase: 'Propose', schema: DIFF_SCHEMA })
      )
    )
  )
  // Tier 3 (apply) stays outside the workflow — human-gated, per §3.
  ```
- **TRACE MCP `ops.*` tools** (already registered, see the `ops_propose_patch`,
  `ops_record_fix_attempt`, `ops_validate_claims`, `ops_run_targeted_test`, `ops_verify_write`,
  `ops_trust_audit` tools listed in this session's deferred-tool set): these are the intended
  MCP-level hooks for exactly Tier 2/3 — a sub-agent should call `ops_propose_patch` rather than
  hand-rolling a diff-writing mechanism, and `ops_verify_write` rather than trusting its own
  `git diff` read.
- **`ScheduleWakeup` / `/loop`**: appropriate only for the outer cadence (e.g. "re-triage every N
  hours as new tasks land"), never for polling a sub-agent's own progress — harness notifications
  already handle that.

---

## 7. Per-task fix loop (what actually happens to one line in `tasks.md`)

1. **Classify** — Tier 1 reads the task text + its program's workboard slice, decides
   ABSENT/STALE_CHECKED/GENUINELY_BLOCKED/DUPLICATE_OF/ACTIONABLE_NOW.
2. **Find owner** — grep for an existing decision doc, canonical file, or table (§5.1, §5.4)
   before proposing anything new.
3. **Propose** — Tier 2 writes a diff against the owner (or a new minimal artifact only if no
   owner exists and none is a near-duplicate), plus the rehearsal plan and the verification
   command.
4. **Rehearse** — Tier 3 runs the rehearsal (transaction+rollback, or a dry-run flag) and diffs
   the actual result against the predicted one. Mismatch = reject and re-triage, not force-apply.
5. **Apply** — only on rehearsal match, and only with explicit authorization for anything
   consequential (identity minting, schema DDL, cross-session-visible writes) — same bar this
   session used for the packet-key rollback and the lineage freeze.
6. **Update `tasks.md`** — the checkbox flips in the *same* commit as the fix, with a one-line
   evidence pointer (receipt path, commit hash, or audit field) — never a bare `[x]` with no
   traceable evidence, per this repo's own tasks.md convention throughout the session summary.
7. **Re-verify** — re-run Tier 0's census script. The task is only actually done when the
   *independent* audit agrees, not when Tier 2/3 says so.

---

## 8. Prioritization: don't dispatch 2,431 tasks in task-list order

Use what the workboard already computes, don't re-derive it:
- Filter to `actionableTasks` (2,431), excluding `waitingTasks` (764 — genuinely blocked, dispatch
  wastes a sub-agent) and `supersededTasks` (53 — archive-reference, don't fix).
- Rank by the workboard's own `promotionCriticalRank` and `laneDependencies` fields — items on the
  critical path to whatever gate matters right now (e.g. the canonical-projection-fabric admission
  gate) outrank equally-actionable items in an unrelated lane.
- For the specific goal of closing `NOT_SAFE_TO_PROJECT`: dispatch first against the tasks.md
  sections feeding the still-open predicates (`GRAPH_MANIFEST_SEALED`'s module-resolution wiring,
  `BITFROST_KEYS_DERIVABLE`/`ACE_EVIDENCE_GROUNDED`'s design-stage work, the `PacketKeyV2`
  operator-authorization checklist) before touching peripheral lanes like `RANKING_RECOMMENDATION`
  (343 open) that don't gate admission.

---

## 9. Stopping / verification criteria

A dispatch round ends when either: (a) the actionable-and-critical-path slice is exhausted, or (b)
context/time budget runs out — whichever first, per this session's own established discipline
around not pushing forward under pressure. **A sub-agent's self-reported "done" is never sufficient
to close a round** — the round closes only when Tier 0's re-generated `openspec-workboard-v1.json`
shows the expected `completedTasks` delta with `newlyCompleted` matching what was actually applied
(that field already exists in the receipt's `completionTracking` block — use it, don't invent a
new counter).

---

## 10a. Worked example: `GRAPH-SNAPSHOT-SCOPE-V2-01`

A concrete run of the §7 loop against a real, currently-open item, done here to pressure-test the
playbook rather than leave it abstract. An external review proposed replacing
`atlas_packets.workspace_id` as the graph-snapshot exporter's scoping key with a proper
`{executionId, workspaceRevision, repositoryId}` contract, sourced from
`graphify_execution_file_membership_v2`. Per this playbook's own rule (§5.1: verify pasted/external
claims live before trusting them in a durable doc), every load-bearing factual claim in that review
was checked against the live DB before being written down here:

| Claim | Verified live | Result |
|---|---|---|
| `graphify_execution_file_membership_v2` exists with `repository_id`, `workspace_revision`, `source_ref`, `code_source_revision`, `content_hash` | `information_schema.columns` | **Confirmed** — 9 columns, exactly those names |
| Index leads with `(workspace_revision, repository_id, repository_relative_path)` | `pg_indexes` | **Confirmed** — `graphify_execution_file_membership_v2_workspace_idx` |
| `repository_id` is a small, real repository set (not path-like noise) | `GROUP BY repository_id` | **Confirmed** — exactly 7 values: `repo:root` (339,119 rows), `repo:claude-mem`, `repo:mcp-server-mcp`, `repo:turbovec`, `repo:sites/parent-atlas-gateboard`, `repo:models/embeddinggemma_300m`, `repo:granite-docling-258M` |
| `atlas_packets.workspace_id` has ~1,196 meaningless distinct values | `count(DISTINCT workspace_id)` | **Confirmed** — exactly 1,196, matching the existing code comment in `graph-snapshot-postgres.ts` |
| The materializer has one real caller + its test, not a wide blast radius | `rg` for `materializeCanonicalGraphSnapshotFromPostgres` in `sveltekit-frontend/src` | **Confirmed** — only `graph-snapshot-postgres.ts` (definition) and `graph-snapshot-postgres.spec.ts` (test); the one external caller is `scripts/atlas/export-graph-snapshot-v2.mts`, already read this session |

**Applying the loop:**

1. **Classify** — this item is `ACTIONABLE_NOW`, not `GENUINELY_BLOCKED`: it's a code-level fix
   (materializer input contract + query), no operator authorization needed (unlike `PacketKeyV2`
   admission, which genuinely is blocked).
2. **Find owner** — this session already fixed `workspace_id → workspace_revision_key` in
   `graph-snapshot-postgres.ts` earlier; the review's correction is one layer deeper: even
   `workspace_revision_key` alone under-scopes, because a snapshot needs a *repository* partition
   too (`repo:root` alone is 339,119 rows — not something you'd want undifferentiated from
   `repo:claude-mem`). No competing owner-decision doc exists for this specific contract — the
   `PACKET_SELECT_SQL`/`TREE_NODE_SELECT_SQL` shape in `graph-snapshot-postgres.ts` is itself the
   owner, and this is its next revision, not a new peer.
3. **Propose** — the diff is bounded to `graph-snapshot-postgres.ts`'s `PostgresGraphSnapshotInput`
   interface (add `repositoryId`, resolve `packets`/`treeNodes` via a join against
   `graphify_execution_file_membership_v2` instead of `atlas_packets.workspace_revision_key` alone)
   and `export-graph-snapshot-v2.mts`'s CLI args (`--execution-id`, `--repository-id` alongside the
   existing `--workspace-revision`). Per the review's own scoping note, this does **not** touch
   `graph-snapshot-materializer.ts`'s node/edge semantics — contained blast radius, consistent with
   the "one real caller" finding above.
4. **Rehearse** — a read-only query against one repository (`repo:root`) comparing row counts and
   a sample of `packet_key`s before/after the join change, per the review's own suggested
   `EXPLAIN (ANALYZE, BUFFERS)` step — run against the *existing* index first; do not add a new one
   preemptively (the existing `(workspace_revision, repository_id, repository_relative_path)` index
   already matches the proposed query's leading equality columns).
5. **Apply** — only after the rehearsal query's row/identity counts match hand-computed
   expectations for `repo:root`.
6. **Update tasks.md** — record under the relevant OpenSpec change (this work traces to the same
   `GRAPH_MANIFEST_SEALED` predicate this session already touched) with a pointer to the rehearsal
   receipt, not a bare checkbox.
7. **Re-verify** — re-run `scripts/atlas/audit-canonical-projection-fabric.mjs`; confirm
   `GRAPH_MANIFEST_SEALED` reflects a snapshot keyed by the corrected contract before considering
   this closed.

**What this example demonstrates**: the review's `updated_at`/`created_at`-is-not-identity point and
its identity-vs-observation split (§ "IDENTITY" vs "OBSERVATION/UTILITY" in the pasted material)
are exactly the kind of fact a Tier-1 triage agent should carry forward into its finding — but the
review's own numeric/structural claims still had to be independently verified before being written
into this durable doc, not trusted because they read as confident and detailed. Confident and
detailed is not the same as checked.

**Not done in this pass**: no code was changed for `GRAPH-SNAPSHOT-SCOPE-V2-01` itself — this
section documents the loop that *would* apply, using facts verified live, not a completed fix. If
you want this implemented for real, say so explicitly (per §5's "yes continue" caution) rather than
treating this worked example as authorization.

## 10. Anti-patterns (explicit, from this session's real mistakes)

- ❌ Proposing a new identity/scheme without grepping for an existing owner-decision doc first.
- ❌ `git stash` for any kind of isolation in this repo.
- ❌ Applying a DB/file mutation without a rehearsal step and an exact-match check against the
  predicted result.
- ❌ Marking a `tasks.md` checkbox done based on a sub-agent's own claim, with no independent
  audit-script confirmation.
- ❌ Building a 36th `audit-openspec-*` script before checking the 35 that exist.
- ❌ Treating "yes continue" (or any non-specific approval) as authorization for a new
  consequential action the user hasn't concretely confirmed.
- ❌ Fixing G4/G5 auth/Zod gaps inline while triaging an unrelated task — record, defer.
- ❌ Reporting percentage/completion claims not backed by an observable count from a script.
