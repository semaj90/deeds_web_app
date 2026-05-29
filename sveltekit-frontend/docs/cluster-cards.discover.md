# Cluster-cards discovery report

Generated: 2026-05-28

Summary
- Performed codebase-wide search for `cluster-cards`, `ClusterCard`, `cluster card` and related artifacts.
- Found references in repository docs, opencode commands, memory export locations, and a few external-to-repo notes under `C:\Users\james\Documents`.

Key locations
- `sveltekit-frontend/memory/exports/cluster-cards.jsonl` — canonical export target referenced by multiple scripts and opencode manifests.
- `docs/atlas/cluster-cards.json` — atlas doc reference (doc artifact) referenced in startup context.
- `.opencode/*` (startup-context.json, ace-context.json, commands) — many orchestration scripts expect `memory/exports/cluster-cards.jsonl` and related manifest files.
- `MASTER-FEATURE-TODO-2026-05-20.md` (root and external copy under Documents) — planning checklist referencing ClusterCard flow and warm/run notes.
- `CODEX-KAG-CHECKLIST.md` — notes to materialize ClusterCard outputs.

Duplicates and superseded candidates
- `MASTER-FEATURE-TODO-2026-05-20.md` appears both in repository root and under `C:\Users\james\Documents\Codex\...` (external copy). Treat the repo copy as canonical; mark external copies as superseded/local-notes.
- Multiple `.opencode/*` command files reference `cluster-cards.jsonl` as an export target; these are orchestration pointers, not duplicates.
- Verify whether `docs/atlas/cluster-cards.json` is a generated snapshot (archive) vs authoritative spec. If generated, prefer `sveltekit-frontend/docs/cluster-cards.schema.json` as the canonical schema and keep atlas JSON as a snapshot/export.

Immediate recommended actions
1. Canonicalize export path: ensure all orchestration scripts point to `sveltekit-frontend/memory/exports/cluster-cards.jsonl` (or `memory/exports/cluster-cards.jsonl`) and document this in `INDEXING.md` (small one-line note).
2. Mark external/local duplicate planning files (under `C:\Users\james\Documents`) as `superseded` in their filename or add a frontmatter `superseded: true` so future rg runs flag them. (These are likely local notes; do not delete automatically.)
3. Add a small README or header to `sveltekit-frontend/memory/exports/cluster-cards.jsonl` (if generated) explaining its provenance and last-run timestamp; ensure it's gitignored.
4. Update the feature registry (feature-map/atlas) to reference the new `cluster-cards.schema.json` and link back to `sveltekit-frontend/scripts/` that produce the export.
5. Run a follow-up pass to tag any documents that implement old ClusterCard contracts (search for `cluster card flow` and `warm common ClusterCards`) and add `superseded` or `archived` markers where appropriate.

Next steps I can run for you
- I can update orchestration scripts to reference the canonical path (small code changes) and run a dry-run export.
- I can add `superseded: true` frontmatter to the external copies (if you want me to modify files outside the repo, confirm first).
- I can update the todo list to mark the discovery report done (and did that), then mark tagging as next task and implement it.

Findings (raw paths)
```
// repo-local
sveltekit-frontend/memory/exports/cluster-cards.jsonl
sveltekit-frontend/docs/cluster-cards.schema.json
sveltekit-frontend/docs/cluster-cards.example.jsonl
sveltekit-frontend/docs/cluster-cards.README.md
docs/atlas/cluster-cards.json
CODEX-KAG-CHECKLIST.md
MASTER-FEATURE-TODO-2026-05-20.md
.opencode/startup-context.json
.opencode/ace-context.json
.opencode/command/graphrag-recover.md
.opencode/command/knowledge-consolidate.md

// external (local machine)
C:\Users\james\Documents\Codex\...\MASTER-FEATURE-TODO-2026-05-20.md
```

If you'd like, I'll now: (A) update orchestration script paths to canonical export, (B) add `superseded: true` to external copies, or (C) tag repo docs with `archived` markers. Which option do you want me to perform next?
