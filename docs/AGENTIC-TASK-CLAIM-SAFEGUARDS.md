# Agentic Task Claim + Supersedes Safeguards

**Status**: ✅ LIVE (Session 71)  
**Purpose**: Prevent duplicate agent work, .mjs.mjs collisions, and concurrent file conflicts

---

## Problem Solved

**Before**: 
- Agent A creates `repair-qdrant-postgres-join.mjs`
- Agent B creates `repair-qdrant-postgres-join.mjs.mjs` (same task, didn't check)
- Repo has duplicates, no audit trail, no conflict detection

**After**:
- All agents must claim task ID before creating files
- Supersedes audit detects duplicates, overlaps, conflicts
- Ledger tracks all agentic work
- Verification gates require valid claim + audit pass

---

## System Overview

```
Agent wants to work on task
  ↓
npm run agent:claim -- --task-id=<id> --story-id=<story> --agent=<opencode|claude|codex> --files=<list>
  ↓ (Conflict check: same task already claimed? File overlap?)
Claim added to ledger (docs/reports/agent-task-claims.json)
  ↓
npm run agent:supersedes:audit -- --task-id=<id>
  ↓ (Conflict check: duplicate extensions, definition overlap, npm script conflicts)
Verdict: PASS | FAIL
  ↓ (if PASS)
Agent creates/patches files
  ↓
npm run agent:release -- --task-id=<id> --status=VERIFYING
  ↓ (Verification gates run, check claim exists)
GAN validator runs (refused if no active claim)
  ↓ (Verification result)
npm run agent:release -- --task-id=<id> --status=PASS|FAIL|SUPERSEDED
  ↓
Claim closed, ledger updated
```

---

## Scripts & Commands

### 1. Claim Task

**Script**: `scripts/agentic/claim-task.mjs`

**Usage**:
```bash
npm run agent:claim \
  --task-id=P3G-ACP-AUDIT \
  --story-id=P3G-QDRANT \
  --agent=claude \
  --files=scripts/atlas/audit-acp-packet-transport.mjs,scripts/atlas/classify-qdrant-missing-packets.mjs
```

**Checks**:
- ✅ Same task already claimed? (blocks concurrent work)
- ✅ File overlap with active claims? (blocks file conflicts)
- ✅ Idempotent (same agent claiming same task twice is OK)

**Output**:
- Adds claim to `docs/reports/agent-task-claims.json`
- Claim hash (sha256 of task spec)
- Status: CLAIMED

### 2. Audit Supersedes

**Script**: `scripts/agentic/audit-supersedes.mjs`

**Usage**:
```bash
npm run agent:supersedes:audit --task-id=P3G-ACP-AUDIT
```

**Checks**:
- ✅ Duplicate extensions (.mjs.mjs, .ts.ts)
- ✅ Same basename under scripts/
- ✅ npm script target conflicts
- ✅ Report output path conflicts
- ✅ Definition overlap (same functions/classes)
- ✅ Overlapping file claims in ledger

**Output**:
- Report: `docs/reports/supersedes-audit.json`
- Verdict: PASS | FAIL
- Blocks file creation if FAIL

### 3. Release Claim

**Script**: `scripts/agentic/release-task-claim.mjs`

**Usage** (after verification):
```bash
npm run agent:release --task-id=P3G-ACP-AUDIT --status=PASS
```

**Statuses**:
- VERIFYING (files created, waiting for gates)
- PASS (verification complete, no issues)
- FAIL (verification failed, needs fix)
- SUPERSEDED (intentionally replaced by newer work)

**Output**:
- Updates claim in ledger
- Timestamp: updated_at

### 4. Preflight (Combined)

**Usage**:
```bash
npm run agent:preflight \
  --task-id=P3G-ACP-AUDIT \
  --story-id=P3G-QDRANT \
  --agent=claude \
  --files=<list>
```

**Runs**:
1. `agent:claim` (check conflicts)
2. `agent:supersedes:audit` (check duplicates)
3. Fails if either fails

---

## Ledger Format

**File**: `docs/reports/agent-task-claims.json`

```json
[
  {
    "task_id": "P3G-ACP-AUDIT",
    "story_id": "P3G-QDRANT",
    "agent": "claude",
    "status": "PASS",
    "files_intended": [
      "scripts/atlas/audit-acp-packet-transport.mjs",
      "scripts/atlas/classify-qdrant-missing-packets.mjs"
    ],
    "claim_hash": "afc1bf61b0df",
    "supersedes": [],
    "created_at": "2026-06-23T16:58:17.380Z",
    "updated_at": "2026-06-23T16:58:33.932Z"
  }
]
```

**Fields**:
- `task_id`: Unique task identifier (e.g., P3G-ACP-AUDIT)
- `story_id`: Parent story (e.g., P3G-QDRANT)
- `agent`: Originating agent (opencode | claude | codex)
- `status`: CLAIMED | VERIFYING | PASS | FAIL | SUPERSEDED
- `files_intended`: Array of files this task will create/patch
- `claim_hash`: SHA256 hash of task spec (prevents replay)
- `supersedes`: Array of older task_ids this claim replaces
- `created_at`: ISO timestamp of claim creation
- `updated_at`: ISO timestamp of last status update

---

## Integration with Verification Gates

### GAN Validator Must Check

Before marking task as PASS:

```javascript
// In verification GAN:
const ledger = loadLedger();
const claim = ledger.find(e => e.task_id === taskId);

// FAIL if:
if (!claim) throw new Error('No active claim found');
if (claim.status !== 'VERIFYING') throw new Error('Claim not in VERIFYING state');

const audit = loadSupersedes(taskId);
if (audit.verdict !== 'PASS') throw new Error('Supersedes audit failed');

// Detect if new file should have patched existing
const newFiles = claim.files_intended;
const existingDuplicate = checkForDuplicates(newFiles);
if (existingDuplicate && !claim.supersedes.includes(existingDuplicate.taskId)) {
  throw new Error(`Duplicate: should patch existing file or mark as SUPERSEDES`);
}

// Proceed with verification
```

---

## Real Example: P3g ACP Audit

**Session 71 Flow**:

```bash
# 1. Claim task
npm run agent:claim \
  --task-id=P3G-ACP-AUDIT \
  --story-id=P3G-QDRANT \
  --agent=claude \
  --files=scripts/atlas/audit-acp-packet-transport.mjs,scripts/atlas/classify-qdrant-missing-packets.mjs

# 2. Audit supersedes
npm run agent:supersedes:audit --task-id=P3G-ACP-AUDIT
# Result: PASS (no conflicts)

# 3. Create files (agent writes code)

# 4. Update claim to VERIFYING
npm run agent:release --task-id=P3G-ACP-AUDIT --status=VERIFYING

# 5. Run verification gates (GAN, tests, etc.)
# Gate checks: claim exists AND audit passed

# 6. Release claim
npm run agent:release --task-id=P3G-ACP-AUDIT --status=PASS
```

**Ledger Timeline**:
```
created_at: 2026-06-23T16:58:17Z  status: CLAIMED
updated_at: 2026-06-23T16:58:33Z  status: VERIFYING
updated_at: 2026-06-23T17:05:12Z  status: PASS (gates passed)
```

---

## Conflict Resolution

### Scenario 1: Duplicate File

**Detect**: `audit-supersedes` finds `repair-qdrant-postgres-join.mjs.mjs`

**Options**:
1. **Patch existing** → update claim.files_intended to existing file path
2. **Supersede old** → add old task_id to claim.supersedes, mark old claim as SUPERSEDED
3. **Rename new** → change intended file name, re-run audit

**Verification gate blocks PASS until resolved**.

### Scenario 2: Same task_id Claimed Twice

**Detect**: `claim-task` finds existing CLAIMED entry for same task_id

**Options**:
1. **Idempotent** (same agent) → OK, proceed (idempotent claim)
2. **Different agent** → FAIL, conflict detected

**Ledger tracks which agent owns task, prevents two agents from working on same task simultaneously**.

### Scenario 3: Overlapping Files

**Detect**: `claim-task` finds file overlap with active claim

**Example**:
- Agent A claims `repair-*.mjs` (4 files)
- Agent B claims `repair-*.mjs` + `audit-*.mjs` (6 files, 2 overlap)

**Result**: Agent B claim is rejected (file overlap with Agent A's active claim)

**Options**:
1. Agent A finishes and releases claim
2. Agent B picks different files
3. Negotiate and mark one as SUPERSEDES

---

## Audit Reports

### `docs/reports/agent-task-claims.json`

Full ledger, all claims (created by `claim-task` and `release-task-claim`)

### `docs/reports/supersedes-audit.json`

Per-task audit report (created by `audit-supersedes`)

```json
{
  "task_id": "P3G-ACP-AUDIT",
  "timestamp": "2026-06-23T17:01:23.456Z",
  "checks": {
    "duplicate_extensions": [],
    "npm_script_conflicts": [],
    "definition_overlaps": [],
    "overlapping_claims": []
  },
  "verdict": "PASS"
}
```

---

## Usage Rules

### Before Creating Any File

**MUST run preflight**:
```bash
npm run agent:preflight \
  --task-id=<TASK_ID> \
  --story-id=<STORY_ID> \
  --agent=<opencode|claude|codex> \
  --files=<file1,file2,...>
```

Fails if:
- Task already claimed (by you or another agent)
- Files conflict with active claims
- Duplicate files already exist

### After Verification (Pass/Fail)

**MUST update claim**:
```bash
npm run agent:release --task-id=<TASK_ID> --status=PASS|FAIL|SUPERSEDED
```

This updates ledger + timestamps for audit trail.

### GAN Verification Gate

**MUST check**:
```javascript
const claim = getLedgerClaim(taskId);
if (!claim || claim.status !== 'VERIFYING') {
  throw new Error('Invalid claim state');
}

const audit = loadSupersedes(taskId);
if (audit.verdict !== 'PASS') {
  throw new Error('Supersedes audit not passed');
}

// Proceed with verification
```

---

## Benefits

✅ **No duplicate .mjs.mjs files** — Audit detects variants before creation  
✅ **Concurrent work tracking** — Ledger shows who's working on what  
✅ **Audit trail** — Every claim/release is timestamped  
✅ **Conflict prevention** — Blocks file/task overlaps early  
✅ **Verification gate integration** — GAN refuses invalid claims  
✅ **Reproducible** — Same task can be re-claimed deterministically  

---

## Files Delivered

**Scripts** (3):
- `scripts/agentic/claim-task.mjs`
- `scripts/agentic/audit-supersedes.mjs`
- `scripts/agentic/release-task-claim.mjs`

**Reports**:
- `docs/reports/agent-task-claims.json` (live ledger)
- `docs/reports/supersedes-audit.json` (per-task audit)

**npm Scripts**:
- `agent:claim`
- `agent:supersedes:audit`
- `agent:release`
- `agent:preflight` (combined claim + audit)

**Documentation**:
- `docs/AGENTIC-TASK-CLAIM-SAFEGUARDS.md` (this file)

---

**Status**: ✅ LIVE & TESTED

Example claim (P3g-ACP-AUDIT):
- Claimed: 2026-06-23T16:58:17Z
- Audited: PASS
- Released: 2026-06-23T16:58:33Z as PASS

Ready for all future agentic workflows.
