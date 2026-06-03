---
name: project-manager
description: Manage OpenCode kanban tasks, track progress, and coordinate multi-step agent plans
license: MIT
compatibility: opencode
---

# Skill: project-manager

Goal:
Coordinate repo tasks, retries, cache policy, and nightly summaries.

Rules:
- Local rg/search first.
- ACE packet second.
- SearXNG only after smoke passes.
- Never finalize failed validation.
- Never assume a failed edit succeeded.
- For repeated patch failure, switch to line-range rewrite or restore.

Hot file policy:
- Track files touched or searched repeatedly.
- Cache hot file summaries in Valkey/Redis.
- TTL:
  - validation errors: 1 day
  - active repair context: 1 day
  - hot docs/skills: 7 days
  - stable weekly summary: 30 days or cold storage

Daily/weekly summary:
- Once per night: summarize changed files, validation errors, and completed tasks.
- Once per week: compact into cold storage / archive summary.
- Do not store raw giant files in Redis.
- Store pointers/sourceRefs + compact summaries.

Tool-calling rule:
Every shell/tool command must include:
- description
- command

Before editing:
1. `Test-Path <target>`
2. if missing, `Get-ChildItem -Recurse -Filter <filename>`
3. read target file
4. patch only after exact anchors are known
5. syntax/test before next step

Hot cache order (cache expansion logic):
1. Valkey exact cache (TTL 1–7 days)
2. ACE packet
3. local rg / ranking report
4. Qdrant semantic later
5. SearXNG/local-deep-research fallback
6. weekly cold summary

Caveman rule:
- Stop guessing patches.
- Create repair skill.
- Create manager skill.
- Cache hot context 1–7 days.
- Cold summarize nightly/weekly.

Do not assume a failed edit succeeded. Switch to line-range rewrite or restore when repeated failures occur.
# Skill: project-manager
## Purpose
Coordinate multi-stage tasks, manage the overall project flow, and orchestrate repair strategies. This skill acts as the 'foreman' for the system, ensuring that no critical gate or validation failure is ignored.

## Workflow Overview (The Foreman)
This skill coordinates the following sequence when a major process fails or stalls:
1. **Read MASTER TODO**: Read the highest-level `MASTER TODO` to determine the current high-priority objective.
2. **Check Validation Reports**: Inspect reports from `scripts/ingest/validate-ace-packet.mjs` and `drizzle-schema-review` for immediate failure points.
3. **Determine Next Gate**: Analyze the failure context to select the single most critical, next gate to pass.
4. **Create Repair Task**: Formulate a concrete, actionable repair plan.
5. **Invoke Mechanic**: If a failure is detected, invoke the `error-inference-research` skill to diagnose the root cause.
6. **Coordinate**: Manage the flow between the `error-inference-research` (mechanic) and the main workflow (OpenCode worker).
7. **Never Finalize Failure**: The skill MUST NOT finalize any task that fails validation; it must always loop back to repair.

## Caveman Stack
- **OpenCode**: The primary worker/orchestrator.
- **project-manager skill**: The foreman (this skill).
- **error-inference skill**: The mechanic (diagnoses failures).
- **SearXNG**: The internet scout (external context).
- **ACE packet**: The memory backpack (context summary).
- **Valkey**: Quick memory access/cache.
- **Qdrant**: Library shelf (semantic knowledge).
- **Neo4j**: Road map (dependency mapping).

## Execution Flow
When called, the skill should:
1. Call `task` with `subagent_type: general` and `prompt: "Determine the next critical gate based on the current failure reports and MASTER TODO."`
2. If failure is detected, call `error-inference-research` with the failure context.
3. Output a final, structured `ProjectState` object containing:
    - `overallStatus`: (e.g., 'STALLED', 'REPAIRING', 'SUCCESS')
    - `nextAction`: (e.g., 'Run validation-ace-packet.mjs' or 'Invoke error-inference-research')
    - `taskSummary`: A 1-sentence summary of the required repair.
    - `nextCommand`: The single, safest command to run next.
---
## Path Resolution Rule
Before editing any file, always resolve the real path.
### Known path rules
Skills live in:
```txt
.opencode/skills/
Ingest scripts live in:
scripts/ingest/
OpenCode utility scripts live in:
scripts/opencode/
### Fallback lookup
If a file is not found, run:
Get-ChildItem -Recurse -Force . -Filter "" |
  Select-Object FullName
For ACE validation files, prefer:
scripts/ingest/rank-cards.mjs
scripts/ingest/compress-cards.mjs
scripts/ingest/retrieval-pass.mjs
scripts/ingest/validate-ace-packet.mjs
For skills, prefer:
.opencode/skills/.md
### Do not do
- Do not create `scripts/opencode/skills/`.
- Do not patch `scripts/opencode/*` when the real target is `scripts/ingest/*`.
- Do not assume a file path after one failed edit.
- Do not use brittle `oldString` edits without reading the file first.