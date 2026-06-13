---
name: Atlas Smoke Validation
description: Standardized verification contract for Parent Atlas mutations and code generation tasks
---

# Atlas Smoke Validation Skill

## Purpose

This skill provides a structured, replayable verification pipeline for all Parent Atlas mutations and code generation tasks. It ensures that every change applied to the codebase has been validated across syntax, semantics, integration, and runtime layers before mutating production state.

## Strict Seven-Phase Validation Pipeline

Every file modified or created by any agent working on Parent Atlas must pass this pipeline in order:

```
[File Modified/Created]
         ↓
[1. File Existence Check] (Confirms file is on disk)
         ↓
[2. Syntax Check (AST)]   (node --check / tsc / svelte-check)
         ↓
[3. Env Redaction Check]  (Ensures no plain-text credentials)
         ↓
[4. Dry-Run Validation]   (Harness-level dry-run evaluation)
         ↓
[5. ACE/KAG/DAG Audit]    (Verifies planning & trace lineage)
         ↓
[6. Local Smoke Tests]    (Runs fast build checks <15 mins)
         ↓
[7. Gate Pass]            (Applies transactional database write)
```

## Phase Definitions

### Phase 1: File Existence Check
- Verify file exists on disk at expected path
- Check file size > 0 bytes (not empty)
- Report: `{ path, size_bytes, exists: true }`

### Phase 2: Syntax Check (AST)
JavaScript/TypeScript files:
```bash
node --check <file>
```

Svelte components:
```bash
npx svelte-check --compiler-warnings=error
```

TypeScript strict mode:
```bash
npx tsc --noEmit --strict
```

Report: `{ file, syntax_ok: true, errors: 0 }`

### Phase 3: Environment Redaction Check
Ensure no plain-text secrets leak into:
- Source files (`.ts`, `.js`, `.mjs`, `.mts`)
- Configuration files (`.json`, `.yaml`, `.env` EXAMPLES only)
- Comments or JSDoc

Scan for:
```regex
DATABASE_URL.*=.*[a-z0-9]+
PASSWORD.*=.*[a-z0-9]+
SECRET.*=.*[a-z0-9]+
PRIVATE_KEY.*=.*[a-zA-Z0-9/+=]+
API_KEY.*=.*[a-z0-9]+
```

Report: `{ file, has_secrets: false, redaction_ok: true }`

### Phase 4: Dry-Run Validation
All scripts implementing the Parent Atlas mutation contract must support `--dry-run` or default to dry-run:

```bash
node scripts/atlas/<producer>.mjs [--dry-run]
node scripts/atlas/<consumer>.mjs                  # defaults to dry-run
node scripts/atlas/<consumer>.mjs --apply          # explicit apply gate
```

Outputs:
- Producer: Write artifact to `docs/reports/*.json`
- Consumer dry-run: Write execution plan to `docs/reports/*-dry-run.json`
- Consumer apply: Conditional DB mutation if `--apply` flag present

Report: `{ mode: 'dry-run', would_write: {...}, status: 'ok' }`

### Phase 5: ACE/KAG/DAG Audit
Verify that generated code or packets connect to the Agent Context Engine:

- **ACE** (Agent Context Engine): Does the mutation feed evidence into the ACE retrieval pipeline?
- **KAG** (Knowledge-Augmented Generation): Are concepts and schema validated?
- **DAG** (Directed Acyclic Graph): Does the dependency order prevent cycles?

For packet mutations:
```javascript
{
  packet_key: string,        // stable identity
  source_ref: string,        // file path or feature ID
  feature_id: string,        // domain classification
  summary: string,           // for ACE context
  metadata: {
    ace_kag_dag_hits: [...]  // lineage evidence
  }
}
```

Report: `{ packet_keys: 3, feature_ids: 3, ace_hits: 12, kag_validated: true, dag_acyclic: true }`

### Phase 6: Local Smoke Tests
Run fast integration checks (<15 minutes total):

```bash
# Build validation
npm run build:check              # Vite/SvelteKit static check
npm run typecheck                # svelte-check + tsc
npm run lint                     # ESLint

# Schema validation
npm run drizzle:check            # Drizzle schema sanity check
npm run drizzle:generate --dry   # No migration journal update

# Artifact validation
npm run atlas:smoke:graphify     # 5-pillar health check
npm run atlas:smoke:lineage      # Feature lineage gates
npm run audit:test-stubs:dry     # Route test pairing validation
```

Report: `{ stage: 'smoke', duration_ms: 45000, failures: 0, pass: true }`

### Phase 7: Gate Pass (Transactional Apply)
Only after all 6 prior phases pass:

```bash
node scripts/atlas/parent-atlas-mutation-gate.mjs --apply
```

This writes all mutations atomically (per-pipeline transactions). If any pipeline fails, the orchestrator stops and does not apply subsequent pipelines.

Report: `{ ok: true, mutations_applied: 12, duration_ms: 3200 }`

## Standardized Telemetry Output

Every agent task must end with a structured verification block:

```markdown
## Telemetry and Safe Path Diagnostics

**Status**: [PASS | FAIL | PARTIAL]

**Patch Targets**:
- `scripts/atlas/parent-atlas-mutation-gate.mjs:38-68` (PIPELINES constant update)
- `scripts/atlas/index-parent-atlas-packets.mjs` (new consumer, 134 lines)

**Verification Summary**:
- Phase 1 (Existence): ✅ 2/2 files exist
- Phase 2 (Syntax): ✅ node --check PASS
- Phase 3 (Redaction): ✅ 0 secrets found
- Phase 4 (Dry-Run): ✅ All pipelines PASS in dry-run mode
- Phase 5 (ACE/KAG/DAG): ✅ 9 packets with feature_id + summary
- Phase 6 (Smoke): ✅ npm run build:check PASS
- Phase 7 (Apply): ⊘ Skipped (waiting for user --apply flag)

**Safe Next Command**:
```bash
cd sveltekit-frontend && node scripts/atlas/parent-atlas-mutation-gate.mjs --apply
```

**Smoke Command**:
```bash
npm run atlas:smoke:graphify && npm run atlas:smoke:lineage
```

**Report Path**: `docs/reports/telemetry-2026-06-13.json`

**Do Not Do**:
- ❌ Skip Phase 4 dry-run validation
- ❌ Run --apply without prior dry-run PASS
- ❌ Modify DATABASE_URL or REDIS_PASSWORD in code
- ❌ Create new pipelines without consumer stages
- ❌ Upsert packets without feature_id and summary fields
- ❌ Use bare `execSync` to call Node scripts (use Bash tool)
```

## For OpenCode Agent Invocation

When invoked via `/atlas-smoke-validation`, agents receive:

1. **Current verification status** of the last Parent Atlas mutation
2. **Blockers** (if any phase failed)
3. **Next safe command** to proceed
4. **Anti-patterns** to avoid in this mutation lane

Example invocation:

```
/atlas-smoke-validation --latest

# Returns:
{
  "status": "PARTIAL",
  "phase": 5,
  "blocker": "ACE/KAG/DAG audit: 3 packets missing feature_id",
  "phase_6_ok": false,
  "smoke_blockers": ["Phase 4 dry-run did not complete"],
  "next_safe_command": "node scripts/atlas/backfill-feature-id.mjs --batch 100",
  "do_not_do": ["--apply without backfill", "Mutate atlas_packets directly via psql"]
}
```

## Integration with Parent Atlas Mutation Contract

The seven-phase pipeline **is** the Parent Atlas mutation contract. Every indexing script must output artifacts at each stage:

| Stage | Script | Artifact Path | Condition |
|-------|--------|---------------|-----------|
| 0 | `node --check <script>` | N/A | Must pass syntax |
| 1 | `<producer>.mjs` | `docs/reports/*.json` | Write-gated by file check |
| 2 | `JSON.parse()` | Implicit validation | Must be valid JSON |
| 3 | `<consumer>.mjs` | `docs/reports/*-dry-run.json` | Dry-run by default |
| 4 | `<consumer>.mjs --apply` | DB mutation | Gated by `--apply` flag |
| 5 | `verify-audit.mjs` | `docs/reports/*-verify.json` | Optional external audit |
| 6 | `npm run atlas:smoke:*` | Build artifacts | Parallel smoke checks |
| 7 | `parent-atlas-mutation-gate.mjs --apply` | Transaction summary | Atomic all-or-nothing |

## Usage Guidelines for Agents

1. **Always default to dry-run** — running consumers without `--apply` is safe by design
2. **Check artifact existence** before proceeding to next stage — missing artifacts halt the pipeline
3. **Validate JSON artifacts** manually if automation fails — use `jq '.' <file>` or similar
4. **Report blockers explicitly** — use the Telemetry format above, every time
5. **Never bypass Phase 4** — dry-run validation is non-negotiable
6. **Wait for Phase 7** — only orchestrator may call `--apply`, not individual scripts

## Example: Complete Validation Sequence

```bash
# Phase 0-2: Syntax validation (30 seconds)
node --check scripts/atlas/generate-parent-atlas-packets.mjs
node --check scripts/atlas/index-parent-atlas-packets.mjs

# Phase 1: Producer artifact (5 seconds)
node scripts/atlas/generate-parent-atlas-packets.mjs

# Phase 2: Artifact validation (1 second)
jq . docs/reports/parent-atlas-packets-manifest.json > /dev/null

# Phase 3: Consumer dry-run (10 seconds)
node scripts/atlas/index-parent-atlas-packets.mjs

# Phase 4: Orchestrator dry-run (15 seconds)
node scripts/atlas/parent-atlas-mutation-gate.mjs --verbose

# Phase 5: Lineage audit (20 seconds)
npm run atlas:smoke:lineage

# Phase 6: Smoke tests (45 seconds)
npm run build:check && npm run atlas:smoke:graphify

# Phase 7: Apply (if all pass — 5 seconds)
node scripts/atlas/parent-atlas-mutation-gate.mjs --apply
```

Total time: ~2-3 minutes for complete verification cycle before --apply.
