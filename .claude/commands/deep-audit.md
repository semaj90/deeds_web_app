# Deep Audit — 20+ Gate Codebase Health Sweep

You are running a comprehensive codebase audit using the **47-gate audit system** documented in `CLAUDE.md` (G1–G55) plus the **17-gate backend infrastructure audit** (`BACKEND_INFRASTRUCTURE_AUDIT.md`). Your output is a prioritised remediation plan, not a wall of grep dumps.

## Constructor inputs (positional)

`/deep-audit [scope] [gates] [mode]`

| Slot | Default | Values | Meaning |
|------|---------|--------|---------|
| `scope` | `all` | `all` · `<dir-path>` · `<file-path>` · `route:<api-path>` · `cluster:<id>` · `som:<row>:<col>` | What to audit |
| `gates` | `code` | `code` (G1-G26) · `data` (G10-G12) · `infra` (G27-G47) · `tier-h` (G48-G55) · `all` | Which gate suite |
| `mode` | `report` | `report` · `fix` · `dry-fix` · `wire` (link to existing repair tools) | Output mode |

`$ARGUMENTS` is the raw arg string. Parse it; if blank, run `all code report`.

### Scope resolution

- `all` → use the source-only inventory for the live `sveltekit-frontend/src/` cohort. Use `docs/graph/codebase-graph.json` only for historical comparison unless currentness and admission are proven.
- `<dir-path>` → only audit files under that path (e.g. `src/routes/api/ace`).
- `<file-path>` → audit a single file; add 1-hop graph neighbors only when the graph is current and admitted, otherwise label neighbor coverage `BLOCKED`.
- `route:<path>` → resolve to the matching `+server.ts` (e.g. `route:/api/ace/agent` → `src/routes/api/ace/agent/+server.ts`).
- `cluster:<id>` → load graph cluster membership only from a current admitted graph; stale/unadmitted results are historical candidates.
- `som:<r>:<c>` → load SOM membership only from an explicitly qualified projection revision; otherwise report `BLOCKED`.

For SOM/cluster scopes, require an explicitly qualified projection revision and current admitted graph. Source-only mode does not query Redis or Qdrant; without those receipts, report the projection scope `BLOCKED`.

## Pre-flight: establish currentness before using the index

The canonical graph path is `sveltekit-frontend/docs/graph/codebase-graph.json` (from the repository root), or `docs/graph/codebase-graph.json` when the command runs in `sveltekit-frontend`. A missing or stale graph must never be used to produce current `PASS` results, and do not run `graphify:daily` as an audit preflight.

First obtain a read-only, source-scoped inventory. This scans tracked and non-ignored untracked live source files, computes per-file hashes, compares paths with the cached graph, and writes nothing:

```bash
cd sveltekit-frontend && node scripts/deep-audit-ast.mjs --inventory-only
```

The inventory reports `PROVISIONAL`; the graph reports `STALE` if older than 24 hours, `BLOCKED` if missing, and otherwise remains `PROVISIONAL` until an explicitly identified admitted snapshot receipt matches its hash and source revision. A timestamp alone never establishes admission. Preserve this inventory as a run-scoped receipt if needed; do not overwrite the canonical graph.

Use these claim states consistently:

- `CURRENT`: source revision and graph hash match an explicitly admitted producer receipt.
- `STALE`: graph age exceeds policy or graph source identity does not match current source.
- `PROVISIONAL`: read-only live source scan without canonical graph admission.
- `BLOCKED`: required source identity, authorization, or admission evidence is unavailable.

The graph JSON may contain per-file flags, but those flags are candidate evidence, not proof:
`hasAuth`, `hasZod`, `parsesBody`, `routeHandlers`, `ssrUnsafe`, `sv4Legacy`, `localhostRefs`, `hasPairedTest`, `drizzleRefs`, `dynImports`, `clusterId`, `somBmuRow`, `somBmuCol`.

## Gate selection

Read **CLAUDE.md** for the complete gate definitions. Below is the dispatch table — invoke each gate by reading the JSON, NOT by re-grepping.

### Tier code (G1–G26) — code connectivity + Svelte 5 + tests
Use graph flags only for triage and historical comparison. For live gates, filter to the exact source inventory and inspect the route handler, inherited hooks/route-group guards, and validation owner. Report `VERIFIED_PASS`, `VERIFIED_FAIL`, or `NEEDS_MANUAL_REVIEW` with exact path and guard/validator references. Never convert a stale graph candidate directly to a security failure or auto-patch it.
- **G1** static imports → `f.imports`
- **G2** dynamic imports → `f.dynImports`
- **G3** barrel re-exports → `f.reExports`
- **G4** auth on API routes → `f.hasAuth === false && f.isRoute && f.routeHandlers.length`
- **G5** Zod on body-parsing → `f.hasZod === false && f.parsesBody`
- **G6** route handlers → `f.routeHandlers`
- **G7** Drizzle refs → `f.drizzleRefs`
- **G8** TODOs → `f.todos`
- **G14** Svelte 4 patterns → `f.sv4Legacy === true`
- **G15** SSR-unsafe → `f.ssrUnsafe === true`
- **G16** test pairing → `f.isRoute && !f.hasPairedTest`
- **G20** cyclic imports → `graph.gateStats.cyclicPairCount`
- **G21–G25** rune compliance → `f.sv4Props`, `f.sv4Reactive`, `f.sv4Events`, `f.sv4Dispatch`, `f.runeInTs`
- **G26** test-file shape → `find tests/routes -name '*.test.ts' | xargs grep -L '@vitest-environment node'`

### Tier data (G10–G12) — DB + vector
- **G10** schema refs → `f.drizzleRefs`
- **G11** localhost refs → `f.localhostRefs.length > 0`
- **G12** vector / Qdrant coupling → grep for `collection.*${name}`

### Tier infra (G27–G47) — pytorch-graph, glyph/cartridge, ACE
Run the Bash gates from CLAUDE.md verbatim. These need filesystem checks (e.g., does `som-topology/+server.ts` exist), not just graph reads.

### Tier H (G48–G55) — search analytics + ACE feedback
Same — run the bash gates from CLAUDE.md.

### Tier ADV (G56–G58) — adversarial fixture validation, read-only (added 2026-10-21; not a GAN)
Run from the repo root. Follow the `validating-parent-atlas` rules: a lane reports the level it actually reached (`STATIC` < `WIRED` < `LIVE_READ_ONLY` < `LIVE_MUTATING` < `PROVEN`, or `BLOCKED`). Never report PROVEN from these gates. The overall status is the worst lane, not the average.
- **G56 adversarial fixtures (no DB):** `npx tsx scripts/atlas/prove-gan-adversarial-v1.mts --output=.tmp/atlas/gan-adversarial-proof-v1-<run-id>.json`. Use a unique explicit output path (without it, the script writes under `docs/reports`). Passes only if every malicious fixture is rejected with the expected code, every control is accepted, and the self-tests detect deliberately broken probes. Record the receipt path.
- **G57 live read-only census:** `npx tsx scripts/atlas/prove-gan-audit-readonly-v1.mts --adversarial-receipt <G56 receipt> --inventory-receipt <inventory receipt> --lineage-readiness <lineage receipt>`. It runs one `REPEATABLE READ READ ONLY` transaction and always rolls back. A DB failure or zero rows exits 2 with `GAN_LIVE_PACKET_PROOF_BLOCKED`, which counts as `BLOCKED`. Give each receipt an explicit named path. Never pick the latest receipt by timestamp.
- **G58 contract parity:** Choose one exact registered contract ID from `CONTRACT_PARITY_REGISTRY`; the exporter requires `--contract` and writes an immutable bundle. Run `npx tsx scripts/atlas/export-contract-parity-v1.mts --contract <registered-schema-id> --out .tmp/atlas/contract-parity-v1/<run-id>`. Record the emitted manifest path, schema ID, version, and checksum. Then run `python python/atlas_contract_parity/run_parity.py --manifest .tmp/atlas/contract-parity-v1/<run-id>/manifest.json --schema-id <emitted-schema-id> --schema-version <emitted-version> --schema-checksum <emitted-sha256> --out .tmp/atlas/contract-parity-v1/<run-id>/python-parity-receipt.json`. The Python runner requires all five arguments and refuses to overwrite a receipt. Never resolve a bundle or contract as "latest"; compare only the exact same contract and sealed manifest.
- **Runs serially.** G57 uses the database, so it never runs in the parallel pool.

### Tier ORG (G59–G62) — indexing, Redis/Valkey, centroids, DAG prefill/decode (added 2026-10-21)
Read-only organisation checks. Nothing here deletes, moves, or writes. Any cleanup is a separate, reviewed change that archives first (see CLAUDE.md archival rules).
- **G59 index freshness:** compare the canonical `docs/graph/codebase-graph.json` mtime with the newest file under `docs/reports/graph-probes/`. Flag the canonical graph as STALE if it is older than 24h. A probe is never canonical, so report probes as candidates only.
- **G60 Redis/Valkey key namespaces:** use `SCAN` with a count limit (never `KEYS`) to count keys per prefix: `code:index:*`, `code:ts:*`, `bitfrost:*`, `gpu:*`, `atlas:centroid:*`, `wiki:note:dir:*`. Flag any prefix that is not in the registry, and any key without a TTL. Read only.
- **G61 centroid caches:** check that `atlas:centroid:{domain,kmeans,som}:*` keys have TTLs and that each cache has a canonical owner. Cache content is never evidence. Confirm the authority for each centroid family in PostgreSQL (for example `atlas_ontology_linked_tuples`).
- **G62 DAG prefill and decode:** confirm the owners exist and each one's OpenSpec status. Check the prefill and decode files, then count checked and open tasks in `sveltekit-frontend/openspec/changes/parent-atlas-ace-json-dag-prefill-pipeline/tasks.md`. Report counts by status. Do not treat a checked task as proof.
- **Archive rule:** if a gate finds an unused file, record it as a candidate with its path and `git log` entry. Never remove it in this audit.

### Tier ID (G63) — model identity classification (read-only)
- Scan the exact live source cohort. Classify each `gemma4` reference as `STALE_LABEL`, `REAL_GEMMA4_ARTIFACT`, `HARDCODED_MODEL_ID`, or `NEEDS_MANUAL_REVIEW`; retain the exact file and matching source reference. Do not query a running model as part of a source-only audit. Resolver behavior is a separate live verification and must be reported separately. Never blanket-rename: route paths and script arguments may be compatibility contracts; preserve historical artifacts and provenance.

## Parallel execution (policy, 2026-10-21; mirrors CLAUDE.md and codex.md)

**G4/G5/G63** use `node scripts/tests/audit-gates.mjs --gate=G4 --summary` (repeat with `G5` and `G63`) for source-scoped classification. Counts include the denominator and remain `PROVISIONAL` until source/currentness and admission are proven. G4 may count inherited protection only when the global hook and deny-by-default access policy are both inspected and linked; otherwise leave `NEEDS_MANUAL_REVIEW`. G5 recognizes local schemas and imported validators only when the handler calls the imported function and its module exposes schema parsing. Keep unproven router-wide contracts such as a catch-all tRPC adapter in manual review. Never auto-fix from counts.

For Parent Atlas production-readiness work, also follow `.codex/skills/parent-atlas-production-hardening-audit/SKILL.md` and the existing `graphify-pipeline-gap-audit` skill. That audit skill augments these gate instructions; it does not authorize mutations or replace the owning OpenSpec ledger.

- **Measure first.** Run one serial pass (`DEEP_AUDIT_CONCURRENCY=1`) and record its wall time before enabling concurrency. The serial run is the replay oracle; the parallel result must match it gate for gate.
- **Read the graph once.** Load `docs/graph/codebase-graph.json` once, hash it (sha256), and give every worker the same in-memory snapshot. Never re-scan per gate.
- **Pool by tier, bounded.** The code tier (G1–G26) and the data tier (G10–G12) are pure reads over the snapshot and may run in a pool of `DEEP_AUDIT_CONCURRENCY` (default 3, hard cap 4). Infra (G27–G47) and Tier H (G48–G55) run bash checks against services and the filesystem, so run them serially to avoid hammering services.
- **Run-scoped outputs.** Each gate writes `reports/deep-audit/<runId>/gate-<id>.json` with the run ID and graph hash. No two workers write the same file.
- **Ordering.** The report, recap and remediation list are built serially after every gate finishes. Any gate that fails or times out marks the run `INCOMPLETE`. Never drop a failed gate silently.
- **Fix mode stays serial.** Group fixes by file, and apply `Edit` one file at a time. Two workers must never edit the same file.
- **No side-effecting writes.** Audit gates never write to PostgreSQL, Valkey, Qdrant or Neo4j. The `wire` mode only emits a checklist.
- **Recap records the run.** Add `Concurrency: N · wall time: Xs · serial oracle: <match|not run>` to the recap.

## Output format (mode=report)

Print a **single concise table** plus an action list. Do NOT dump the full file lists unless the user asks; cap each gate's bullet to top 5 with `(+N more)` suffix. The example below is historical format only, not a current audit result. Every live report must include denominators and reconcile `attempted = passed + warned + failed + not_run`; manual-review candidates belong under `warned`, never under `failed`.

```
## Deep Audit — example format only (historical counts)

| Gate | Status | Failures |
|------|--------|----------|
| G1   | ✓      | n/a |
| G4   | ⚠️     | 1: `ace-internal/+server.ts` missing locals.user |
| G5   | ✓      | 0 |
| G15  | ✓      | 0 (server-only, exempt) |
| G16  | ⚠️     | 7 routes lack paired tests (run `audit:test-stubs`) |
| G20  | ✓      | 0 |

### Top remediation (priority order)
1. **G4 review** — inspect the route and inherited guard before deciding whether a fix is needed
2. **G16 review** — treat missing-pair results as candidates; follow the repository's actual test discovery convention
3. _(no other gates fail)_

### Recap
- Telemetry: `npx tsx scripts/atlas/deep-audit-hll-telemetry-v1.mts --graph=<graph json>` writes one exact distinct-count receipt to `reports/deep-audit/telemetry/` (EXACT_SET_ADAPTER, read-only, no Valkey writes). The writer validates the receipt it just created, through the shared contract in `scripts/atlas/lib/deep-audit-telemetry-receipt-v1.mts`, and exits 1 with `TELEMETRY_RECEIPT_INVALID` on failure. To validate named receipts later, run `npx tsx ../scripts/atlas/deep-audit-telemetry-consumer-v1.mts <receipt.json>`. Neither path picks the latest receipt. Add the validated receipt path and its SHA-256 here.
- Files audited: 47
- Gates run: 23 (Tier code)
- Hard fails: 0  ·  Warnings: 8  ·  Pass: 15
- Estimated fix time: 15 min
```

## Output format (mode=fix or dry-fix)

For each independently verified fail, propose the **smallest possible fix** as a unified diff. A provisional/manual-review candidate cannot be auto-fixed. In `fix` mode, preserve normal authorization and test expectations; if inherited protection or side effects are uncertain, stop at a review note. In `dry-fix`, only print the diff.

Match the canonical patterns:
- **G4 fix**: only after verifying the actual authorization contract and handler ordering; reuse the existing case/admin access owner.
- **G5 fix**: only after checking local schema, router-level Zod input, and validated-wrapper owners.
- **G11 fix**: replace `'http://localhost:N'` with `ENV.SERVICE_URL ?? 'http://localhost:N'`
- **G15 fix**: wrap in `if (typeof window !== 'undefined')` or move into `$effect`/`onMount`
- **G16 fix**: run `npm run audit:test-stubs` (don't write tests by hand)

## Output format (mode=wire)

Don't fix — just emit a **next-action checklist** referencing existing repair tools:

```
G4 (1 fail)  → fix manually (single route)
G16 (7 fail) → npm run audit:test-stubs --filter ace
G15 (0)      → no action
```

## Constructor mapping (data sources)

```
[scope]    →  source inventory filter by canonical src-relative path; use graph scope only if current/admitted
[gates]    →  select which g*() function to run from CLAUDE.md gate suite
[mode]     →  report | fix | dry-fix | wire
graph      →  sveltekit-frontend/docs/graph/codebase-graph.json (historical unless admitted/current)
KAG        →  Redis wiki:note:dir:* (per-directory context, AGENTS.md source)
gateStats  →  Redis code:index:gate-stats (last full audit summary)
agents.md  →  walk up from any failure file to find nearest AGENTS.md, append its
              "Patterns / Warnings" sections to the remediation context
```

## Critical: don't re-scan, read the cache

The **whole point** of this skill is to use the GPU codebase index as the authoritative source. If you find yourself running `grep -r` for things that are already in `f.imports` / `f.routeHandlers` / `f.localhostRefs`, **stop and read the JSON instead**. The index is regenerated by `npm run index:codebase:fast` (cold ~14s, warm ~11s with Redis cache hit).

## Examples

```
/deep-audit                                      # all + code + report
/deep-audit src/lib/server/ace code report      # scoped, code gates, table
/deep-audit src/routes/api code fix             # apply auth fixes to API routes
/deep-audit cluster:7 all wire                  # gate failures in cluster 7, list tools
/deep-audit som:3:5 code report                 # files at SOM grid (3,5)
/deep-audit route:/api/ace/agent all report     # one specific route, all gates
```

## When to re-run

- After `git pull` (graph may be stale)
- Before opening a PR (clean audit = green CI)
- After running `agents:write` (per-directory AGENTS.md may have updated warnings)
- Daily as part of `graphify:daily`

## D9 Orphan Verification (added 2026-05-05)

D9's `fanIn === 0` heuristic from Graphify is great for **visualization** (find isolated nodes), but unsafe for **deletion decisions**. fanIn under-counts:

- type-only imports (`import type { X } from '...'`)
- dynamic imports (`await import('...')`)
- barrel re-exports (`export * from '...'`)
- SvelteKit auto-loaded route files
- framework/config/hooks/migrations/service-workers

**Always run the verifier before recommending any deletion**:

```bash
npm run audit:d9              # writes reports/deep-audit/d9-orphan-verification.json
npm run audit:d9:strict       # exits 1 if any true orphans (CI gate)
```

The verifier (`scripts/lib/reference-verifier.mjs`) classifies every fanIn=0
candidate into one of:

| Classification | Action |
|----------------|--------|
| `runtime-referenced` | KEEP (real `from '...'` consumer) |
| `dynamic-referenced` | KEEP (`await import()` consumer) |
| `barrel-reexported` | KEEP (consumed via `index.ts`) |
| `type-only-referenced` | KEEP (used in types — flag if also unused at runtime) |
| `route-entrypoint` | EXEMPT (SvelteKit auto-loads) |
| `config-or-framework-entrypoint` | EXEMPT (hooks/sw/configs/migrations) |
| `path-mentioned` | MANUAL REVIEW (string mention only) |
| `true-orphan-candidate` | DELETION CANDIDATE — but still do a manual peek |

### Triage chain (run in order)

```bash
npm run audit:d9            # 3357 → 148 verified true-orphans       (~12s cold, ~3s warm)
npm run audit:d9:triage     # 148 → 19 true / 32 unwired / 50 dyn / 46 in-agents / 1 sibling
npm run audit:d9:vs-plan    # cross-ref vs next_steps/ — PLANNED / DRIFT / INVERTED
npm run audit:d9:full-chain # all three in one shot
```

The chain lands three artifacts under `reports/deep-audit/`:

1. `d9-orphan-verification.json` — 8-bucket classification (verifier output)
2. `d9-shallow-dynamic-triage.json` — 5-bucket triage (post-classification)
3. `d9-vs-next-steps.json` — PLANNED vs DRIFT vs INVERTED (vs `next_steps/` plan corpus)
4. `d9-vs-next-steps.md` — human-readable digest

Plus a **durable encoded snapshot** at `reports/deep-audit/encoded/d9-vs-next-steps_<date>_<gitSha>.json` so future audits can diff against the baseline. **Don't gitignore this directory** — it's the audit trail.

### Decision matrix

| Bucket | Action | Notes |
|--------|--------|-------|
| `runtime-referenced` | KEEP | Real `from '...'` consumer found |
| `dynamic-import-target` | KEEP | `await import('...filename')` consumer |
| `barrel-reexported` | KEEP | Surfaced via `index.ts` re-export |
| `mentioned-in-agents` | KEEP | Documented in directory wiki / AGENTS.md |
| `has-fanOut-no-fanIn` ∩ PLANNED | **WIRE** | Planner expects this — find the wire point |
| `has-fanOut-no-fanIn` ∩ DRIFT | INVESTIGATE | Substantial code (200-600 LOC), no plan ref |
| `true-orphan` ∩ PLANNED | INVESTIGATE | Tiny file, planner mention — verify intent |
| `true-orphan` ∩ DRIFT | **ARCHIVE** | Move to `deeds_labs/` |
| INVERTED | IMPLEMENT or DEPLAN | Plan expects file that doesn't exist |

### Sample baseline (2026-05-05, post Tier-A wiring)

| Metric | Count |
|--------|-------|
| fanIn=0 candidates | 3357 |
| Verified true-orphans | 148 (95.6% false-positive cut) |
| Unwired features (`has-fanOut-no-fanIn`) | 28 |
| Wire-now (PLANNED ∩ unwired) | 13 |
| Archive-now (DRIFT ∩ true-orphan) | 19 |
| Live INVERTED (planner expects missing) | 29 |

**Output artifact** (`reports/deep-audit/d9-orphan-verification.json`):

```json
{
  "gate": "D9",
  "reportedByFanIn": 840,
  "verifiedTrueOrphans": 12,
  "falsePositives": 828,
  "classifications": { "runtime-referenced": 300, ..., "true-orphan-candidate": 12 },
  "trueOrphans": [ "src/lib/.../foo.ts", ... ]
}
```

This artifact is the input to `/audit-components` and `/prune-codebase`. Never recommend deleting a file based only on Graphify's `fanIn`.
