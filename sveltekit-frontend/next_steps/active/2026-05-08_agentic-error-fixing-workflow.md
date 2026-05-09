# Agentic Error Fixing Workflow - 2026-05-08

## Purpose

Compact workflow for fixing production issues with the shared KnowledgeCard spine.

## Loop

1. Identify the failing route, API, or service.
2. Pull context from cards, docs, AGENTS.md, tests, and recent plans.
3. Compare external evidence to repo truth.
4. Rank likely files and choose the smallest correct fix.
5. Patch only the needed area.
6. Re-run targeted checks and the relevant smoke gate.
7. Record the result in the audit trail.

## Inputs

- Route/file name
- Error text or stack trace
- Relevant KnowledgeCards
- Recent next_steps notes
- Matching tests or smoke commands

## Must-Have Checks

- Auth stays intact on protected paths.
- Zod validates body-parsing routes.
- GET routes preserve degraded response shape.
- No raw LLM calls during parsing.
- No mutation in read-only inspection paths.
- No cross-lane writes between legal and dev data.

## Retrieval Order

1. Sparse match on exact names and errors.
2. Dense match on semantic intent.
3. Graph neighbors and related cards.
4. Relevance rerank.
5. Small context pack only.

## Fix Strategy

- Prefer the smallest patch.
- Keep the code in the existing layer unless a refactor is necessary.
- Use existing schemas and helpers before adding new ones.
- Stop once the target behavior is verified.

## Verification

- Run the targeted route or file test first.
- Run the relevant smoke gate next.
- Only widen the scope if the failure repeats.

## Exit Criteria

- The issue is reproduced, fixed, and verified.
- The note stack explains why the fix was chosen.
- No unrelated files changed.
