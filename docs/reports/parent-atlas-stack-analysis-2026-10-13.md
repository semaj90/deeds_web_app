# Parent Atlas — Stack Analysis & Validation Progress (2026-10-13)

Read-only analysis. Evidence: scoped `rg -l -i "openwiki|deepagents|langchain|pydantic|\.okf"` over
`scripts python sveltekit-frontend/src openspec packages` (JSON/NDJSON excluded), plus receipts listed below.
The search output was truncated by the tool (~400 lines hidden), so **no per-term counts are claimed**.

## 1. Key finding: the OKF validation gate largely already exists

Do **not** add a second "OKF validation reference bundle". These owners already exist and should be extended:

| Concern | Existing owner |
| --- | --- |
| OKF schema boundaries (TS/Zod) | `scripts/atlas/prove-okf-schema-boundaries-v1.mts`, `sveltekit-frontend/src/lib/server/atlas/graph/okf-schema-validation.spec.ts` |
| Python (pydantic) ↔ Zod parity | `scripts/atlas/prove-okf-domain-python-zod-parity-v1.mts`, `scripts/atlas/validate-okf-beautifulsoup-pydantic-v1.py` |
| OKF projection / cross-domain contracts | `.../atlas/knowledge/okf-projection-v1.ts`, `.../atlas/contracts/okf-cross-domain-v1.ts` |
| Chunk plan / crawled docs / concept gaps | `validate-okf-chunk-plan-v1.mjs`, `validate-crawled-okf-docs-v1.mjs`, `validate_okf_concept_gaps.py` |
| Ownership / boundary / freshness audits | `audit-okf-runtime-ownership.mjs`, `audit-okf-storage-agent-boundaries-v1.mjs`, `audit-okf-claim-freshness-v1.mjs`, `audit-okf-v02-bundle-v1.mjs` |
| Domain classification + crosswalk | `.../atlas/domain-classification-adapter-v1.ts`, `domain-classification-packet-crosswalk-*.spec.ts` |
| HGRAG / OAK owner map | `scripts/atlas/audit-hgrag-oak-owner-map-v1.mjs`, `.../atlas/retrieval/hypergraph-retrieval-v1.ts` |
| OpenWiki boundary | `scripts/atlas/audit-openwiki-review-input-boundary-v1.mjs` |
| LangChain / DSPy doc corpora | `fetch|chunk|verify-langchain-doc-corpus-v1.*`, `capture-dspy-doc-corpus-v1.py` |
| LangGraph (optional orchestration only) | `.../langgraph/dispatcher-graph.ts`, `prove-langgraph-*`, `audit-langgraph-serde-hardening-v1.mjs` |

Observed: **no `deepagents` match was visible** in the retained output (it may be in the truncated portion — unverified).

**OKF-01 therefore means:** run the existing validators against the real `.okf` directory and record which pass,
not write a new schema. Whether `.okf` here is the public Markdown+YAML-frontmatter OKF or a project convention
must be confirmed from the actual files first.

## 2. Validation progress (receipt-derived, no blended number)

Source: `docs/reports/validation-progress-v1.json` (script: `scripts/atlas/compute-validation-progress-v1.mjs`).
Statuses are computed from receipt contents.

| Gate | Class | Why |
| --- | --- | --- |
| G-01 Resident BFS vs NetworkX | TESTED_FIXTURE | receipt `FIXTURE_ONLY`; cuGraph rows were simulated; no live request/GPU |
| G-02 CPU worker pool | FAILING | checksum parity held, but workers were 12×–16× **slower** than single-thread (synthetic graph, degree counts only) |
| G-03 Schema-topology PageRank | GENERATED_UNVERIFIED | NetworkX only; no cuGraph comparison |
| G-04 Docs links resolve | FAILING | 5,532 broken links (largely vendored/raw doc crawls; not triaged) |
| G-05 Sidecar migrations | BLOCKED | several `planned_sidecar` / `design_unapplied` / `manual_sidecar`; registry ≠ live proof |
| G-06 ACTIVE graph snapshot | BLOCKED | both snapshots SUPERSEDED; revision columns and traversal/`source_ref` indexes not applied |

**Result: 0 of 6 gates PROVEN_LIVE; 1 of 6 (16.7%) fixture-or-better.** This is scoped to these six gates only.
The OpenSpec workboard's 61.6% (7,228/11,729) is checkbox completion, and its controller evidence is stale/missing for
8,896 tasks, so it must not be read as proof-level progress.

## 3. Corrections to earlier statements in this session

- Earlier "OPERATIONAL" labels for MapReduce / CouchDB / MsgPack packets / AST+semantic fusion were based on file
  presence and script headers, **not** on live runs. Treat them as IMPLEMENTED_UNVERIFIED.
- The BFS receipt originally hardcoded `PROVEN`; it now records `FIXTURE_ONLY`.
- The worker benchmark originally recommended enabling workers; the data says the opposite. Verdict corrected.
- Graph timeouts: the `EXPLAIN` evidence points to a parallel seq scan on `source_ref` lookups (no index), not CPU starvation.
  Live-index readiness for the traversal indexes is still unapplied.

## 4. Next gates (smallest first)

1. OKF-01: run the existing validators over the real `.okf` tree; record pass/fail per file.
2. G-04 triage: split broken links into first-party vs vendored crawl output.
3. Draft (do not apply) `CREATE INDEX CONCURRENTLY` DDL for `source_ref` + typed traversal indexes; rehearse in rollback.
4. Prove one source → chunk → revision → `semantic_768` lineage chain before promoting dependent graph/cache/learning work.

```yaml
likely_cause: Progress claims were conflating file presence, fixtures, and checkbox completion with live proof.
evidence: [docs/reports/validation-progress-v1.json, docs/reports/atlas-resident-bfs-proof-2026-10-13.json, docs/reports/graph-cpu-worker-qualification-2026-10-13.json, .tmp/atlas/docs-link-audit.json]
patch_targets: [scripts/atlas/compute-validation-progress-v1.mjs, scripts/atlas/benchmark-graph-cpu-workers.mjs]
safe_next_command: node scripts/atlas/compute-validation-progress-v1.mjs
smoke_command: node scripts/atlas/benchmark-graph-cpu-workers.mjs
report_path: docs/reports/validation-progress-v1.json
```
