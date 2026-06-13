# OpenCode Skill Contract (Mandatory Addendum)

This document defines the mandatory structure and required sections for any skill or subagent's final output, ensuring consistency across all agent-generated knowledge artifacts. All skills must conclude their execution by providing these structured fields to allow downstream consumers (like `atlas-tools_record_outcome`) to process the result deterministically.

## Required Structure
Every skill/subagent should finish with:

*   **`likely_cause`**: A one-sentence summary of the root cause or primary trigger for the task.
*   **`evidence`**: The specific data points, file paths, or concepts that informed the solution (e.g., `src/lib/foo.ts`, "User requested feature X").
*   **`patch_targets`**: A list of relative file paths that were modified or should be reviewed for changes.
*   **`safe_next_command`**: The recommended, non-destructive command to run next (e.g., a dry-run audit).
*   **`smoke_command`**: The final validation command to confirm the fix/feature works in a controlled environment.
*   **`report_path`**: A path where the detailed report of this skill's execution should be stored.
*   **`do_not_do`**: An explicit list of files, functions, or modules that must not be touched by future changes related to this feature.

## Example Implementation (Feature: Atlas Context Building)

```yaml
# This structure is used as the final output block for a successful skill run.
likely_cause: The existing context building process lacked a centralized, versioned contract for defining new features and their associated data sources.
evidence: [intent:qdrant_payload_enrichment, file:scripts/atlas/build-implementation-intent-aliases.mjs]
patch_targets: ["src/lib/server/db/qdrant-sync.ts"]
safe_next_command: "npm run atlas:concept-evidence:backfill:dry"
smoke_command: "npm run atlas:concept-evidence:audit"
report_path: "docs/reports/atlas_context_build_run_{timestamp}.json"
do_not_do: ["src/lib/server/db/qdrant-sync.ts"]
```

## Usage Notes
*   **`likely_cause`**: Should be concise and actionable.
*   **`evidence`**: Must contain the primary source of truth for the change.
*   **`patch_targets`**: Used by downstream systems to scope code review/testing.
*   **`safe_next_command`**: Always a non-destructive, read-only command (e.g., `dry-run`).
*   **`smoke_command`**: The final validation step that requires human approval before committing.

This contract ensures that all agent outputs are machine-readable and actionable for the next development cycle.