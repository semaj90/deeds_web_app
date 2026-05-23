Log the current agentic development result.

1. Summarize the bug, test, or implementation attempt.
2. Capture commands run and exit codes.
3. Capture files touched.
4. Capture sourceRefs if available.
5. Mark status as solved, failed, partial, retry_needed, or blocked.
6. Do not modify AGENTS.md unless the result produced a durable project rule.
7. Write to docs/ai-os/agentic-progress-log.ndjson.
8. Update docs/ai-os/atlas-retry-index.json if status is failed, partial, blocked, or retry_needed.
