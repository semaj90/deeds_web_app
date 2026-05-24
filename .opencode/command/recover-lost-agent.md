# Recover Lost Agent

This command orchestrates the "Lost Agent Recovery" workflow when an agent fails to find necessary context, hits a state loop, or encounters an unhandled exception during execution. It is designed to prevent the context window from being polluted by failure states and instead attempts to self-heal by querying structured memory stores.

## Workflow Overview (Recovery Cycle)
The process is executed when an agent call fails or returns a specific error code indicating context loss (e.g., `AGENT_LOST_CONTEXT`).

1. **Signal Reception**: The system receives an `AGENT_LOST` signal, triggering this command.
2. **Schema Check**: Validate the presence of `llm_stuck_events` in the DB schema.
3. **Atlas/Redis Check (Primary)**: Attempt to retrieve recent memory from Redis (for hot caches) and the Parent Atlas (for deep, reliable context).
4. **Graph/Qdrant Check (Secondary)**: If Atlas/Redis fails, query the Graph and Qdrant for related context based on the failed query.
5. **Stuck-Event Logging**: Regardless of success, log a `stuck-event` record to the database for future auditing and debugging.
6. **Retry/Report**: Return a compact report containing the best guess for a `retryQuery` and the sourceRefs found, allowing the calling agent to self-correct.

## Execution Steps

### Step 1: Cache Lookup and Atlas Check
First, attempt to pull recent memory using the `semanticCacheLookup` pattern (similar to the lost-agent recovery logic).

### Step 2: Stuck-Event Logging
If the recovery flow completes, write the findings to the `llm_stuck_events` table.

### Step 3: SourceRef Card Generation
Generate a compact summary card containing only the most relevant `sourceRefs` from the cache/atlas/Qdrant results, formatted for the next agent attempt.

**Action Command:**
Execute the core logic flow, which combines the cache lookup and the stuck-event writing logic.

**Example Usage (Manual Trigger):**
If an agent fails on query "...", this command should be run with the failure context.
`npm run recover:lost-agent -- --runId "..." --agent "..." --symptom "..." --query "..."`
