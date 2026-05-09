# Agentic Ingestion Program - 2026-05-08

## Goal

Build a production-ready ingestion spine that helps the AI understand this SvelteKit 2 app, compare external information to repo truth, and fix errors safely.

## Scope

Two lanes, one spine:

- Dev/codebase lane: graph JSONL, markdown memories, AGENTS.md, repo docs, code graph, route metadata.
- Legal/admin lane: PDFs, statutes, briefs, exhibits, case docs, evidence records.

Shared flow:

`source -> source_hash -> parser -> chunks -> notecards -> summaries -> embeddings -> graph edges -> context packs -> LLM analysis -> audit log`

## Ingestion Sources

- Local repo files
- Firecrawl or web search results
- GitHub MCP data
- Existing docs and next_steps notes
- Language docs / API docs
- Repo graph JSONL / JSONB / markdown vault notes

## Core Rule

Never send raw source directly to the LLM unless it has already been reduced into cards, ranked, and compared against repo context.

## Readiness Checklist

### SvelteKit 2 + repo stack

- Auth is on protected routes and API paths.
- All body-parsing routes validate with Zod.
- SSR-unsafe globals are eliminated or isolated.
- Hardcoded localhost URLs are removed outside env config.
- Route tests exist for critical user flows.
- GET routes degrade gracefully instead of returning shape-breaking errors.
- DB access uses the canonical Drizzle client and canonical schema.
- Redis keys are namespaced and snapshot-aware.
- Qdrant retrieval is paired with sparse search.
- AGENTS.md and next_steps docs stay aligned with actual code paths.

### Agentic ingestion

- Every source gets a stable hash.
- Every source becomes a compact card.
- Every card has search text and context text.
- Sparse retrieval runs before dense retrieval.
- Graph expansion runs before rerank.
- The final context pack stays small.
- The LLM sees ranked evidence, not raw dumps.
- Audit logs capture what was read, ranked, and used.

## What The AI Needs To Understand

- App architecture and route ownership.
- Data model and schema invariants.
- Permission boundaries between admin/legal/dev lanes.
- Known hot paths, caches, and retrieval boundaries.
- Existing tests and missing tests.
- Previous fixes, regressions, and active plans.
- Current graph neighbors and related docs.
- Snapshot state so it can compare before/after changes.

## Generalized Agentic Loop

1. Pull data from repo, web search, Firecrawl, GitHub, MCP, and docs.
2. Normalize into KnowledgeCards.
3. Score relevance with sparse + dense + graph signals.
4. Compare retrieved evidence to repo truth.
5. Build a compact context pack.
6. Propose a fix.
7. Verify with tests, route checks, and smoke gates.
8. Record the audit trail.

## Phases

### Phase 1 - Shared spine

- Define the shared card schema.
- Normalize code and legal sources into one card model.
- Keep raw payloads separate from retrieval cards.

### Phase 2 - Retrieval quality

- Add sparse search + dense search + graph expansion.
- Rank by risk, freshness, degree, and summary quality.
- Compare external sources to repo context.

### Phase 3 - Production readiness

- Enforce auth, validation, and degraded contracts.
- Add route and pipeline smoke tests.
- Make the audit log the default output of agentic runs.

### Phase 4 - Error fixing

- Use the card graph to find likely files.
- Confirm the target with test and schema checks.
- Patch the smallest correct area.
- Re-run verification before any follow-up change.

## Output Artifacts

- `memory/kb/cards/*`
- `memory/kb/notecards/*` for legacy support
- `next_steps/active/*` planning notes
- audit logs for each run

## Acceptance Criteria

- The AI can explain the app from cards, not raw dumps.
- The AI can distinguish legal/admin data from dev/codebase data.
- Retrieval returns the right files and docs before a fix is proposed.
- Error fixes are verified against tests and production gates.
- No lane mutates data it should only read.

## Non-Goals

- No LLM calls during raw parsing.
- No direct writes from ingestion parsers.
- No cross-contamination between legal and dev lanes.
- No large context packs.

## Next Steps

1. Keep the shared KnowledgeCard schema canonical.
2. Add legal/PDF adapters after the codebase lane is stable.
3. Wire a retrieval API that can serve both lanes.
4. Use the same spine for agentic error fixing and production readiness review.
