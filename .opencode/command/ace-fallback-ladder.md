
# ACE Tool Fallback Ladder

description: Recover from missing scripts, wrong cwd, missing graph inputs, MCP failures, and schema errors without filling context.

## Mission

Continue the task using deterministic fallbacks.

## Rules

- Do not ask vague questions.
- Do not read whole files.
- Do not run heavy commands before confirming generator/script paths.
- Do not manually inject fake metrics.
- Prefer rg -uu, sourceRefs, small windows, and degraded reports.

## Required Recovery Order

1. Missing npm script → find script path → run direct node script → add alias.
2. Wrong cwd → try known repo roots.
3. Missing graph input → rg --files -uu for graph files.
4. Tool schema error → retry with description.
5. MCP unavailable → return MCP_TOOL_NOT_AVAILABLE + rg fallback.
6. Missing artifact → stub/unpromoted only.
7. Smoke pass + generator fail → degraded success.
8. Session ID only → query progress or return degraded report.

## Output

Return:

```txt
status:
failure_type:
fallback_used:
confirmed_paths:
commands_run:
files_changed:
tests_run:
result:
next_exact_command:

Then trigger it with:

```txt
/ace-fallback-ladder continue graph export recovery

For the exact current state, the next command is still:

rg --files -uu | rg "codebase-graph.json|deep-import-graph.json|deep-import-edges.jsonl|codebase-map.md"

Then patch the generator to search fallback roots
```
