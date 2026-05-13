# Daily Activity Atlas — Date-Indexed Context

**Status**: design note

## Goal
Create a date-indexed atlas of daily activity so the agent can reconstruct what happened, what was edited, what was queried, and which workflow steps mattered for a given day.

## Scope
The atlas is for agentic workflow context, not surveillance.

Useful inputs:
- VS Code agentic workflow events
- user analytics events
- file edits and patch operations
- tool calls and retrievals
- query/rerank summaries
- daily task / commit / smoke-test activity

## Core Idea
Each day becomes a stitched activity capsule.

Examples:
- `atlas:day:2026-05-13`
- `atlas:user:{userId}:day:2026-05-13`
- `atlas:workspace:{workspaceId}:day:2026-05-13`

The atlas should answer:
- What changed today?
- What was the agent doing?
- Which files and docs were touched?
- Which retrievals and tool calls mattered?
- What should be reused tomorrow?

## Recommended Data Split
- `Postgres` for durable activity records and audit rows
- `Redis` for hot daily summaries and current-day packets
- `Qdrant` for semantic lookup over daily notes, transcripts, and summaries
- `Neo4j` for chains between actions, files, tools, and outcomes
- `CouchDB` for stitched daily wiki pages
- `SeaweedFS` for raw artifacts when needed

## Canonical Record
Use a JSONB envelope for each activity item.

```json
{
  "day": "2026-05-13",
  "user_id": "...",
  "workspace_id": "...",
  "session_id": "...",
  "source": "vscode-agentic-workflow",
  "kind": "file_edit",
  "file_path": "src/lib/server/cache/README.md",
  "summary": "Restored cache README and merged NanoFlow section.",
  "tool": "apply_patch",
  "tags": ["docs", "cache", "ace"],
  "feature_keys": ["cache.bitfrost_context", "atlas.daily_activity"],
  "references": {
    "redis": "atlas:day:2026-05-13",
    "qdrant_point_id": "day:2026-05-13:patch:01",
    "neo4j_node_id": "Activity:2026-05-13:patch:01"
  }
}
```

## Indexing by Date
The date is the primary grouping key.

Recommended axes:
- day
- workspace
- user
- session
- agent
- file path
- tool name
- feature key

## Suggested Tables
- `daily_activity_runs`
- `daily_activity_events`
- `daily_activity_summaries`
- `daily_activity_links`

## Suggested Redis Keys
- `atlas:day:{YYYY-MM-DD}`
- `atlas:day:{YYYY-MM-DD}:summary`
- `atlas:user:{userId}:day:{YYYY-MM-DD}`
- `atlas:workspace:{workspaceId}:day:{YYYY-MM-DD}`

## Suggested Qdrant Payload

```json
{
  "day": "2026-05-13",
  "kind": "tool_call",
  "source": "vscode-agentic-workflow",
  "summary": "Applied patch to restore cache README and merge NanoFlow.",
  "tags": ["patch", "docs", "cache"],
  "feature_keys": ["atlas.daily_activity", "cache.bitfrost_context"]
}
```

## Retrieval Use
The atlas should support:
- daily timeline lookup
- “what happened today?” summaries
- file-centric recall
- tool-centric recall
- context reuse for the next day’s session

## Non-Goals
- raw transcript hoarding
- hidden reasoning storage
- replacing audit tables
- replacing the ACE context cache

## Relationship to ACE
The daily atlas can feed ACE with compact context:
- recent file edits
- recent tool calls
- recent retrieval decisions
- recent workflow summaries

That makes the agent better at answering “what were we doing yesterday?” without replaying everything.
