# Repo Proof-Status Analysis (2026-10-13)

**Status**: read-only analysis | **Scope**: OpenSpec tasks, receipts, framework references | **Writes**: this file only

---

## TL;DR

Checkbox progress (61.6%) is not proof progress. Only 4.3% of checked tasks cite a receipt file. The checkbox percentage has a different denominator from the workboard, and no single honest overall percentage can be computed. Use the per-measure numbers below instead.

## Measures

| Measure | Value | Source | Caveat |
|---|---|---|---|
| Workboard completion | 7,228 / 11,729 = 61.6% | `docs/reports/openspec-workboard-v1.json` | ETA reported as UNKNOWN (no receipt-linked throughput) |
| Checked tasks (rg) | 7,804 | `- [x]` lines in OpenSpec `tasks.md` | Different denominator from the workboard (7,804 vs 7,228 done) |
| Checked tasks citing a receipt | 334 (4.3% of checked) | `[x]` lines with a `docs/reports/` or `.tmp/` `.json`/`.md`/`.txt` path | Path match only; receipt contents not verified |
| Proof-status markers | see table below | rg word counts | Counts include prose that describes markers, not only verdicts |

## Proof-status marker counts (OpenSpec `tasks.md` lines)

| Marker | Lines |
|---|---|
| PROVEN | 451 |
| DRY_RUN_PROVEN | 98 |
| APPLY_PROVEN | 52 |
| PARTIAL | 148 |
| WIRED | 119 |
| CREATED | 92 |
| BLOCKED | 326 |
| NOT_PROVEN | 310 |
| NOT_RUN | 43 |

Dry-run and wired markers are not proof of live behaviour (repo status-language rule).

## Framework references (files under `sveltekit-frontend/src`, `python`, `packages`, `scripts`)

| Term | Files | Reading |
|---|---|---|
| langgraph | 209 | highest; the repo's loop controller and bridges |
| langchain | 138 | presence only; not evidence of live use |
| `.okf` | 135 | active documentation/analysis pipeline |
| pydantic | 93 | Python contract validation |
| openwiki | 18 | generated evidence index (`openwiki/`) |
| deepagents | 8 | low use; treat as tooling reference |

A file mentioning a framework does not show the framework runs in production. Callers and receipts must be checked separately.

## Honest percentage

- **Overall:** not computable. The workboard counts checkboxes; the proof gates are not scored against one denominator.
- **Receipt-backed:** 4.3% of checked tasks cite a receipt. This is a lower bound on evidence, not a measure of correctness.
- **Phase-level:** per the phase audit (`PARENT_ATLAS_END_TO_END_READINESS_AUDIT`), phases 17–21 percentages are from an older report, and other phases lack an owner or denominator. Mark them N/A rather than inventing zeros.

## Next proof gate (recommended)

Prove one lineage chain before promoting dependent work:

`source_ref` → `packet_key` / chunk → `sourceRevision` → `semantic_768`

Acceptance: one real revision-qualified item traced through PostgreSQL, Qdrant and the packet, with a receipt that cites its path.

## Limits of this analysis

- Read-only. No services, databases or receipts were modified.
- Counts are path and word matches, not parsed verdicts.
- The 7,804 vs 7,228 gap is not reconciled here.
