# Log Subagent Work

When a task fails, loops, or loses context, this command orchestrates the writing of a structured JSONL log entry to the memory store, preventing context bloat in the main agent history.

## Usage

```powershell
# Example: Log a failure when running the Drizzle schema review
npm run log-subagent -- --agent "trace-audit" --subagent "drizzle-schema-review" --task "audit sidecar migrations" --status "blocked" --reason "missing scripts / asked user incorrectly" --query "feature:atlas"
```

## Workflow

This command calls the internal `log-subagent.mjs` script to append a structured JSONL event to `memory/subagents/subagent-log.jsonl`.

**Hard rule**: Never ask the user for file contents or paths. Always use the provided parameters to construct the log entry.

**Trigger:** Use when any agent call fails, loops, or requires user interaction for path discovery.