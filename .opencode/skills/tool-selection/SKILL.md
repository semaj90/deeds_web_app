---
name: tool-selection
description: Select the right tool chain (rg, glob, MCP, Gemma4, embed) for the current task
license: MIT
compatibility: opencode
---

# Skill: tool-selection

## The discipline split

| Thing | Where it lives | What it does |
|---|---|---|
| **Skill** | `.opencode/skills/*.md` | Instruction prose — tells the AI how to behave |
| **Command** | `.opencode/command/*.md` | Slash-command prompt — user-invocable recipe |
| **Tool** | `.opencode/tools/*.ts` | TypeScript function — what the AI can *call* |

Skills describe logic. Tools execute logic. Commands invoke sequences of both.

TurboVec **reranks candidates** — it does not read files. Pass it a candidate list from the ACE packet.

---

## Tool registry (`.opencode/tools/`)

### `classify-intent.ts` — `classifyIntent`
First step in any agentic loop. Maps a prompt → intent + domain + safe shell command.

```
Input:  { prompt: string, context?: string }
Output: { intent, domain, subdomain, confidence, safeNextCommand }
```

### `build-agentic-rag-context.ts` — `buildAgenticRagContext`
Reads the ACE packet from disk, scores cards against the query, returns top-K with prompt snippet.

```
Input:  { query: string, maxCards?: number (1–50), domainFilter?: string }
Output: { ok, cards[], sourceRefs[], promptPacket, safeNextCommand }
```

**Does NOT** read raw source files or call Qdrant. Uses pre-ranked `.opencode/ace-packet.json`.

### `build-recommendation.ts` — `buildRecommendation`
Final step. Produces the output contract from error-inference-research skill.

```
Input:  { intent, domain, errorSummary, evidenceLines[], patchTargets[], proposedFix? }
Output: { likely_cause, evidence, patch_targets, safe_next_command, do_not_do }
```

---

## Agentic loop pattern

```
User prompt
  ↓
classifyIntent({ prompt })
  ↓
buildAgenticRagContext({ query, maxCards: 20, domainFilter })
  ↓
[Gemma4 reasons over promptPacket]
  ↓
buildRecommendation({ intent, domain, errorSummary, evidenceLines, patchTargets })
  ↓
Operator approves → executes safe_next_command
```

---

## Schema discipline rules (enforced by `npm run smoke:tool-schema`)

1. Every tool has a non-empty `description` string.
2. Every `z.*` field has a `.describe('...')` annotation.
3. `parameters` is always wrapped in `z.object({})`.
4. `execute` is always `async`.
5. Tools never read raw source files directly — only pre-ranked artifacts (ACE packet, cluster cards).

Run validation:

```bash
npm run smoke:tool-schema
# Expected: 15 pass, 0 fail
```

---

## Tool selection process

1. Classify intent via `classifyIntent` to get `domain` + `intent`.
2. Check if ACE packet is fresh: `node scripts/ingest/cache-ace-packet.mjs --audit`
3. If stale: `npm run ingest:pipeline` first.
4. Call `buildAgenticRagContext` with query + optional domainFilter.
5. Pass `promptPacket` to Gemma4 system context.
6. After Gemma4 produces evidence lines + patch targets, call `buildRecommendation`.
7. Present recommendation to operator. Do NOT auto-execute patches.
