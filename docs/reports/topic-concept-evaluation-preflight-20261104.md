# Parent Atlas topic/concept evaluation preflight — 2026-11-04

Status: SOURCE_REVIEW_ONLY / JUDGED_COHORT_NOT_FROZEN / NO_CANONICAL_PROMOTION

## Existing evaluation owners

- `sveltekit-frontend/openspec/changes/phase-2f1-real-evaluation-corpus/specs/deterministic-judgments/spec.md` specifies four deterministic judgment sources: AST, route, schema, test.
- `docs/reports/ga8-judge-01-freeze-implementation.md` documents frozen candidate pools and LLM_JUDGED_PROXY (not human gold) ablations. Its pool-local candidateId is not a canonical PacketKey/CandidateOrdinal.
- `python/sweep_ga8_frozen_judgments_v1.py` and `sveltekit-frontend/scripts/atlas/phase2f-evaluation-runner.mts` are existing evaluation adapters to census before adding code.
- Locally reported `topic-concept-join-v1.ts` (14 tests) and `recommendation-metrics-v1.ts` (6 tests) are uncommitted-worktree claims not independently reproducible from this GitHub branch.

## Source-only candidate questions (NOT relevance judgments)

These queries form a *proposed review queue*, not a scored dataset. Do not run Recall@K, MRR or publish quality results using these entries.

| Query ID | Category | Review question | Source-grounding location to inspect |
| --- | --- | --- | --- |
| TC-SYMBOL-001 | symbol lookup | Where is the authenticated evidence-case access check implemented? | `sveltekit-frontend/src/routes/(app)/cases/[id]/evidence/+page.server.ts` |
| TC-DEPEND-001 | dependency analysis | Which loaders read evidence by case ID and how do they authorize the read? | `sveltekit-frontend/src/routes/(app)/cases/[id]/board/+page.server.ts`, `.../chat/+page.server.ts` |
| TC-REPAIR-001 | error repair | Which test and implementation are responsible for case-access denial? | `sveltekit-frontend/src/lib/server/evidence-case-admission-v1.spec.ts` |
| TC-TOPIC-001 | topic discovery | How are stable topic identities derived and versioned? | Locate the active `topic-identity-v1.ts` owner in the current local worktree |
| TC-CONCEPT-001 | concept relationship | Which graph relationship links taxonomy topics to canonical feature IDs and packet keys? | Inspect local `topic-concept-join-v1.ts` and authoritative graph admission receipts |
| TC-FEATURE-001 | feature recommendation | Which source evidence supports an authentication-related feature recommendation? | Read-only source and symbol-registry admission; no guessed PacketKey |

## Admission requirements for a true frozen judged cohort

For every query, record exact repo commit and workspace revision, source revision, graph revision when relevant, embedding model/recipe revision, canonical packet/symbol identities if admitted, grade and independent judgment provenance (AST/route/schema/test or verified human review). Record absent identities as UNRESOLVED; never derive a packet key solely from a path or label.

Use SHA-256 checksums on canonical serialized query/judgment manifests; preserve original fixture bytes; never let evaluation results generate their own relevance labels. Freeze the candidate universe before judgments. Partition LLM_JUDGED_PROXY from HUMAN_GOLD and DETERMINISTIC_SOURCE labels. Compute metrics only over eligible, sufficiently judged queries and name the candidate universe.

## Explicit blockers

1. Local topic-join/metric code is reported as uncommitted and is not present in this GitHub branch.
2. No source-qualified canonical packet/key/ordinal set was read from live Postgres in this review.
3. No independently reviewed relevance grades or source-revision manifest was provided for this proposed six-query set.
4. No live Neo4j/NetworkX, Qdrant/TurboVec, Prefill DAG, or API evaluation was run.
5. Current graph-admission state and `graphify:daily` safety gates were not changed.

No live metrics, database writes, model calls, Graphify runs, fixture overwrites or production promotion were performed.

## Production priority found during read-only inspection

Counsel `+page.server.ts` checked only authentication before case/evidence reads. Evidence board `+page.server.ts` used a user-specific cache key without case-membership verification. A separate branch patch now gates both through the same owner/assigned-attorney predicate used by the evidence page. Route regressions and runtime typecheck are still required before merging; audit all other case endpoints for consistent membership rules.
