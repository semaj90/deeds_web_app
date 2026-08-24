Parent Atlas review package

Files:
- CURRENT_STATE_REVIEW.md
- SAFE_NEXT_COMMANDS.ps1
- EVIDENCE_MANIFEST.json
- WEB_VERIFICATION.md
- workstation_handoff_20260822_192206.txt

This archive is informational. It performs no runtime or database writes.


# Parent Atlas current-state review — 2026-08-23

## Snapshot

Repository: `semaj90/deeds_web_app`

Current `main` observed during this review:
`7fe3c52136d3395a0480d3af44f5f46ee969bcf3`

Current-main headline commit:
`feat(atlas): spectral parity diagnostics + GPU runtime ABI contract`

This package is a review/handoff artifact only. It does not mutate Postgres,
Qdrant, Neo4j, Valkey, Docker volumes, models, or canonical data.

## High-confidence current findings

### 1. Canonical runtime direction is 768 + Valkey

The supplied workstation handoff records the active-rule cleanup that moved active
guidance to:

- canonical/native retrieval dimension: 768
- Qdrant collection naming: `codebase_chunks_768`
- cache/service naming: `legal_ai_valkey`
- CLI: `valkey-cli`

It also records a live runtime proof where Valkey, go-retrieval, Postgres,
Qdrant, embedding search, RabbitMQ, SeaweedFS, Neo4j and supporting services
were healthy, with a native non-zero 768-dimensional Ollama embedding.

Treat old 384/Redis references as historical/legacy compatibility unless a current
live file proves otherwise.

### 2. AST corpus parity remains structurally blocked

The supplied workstation receipt recorded:

- runtime: 66/66
- source bytes frozen: 66/66
- full parity: 5/66
- status: `CORPUS_PARITY_MISMATCH`

The root cause was traced to an active `treesitter-chunker` path returning some
explicit byte spans relative to an LF-normalized view while the original request
source retained CRLF bytes.

This matters because both Tree-sitter and current `treesitter-chunker` docs define
these coordinates as UTF-8 byte offsets.

### 3. The CRLF/LF span compatibility repair was merged, then disappeared

Merged PRs observed:

- PR #62 `Agent/ast lf byte span compat 20260822`
- PR #69 `test(atlas): cover multiline CRLF span remap integration`

PR #62 added:
- `python/atlas_treesitter_span_compat.py`
- a fail-closed `LF_COMPAT_REMAPPED` compatibility path
- dedicated regression tests
- sidecar diagnostics for remapped spans

However, current `main` no longer contains that module and current
`python/miniforge_nlp_sidecar_v2.py` again trusts normalized
`byte_start`/`byte_end` directly.

Commit `a2e4dab329a692a2107184aabd0983392a5ed9fc` explicitly deleted
`python/atlas_treesitter_span_compat.py`, deleted its tests, and removed the
sidecar import.

This should be treated as a regression candidate, not as proof that the earlier
work never existed.

### 4. XGBoost GPU/qid hardening was also merged, then regressed

Merged PR #64 introduced:
- `python/prove_atlas_xgboost_gpu_runtime_v1.py`
- `python/atlas_xgboost_grouped_ranking_v1.py`

The supplied handoff records real native-Windows XGBoost CUDA proof work and a
qid-aware grouped-ranking design.

Commit `a2e4dab329a692a2107184aabd0983392a5ed9fc` later deleted the bounded GPU
proof module.

Current `scripts/atlas/train-xgboost-reranker.py` again contains:
- `'device': 'cuda'  # falls back to cpu if no CUDA`
- plain `DMatrix` construction
- no qid/group attachment for rank objectives
- regression-first default behavior

Therefore:
`GPU_RUNTIME_PROVEN` history and current trainer correctness are separate facts.
The trainer should not currently be treated as promotion-grade grouped LTR.

### 5. `a2e4dab329...` deserves a dedicated targeted audit

Its commit message says it retires Atlas v1/python atlas modules in favor of
v2/semantic_768-aligned replacements.

The supplied handoff reports it touched hundreds of files and has already been
associated with multiple consequential removals:
- AST CRLF span compatibility
- XGBoost GPU proof/grouped-ranking work
- multiple OpenSpec changes
- Graphify source-inventory producer work

Do not blindly revert the whole commit.
Audit high-value deletions one contract at a time and restore only when no valid
v2 replacement exists.

### 6. Graphify migration remains safety-gated

The handoff records an additive-only hardening policy:
- no DROP/DELETE/TRUNCATE/UPDATE backfill
- no `ON DELETE CASCADE`
- no destructive constraint removal
- read-only preflight before any migration application

The previously discussed `127.0.0.1:5434` target is a proxy, not a disposable DB.
Do not run proof migrations there.

### 7. D9/orphan audit tooling has an independent pre-existing issue

The handoff records:
- live `package.json` lacks the referenced `npm run audit:d9` wiring
- underlying scripts still exist
- `scripts/deep-audit-ast.mjs` expects a newer `glob` ESM API while installed
  `glob` is 7.2.3

This is separate from Parent Atlas retrieval correctness but blocks trustworthy
D9 proof automation.

## Architecture that remains coherent

Keep these ownership classes distinct:

1. identity/provenance
2. canonical semantic matrix
3. derived latent matrices
4. candidate feature matrix
5. executor indexes
6. bounded GPU working set

Recommended artifact alignment:

- `CandidateOrdinalMapV1`
- `SemanticMatrixV2` — N x 768 FP32
- `Latent128MatrixV1` — derived
- `Latent64MatrixV1` — derived
- `CandidateFeatureMatrixV1` — N x F + presence
- `BinarySemanticMatrixV1` — derived Hamming challenger
- sparse AST/graph relation state

All derived artifacts should bind revision/checksum lineage and share the frozen
CandidateOrdinal coordinate.

## Immediate priority order

1. Audit/restore the AST CRLF span compatibility tranche if no valid replacement exists.
2. Re-run only the bounded AST byte tests and 66-file corpus parity receipt.
3. Let the receipt decide whether the next blocker is:
   - byte coordinates
   - symbol coverage
   - semantic taxonomy
   - span/chunk policy
4. Audit XGBoost deletions from `a2e4dab329...`; restore only the bounded proof/qid
   components that remain necessary.
5. Keep live domain/XGBoost feature activation and model promotion blocked until
   exact label lineage and grouped evaluation are proven.
6. Keep Graphify migration application blocked until a truly disposable
   non-production PostgreSQL target is explicitly identified.
7. Keep FANOUT/PageRank/PPR downstream of revision + structural authority.

## Do not do yet

- do not invent another RRF lane for latent_64
- do not turn Qdrant/CAGRA/pgvector into independent semantic votes
- do not mutate the 5434 proxy
- do not delete dangling Docker volumes without retention approval
- do not wholesale revert `a2e4dab329...`
- do not call historical proof receipts equivalent to current-main behavior ood catch — I was too quick to wave
  that off. Real characterization:
  The 129 files break down as: 114
  modified, 10 untracked, 1 deleted, 3  submodule pointer changes
  (claude-mem, turbovec,
  embeddinggemma_300m — visible in the  original session gitStatus,
  unrelated to this session), 1 stray
  status line.

  The scary "246K deletions" isn't
  data loss — checked directly:
  docs/reports/graphify-source-invento  ry-plan.json went from schema v1
  (246,157 lines, a full raw dump) to
  schema v2 (728 lines, a compact
  summary). That's a legitimate
  regeneration by a newer tool
  version, not corruption.

  But there are other real,
  substantive changes I haven't
  reviewed: several
  docker-compose*.yml/.yaml files
  modified (docker-compose.yaml alone
  shows 313 lines removed — that's the  bare-name, highest-collision-risk
  file from the earlier docker-compose  audit), plus modified scripts
  (start_services.sh,
  atlas-tools-mcp.mjs, prove-code-revi  sion-owner-canary.mts, observe-works  pace-source-binding.mts, workspace-r
  None of these are files I touched or  committed this session — they
  predate my work or came from
  concurrent activity in this shared
  working directory. Given context is
  now quite limited (30% remaining)
  and my own safety rules say never
  blanket-commit unreviewed changes, I  don't want to either commit this
  pile now or guess at its origin
  further.

  What do you want to do — leave it as  working-tree state for now (nothing
  lost, it's all still on disk), or
  should I keep digging into specific
  files (say, the docker-compose
  changes, since that ties to work
  already in the record)?
  ⎿  Stop says: [Graph stale]
     codebase-graph.json is 3120min
     old. Run: npm run graphify:daily
     (in sveltekit-frontend) to refresh     Karpathy map + KAG notes.

✻ Crunched for 1m 11s

❯ update openspec to see where we're   
  are for next steps                   
  ⎿  UserPromptSubmit says: [Graph
     context] codebase-graph.json age:
     3121min ⚠️  stale | Services UP:
     turbo, bifrost | Services DOWN:
     mcp, sveltekit (start via
     tasks.json or
     start-trace-stack.ps1)

● Bash(cd "C:\Users\james\Videos\deeds-      web-app" && tail -5
      parent-atlas-workstation-todo.md)  ⎿    session's own findings inde
     pendently agree with): (1) ru
     n the XGBoost bounded GPU pro
     … +14 lines (ctrl+o to
     expand)

● Update(…nt-atlas-workstation-todo.md)
  ⎿  Added 23 lines
      2908    `.length` crash to
             find the real throw
             site; (3) resolve t            he `codebase_chunks_
            768` vs `_768_v2`      2909    split; (4) resume 
            the Graphify revisio
            n-owner proof sequen
            ce → snapshot/Qdrant
             lineage → FANOUT,
      2910    which was blocked
            all session on the s
            emanti # Web verification notes

These links were checked during the review.

- Tree-sitter Node SyntaxNode:
  https://tree-sitter.github.io/node-tree-sitter/interfaces/SyntaxNode.html
  `startIndex` / `endIndex` are byte offsets.

- py-tree-sitter Node:
  https://tree-sitter.github.io/py-tree-sitter/classes/tree_sitter.Node.html
  exposes byte ranges in bytes.

- treesitter-chunker:
  https://pypi.org/project/treesitter-chunker/
  current docs state byte_start/byte_end are UTF-8 byte positions and slicing
  original file bytes reproduces chunk content.

- NVIDIA CUTLASS:
  https://docs.nvidia.com/cutlass/latest/overview.html
  current CUTLASS supports Ampere kernels; real-device profiling remains the
  appropriate authority for SM86 performance.

- PyTorch Storage:
  https://docs.pytorch.org/docs/stable/storage.html
  file-backed storage uses mmap and is appropriate for large CPU-backed matrices.

 
  The race-condition investigation is  resolved: commit 806c0ed2fe was the user's
  own concurrent docker_audit_823 work, which
  fully absorbed the 129-file pile I'd flagged  (all the docker-compose files, scripts, and
  the JSON schema regen). Nothing was lost,
  my push was a clean fast-forward on top of
  it, and the handoff doc now reflects reality  instead of a stale "unreviewed" warning.
  Working tree is down to 11 small, unrelated
  entries.

  Session is in a fully clean, accurate,
  pushed state. The real remaining work is
  what was already queued in the handoff doc's  priority list: XGBoost GPU proof run, the
  ACE crash instrumentation, the
  codebase_chunks_768/_768_v2 split, and
  resuming the Graphify revision-owner
  sequence — plus the still-open
  docker-compose canonical-file decision,
  which 806c0ed2fe touched but didn't resolve 