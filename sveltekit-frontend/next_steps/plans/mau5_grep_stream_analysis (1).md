# mau5-grep-stream-analysis.md — Atlas Smoke Review + Grep Stream Diagnostics

**Purpose:** Review the `npm run smoke:atlas` output, classify real failures vs environment skips, and define a grep/stream workflow for agentic Master Atlas diagnostics.

**Parent context:** `mau5.md` frames the CRM/agentic workflow atlas around user activity, evidence workflows, agent/MCP tool runs, patch proposals, Daily Activity Atlas summaries, and ACE/Gemma4 context injection.

---

## 1. Smoke Output Reviewed

Command:

```bash
npm run smoke:atlas
```

Observed summary:

```text
11/17 pass, 5 skip, 1 warn
→ logs/task-output/pipeline-test/smoke-atlas-latest.json
🩺 atlas smoke green
```

Important sections:

```text
P1.7 — atlas:prompt:smoke
  11 PASS

P1.8 — hypergraph.search regression
  5 SKIP because dev server unreachable

/api/ace/recommendations HTTP
  1 WARN because dev server unreachable
```

---

## 2. Encoding Artifact

The output contains characters like:

```text
ΓÇö
ΓëÑ
ΓåÆ
```

These are mojibake artifacts from UTF-8 text rendered through the wrong Windows codepage.

Likely intended characters:

```text
ΓÇö  → —
ΓëÑ  → ≥
ΓåÆ  → →
```

This is not an application failure.

### Fix options

PowerShell:

```powershell
chcp 65001
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8
```

Node scripts:

```js
process.stdout.write('text', 'utf8');
```

Package scripts can avoid Unicode symbols in smoke output if logs must stay Windows-safe.

Recommended change:

```text
Use ASCII-only smoke labels:
PASS context_for_file responds -- OK
provenance.sources lists >=1 origin
-> logs/task-output/pipeline-test/smoke-atlas-latest.json
```

---

## 3. Status Classification

### P1.7 atlas prompt smoke

Status:

```text
GREEN
```

Reason:

```text
context_for_file responds
file path normalization works
directory shape complete
file rank shape valid
promptCards present
recommendedActions present
provenance points to Redis
sources list atlas/dir-card/karpathy/peers
hitDemand correctly cold
```

This proves the atlas prompt context path is working from cached atlas data.

---

### P1.8 hypergraph.search regression

Status:

```text
SKIPPED / ENVIRONMENT BLOCKED
```

Reason:

```text
dev server unreachable
```

This is not a retrieval regression. It means the smoke script could not reach the SvelteKit dev server.

Expected fix:

```text
Start dev server before smoke, or mark these checks as "requires dev server".
```

Commands:

```powershell
npm run dev
npm run smoke:atlas
```

Or detached:

```powershell
npm run dev:detached
npm run smoke:atlas
```

---

### /api/ace/recommendations HTTP

Status:

```text
WARN / ENVIRONMENT BLOCKED
```

Reason:

```text
dev server unreachable: fetch failed
```

This does not prove `/api/ace/recommendations` is broken. It only proves the HTTP target was down.

Expected fix:

```text
Start SvelteKit dev server and rerun.
```

---

## 4. Important Correction

The script printed:

```text
🩺 atlas smoke green
```

But the strict status should be:

```text
DEGRADED GREEN
```

Because:

```text
11 checks passed
5 checks skipped due environment
1 HTTP check warned due environment
0 hard failures
```

Recommended smoke status taxonomy:

```text
GREEN
  all required checks pass, no warnings, no skips

DEGRADED_GREEN
  required offline checks pass, online/dev-server checks skipped or warned

YELLOW
  non-critical assertions failed, core still works

RED
  required core assertion failed
```

For this output:

```text
DEGRADED_GREEN
```

---

## 5. Required Script Enhancement

Update `scripts/smoke-atlas-context.mjs` to emit structured status:

```json
{
  "status": "DEGRADED_GREEN",
  "passed": 11,
  "skipped": 5,
  "warned": 1,
  "failed": 0,
  "devServerReachable": false,
  "offlineAtlasContext": true,
  "httpChecks": "skipped",
  "logPath": "logs/task-output/pipeline-test/smoke-atlas-latest.json"
}
```

Recommended rule:

```text
if failed > 0:
  status = RED
else if warned > 0 or skipped > 0:
  status = DEGRADED_GREEN
else:
  status = GREEN
```

---

## 6. Grep Stream Diagnostics

The goal is to create a live diagnostic flow that agents can use to inspect logs, smoke output, and code paths without guessing.

### One-shot grep

```bash
rg -n --glob '!node_modules' --glob '!*.map'   "smoke:atlas|context_for_file|hypergraph.search|ace/recommendations|dev server unreachable|fetch failed|provenance|promptCards|recommendedActions"   scripts src docs logs tests
```

### Log-focused grep

```bash
rg -n   "PASS|FAIL|WARN|SKIP|dev server unreachable|fetch failed|DEGRADED|atlas smoke"   logs/task-output/pipeline-test
```

### Watch latest smoke file

PowerShell:

```powershell
Get-Content logs/task-output/pipeline-test/smoke-atlas-latest.json -Wait
```

Git Bash:

```bash
tail -f logs/task-output/pipeline-test/smoke-atlas-latest.json
```

### Stream smoke and tee log

PowerShell:

```powershell
npm run smoke:atlas 2>&1 | Tee-Object -FilePath logs/task-output/pipeline-test/smoke-atlas-stream.log
```

Git Bash:

```bash
npm run smoke:atlas 2>&1 | tee logs/task-output/pipeline-test/smoke-atlas-stream.log
```

Then grep:

```bash
rg -n "PASS|FAIL|WARN|SKIP|fetch failed|unreachable" logs/task-output/pipeline-test/smoke-atlas-stream.log
```

---

## 7. Agentic Workflow Awareness

Every smoke run should write an agent workflow event.

Event:

```json
{
  "event_type": "smoke_run",
  "target_type": "atlas",
  "target_id": "smoke:atlas",
  "status": "DEGRADED_GREEN",
  "metadata": {
    "passed": 11,
    "skipped": 5,
    "warned": 1,
    "failed": 0,
    "devServerReachable": false,
    "logPath": "logs/task-output/pipeline-test/smoke-atlas-latest.json"
  }
}
```

Store in:

```text
agent_workflow_events
```

Also update:

```text
daily_activity_atlas
```

Daily summary example:

```text
Atlas smoke passed offline context checks, but dev-server-backed hypergraph and ACE recommendations checks were skipped/warned because the SvelteKit dev server was unreachable.
```

---

## 8. ACE/Gemma4 Context Injection

When the user later asks:

```text
why is atlas smoke green but recommendations failed?
```

ACE should retrieve:

```text
smoke-atlas-latest.json
agent_workflow_events smoke_run event
Daily Activity Atlas summary
dev-server health status
related routes:
  /api/ace/recommendations
  hypergraph.search
```

Gemma4 should answer:

```text
The atlas context path is healthy.
The HTTP checks were not executed because the dev server was unreachable.
Start the dev server and rerun the smoke to test hypergraph.search and /api/ace/recommendations.
```

---

## 9. Recommended Fix Order

### Step 1 — Improve smoke status wording

```text
[ ] Change "atlas smoke green" to strict status taxonomy.
[ ] Emit GREEN / DEGRADED_GREEN / YELLOW / RED.
[ ] Include failed/skipped/warned counts.
```

### Step 2 — Add dev server preflight

```text
[ ] Check dev server before HTTP checks.
[ ] If unreachable, mark HTTP checks as environment skipped.
[ ] Print exact command to run.
```

Example:

```text
Dev server unreachable.
Run:
  npm run dev
Then rerun:
  npm run smoke:atlas
```

### Step 3 — Add JSON event output

```text
[ ] Write logs/task-output/pipeline-test/smoke-atlas-latest.json.
[ ] Include strict status.
[ ] Include devServerReachable.
[ ] Include recommendedNextActions.
```

### Step 4 — Log workflow event

```text
[ ] Insert agent_workflow_events row for smoke run.
[ ] Include status and log path.
[ ] Fail open if DB unavailable.
```

### Step 5 — Add grep stream helper

```text
[ ] Add scripts/diagnostics/grep-smoke-atlas.mjs
[ ] Add package script: smoke:atlas:grep
[ ] Search recent logs for PASS/FAIL/WARN/SKIP/fetch failed/unreachable.
```

---

## 10. Package Scripts

Add:

```json
{
  "scripts": {
    "smoke:atlas:stream": "npm run smoke:atlas 2>&1 | tee logs/task-output/pipeline-test/smoke-atlas-stream.log",
    "smoke:atlas:grep": "rg -n "PASS|FAIL|WARN|SKIP|fetch failed|unreachable|DEGRADED|atlas smoke" logs/task-output/pipeline-test"
  }
}
```

On Windows PowerShell, use a Node helper instead of shell pipes if needed.

---

## 11. Node Helper: grep-smoke-atlas.mjs

Create:

```text
scripts/diagnostics/grep-smoke-atlas.mjs
```

Behavior:

```text
read logs/task-output/pipeline-test/smoke-atlas-latest.json
read logs/task-output/pipeline-test/smoke-atlas-stream.log if present
extract:
  PASS lines
  FAIL lines
  WARN lines
  SKIP lines
  fetch failed
  dev server unreachable
emit compact report
```

Output:

```json
{
  "status": "DEGRADED_GREEN",
  "counts": {
    "pass": 11,
    "skip": 5,
    "warn": 1,
    "fail": 0
  },
  "environment": {
    "devServerReachable": false
  },
  "nextActions": [
    "Start npm run dev.",
    "Rerun npm run smoke:atlas.",
    "If /api/ace/recommendations still warns, inspect route."
  ]
}
```

---

## 12. Error Review Summary

Current smoke result is acceptable for offline atlas context.

It is not a full end-to-end green because HTTP checks were skipped/warned.

### Real pass

```text
P1.7 atlas:prompt:smoke
```

### Environment blocked

```text
P1.8 hypergraph.search regression
/api/ace/recommendations HTTP
```

### Not a failure

```text
Unicode mojibake in terminal output
```

### Next real verification

```bash
npm run dev
npm run smoke:atlas
```

Expected if everything is healthy:

```text
17/17 pass, 0 skip, 0 warn
status = GREEN
```

---

## 13. Claude Code Prompt

```text
You are working in:
C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Task:
Improve atlas smoke diagnostics and grep stream analysis.

Context:
Current npm run smoke:atlas produced 11/17 pass, 5 skip, 1 warn.
All skips/warnings were caused by dev server unreachable.
Offline atlas context checks passed.

Implement:
1. Add strict status taxonomy:
   GREEN, DEGRADED_GREEN, YELLOW, RED.
2. Add dev server preflight.
3. Mark HTTP checks as environment-skipped if dev server is unreachable.
4. Emit structured JSON with:
   status, passed, skipped, warned, failed, devServerReachable, recommendedNextActions.
5. Add scripts/diagnostics/grep-smoke-atlas.mjs.
6. Add package script smoke:atlas:grep.
7. Optionally record agent_workflow_events smoke_run event fail-open.

Rules:
- Do not run drizzle push.
- Do not mutate Qdrant/Neo4j.
- Do not change identity strategy.
- Do not expose raw apply_patch.
- Keep diagnostics fail-open.
```

---

## 14. Final Recommendation

Treat the current smoke as:

```text
DEGRADED_GREEN
```

Meaning:

```text
Core offline atlas prompt context is healthy.
Dev-server-backed HTTP checks were not exercised.
Start the dev server and rerun to verify hypergraph.search and /api/ace/recommendations.
```

Build the grep stream helper next so agentic workflows can summarize smoke logs, classify failures, and inject clear next actions into the Daily Activity Atlas.
