# Kanban Task Template

Copy and fill this template for each new task. Post in `.opencode/kanban/[task-id].md`.

```markdown
---
id: [feature-id]
title: [Short, present-tense action]
status: [backlog|ready|in-progress|blocked|review|done]
priority: [p0|p1|p2|p3]
effort: [1h|2h|4h|8h]
created: [YYYY-MM-DD]
started: [YYYY-MM-DD or null]
completed: [YYYY-MM-DD or null]
---

# [Title]

## Task Statement
[2-3 sentence problem statement: what are we building and why]

## Context
[Link to session, epic, or upstream task]
- Depends on: [list of blocking tasks or PRs]
- Relates to: [similar tasks]
- Reference: [docs/*, memory/*, AGENTS.md sections]

## Files Allowed
[List exact file paths that will change]
- `src/lib/server/telemetry/mcp-tool-telemetry.ts`
- `tests/telemetry/*.spec.ts`
- `docs/telemetry/*.md`
- **Explicitly disallowed**:
  - No changes to schema migrations
  - No changes to GPU worker code
  - No database schema changes

## Acceptance Criteria
- [ ] Original return shapes unchanged (no breaking changes)
- [ ] All tests pass (`npm run check`, `npm run test -- telemetry`)
- [ ] No console errors on `npm run dev`
- [ ] Telemetry signal confirmed (see TELEMETRY SIGNAL below)
- [ ] Commit message links to this task ID

## Expected Tests
```bash
# Lint + type check
npm run check

# Run telemetry tests only
npm run test -- telemetry

# Smoke test (optional, but recommended)
npm run smoke:hyperrag-packet-rpc
```

## Rollback
If anything goes wrong, revert cleanly:
```bash
git reset --hard origin/main
# Only run if cache is corrupted:
docker exec legal-ai-valkey redis-cli FLUSHDB
```

## Telemetry Signal
[Operational proof that this task worked]

**Query to run**:
```bash
curl -s http://localhost:5173/api/telemetry/implementation-clusters | jq '.clusters | length'
```

**Expected result**:
- Clusters found: `> 0`
- Success rate: `success_rate >= 0.95`
- Confidence: `confidence >= 0.8`

**What this means**: If you see these metrics, the task is genuinely working (not just "no errors").

## Implementation Notes
[Things you discovered while working]
- [Gotcha or surprise]
- [Decision point and why you chose this way]
- [Non-obvious dependency on another module]

## Time Log
- Started: [HH:MM]
- First test pass: [HH:MM]
- Telemetry signal confirmed: [HH:MM]
- Completed: [HH:MM]
- Total: [duration]
```

---

## How to Use This Template

1. **Copy the template** to `.opencode/kanban/[task-id].md`
   ```bash
   cp .opencode/kanban-task-template.md .opencode/kanban/telemetry-task-1-10.md
   ```

2. **Fill in the template** with your specific task details

3. **Update status** as you work:
   - `status: backlog` → `in-progress` → `review` → `done`

4. **Telemetry signal** is the most important field:
   - Before starting: write down what "success" looks like
   - After each commit: run the query and record the result
   - If metrics are wrong, the task isn't done (even if code compiles)

5. **Time log** helps estimate future tasks:
   - 1h fix: easy refactor or test addition
   - 4h task: moderate complexity, some coordination needed
   - 8h+ task: consider breaking into smaller Kanban cards

---

## Example: Task 1.10 Filled In

See `docs/OPENCODE-TOOL-CALLING-FIX-AND-WORKFLOW.md` for the full Task 1.10 example.

---

## Integration With OpenSpec

If using OpenSpec for this task:

1. Create OpenSpec change:
   ```bash
   openspec new change "telemetry-real-redis-wiring"
   ```

2. Link Kanban task ID to OpenSpec change:
   ```yaml
   # In .opencode/kanban/telemetry-task-1-10.md
   openspec-change: telemetry-real-redis-wiring
   ```

3. OpenCode can read both and sync progress:
   ```bash
   openspec status --change telemetry-real-redis-wiring
   ```

---

## Rules

- ✅ **One task, one `.md` file** — no combining multiple tasks into one card
- ✅ **Telemetry signal is mandatory** — "it compiled" is not done
- ✅ **Effort estimate upfront** — helps prioritize and avoid surprises
- ✅ **Files allowed list** — prevents scope creep and accidental refactors
- ❌ **No task without telemetry signal definition** — would be flying blind

