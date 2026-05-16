# useranalytics.md — UI, Agent Workflow, and Daily Atlas TODO

**Goal:** Add safe user analytics, transcription/evidence interaction tracking, VS Code/agent workflow notes, and a date-indexed Daily Atlas that helps ACE/Gemma4 recover context without treating analytics as canonical truth.

**Interpretation of the request:** This file combines four related ideas:

1. `apply_patch` for DOM/code insertions  
2. `user.analytics` for behavior and transcription tracking  
3. VS Code / Hermes / Claude / MCP agentic workflow notes  
4. Daily activity atlas indexed by date for contextual recall  

---

## 0. Core Decision

Use analytics as **context signals**, not source-of-truth.

```text
Source of truth:
  code
  tests
  DB introspection
  migrations
  evidence files
  operator-approved changes

Context signals:
  UI events
  transcript clicks
  frame opens
  searches
  workflow steps
  agent runs
  patch proposals
  daily summaries
```

Analytics should help answer:

```text
What was the user doing?
Which evidence was important?
Which files/features were hot?
Which workflow failed?
Which recommendations were accepted?
What should ACE/Gemma4 preload next?
```

Analytics should not decide:

```text
whether evidence is true
whether code is correct
whether a patch should be applied
whether schema migration is safe
whether user identity strategy changes
```

---

## 1. Guardrails

- [ ] Do not track secrets.
- [ ] Do not track passwords.
- [ ] Do not track raw private evidence text by default.
- [ ] Do not store hidden reasoning.
- [ ] Do not expose raw `apply_patch` to Gemma4, Hermes, or untrusted tools.
- [ ] Do not let analytics block UI interactions.
- [ ] Do not use Redis as the source of truth.
- [ ] Do not let Daily Atlas summaries override code/tests/DB truth.
- [ ] Do not auto-apply patches from analytics.
- [ ] Do not log full transcript or OCR text unless explicitly enabled.
- [ ] Store IDs, hashes, timestamps, route names, status, and compact metadata.

---

## 2. Lane A — DOM / UI Analytics

### Purpose

Track user behavior in the SvelteKit UI so the system can understand which panels, evidence items, routes, and actions matter.

### Events to track

```text
page_view
button_click
upload_started
upload_completed
upload_failed
tab_opened
search_submitted
result_clicked
timeline_scrubbed
transcript_segment_opened
frame_opened
wiki_page_opened
ace_answer_copied
feedback_thumbs_up
feedback_thumbs_down
```

### Do not track

```text
passwords
raw private evidence text
full transcript contents
hidden reasoning
secrets
file bytes
```

---

## 3. Postgres Table: user_activity_events

```sql
CREATE TABLE IF NOT EXISTS user_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  session_id text,
  event_type text NOT NULL,
  route text,
  target_type text,
  target_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz DEFAULT now()
);
```

### Example event

```json
{
  "event_type": "button_click",
  "route": "/admin/evidence-ingestion",
  "target_type": "button",
  "target_id": "upload-video",
  "metadata": {
    "workflow_id": "wf_123",
    "label": "Upload Video"
  }
}
```

---

## 4. SvelteKit Endpoint

### Route

```text
POST /api/analytics/event
```

### Files

```text
src/routes/api/analytics/event/+server.ts
src/lib/server/analytics/user-activity-service.ts
src/lib/client/analytics/track-ui-event.ts
```

### Endpoint behavior

- [ ] Validate payload with Zod.
- [ ] Strip secrets from metadata.
- [ ] Store event in Postgres.
- [ ] Fail open if analytics storage fails.
- [ ] Return `{ ok: true }` quickly.
- [ ] Never block the UI.

---

## 5. Client Helper

```ts
export async function trackUiEvent(event: {
  event_type: string;
  route?: string;
  target_type?: string;
  target_id?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true
    });
  } catch {
    // fail open
  }
}
```

### Example button usage

```svelte
<button
  type="button"
  on:click={async () => {
    await trackUiEvent({
      event_type: 'button_click',
      route: $page.url.pathname,
      target_type: 'button',
      target_id: 'upload-video'
    });

    await startUpload();
  }}
>
  Upload video
</button>
```

---

## 6. Lane B — Upload and Button Reliability

Buttons sometimes do not work and uploads sometimes fail. Analytics should help diagnose that.

### Button standards

- [ ] Every non-submit button uses `type="button"`.
- [ ] Submit buttons have visible loading state.
- [ ] Upload button disables while request is in flight.
- [ ] Errors render inline.
- [ ] Success state is visible.
- [ ] Buttons have `data-testid`.
- [ ] Failed click handlers log an event.
- [ ] Modal does not close before upload success.

### Upload standards

- [ ] Validate file type client-side.
- [ ] Validate file size client-side.
- [ ] Validate file type server-side.
- [ ] Validate file size server-side.
- [ ] Use `FormData`.
- [ ] Return durable `evidence_id` immediately after registration.
- [ ] Queue processing job after file registration.
- [ ] Show queued workflow card immediately.
- [ ] Invalidate evidence list after success.
- [ ] Show failed upload error message.
- [ ] Log `upload_started`, `upload_completed`, or `upload_failed`.

### Playwright tests

```text
tests/evidence-upload.spec.ts
tests/evidence-buttons.spec.ts
tests/evidence-workflow-tracker.spec.ts
```

Test cases:

- [ ] Upload valid file shows queued card.
- [ ] Upload invalid type shows error.
- [ ] Upload too-large file shows error.
- [ ] Upload button disables while uploading.
- [ ] Card list refreshes after success.
- [ ] Retry button calls failed-step API.
- [ ] Cancel button marks workflow cancelled.
- [ ] Button click does not accidentally submit parent form.

---

## 7. Lane C — Transcription and Evidence Interaction Analytics

### Events to track

```text
transcript_opened
transcript_segment_clicked
transcript_corrected
transcript_exported
frame_opened
frame_caption_corrected
ocr_text_corrected
timeline_range_selected
evidence_search_submitted
evidence_result_opened
```

### Example transcript event

```json
{
  "event_type": "transcript_segment_clicked",
  "target_type": "transcript_segment",
  "target_id": "seg_120000_145000",
  "metadata": {
    "evidence_id": "ev_123",
    "start_ms": 120000,
    "end_ms": 145000
  }
}
```

### What this enables

```text
hot transcript segments
important frames
frequently opened evidence
searches that lead to clicks
which OCR/transcript corrections matter
which evidence appears in accepted answers
```

---

## 8. Lane D — VS Code / Agentic Workflow Tracking

Track workflow events from Claude Code, Hermes, MCP tools, local scripts, smoke tests, and VS Code tasks.

### Table: agent_workflow_events

```sql
CREATE TABLE IF NOT EXISTS agent_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text,
  agent_name text,
  event_type text NOT NULL,
  source text,
  target_path text,
  tool_name text,
  status text,
  metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz DEFAULT now()
);
```

### Events

```text
agent_task_started
agent_task_completed
file_read
file_written
test_run
test_passed
test_failed
patch_proposed
patch_applied_operator_approved
mcp_tool_called
smoke_passed
smoke_failed
commit_created
```

### TODO

- [ ] Add `agent_workflow_events` table.
- [ ] Add service: `src/lib/server/analytics/agent-workflow-service.ts`.
- [ ] Add helper: `recordAgentWorkflowEvent()`.
- [ ] Log MCP tool calls.
- [ ] Log tests and smokes.
- [ ] Log file read/write events from safe wrappers.
- [ ] Log patch proposals.
- [ ] Log operator-approved patch applications.
- [ ] Add workflow timeline UI.

---

## 9. apply_patch / Patch Proposal Safety

Do **not** expose raw `apply_patch` directly to Gemma4, Hermes, or external subagents.

Use proposal flow:

```text
LLM proposes patch
  → patch stored as proposal
  → tests/smokes are suggested
  → operator reviews
  → operator approves
  → patch applied
  → result logged
```

### Table: patch_proposals

```sql
CREATE TABLE IF NOT EXISTS patch_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text,
  title text,
  target_files jsonb,
  patch_unified_diff text,
  rationale text,
  status text DEFAULT 'proposed',
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  applied_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);
```

### Status values

```text
proposed
approved
rejected
applied
failed
superseded
```

### TODO

- [ ] Add patch proposal table.
- [ ] Add route: `POST /api/agent/patch-proposals`.
- [ ] Add route: `POST /api/agent/patch-proposals/[id]/approve`.
- [ ] Add route: `POST /api/agent/patch-proposals/[id]/reject`.
- [ ] Add UI panel for patch proposal review.
- [ ] Add event log for approval/rejection/application.
- [ ] Add tests ensuring raw patch application is operator-gated.

---

## 10. Lane E — Daily Activity Atlas

Build a date-indexed context layer from UI events, agent events, ACE retrieval runs, patch proposals, workflow runs, and feedback.

### Table: daily_activity_atlas

```sql
CREATE TABLE IF NOT EXISTS daily_activity_atlas (
  activity_date date PRIMARY KEY,
  summary text,
  feature_keys jsonb DEFAULT '[]'::jsonb,
  hot_files jsonb DEFAULT '[]'::jsonb,
  hot_routes jsonb DEFAULT '[]'::jsonb,
  hot_evidence jsonb DEFAULT '[]'::jsonb,
  agent_runs jsonb DEFAULT '[]'::jsonb,
  recommendations jsonb DEFAULT '[]'::jsonb,
  qdrant_point_ids jsonb DEFAULT '[]'::jsonb,
  neo4j_node_ids jsonb DEFAULT '[]'::jsonb,
  redis_keys jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);
```

### Redis keys

```text
atlas:daily:{YYYY-MM-DD}
atlas:daily:latest
```

### Qdrant collection

```text
daily_activity_summaries
```

### Neo4j graph

```text
(:DailyAtlas {date})
(:DailyAtlas)-[:TOUCHED]->(:File)
(:DailyAtlas)-[:MENTIONED]->(:Feature)
(:DailyAtlas)-[:OPENED]->(:Evidence)
(:DailyAtlas)-[:PRODUCED]->(:Recommendation)
```

---

## 11. Daily Atlas Builder

### Script

```text
scripts/atlas/build-daily-activity.mjs
```

### Pipeline

```text
user_activity_events
agent_workflow_events
ace_retrieval_runs
recommendation_events
patch_proposals
workflow_runs

  ↓ aggregate by date

Gemma4 summarizer

  ↓

daily_activity_atlas row
Qdrant embedding
Neo4j DailyAtlas edges
Redis hot cache
```

### TODO

- [ ] Add script `scripts/atlas/build-daily-activity.mjs`.
- [ ] Aggregate UI events by date.
- [ ] Aggregate agent workflow events by date.
- [ ] Aggregate ACE retrieval runs by date.
- [ ] Aggregate recommendations by date.
- [ ] Aggregate patch proposals by date.
- [ ] Summarize with Gemma4.
- [ ] Store daily summary in Postgres.
- [ ] Embed daily summary into Qdrant.
- [ ] Add DailyAtlas nodes/edges in Neo4j.
- [ ] Cache `atlas:daily:{date}` in Redis.
- [ ] Add package script `atlas:daily`.

---

## 12. ACE / Gemma4 Context Injection

### Goal

Let ACE/Gemma4 answer questions like:

```text
What were we doing yesterday?
Continue the video evidence pipeline.
Why did uploads fail?
What did the agents change?
What should I work on next?
```

### Context packet

```json
{
  "date": "2026-05-13",
  "summary": "Worked on ACE context cache, TurboVec sidecar, video evidence ingestion, and UI upload reliability.",
  "hot_features": [
    "evidence.video_ingest",
    "cache.bitfrost",
    "retrieval.turbovec_sidecar"
  ],
  "hot_files": [
    "src/lib/server/ace/llm-context-cache.ts",
    "src/lib/server/vector/turbovec-client.ts"
  ],
  "recommendations": [
    "Do transcript-first ingestion before frame VLM.",
    "Keep Qdrant canonical and TurboVec sidecar."
  ]
}
```

### TODO

- [ ] Add `getDailyAtlasContextForQuery(query, dateRange)`.
- [ ] Retrieve recent daily atlas summaries.
- [ ] Merge with FeatureMap/Wiki/KAG context.
- [ ] Inject into ACE packet.
- [ ] Add cache key identity field `dailyAtlasHash`.
- [ ] Add Langfuse trace span `atlas.daily_context`.
- [ ] Add tests for date-range retrieval.
- [ ] Add tests for cache key change when daily atlas changes.

---

## 13. SvelteKit UI

### Routes

```text
/admin/analytics
/admin/workflows
/admin/daily-atlas
/admin/agent-patches
/admin/evidence-ingestion
```

### Components

```text
AnalyticsEventTable.svelte
AgentWorkflowTimeline.svelte
DailyAtlasSummary.svelte
PatchProposalReview.svelte
UploadReliabilityPanel.svelte
EvidenceHotspotsPanel.svelte
TranscriptInteractionPanel.svelte
```

### TODO

- [ ] Add analytics route.
- [ ] Add workflow timeline route.
- [ ] Add Daily Atlas route.
- [ ] Add patch proposal review route.
- [ ] Add evidence hotspots panel.
- [ ] Add upload reliability panel.
- [ ] Add transcript interaction panel.

---

## 14. Privacy / Redaction

### Redact metadata keys

```text
password
token
secret
api_key
authorization
cookie
raw_text
full_transcript
file_bytes
hidden_reasoning
```

### TODO

- [ ] Add metadata redaction helper.
- [ ] Add tests for redaction.
- [ ] Add allowlist mode for production.
- [ ] Add admin toggle for detailed local-only debug logs.
- [ ] Store hashes instead of raw text where possible.

---

## 15. Langfuse / Observability

### Trace spans

```text
ui.event
upload.start
upload.complete
upload.fail
workflow.step
agent.tool_call
patch.proposed
patch.applied
atlas.daily_build
ace.daily_context
```

### TODO

- [ ] Add fail-open Langfuse wrapper.
- [ ] Add trace IDs to UI events.
- [ ] Link workflow events to traces.
- [ ] Link ACE retrieval runs to Daily Atlas.
- [ ] Mirror important scores into Postgres.
- [ ] Do not log hidden reasoning or raw evidence text by default.

---

## 16. Tests

### Unit tests

```text
tests/unit/user-activity-service.test.ts
tests/unit/agent-workflow-service.test.ts
tests/unit/daily-atlas-builder.test.ts
tests/unit/redact-analytics-metadata.test.ts
```

### Playwright tests

```text
tests/evidence-upload.spec.ts
tests/evidence-buttons.spec.ts
tests/daily-atlas-ui.spec.ts
tests/patch-proposal-review.spec.ts
```

### Smoke scripts

```text
scripts/smoke-user-analytics.mjs
scripts/smoke-daily-atlas.mjs
scripts/smoke-agent-workflow-events.mjs
```

---

## 17. Package Scripts

```json
{
  "scripts": {
    "analytics:smoke": "node scripts/smoke-user-analytics.mjs",
    "atlas:daily": "node scripts/atlas/build-daily-activity.mjs",
    "atlas:daily:smoke": "node scripts/smoke-daily-atlas.mjs",
    "agent:workflow:smoke": "node scripts/smoke-agent-workflow-events.mjs"
  }
}
```

---

## 18. Commit Sequence

### Commit 1

```text
docs(analytics): add user analytics and daily atlas plan
```

### Commit 2

```text
feat(analytics): add UI event tracking endpoint
```

### Commit 3

```text
fix(ui): harden upload buttons and analytics events
```

### Commit 4

```text
feat(agent): add workflow event and patch proposal ledger
```

### Commit 5

```text
feat(atlas): add daily activity atlas summarizer
```

### Commit 6

```text
feat(ace): inject daily atlas context into retrieval packets
```

---

## 19. Final Recommendation

Implement in this order:

```text
1. UI analytics endpoint
2. Upload/button reliability events
3. Agent workflow events
4. Patch proposal ledger
5. Daily Activity Atlas
6. ACE/Gemma4 context injection
```

This gives the system a memory of what the user and agents actually did each day, while preserving safety and keeping the canonical truth in code, tests, DB introspection, evidence files, and operator-approved changes.
