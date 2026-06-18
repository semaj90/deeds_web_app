---
description: Resolve Parent Atlas ACE context before editing or merging files
agent: build
---

# OpenCode: ACE/Atlas Context Editor

This command is the mandatory gate for making changes to the codebase. It ensures that before any file is edited, we have established an authoritative, retrievable context from the system's knowledge graph (Atlas, Qdrant, KAG, etc.).

## Usage
`npm run ace:resolve -- "<query>"` (To find the candidate)
`npm run ace:merge` (To perform the guarded edit)

## Workflow
The process is strictly sequential.

### 1. Context Resolution
Before editing, call all available Parent Atlas / TRACE MCP tools:
- `trace_atlas_query`
- `trace_bifrost_semantic_cache`
- `trace_qdrant_search`
- `trace_kag_search`
- `trace_dag_traversal`
- `trace_filesystem_rg`

If MCP tools are unavailable, run:
`npm run ace:resolve -- "<query>"`

The resolver must use project `.env` values for:
- `DATABASE_URL`
- `REDIS_URL`
- `QDRANT_URL`
- `QDRANT_COLLECTION`
- `OPENAI_BASE_URL`
- `TRACE_MCP_URL`

### 2. Candidate Selection
Select exactly one authoritative candidate.
Required fields:
- `canonical_source_ref`
- `feature_id`
- `file_path`
- `fusion_score`
- `lane`
- `evidence`

If multiple candidates conflict, stop and ask for review.

### 3. File Context
Read the exact file from:
`finalCandidate.file_path`

Do not guess filenames.
Do not use a stale oldString.
Use `grep`/`rg` to locate the current function or anchor.

### 4. Execution
Before edit, summarize:
- selected file
- feature_id
- reason it was selected
- exact function/section being changed
- validation command

Then ask for confirmation before using `edit`.

### 5. Merge Rules
When editing:
- patch the existing canonical file only
- preserve `feature_id`
- preserve `canonical_source_ref`
- preserve `packet_key`
- preserve `bifrost_cache_key`
- preserve `qdrant_point_id`
- use the smallest stable anchor
- never replace a whole file unless explicitly requested

## Hard Rules
1. Never call `edit` before context resolution.
2. Never create placeholder files.
3. Never retry an edit after `oldString` failure without re-reading the file.
4. `canonical_source_ref` is the source of truth.
5. If no authoritative source exists, stop.
6. If edit fails, run context/read again.
7. If no ACE hit exists, call `enforceNoPlaceholderPolicy`.
8. If policy blocks, report: "No ACE context found; placeholder creation blocked."

## Edit Failure Recovery
If edit returns: `Could not find oldString in the file`
Then:
1. Stop.
2. Re-read `finalCandidate.file_path`.
3. `grep` for the actual function.
4. create a new exact anchor.
5. retry once.
6. if still failing, stop and report the mismatch.

Never create a new file because an edit failed.

**Core agent rule:**
- No ACE hit $\rightarrow$ no edit.
- No `canonical_source_ref` $\rightarrow$ reject hit.
- No `feature_id` $\rightarrow$ reject or derive from `canonical_source_ref`.
- Edit failure $\rightarrow$ re-read, do not invent.
