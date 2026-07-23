# Retrieval Outcome Ledger (Behavioral Supervision)

The Retrieval Outcome Ledger serves as the central transaction log to track prompt intents, chosen retrieval paths, matched source references, outcomes, and reinforcement rewards.

## Purpose

By tracking the effectiveness of retrieval decisions at runtime, the platform builds a behavioral dataset. This allows us to teach the model **what worked, what failed, and why**, enabling downstream reinforcement learning (GRPO/PPO) and LoRA tuning.

## Ledger Schema

Each outcome record appended to `memory/retrieval/outcomes.jsonl` follows this schema:

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | String | ISO-8601 creation timestamp. |
| `query` | String | The raw user prompt or query. |
| `intent` | String | Classified intent (e.g. `repair`, `research`). |
| `domain` | String | Domain boundary (e.g. `retrieval`, `graph`). |
| `subdomain` | String | Subdomain context. |
| `toolsUsed` | Array | String list of MCP or API tools executed. |
| `sourceRefs` | Array | String list of file paths/references surfaced. |
| `graphNodes` | Array | Mapped nodes from Neo4j involved in the context. |
| `cacheHit` | Boolean | Whether an exact or semantic cache hit occurred. |
| `recommendationAccepted` | Boolean \| null | Operator feedback indicating acceptance. |
| `outcome` | String | Target execution status: `pending`, `success`, `failure`, `partial`. |
| `reward` | Number \| null | Scalar reward value (0.0 to 1.0) for validation scoring. |
| `graphVersion` | String | Codebase graph snapshot identifier. |
| `notes` | String | Operational context notes. |

## Commands

### Record an Outcome
To log a runtime retrieval choice, run:
```bash
node scripts/atlas/record-retrieval-outcome.mjs \
  --query "fix schema mapping" \
  --intent "repair" \
  --domain "database" \
  --tool "atlas-tools.build_agentic_rag_context" \
  --sourceRef "sveltekit-frontend/src/lib/server/db/schema.ts" \
  --outcome "pending"
```

### Summarize Outcomes
To compile reports and calculate metrics, run:
```bash
node scripts/atlas/summarize-retrieval-outcomes.mjs
```
Generates reports in:
- `.tmp/retrieval-outcome-summary.json`
- `.tmp/retrieval-outcome-summary.md`
