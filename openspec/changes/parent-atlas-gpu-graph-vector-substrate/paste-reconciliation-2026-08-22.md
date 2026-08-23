# Paste Reconciliation — 2026-08-22

**Status**: Raw pasted status text from a parallel/different agent session, cross-checked
against live repo (git) and live web state. This is a reconciliation record, not a decision
and not an implementation. Nothing here should be treated as CONFIRMED unless explicitly
marked so below with supporting evidence.

**Origin of this note**: operator pasted an unstructured wall of research/status text
describing work claimed to be already implemented on branches `agent/ast-parity-corpus-v2-interpreter-20260822`
and `agent/cugraph-orientation-api-proof-20260822`, referencing draft PRs #55/#56, several
new contracts, and a set of upstream-API claims (cuGraph, cuVS/CAGRA, CUTLASS, cuTile,
PyTorch `Storage.from_file`, Qdrant). A prior in-session check (before `git fetch`) reported
these exact branch names did **not** exist in `git branch -a`. This note resolves that
discrepancy: the branches exist on `origin`, they were simply not fetched yet.

## 1. Branch / PR verification

| Claim | Status | Evidence |
|---|---|---|
| `agent/ast-parity-corpus-v2-interpreter-20260822` exists | VERIFIED_EXISTS | present under `origin/` after `git fetch --all --prune` |
| `agent/cugraph-orientation-api-proof-20260822` exists | VERIFIED_EXISTS | present under `origin/` after fetch |
| PR #56 ("Add AST corpus parity post-run interpreter") | VERIFIED_EXISTS, MERGED TO MAIN | `git log --all --grep "#56"` → `a3ad9926d0 Merge pull request #56 from semaj90/agent/ast-parity-corpus-v2-interpreter-20260822`; `git merge-base --is-ancestor a3ad9926d0 origin/main` → **YES** |
| PR #55 ("Add qid-based domain-match ablation") | VERIFIED_EXISTS, **NOT MERGED TO CURRENT MAIN TIP** | `db1fb0cbb2 Merge pull request #55 from semaj90/agent/domain-rerank-ablation-eval-20260822` exists in the all-branches log but `git merge-base --is-ancestor db1fb0cbb2 origin/main` → **NO**. It only appears in `git branch -a --contains db1fb0cbb2` under `remotes/origin/agent/domain-rerank-shadow-eval-20260822` — i.e. GitHub recorded a merge of PR #55 at 2026-08-22 11:37:59, but current `origin/main` tip (`a69a68956d`, dated 2026-08-22 13:08:53, "Merge pull request #41...") does not contain it. This looks like main was reset/force-pushed or PR #55 was merged into a divergent ref, not into the `main` branch as it exists now. **UNRESOLVED — flag for operator.** |
| `gh` CLI available for direct PR-list confirmation | NOT AVAILABLE | `gh: command not found` (Bash) and `gh: not recognized` (PowerShell) — could not independently query GitHub's PR API; all PR evidence above comes from local merge-commit messages in the fetched git history only. |

**Branches referenced in the paste but NOT found under any name** (community-projection /
Leiden / CAGRA / CUTLASS specific branch names): none found — `git branch -a` has no branch
literally named for these; the corresponding files instead live inside
`agent/cugraph-orientation-api-proof-20260822` (see file table below), which is the correct,
just differently-named, home for that work.

## 2. Claimed new files — existence check

Checked via `git ls-tree -r --name-only <ref>` per branch, plus `git cat-file -e origin/main:<path>` for main-tip presence.

| File | Found? | Branch(es) | On `origin/main` tip? |
|---|---|---|---|
| `sveltekit-frontend/src/lib/server/atlas/graph/community-projection-v1.ts` (+ `.spec.ts`) | FOUND | `agent/cugraph-orientation-api-proof-20260822` | YES (branch merged via PR into main) |
| `python/community_projection_networkx_oracle_v1.py` (+ test) | FOUND | `agent/cugraph-orientation-api-proof-20260822` | YES |
| `python/prove_atlas_cugraph_storage_orientation_sequence.py` (+ test) | FOUND | `agent/cugraph-orientation-api-proof-20260822` | YES |
| `sveltekit-frontend/src/lib/server/atlas/features/manifold4-orientation-v1.ts` (+ `.spec.ts`) — not explicitly named in paste but co-located | FOUND (bonus) | same branch | YES |
| `docs/parent-atlas-leiden-community-projection-gate.md` — not explicitly named in paste but co-located | FOUND (bonus) | same branch | not directly checked, same branch as merged files |
| `atlas_compute/domain_rerank_ablation.py`, `domain_rerank_ablation_gate.py`, `prove_domain_rerank_ablation.py` (+ tests) | FOUND (under `python/`, not repo-root `atlas_compute/` as paste implied) | `agent/domain-rerank-ablation-eval-20260822`, `agent/domain-rerank-shadow-eval-20260822` | **NO** — see PR #55 discrepancy above |
| `sveltekit-frontend/src/lib/server/atlas/indexing/structural-parity-corpus-interpretation-v1.ts` (+ `.spec.ts`) | FOUND | `agent/ast-parity-corpus-v2-interpreter-20260822` | YES |
| `scripts/atlas/interpret-node-tree-sitter-corpus-parity-v2.mts` | FOUND (path is `sveltekit-frontend/scripts/atlas/...`, not repo-root `scripts/atlas/...` as paste implied) | same branch | YES |
| `docs/parent-atlas-canonical-gpu-graph-vector-api-links.md` | FOUND | merged to main directly (`b5a783362246a097c8a12d24b96f8cca4e0821cd`, 2026-08-22 12:17:35) | YES, but **not present in the current local working tree** (this session is on `archive/orphaned-root-src-tree-20260822`, not `main` — file exists on `origin/main` in git history but was not checked out locally) |

**Overall**: every file the paste named was located, but two location details in the paste
were imprecise (repo-root `atlas_compute/` and repo-root `scripts/atlas/` — both are actually
under `python/` and `sveltekit-frontend/`, matching this repo's real layout conventions).
None of the files are FOUND_UNDER_DIFFERENT_NAME — they're all at recognizable, if
path-imprecise, locations. One whole feature line (domain-rerank ablation, PR #55) has real
committed code but is **not currently reachable from `origin/main`'s tip**, which contradicts
the paste's framing of it as shipped/merged.

## 3. Web-verified upstream API claims

| Claim | Verdict | Source |
|---|---|---|
| CUTLASS GEMM Heuristics restrict supported hardware to Hopper (sm9x) / Blackwell (sm10x), **excluding** Ampere (sm86/RTX 3060 Ti) | **CONFIRMED** | [GEMM Heuristics — NVIDIA CUTLASS Documentation](https://docs.nvidia.com/cutlass/latest/media/docs/cpp/heuristics.html) — "The heuristics currently support Hopper (sm9x) and Blackwell (sm10x) architectures for plain dense GEMM with f8, f16, and f32 data types." SM86 is not listed; the feature is explicitly experimental. |
| cuTile 1.2+ documentation adds Ampere/Ada (sm80) support | **CONFIRMED** | [cutile-python (NVIDIA/cutile-python)](https://github.com/nvidia/cutile-python) and related coverage — tileiras compiler (13.2) supports Blackwell and Ampere/Ada GPUs; on Ampere/Ada, tile ops compile and run but fall back to software-managed async copy paths (vs. hardware tile-memory paths on newer archs). |
| cuGraph's Leiden implementation requires undirected weighted graphs and defaults to a non-deterministic `random_state` | **CONFIRMED** | [cugraph.leiden — NVIDIA cuGraph docs](https://docs.nvidia.com/cugraph/26.10/api_docs/api/cugraph/cugraph.leiden/) — current implementation "only supports undirected weighted graphs"; `random_state: int = None` defaults to a hash of process id/time/hostname (non-reproducible unless explicitly pinned). |

All three of the paste's most load-bearing upstream-API claims check out against current
official/near-official documentation. This is meaningful signal that the paste's technical
research (as opposed to its repo-state claims) is trustworthy.

## 4. Proof-state taxonomy — annotated

Paste listed entries such as `CUGRAPH_PAGERANK_ORDINAL: IMPLEMENTED_UNPROVEN`,
`LEIDEN: BLOCKED_ON_UNDIRECTED_PROJECTION_CONTRACT`,
`COMMUNITY_06_CUGRAPH_LEIDEN_EXECUTION: NOT_IMPLEMENTED`. Per this repo's Agent Execution
Integrity rule, none of these are promoted here — they are annotated only against what this
session actually checked:

- `CUGRAPH_PAGERANK_ORDINAL: IMPLEMENTED_UNPROVEN` — **[NOT_CHECKED]**. This session did not
  execute any CUDA/RAPIDS code (out of scope per task instructions). File-existence for the
  orientation-sequence proof script is [VERIFIED] (see §2), but "proven" in the runtime sense
  is [NOT_CHECKED] — no GPU execution was performed.
- `LEIDEN: BLOCKED_ON_UNDIRECTED_PROJECTION_CONTRACT` — the underlying upstream constraint
  (undirected-weighted-graph requirement) is [VERIFIED] (§3). Whether the repo's own
  `community-projection-v1.ts` / `community_projection_networkx_oracle_v1.py` actually satisfy
  that contract end-to-end is [NOT_CHECKED] — files exist (§2) but were not read/executed.
- `COMMUNITY_06_CUGRAPH_LEIDEN_EXECUTION: NOT_IMPLEMENTED` — consistent with "no GPU/RAPIDS
  execution was run" scope of this task; **not contradicted** by anything found, but also not
  independently confirmed either way — [NOT_CHECKED].
- Every other taxonomy line from the paste not explicitly discussed above — **[NOT_CHECKED]**.
  This note deliberately does not attempt to grade the full taxonomy; it only reports what was
  directly verified (branch/PR/file existence, and 3 upstream API claims).

## 5. Summary

The paste is **not** hallucinated file paths or an unrelated repo checkout — the great
majority of what it describes is real, committed code that exists in this exact repository,
just on feature branches that hadn't been fetched into this session's local git state yet
(`git fetch --all --prune` immediately surfaced both named branches). The AST-parity-corpus
interpreter work (PR #56) is genuinely merged into `origin/main`. However, one concrete and
actionable discrepancy remains for the operator: the domain-rerank-ablation work (PR #55) has
a recorded GitHub merge commit but that commit is **not an ancestor of `origin/main`'s current
tip**, meaning either `main` was force-pushed/reset after that merge, or PR #55 was merged into
a different target than the paste (and possibly GitHub's own merge log) implies — this needs
direct operator/GitHub-UI confirmation (this session had no working `gh` CLI to check the PR's
actual base/merged status via API). The three spot-checked upstream technical claims (CUTLASS
hardware support, cuTile Ampere support, cuGraph Leiden constraints) are all independently
confirmed against current official documentation, so the paste's underlying research quality
appears sound even where its repo-state narrative needs correction.
