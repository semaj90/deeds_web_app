---
description: Resolve ACE/Atlas context before editing
agent: build
---

# OpenCode: ACE/Atlas Context Editor

This command is the mandatory gate for making changes to the codebase. It ensures that before any file is edited, we have established an authoritative, retrievable context from the system's knowledge graph (Atlas, Qdrant, KAG, etc.).

## Usage
`npm run ace:resolve -- <query>`

## Workflow
The process is strictly sequential:
1. **Context Resolution**: Calls all relevant Parent Atlas MCP tools (`trace_atlas_query`, `trace_qdrant_search`, etc.) to gather all potential source evidence for the given query.
2. **Candidate Selection**: Processes the raw hits to select the single, authoritative `canonical_source_ref` and `feature_id`.
3. **File Context**: Reads the current content of the authoritative file.
4. **Execution**: Presents the context and asks for explicit confirmation before running the `edit` operation.

## Hard Rules
1. **Never Edit Blindly**: Never call `edit` without first completing the context resolution steps.
2. **No Placeholders**: If no authoritative source is found after all gates, the operation fails, and no placeholder files are created.
3. **Source of Truth**: The `canonical_source_ref` must be the primary anchor for any change.

## Permissions
The system requires the following permissions to run this command:
- `read`: allow
- `grep`: allow
- `glob`: allow
- `edit`: ask
- `bash`: { "*": "ask", "npm run ace:resolve *": "allow" }
- `parent-atlas_*`: "allow" (or "ask" during debugging)

## Example
`npm run ace:resolve -- "Implement user profile picture upload"`
