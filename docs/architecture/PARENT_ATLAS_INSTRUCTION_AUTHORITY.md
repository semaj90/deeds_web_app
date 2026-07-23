# Parent Atlas Instruction Authority

Generated: 2026-07-23

This report reconciles the repository-root instruction files with the current Parent Atlas implementation prompt. It is a classification artifact, not a rewrite of the root guidance.

## Scope

Sources reviewed:

- [AGENTS.md](../../AGENTS.md)
- [CLAUDE.md](../../CLAUDE.md)
- [PRODUCTION-HARDENING-CLAUDE-PROMPT.md](../PRODUCTION-HARDENING-CLAUDE-PROMPT.md)

## Summary

The repository has one clear root instruction file pair with duplicated and partially conflicting content:

- `AGENTS.md` contains repeated sections and two overlapping runtime profiles.
- `CLAUDE.md` contains archival rules, connected tooling status, and older operational statements that read as session-specific rather than global.
- The implementation prompt now includes a reconciliation gate that should govern future Parent Atlas work.

The main risk is not that the instructions are unusable. It is that the current text mixes global rules, profile-specific rules, and historical status claims without explicit scoping.

## Classification

### AGENTS.md

| Line range | Classification | Applicable profiles | Notes |
|---|---|---|---|
| 1-19 | GLOBAL | all | Search-first behavior and file-reading discipline. |
| 21-35 | PROFILE_PARENT_ATLAS_FULL | parent_atlas_full | Stage 0 / Graphify readiness claims, embedding contracts, archival rules. |
| 39-49 | GLOBAL | all | Core Svelte/Drizzle/Zod/service constraints. |
| 51-62 | DUPLICATE | all | Repeated OpenCode Skill Contract block. |
| 63-90 | GLOBAL | all | ACE/Atlas context packet gate. |
| 93-104 | DUPLICATE | all | Repeated repo map block. |
| 106-115 | GLOBAL | all | Repo commands / verification entrypoints. |
| 118-125 | PROFILE_ENGRAM_ONLY | engram_only | Explicit disabled-service profile. |
| 127-133 | GLOBAL | all | Gotchas and migration metadata rules. |
| 135-140 | GLOBAL | all | Reference docs to load on demand. |
| 142-155 | GLOBAL | all | Retrieval abstraction boundary and cuVS backend rule. |
| 157-169 | GLOBAL | all | LangGraph boundary and durable mutation restriction. |

### CLAUDE.md

| Line range | Classification | Applicable profiles | Notes |
|---|---|---|---|
| 1-27 | GLOBAL | all | Archival not deletion policy. |
| 31-68 | LEGACY | historical | OpenCode Bash Tool Calling fix and current project tooling snapshot. |
| 70-82 | GLOBAL | all | Connected MCP status with explicit disabled turbovec wrapper. |
| 84-109 | GLOBAL | all | LSP installation and wiring guidance. |
| 111-161 | GLOBAL | all | Playwright/trace MCP history and current restoration decision. |
| 165-204 | PROFILE_PARENT_ATLAS_FULL | parent_atlas_full | Phase 7 operational status is a live status statement, not a universal proof of later phases. |
| 208-217 | GLOBAL | all | Quick-reference table. |

### PRODUCTION-HARDENING-CLAUDE-PROMPT.md

| Line range | Classification | Applicable profiles | Notes |
|---|---|---|---|
| 1-242 | PROFILE_PARENT_ATLAS_FULL | parent_atlas_full | Recovery prompt for a specific production-hardening task. |
| 243-308 | PROFILE_PARENT_ATLAS_FULL | parent_atlas_full | Reconciliation gate added for future Parent Atlas implementation. |
| 309-end | PROFILE_PARENT_ATLAS_FULL | parent_atlas_full | Existing hard requirements and task scaffolding. |

## Conflicts and drift

1. `AGENTS.md` repeats the OpenCode Skill Contract and repo map blocks. These should be normalized into one canonical section or clearly labeled as inherited/duplicated text.
2. `AGENTS.md` contains both `Parent Atlas Workstation (Production-Ready)` and `Engram-only mode (current)`. These are valid profiles, but they need explicit scoping so the disabled services are not misread as failures.
3. `CLAUDE.md` mixes archival policy, tooling status, and phase-7 operational claims. The phase-7 statements should be treated as status history, not proof of later Parent Atlas phases.
4. The retrieval and LangGraph boundaries are consistent across the root files and should be preserved.

## Canonical wording proposal

- Treat `AGENTS.md` as the root policy file with two explicit runtime profiles: `PROFILE_PARENT_ATLAS_FULL` and `PROFILE_ENGRAM_ONLY`.
- Treat `CLAUDE.md` as project instructions plus historical status notes, not as a release gate.
- Treat `docs/PRODUCTION-HARDENING-CLAUDE-PROMPT.md` as a task prompt that now embeds a repository instruction reconciliation gate.
- Preserve the LangGraph and retrieval boundaries exactly as written.

## Required outputs

- `docs/architecture/PARENT_ATLAS_INSTRUCTION_AUTHORITY.md`
- `docs/reports/parent-atlas-instruction-authority.json`

## Required proofs to record in follow-up work

- `DUPLICATE_INSTRUCTIONS_IDENTIFIED`
- `PROFILE_CONFLICTS_IDENTIFIED`
- `GLOBAL_RULES_IDENTIFIED`
- `NO_INSTRUCTION_SILENTLY_DROPPED`

## Next bounded task

Normalize the repository-root instruction hierarchy into a single machine-readable profile manifest, then wire startup/readiness checks to the active profile.
