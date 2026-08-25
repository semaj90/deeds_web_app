# Disk Cleanup Canonical TOC — 2026-08-25

Built after a user correction: prior reasoning in this session used plausibility
("it's probable X uses this") as justification for cleanup actions. This document
replaces that with a verified inventory — each row states exactly what evidence
was checked, not what seemed likely.

Status legend: **VERIFIED** = checked against a real, cited source before acting.
**UNVERIFIED-AT-TIME** = action was already taken without adequate verification;
this row records what verification would have looked like and whether it holds up
in hindsight. **NOT ACTIONED** = found, not yet acted on, pending this TOC.

## Actions already taken this session

| Item | Action | Evidence at time of action | Status |
|---|---|---|---|
| `legal-ai-postgres` full DB dump | Created backup | Standard precaution before any live-DB write; not a deletion | VERIFIED (precaution, not cleanup) |
| `pgvector/pgvector:pg18` -> `pgvector-pgsearch:pg18-local` | Docker image swap + commit | Read `docker-compose.yml` directly, confirmed named-volume persistence, confirmed via `docker system df -v` the old base image has 0 containers | VERIFIED |
| `codebase_chunk_index.content_embedding` | Re-embedded 52,325 rows | Explicit operator approval; piloted 5+50 rows with readback verification before full run; post-run count reconciliation (52,379+1+37=52,417) done | VERIFIED |
| 11x `node_modules` in 5 worktree checkouts | Deleted | `node_modules` is gitignored, npm/pnpm-regenerable by definition; worktrees' own `package.json`/`package-lock.json`/`pnpm-lock.yaml` remain untouched | VERIFIED (node_modules is unconditionally regenerable, not project-specific evidence needed) |
| `.tmp/atomic-mtp`, `atomic-mtp-unsloth`, `atomic-mtp-release-519f0c5` | Moved to Desktop (not deleted) | `memory/SESSION-201-EG-GGUF-PROOF-GATES-0-2.md` explicitly states "NOT any `.tmp/atomic-mtp*` path — not in use", from a prior session's real investigation of the live embedding executor | VERIFIED |
| `.tmp/atomicbot-src` | Moved to Desktop (not deleted) | **Not checked before moving** (unverified-at-time). Follow-up review: `git remote -v` confirms a real clone of `https://github.com/AtomicBot-ai/atomic-llama-cpp-turboquant`, branch `feature/turboquant-kv-cache`, last commit `519f0c594a8e...` (merged PR #30, 2026-07-03). That short hash `519f0c5` exactly matches the sibling `atomic-mtp-release-519f0c5` directory name — confirms that directory was a build output from this exact source commit, tying the two together with real evidence instead of naming-pattern guesswork. `AGENTS.md` confirms it's a real llama.cpp-derived project (has the standard llama.cpp contributor AI-PR-policy boilerplate). A third, previously-undocumented TurboQuant fork attempt, distinct from the two forks this repo's own `CLAUDE.md` documents (`TheTom/llama-cpp-turboquant`, `test1111.../llama-cpp-turboquant-gemma4`) | VERIFIED (identity confirmed). Since it's a clone of an accessible upstream GitHub repo, it is trivially re-clonable if ever needed again — genuinely low-cost to keep or eventually remove either way. Not deleted this pass; left on Desktop pending your call. |
| `npm cache clean --force` | Cache cleared | npm's own cache is npm-owned and rebuilt automatically on any `npm install`; this is definitionally always safe regardless of project | VERIFIED (npm cache is unconditionally regenerable) |
| `pip cache purge` | Cache cleared (9.1 GB) | Confirmed via `ls` that the directory contained only `cache/` (pip's own internal cache structure); pip cache is definitionally regenerable | VERIFIED (structure confirmed, and pip cache is unconditionally regenerable) |
| `uv cache clean` | Cache cleared (15.7 GiB) | Confirmed directory structure (`cache/` + `uv-receipt.json`) matched uv's own layout, but **never checked whether this repo/system actually uses `uv`** before claiming "plausible" | UNVERIFIED-AT-TIME, and the follow-up correction below **reverses the earlier "no dependency" conclusion** — do not read the two intermediate rows above this note as the final answer. |
| ↳ **Follow-up correction (3rd check, properly `--exclude-dir`-scoped grep, completed later)** | — | Two real, non-vendored hits found: (1) `docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md:1141` — an unchecked planned task, `Install Unsloth + PyTorch (uv pip install unsloth --torch-backend=auto)`, which connects directly to the abandoned `.tmp/atomic-mtp-unsloth` directory found earlier this session; (2) **`llama-cpp-turboquant-gemma4/scripts/tool_bench.py:1` has a literal `#!/usr/bin/env uv run` shebang** — this script requires `uv` to be installed to execute directly. Zero `uv.lock` files still found across all three checks (that part holds), but "this repo's own tooling doesn't depend on uv" was **wrong** — it does, in at least one real script. | **CORRECTED: real dependency exists.** Practical impact is still limited: `uv` the *tool* was never uninstalled, only its download cache — `uv run`/`uv pip install` on next invocation will simply re-resolve and re-download rather than fail, so the script and the planned Unsloth task both still work, just without the warm cache. No breakage occurred, but the earlier confidence ("reasonably good evidence... doesn't depend on `uv`") was asserted before the evidence that contradicts it had actually been found — exactly the failure mode this TOC exists to stop. |
| `pnpm store prune` | Cache cleared (1.63 GB) + stale registry entry removed | `pnpm store prune` is pnpm's own official maintenance command; it only removes content unreferenced by any known pnpm project (confirmed via its own output: "Checking 1 registered project(s)... Removed 1 package") | VERIFIED (used the tool's own safe/official command, not raw deletion) |
| `docker system prune -a --volumes -f` | **Rejected by user before execution** | N/A — not run | N/A |

## Found, not yet actioned

| Item | Size | What's actually known | Verification needed before any action |
|---|---|---|---|
| ~~`.tmp/mapreduce-full.ndjson` / `-v2` / `-v3` / `-v5`~~ — **RESOLVED, moved to "actionable" below** | — | Was a naming-based guess; now verified via `Grep` across `scripts/` | See resolved row below |
| `.tmp/backups` (538 MB, distinct from repo-root `backups/`) | 538 MB | Not inspected at all | List contents, check dates/purpose before any action |
| `AppData\Roaming\Code` (31.35 GB), `Atomic Chat` (22.17 GB), `Kiro` (13.07 GB), `Claude` (11.02 GB) | ~77.6 GB | Known to be real installed apps' data directories; NOT inspected for what specifically is inside (workspace storage vs. chat history vs. extension cache) | Do not touch without explicit review — "Atomic Chat" and "Claude" plausibly hold conversation history, not just cache |
| `docker system prune -a --volumes` | ~1.8-14.8 GB (Docker's own `system df -v` numbers) | Confirmed via `docker system df -v`: 0 unused volumes (all 21 have `LINKS:1`), only 1 unused image (old `pgvector/pgvector:pg18` base, superseded), 1.169 GB build cache | This one IS backed by real `docker system df -v` output, not guesswork — but still requires explicit re-confirmation before running given the earlier rejection, per updated working-style rule |
| `Downloads` (75 GB), `Documents` (39 GB), `Pictures` (33 GB), `Music` (19 GB) | ~166 GB | Sizes only; contents never listed | User's own files — not this session's call to review or suggest cleanup for at all |

## Verified actionable (fully checked, awaiting go-ahead)

| Item | Size | Evidence | Recommendation |
|---|---|---|---|
| `.tmp/mapreduce-full.ndjson`, `-v2`, `-v3` | 109.67 + 109.97 + 110.16 MB = **329.8 MB** | `Grep` across all of `scripts/` for `mapreduce-full` found only 4 files with any reference at all: `mapreduce-path-join.mjs` and `missing-features-review.mjs` both hardcode `mapreduce-full-v4.ndjson`; `audit-phase17-21-workstation.mjs` hardcodes `mapreduce-full-v5.ndjson`; `build-recommendations.mjs` references v4 in a suggested command string. **Zero references to `mapreduce-full.ndjson`, `-v2`, or `-v3` found anywhere.** | Safe to archive/delete — genuinely orphaned, not "presumably" superseded |
| `.tmp/mapreduce-full-v4.ndjson` (19.47 MB) and `-v5.ndjson` (805.35 MB) | 824.8 MB | Both actively referenced by different live scripts for different purposes (v4: path-join + missing-features review; v5: phase17-21 workstation audit) — **not interchangeable despite the sequential naming** | Keep both — do not treat "highest version number" as "the only one still needed" |

## Deleted (executed, not just recommended)

| Item | Size | What was checked before deleting | Result |
|---|---|---|---|
| `AppData\Roaming\Kiro\User\globalStorage\kiro.kiroagent\index` | 3.77 GB | N/A — top-level folder named `index`, no ambiguity | Deleted |
| `...\e38928570c6f912e50e9324cf73762c9\414d1636299d2b9e4ce7e17fb11f63e9` | 2.486 GB | Sampled contents: 1,874 extensionless hash-named files (~500KB-2.8MB each) — classic opaque content-addressable cache/index shape, no readable chat content | Deleted |
| `...\e38928570c6f912e50e9324cf73762c9\74a08cf8613c7dec4db7b264470db812` | 0.072 GB | Same parent pattern as above | Deleted |
| **Total freed** | **~6.33 GB claimed, 5.95 GB measured** (`Get-PSDrive C`: 37.66 -> 43.61 GB free) | — | Small variance from rounding/filesystem overhead, not a discrepancy of concern |
| **Explicitly preserved per user instruction ("keep the tiny chats")** | — | Verified via `Get-ChildItem -Filter "*.chat"` immediately after deletion | **13,885 `.chat` files confirmed still present** in `e38928570c6f912e50e9324cf73762c9` (the earlier partial listing only showed ~15 of these — the real count is much higher, still individually tiny so negligible total size) |
| **Also explicitly preserved** | 0.099 GB | `workspace-sessions/` — not part of the delete list, left untouched | Preserved |

## Follow-up verification: closed

- `uv` usage check: complete, see row above. No further follow-ups open.
