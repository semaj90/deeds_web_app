# OpenCode Skill Routing — Keyword → Auto-Skill Hints

When a user message contains keywords matching a skill's domain, **suggest or invoke that skill before responding**. This is the auto-skill routing table for Gemma4 thinking.

---

## Skill Routing Table

| Keywords in message | Skill to invoke | When |
|---|---|---|
| `ace`, `packet`, `context warm`, `stale`, `ingest pipeline`, `rank-cards`, `rerank` | `gemma4` | Before any large codebase task — ensure ACE packet is fresh |
| `error`, `crash`, `failed`, `undefined`, `cannot find`, `exception`, `stacktrace`, `repair`, `diagnose` | `error-inference-research` | User reports a runtime or validation error |
| `atlas`, `DuckDB`, `recovery`, `OpenCode failed`, `command failed`, `ACE down`, `GraphRAG down` | `ace-recovery` | Any infrastructure or pipeline failure |
| `search`, `find`, `where is`, `which file`, `rg`, `grep`, `locate` | `rg-atlas` | File/symbol lookup before reading full files |
| `MCP`, `trace`, `kag_search`, `topology`, `engram`, `turbovec`, `langextract` | `trace-mcp-tooling` | Any MCP tool-call orchestration request |
| `context budget`, `token limit`, `too large`, `read file`, `paste`, `full file` | `context-budget` | User asks for file content or is near context limit |
| `ingest`, `index`, `embed`, `chunk`, `qdrant upsert`, `atlas_cards` | `caveman-pipeline` | Document/code ingestion into Qdrant |
| `markdown`, `.md`, `.txt`, `ingest docs`, `index docs` | `ingest-md-txt` | Ingesting markdown or text files |
| `GraphRAG`, `neo4j`, `graph context`, `sourceRef`, `qdrant context` | `graphrag-context-recovery` | Graph-backed context retrieval |
| `feature`, `label`, `domain`, `ACE domain`, `feature map` | `feature-labeling` | Labeling ACE cards with domain/feature tags |
| `domain`, `route`, `which lane`, `pick tool`, `which skill` | `domain-router` | Task routing decision |
| `tool`, `bash vs mcp`, `which tool`, `rg or embed` | `tool-selection` | Choosing between bash/MCP/embed/Gemma4 tools |
| `sourceRef`, `score`, `rank candidates`, `deduplicate` | `sourceRef-ranking` | Ranking and deduplicating source references |
| `metadata`, `JSONB`, `envelope`, `json envelope` | `metadata-context-analysis` | Metadata and JSONB analysis |
| `MCP chain`, `four-server`, `retrieval chain` | `mcp-toolchain` | Multi-server MCP retrieval |
| `kanban`, `task`, `progress`, `plan`, `milestone`, `next steps` | `project-manager` | Project tracking and task management |
| `docs`, `documentation`, `search docs`, `find doc` | `docs-search-ace` | Documentation search |

---

## Auto-Suggestion Rule

**Before** answering a question, scan the user's message for keywords above. If a match is found:

1. State which skill is relevant: `[Skill: <name>] — <why it applies]`
2. Load that skill's SKILL.md for execution guidance
3. Follow its rules before generating a response

Do NOT load a skill if the keyword match is incidental (e.g. user mentions "error" in passing while asking about a UI feature). Use judgment — the skill should materially change how you respond.

---

## Stacking Rule

Multiple skills can apply. Resolve in this priority order:

1. `error-inference-research` — always first if an error is present
2. `context-budget` — always enforced regardless of other skills
3. `ace-recovery` — if infra is down, nothing else works
4. Domain-specific skill (gemma4, rg-atlas, trace-mcp-tooling, etc.)

---

## Example Thinking Pattern

User says: *"I'm getting a Redis connection error when running the parent atlas load script"*

→ Keywords matched: `error`, `Redis`, `connection error`
→ Skill: `error-inference-research`
→ Also: `ace-recovery` (Redis infra failure pattern)
→ Apply: diagnose first with rg/bash, propose a safe repair plan, do not auto-apply fixes

---

## Available Skills (auto-discoverable via `.opencode/skills/<name>/SKILL.md`)

```
ace-recovery          caveman-pipeline      context-budget
docs-search-ace       domain-router         error-inference-research
feature-labeling      gemma4                graphrag-context-recovery
ingest-md-txt         mcp-toolchain         metadata-context-analysis
project-manager       rg-atlas              sourceRef-ranking
tool-selection        trace-mcp-tooling
```

Invoke any skill by name in your thinking before responding. The skill file contains the exact execution rules.
