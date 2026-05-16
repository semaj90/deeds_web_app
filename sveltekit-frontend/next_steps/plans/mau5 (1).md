# mau5.md — Master Agents CRM + Agentic Workflow Atlas

**Purpose:** Enhance the Master Agents / Master Atlas plan with a CRM-like tracking layer for user behavior, evidence workflows, agentic tool runs, patch proposals, Daily Activity Atlas summaries, and ACE/Gemma4 context injection.

**Short version:** The repo already has most of the surfaces needed for a CRM-style agentic workflow system: evidence UI, cases/POI/legal components, analytics/engagement routes, agent/MCP tooling, wiki/knowledge APIs, RAG/KAG/search/topology layers, cache/context reuse, recommendations, observability, OCR/PDF/audio/video analysis, and dashboards. The missing piece is a **unified event ledger** plus a **date-indexed Daily Activity Atlas** that stitches the activity into reusable ACE/Gemma4 context.

---

## 1. Master Agents Principle

The system should treat these as canonical truth:

```text
1. Source code
2. Tests
3. DB introspection / migrations
4. Operator-approved docs
5. Evidence files and durable metadata
6. Runtime traces and event ledgers
```

The system should treat these as context projections:

```text
1. AGENTS.md directory cards
2. Karpathy wiki pages
3. CouchDB stitched notes
4. Qdrant semantic chunks
5. Redis hot context packets
6. Gemma4 summaries
7. Daily Activity Atlas summaries
```

**Rule:** AGENTS.md and Daily Atlas are context packs, not legal/canonical truth.

---

## 2. Existing CRM-Like Feature Surfaces

Based on the current codebase atlas shape, these areas already exist or are strongly represented.

### 2.1 User Activity / Analytics

Likely existing surfaces:

```text
src/lib/components/analytics
src/routes/api/engagement
src/routes/api/metrics
src/routes/api/observability
src/lib/server/observability
```

CRM role:

```text
page views
button clicks
uploads
failed uploads
route usage
dashboard usage
feedback events
copy/export actions
```

Status:

```text
PARTIAL — surfaces exist, but unified user_activity_events ledger is needed.
```

---

### 2.2 Evidence Workflow Tracking

Likely existing surfaces:

```text
src/lib/components/evidence
src/lib/features/evidence-command-center
src/routes/(app)/evidence
src/routes/(app)/evidence-library
src/routes/api/evidence
src/routes/api/ai/analyze-evidence
```

CRM role:

```text
evidence upload
evidence processing status
transcription
OCR
frame extraction
review state
workflow retry/cancel
timeline activity
```

Status:

```text
PARTIAL — evidence UI exists, but workflow run/step ledger should be unified.
```

---

### 2.3 Case / Legal CRM

Likely existing surfaces:

```text
src/lib/components/cases
src/lib/components/case
src/lib/components/poi
src/lib/features/poi
src/lib/components/legal
src/lib/components/legal-ai
src/lib/components/citations
src/routes/(app)/cases
src/routes/(app)/persons-of-interest
src/routes/(app)/citations
```

CRM role:

```text
case lifecycle
person-of-interest tracking
evidence-to-case links
legal citations
document/entity notes
case timeline
```

Status:

```text
PARTIAL — case/evidence/POI surfaces exist; unified timeline + event ledger should connect them.
```

---

### 2.4 Agentic Workflow / MCP / ACP

Likely existing surfaces:

```text
src/lib/components/agent
src/lib/components/agentic
src/lib/server/acp
src/lib/server/mcp
src/mcp/tools
src/lib/server/tools
src/routes/api/acp/execute
src/routes/api/acp/tools
src/routes/api/admin/agent/fix
```

CRM role:

```text
agent run started
agent run completed
MCP tool call
tool failure
patch proposal
operator approval
smoke/test run
commit creation
```

Status:

```text
PARTIAL — tool surfaces exist; needs agent_workflow_events + patch_proposals ledger.
```

---

### 2.5 Knowledge Base / Wiki / Atlas

Likely existing surfaces:

```text
src/routes/api/wiki
src/routes/api/knowledge
src/routes/(app)/knowledge
src/routes/(app)/codebase-wiki
src/lib/server/atlas
src/lib/server/agents-md
src/lib/server/obsidian
src/lib/server/couchdb
```

CRM role:

```text
wiki page opened
daily note created
AGENTS card refreshed
atlas reconcile status
feature docs used in answer
knowledge page linked to workflow
```

Status:

```text
PARTIAL/SHIPPED — wiki/atlas pieces exist, but Daily Activity Atlas should become the CRM memory layer.
```

---

### 2.6 Search / RAG / KAG / GraphRAG

Likely existing surfaces:

```text
src/lib/server/search
src/lib/server/rag
src/lib/server/kag
src/lib/server/hypergraph
src/lib/server/topology
src/routes/api/hypergraph
src/routes/api/topology
src/lib/components/rag
src/lib/components/graph
```

CRM role:

```text
query submitted
retrieval lanes used
Qdrant hits
Neo4j graph paths
RRF rank changes
answer accepted/rejected
recommendation emitted
```

Status:

```text
SHIPPED/PARTIAL — retrieval exists; CRM layer needs to persist retrieval decisions as activity events.
```

---

### 2.7 ACE / BitFrost / Context Cache

Likely existing surfaces:

```text
src/lib/cache
src/lib/server/cache
src/routes/api/cache
src/lib/components/cache
src/lib/server/redis
src/lib/server/ace
```

CRM role:

```text
context cache hit
context cache miss
cache source: redis/postgres/local-json
stale delta detected
tool policy preserved
context packet reused
```

Status:

```text
SHIPPED/PARTIAL — context cache exists; should feed daily atlas and workflow trace.
```

---

### 2.8 OCR / PDF / Audio / Video Analysis

Likely existing surfaces:

```text
src/lib/server/ocr
src/lib/server/pdf
src/lib/components/audio
src/lib/components/video
src/routes/(analysis)/audio-analysis
src/routes/(analysis)/document-analysis
```

CRM role:

```text
OCR job started
OCR correction
transcript segment opened
transcript correction
frame opened
frame caption correction
document analysis run
```

Status:

```text
PARTIAL — ingestion/analyzer surfaces exist; needs event and workflow tracking.
```

---

### 2.9 Recommendations / Feedback / Memory

Likely existing surfaces:

```text
src/lib/components/recommendations
src/routes/(app)/recommendations
src/lib/server/memory
src/lib/server/training
src/lib/server/observability
```

CRM role:

```text
recommendation generated
recommendation accepted
recommendation rejected
feedback thumbs up/down
source IDs selected/rejected
GRPO memory signal
```

Status:

```text
PARTIAL — recommendations and memory surfaces exist; needs durable recommendation_events.
```

---

## 3. Unified CRM Event Model

Add one common mental model:

```text
Actor did Action to Target in Context at Time.
```

Examples:

```text
User clicked Upload Video button in Evidence Ingestion page.
Agent called evidence.search MCP tool during Workflow Run 123.
User opened transcript segment seg_120000_145000.
Gemma4 reused ACE context packet ace:ctx:abc.
Operator approved patch proposal patch_456.
```

---

## 4. Core Tables

### 4.1 user_activity_events

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

Use for:

```text
page_view
button_click
upload_started
upload_completed
upload_failed
search_submitted
result_clicked
transcript_segment_clicked
frame_opened
wiki_page_opened
feedback_thumbs_up
feedback_thumbs_down
```

---

### 4.2 agent_workflow_events

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

Use for:

```text
agent_task_started
agent_task_completed
mcp_tool_called
test_run
test_passed
test_failed
smoke_passed
smoke_failed
file_read
file_written
patch_proposed
patch_applied_operator_approved
commit_created
```

---

### 4.3 patch_proposals

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

Status values:

```text
proposed
approved
rejected
applied
failed
superseded
```

Rule:

```text
Never expose raw apply_patch directly to Gemma4, Hermes, or untrusted agents.
Use proposal → operator approval → apply → log.
```

---

### 4.4 daily_activity_atlas

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

Use for:

```text
date-indexed recall
daily summaries
user/agent activity context
hot evidence/features/files
ACE/Gemma4 continuation prompts
```

---

### 4.5 recommendation_events

```sql
CREATE TABLE IF NOT EXISTS recommendation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text,
  intent text,
  recommendation text,
  source_chunk_ids jsonb DEFAULT '[]'::jsonb,
  accepted boolean,
  feedback_score real,
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);
```

Use for:

```text
accepted recommendations
rejected recommendations
what helped
what failed
future retrieval weighting
GRPO-style reward signals
```

---

## 5. Datastore Roles

### Postgres

Durable event ledger:

```text
user_activity_events
agent_workflow_events
patch_proposals
daily_activity_atlas
recommendation_events
workflow_runs
workflow_steps
metadata_envelopes
llm_context_cache
```

### Redis

Hot context/cache:

```text
atlas:daily:{YYYY-MM-DD}
atlas:daily:latest
ace:ctx:{cacheKey}
workflow:status:{runId}
activity:recent:{sessionId}
feature:summary:{featureId}
```

### Qdrant

Semantic lookup:

```text
daily_activity_summaries
workflow_summaries
recommendation_summaries
evidence_text_chunks
evidence_visual_chunks
markdown_chunks
feature_summaries
```

### Neo4j

Relationship graph:

```text
(:DailyAtlas)-[:TOUCHED]->(:File)
(:DailyAtlas)-[:MENTIONED]->(:Feature)
(:DailyAtlas)-[:OPENED]->(:Evidence)
(:AgentRun)-[:CALLED]->(:Tool)
(:PatchProposal)-[:MODIFIES]->(:File)
(:Recommendation)-[:DERIVED_FROM]->(:Chunk)
```

### CouchDB

Readable wiki pages:

```text
daily pages
workflow notes
evidence notes
AGENTS directory cards
Master Atlas rollups
```

### Langfuse

Observability only:

```text
trace spans
latency
retrieval lane breakdown
cache hit/miss
tool call traces
feedback scores
```

---

## 6. Event Taxonomy

### UI events

```text
page_view
button_click
tab_opened
modal_opened
modal_closed
form_submitted
form_failed
```

### Upload events

```text
upload_started
upload_completed
upload_failed
upload_retried
upload_cancelled
```

### Evidence events

```text
evidence_opened
evidence_result_clicked
transcript_opened
transcript_segment_clicked
transcript_corrected
frame_opened
frame_caption_corrected
ocr_text_corrected
timeline_range_selected
```

### Agent events

```text
agent_task_started
agent_task_completed
mcp_tool_called
tool_failed
test_run
test_passed
test_failed
smoke_passed
smoke_failed
```

### Patch events

```text
patch_proposed
patch_approved
patch_rejected
patch_applied
patch_failed
```

### Retrieval events

```text
query_submitted
qdrant_search
neo4j_expand
redis_cache_hit
redis_cache_miss
ace_context_packet_built
gemma4_synthesis_completed
```

### Feedback events

```text
feedback_thumbs_up
feedback_thumbs_down
recommendation_accepted
recommendation_rejected
citation_saved
answer_copied
```

---

## 7. Daily Activity Atlas Pipeline

Command:

```bash
npm run atlas:daily
```

Pipeline:

```text
user_activity_events
agent_workflow_events
ace_retrieval_runs
recommendation_events
patch_proposals
workflow_runs
workflow_steps

  ↓ aggregate by date

Gemma4 summarizer

  ↓

daily_activity_atlas
Qdrant daily_activity_summaries
Neo4j DailyAtlas graph
Redis atlas:daily:{date}
CouchDB daily wiki page
```

Example output:

```json
{
  "date": "2026-05-13",
  "summary": "Worked on ACE context cache, TurboVec sidecar, video evidence ingestion, UI upload reliability, and CRM workflow tracking.",
  "hot_features": [
    "cache.bitfrost",
    "retrieval.turbovec_sidecar",
    "evidence.video_ingest",
    "analytics.user_activity"
  ],
  "hot_files": [
    "src/lib/server/ace/llm-context-cache.ts",
    "src/lib/server/vector/turbovec-client.ts",
    "docs/design/2026-05-13_daily-activity-atlas.md"
  ],
  "recommendations": [
    "Build transcript-first ingestion before VLM frame analysis.",
    "Keep Qdrant canonical and TurboVec as sidecar.",
    "Gate patch application behind operator approval."
  ]
}
```

---

## 8. ACE/Gemma4 Injection

When user asks:

```text
What were we doing yesterday?
Continue the evidence workflow.
Why did uploads fail?
What did the agents change?
What should I work on next?
```

ACE should retrieve:

```text
recent daily atlas summaries
hot files
hot features
failed workflow steps
accepted recommendations
patch proposals
recent cache misses
```

Add helper:

```ts
getDailyAtlasContextForQuery(query: string, dateRange?: {
  from: string;
  to: string;
})
```

Add cache identity:

```text
dailyAtlasHash
```

Add Langfuse span:

```text
atlas.daily_context
```

---

## 9. UI Routes

```text
/admin/analytics
/admin/workflows
/admin/daily-atlas
/admin/agent-patches
/admin/evidence-ingestion
/admin/recommendations
```

---

## 10. Svelte Components

```text
AnalyticsEventTable.svelte
AgentWorkflowTimeline.svelte
DailyAtlasSummary.svelte
PatchProposalReview.svelte
UploadReliabilityPanel.svelte
EvidenceHotspotsPanel.svelte
TranscriptInteractionPanel.svelte
WorkflowStepList.svelte
RecommendationDecisionPanel.svelte
AceContextPacketViewer.svelte
```

---

## 11. API Routes

```text
POST /api/analytics/event
GET  /api/analytics/recent
GET  /api/workflows
GET  /api/workflows/[id]
POST /api/workflows/[id]/retry
POST /api/agent/patch-proposals
POST /api/agent/patch-proposals/[id]/approve
POST /api/agent/patch-proposals/[id]/reject
GET  /api/atlas/daily
POST /api/atlas/daily/build
GET  /api/recommendations/events
POST /api/recommendations/events/[id]/feedback
```

---

## 12. Privacy and Redaction

Redact these keys:

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

Store these instead:

```text
IDs
hashes
timestamps
route names
event types
target IDs
compact metadata
```

---

## 13. Enhanced Agent Prompts

### 13.1 Feature inventory prompt

```text
You are working in:
C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Task:
Build a CRM-style feature inventory for agentic workflow tracking.

Inputs:
- docs/graph/codebase-map.md
- docs/graph/codebase-graph.json
- memory/atlas/codebase-atlas.dirs.json
- src/routes
- src/lib

Output:
docs/audit/2026-05-13_crm-agentic-workflow-feature-inventory.md

Classify:
- user activity analytics
- evidence workflow tracking
- agent/MCP workflow tracking
- patch proposal ledger
- daily activity atlas
- recommendations/feedback
- search/RAG/KAG traces
- cache/context reuse
- OCR/audio/video/document analysis
- cases/POI/legal CRM

For each:
- existing directories/files
- existing API routes
- existing DB tables if obvious
- missing pieces
- status: SHIPPED, PARTIAL, SPEC_ONLY, MISSING
- next implementation step

Rules:
- Do not run drizzle push.
- Do not mutate DB.
- Do not expose raw apply_patch.
- Treat AGENTS.md as context cards, not truth.
```

---

### 13.2 Daily Atlas build prompt

```text
Task:
Implement a date-indexed Daily Activity Atlas.

Create:
- user_activity_events service if missing
- agent_workflow_events service if missing
- daily_activity_atlas builder
- getDailyAtlasContextForQuery()

Rules:
- Fail open.
- Redact secrets.
- Do not log hidden reasoning.
- Do not store raw evidence text by default.
- Do not change identity strategy.
- Do not run drizzle push.
```

---

### 13.3 Patch proposal prompt

```text
Task:
Add operator-gated patch proposal workflow.

Create:
- patch_proposals table
- patch proposal API
- patch proposal review UI
- event logging for approve/reject/apply

Rules:
- Do not expose raw apply_patch to Gemma4 or Hermes.
- Patch proposals are inert until operator approves.
- Every patch must include target files, rationale, tests, and rollback note.
```

---

## 14. Recommended Commit Sequence

```text
1. docs(master-agents): add CRM workflow atlas plan
2. feat(analytics): add user activity event ledger
3. fix(ui): instrument upload reliability events
4. feat(agent): add agent workflow event ledger
5. feat(agent): add operator-gated patch proposal ledger
6. feat(atlas): add daily activity atlas builder
7. feat(ace): inject daily atlas context into ACE packets
8. feat(ui): add CRM workflow dashboard panels
```

---

## 15. Done Definition

The CRM/agentic workflow layer is done when:

```text
User clicks and uploads are logged.
Evidence transcript/frame interactions are logged.
MCP/agent tool calls are logged.
Patch proposals are operator-gated and logged.
Daily Activity Atlas summarizes each day.
Daily summaries are embedded into Qdrant.
DailyAtlas nodes exist in Neo4j.
Redis has atlas:daily:{date}.
ACE can inject Daily Atlas context.
Dashboard shows analytics, workflows, patches, and hot evidence.
```

---

## 16. Final Recommendation

Build the CRM layer in this order:

```text
1. user_activity_events
2. upload/button reliability logging
3. agent_workflow_events
4. patch_proposals
5. daily_activity_atlas
6. ACE/Gemma4 daily context injection
7. dashboard panels
```

This turns the app from a collection of AI tools into a CRM-like operating system for cases, evidence, agent work, recommendations, and daily project memory.
