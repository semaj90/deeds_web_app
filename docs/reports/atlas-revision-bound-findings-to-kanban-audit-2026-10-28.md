# Parent Atlas AST-to-Kanban Pipeline Audit

Date: 2026-10-28

## Result

The owners exist, but the producer-to-consumer path is partial. Directory scoring and agentic error-fixing planning remain separate inputs; no direct adapter currently turns a qualified AST finding into a Kanban proposal. The existing Kanban bridge now preserves and verifies source-byte provenance when a plan supplies it. It still does not establish canonical workspace admission.

| Stage | Owner | Current evidence | State / first blocker |
|---|---|---|---|
| Analyze | `scripts/atlas/file-ast-facts-v1.mjs` | Inventory-bound JSONL facts include source digest, byte spans, parser owner/version, optional exact workspace binding, and `symbol_resolution=NOT_VERIFIED`. | `OWNER_PRESENT`; the bounded observations include `REVIEW_REQUIRED` request-validation cases and are not automatically confirmed defects. |
| Rank | `scripts/atlas/directory-remediation-rank-v1.sql` | Deterministic baseline plus diagnostic AST score; optional PageRank CSV input. The query does not connect to Neo4j. Missing graph data is not required by the score terms. | `OWNER_PRESENT`; directory scores are recommendations, not file-level findings or proof of quality. |
| Plan | `scripts/atlas/run-agentic-error-fixing-v1.mjs` | Converts diagnostics, Graphify eligibility reports, or an explicitly reviewed source-findings envelope into proposal candidates. | `CONTRACT_TESTED`; no automatic producer converts raw AST observations into confirmed findings. |
| Kanban projection | `scripts/atlas/build-error-fixing-kanban-tasks-v1.mjs` | Existing board path is `docs/reports/atlas/atlas-kanban-tasks.json`; dry-run and non-dispatch tests exist. | `CONTRACT_TESTED`; qualified source digest/span are validated against current repo bytes and carried to the board. Workspace revision is shape-checked and passed through, not independently validated here. |
| Fix/revalidate | Human-reviewed patch plus parser/tests | No auto-dispatch or source edit occurs in the bridge. | Separate approval and execution path remains required; no automatic agent dispatch was tested or added. |

## Change and verification

- `build-error-fixing-kanban-tasks-v1.mjs` accepts optional `sourceRevision`, `workspaceRevision`, `evidenceDigest`, `sourceSpan`, and `evidenceRefs` on a proposal candidate.
- When source provenance is present, the bridge rejects absolute/out-of-repository paths and escaping symlinks, verifies the file SHA-256, bounds-checks the UTF-8 byte span, and verifies the span digest before constructing board rows. It carries `source_revision`, nullable `workspace_revision`, `evidence_digest`, `source_span`, and evidence refs forward.
- Existing unqualified diagnostic plans remain supported and stay explicitly non-canonical/non-dispatchable. These new checks prove bytes against the local file at bridge time; they do not prove a canonical workspace revision or database admission.
- The planner accepts `--findings` as a separate input mode. It requires an envelope marked `REVIEWED` and individual `CONFIRMED` findings, verifies source and evidence-span SHA-256 against current repository bytes, rejects stale/escaping paths and duplicates, and emits only `PROPOSED` candidates with `mutationAllowed: false`. `--findings` cannot be combined with diagnostic text inputs. This is a reviewed-finding adapter, not an AST-fact auto-promoter; the existing AST observations still require independent review and a qualifying workspace-revision owner.
- Deterministic planning no longer probes the local model endpoint by default. Model discovery and synthesis are reached only with explicit `--synthesize`; the structured-findings test exercises the default path and confirms model resolution is skipped. This is not an Ollama integration, and no chat request is part of the AST-to-Kanban flow.
- Focused bridge suite: **8/8 passed**, including reviewed finding byte verification, stale source rejection, proposal-only projection, dry-run non-write behavior, and protection against overwriting on invalid plans. Both planner and bridge syntax checks passed. `git diff --check` passed; only the existing LF/CRLF warning was reported.
- The AST generator test was not run: it writes fixtures beneath the repository source tree and deletes its fixed fixture paths during cleanup; those paths were not established as empty before execution.
- No Graphify run, Neo4j/Valkey/PostgreSQL/SeaweedFS write, GPU job, model call, or production board update was performed. Test-created temporary files and board fixtures were cleaned up.

## Next gates

1. Keep the reviewed-findings envelope producer separate from raw AST facts; define its human/independent-review owner before generating `CONFIRMED` inputs. Preserve unresolved parser observations as `REVIEW_REQUIRED`, not defects.
2. Keep AST observations, directory-level hygiene recommendations, and Graphify lifecycle blockers as distinct task origins and evidence kinds.
3. Feed optional, admitted graph metrics into ranking only when their snapshot/revision is current; otherwise leave deterministic ranking operational without graph contribution.
4. Preview candidate proposals with the existing board builder using `--dry-run`; separately review any local board-file write. Do not dispatch an agent or alter source files automatically.
5. Treat courtroom playback as a separate finding and prove the runtime animation measurements before declaring it resolved.

`likely_cause`: The pipeline owners are present, but raw AST observations are not independently reviewed into confirmed findings; the new adapter accepts only reviewed, byte-verified proposals.

`evidence`: `scripts/atlas/file-ast-facts-v1.mjs`; `scripts/atlas/directory-remediation-rank-v1.sql`; `scripts/atlas/run-agentic-error-fixing-v1.mjs`; `scripts/atlas/build-error-fixing-kanban-tasks-v1.mjs`; `scripts/atlas/run-agentic-error-fixing-kanban-v1.test.mjs` (8/8).

`patch_targets`: `scripts/atlas/run-agentic-error-fixing-v1.mjs`; `scripts/atlas/build-error-fixing-kanban-tasks-v1.mjs`; `scripts/atlas/run-agentic-error-fixing-kanban-v1.test.mjs`; this report.

`safe_next_command`: Generate a fixture-only `REVIEWED` envelope from independently reviewed findings, then run the planner with `--offline`; do not run Graphify or write the board.

`smoke_command`: `node --test scripts/atlas/run-agentic-error-fixing-kanban-v1.test.mjs`

`report_path`: `docs/reports/atlas-revision-bound-findings-to-kanban-audit-2026-10-28.md`
