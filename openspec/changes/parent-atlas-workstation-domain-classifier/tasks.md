# Tasks — Parent Atlas Workstation Domain Classifier

## Built this session (2026-08-12)

- [x] New module: `sveltekit-frontend/src/lib/server/ai/parent-atlas-workstation-domain-classifier.ts`
      — domain taxonomy, concept patterns, real tree-sitter chunking, gated LLM summary via
      llama-server, embeddinggemma reuse, Qdrant ingest, Redis centroid materialization, CLI entry.
- [x] `tsc --noEmit -p .` clean for this file (0 errors referencing it).
- [x] Live-verified tree-sitter parse works on this machine (not assumed) and llama-server is up
      with `hforf.gguf` loaded.
- [x] OpenSpec proposal documenting the copy-source, the 3 real upgrades, and the deliberate
      Qdrant/Redis namespace separation from the existing AUTH/DATA/API/UI classifier.
- [x] Live classifier proof now exists for the local lane: real chunk extraction and domain
      scoring are executing, including the `tree-sitter-typescript` ESM import fix
      (`tsLangModule.typescript ?? tsLangModule.default?.typescript`).

## Exact runtime map now in use

This is the file map the current implementation is aligned to:

| Lane | Files |
|---|---|
| Extraction | `docker/miniforge-nlp-sidecar/Dockerfile`, `docker/miniforge-nlp-sidecar/docker-compose.yml`, `sveltekit-frontend/src/lib/server/analysis/ast-langextract-bridge.ts`, `sveltekit-frontend/src/lib/server/ai/parent-atlas-workstation-domain-classifier.ts` |
| Packet synthesis | `sveltekit-frontend/src/lib/server/analysis/source-pos-concept-packet.ts`, `sveltekit-frontend/src/lib/server/analysis/code-evidence-synthesizer.ts`, `sveltekit-frontend/src/lib/server/analysis/analysis-pass-results.ts`, `sveltekit-frontend/src/lib/server/analysis/code-evidence-readback.ts` |
| Live worker wiring | `sveltekit-frontend/src/lib/server/analysis/worker.ts` |
| Graphify board consumer | `sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board-recommendations.ts`, `sveltekit-frontend/src/lib/server/analytics/recommendation-policy.ts` |
| TurboVec retrieval | `sveltekit-frontend/src/lib/server/retrieval/turbovec-prefilter.ts`, `sveltekit-frontend/src/lib/server/retrieval/turbovec-rerank.ts`, `sveltekit-frontend/src/lib/server/grpc/turbovec-cuda-client.ts`, `packages/parent-atlas-retrieval/src/index.ts` |

TurboVec remains retrieval acceleration only; it does not participate in extraction or evidence synthesis.

## Updated priority after the latest logs

| Item | State | Notes |
|---|---|---|
| Local classifier logic is proven live | PROVEN | live Tree-sitter / domain logic already exercised |
| First-class code evidence receipt builder is now wired through `analysis/code-evidence-synthesizer.ts` | WIRED | worker path threads the receipt |
| Durable Postgres / outbox write plane is healthy enough for end-to-end receipts | OPEN | durability still blocked by the write plane |
| Qdrant / Redis sidecar write path re-proof is still required before promoting the pipeline | OPEN | sidecar write path still needs re-proof |
| Live durable receipt persistence still depends on the degraded write plane | OPEN | still blocked until durable persistence recovers |

## Sidecar wiring — IN PROGRESS 2026-08-12 (same session, "wire it up ... conda nlp docker sidecar")

| Item | State | Notes |
|---|---|---|
| Discovered `docker/miniforge-nlp-sidecar/` and its live capabilities | PROVEN | live container and tooling verified |
| Found and fixed the `POST /analyze` bug | PROVEN | one-line guard fix landed |
| Confirmed no other unguarded `control5.` access exists | PROVEN | scan completed |
| Rewired `parent-atlas-workstation-domain-classifier.ts` to try the sidecar first | WIRED | sidecar is now the first path, fallback remains local |
| Rebuild in progress | OPEN | build / smoke / CLI proof still pending |

## isMainModule Windows sweep — CLOSED 2026-08-12 (repo-wide, prompted by this task's own test failure)

- [x] Found the same bug in `ace-domain-evidence-extractor.mts` while testing `collectSemanticEvidence()`
      (see below) and in this task's own `parent-atlas-workstation-domain-classifier.ts` while
      running its first live CLI test — both exited 0 with zero output, `main()` silently never ran.
- [x] Root cause: `import.meta.url === \`file://${process.argv[1]}\`` never matches on Windows
      (backslash path vs. real `file://` URL). Fixed both files with
      `process.argv[1] === fileURLToPath(import.meta.url)`.
- [x] Swept the whole repo for the same pattern (plus a second broken variant,
      `process.argv[1] === import.meta.url.replace('file://', '')`) — found **35 files total**,
      fixed all 35 (script + manual verification, not a blind find-replace — each file's
      `fileURLToPath` import was checked/inserted correctly, verified via grep for duplicate
      imports and `node --check` / `tsc --noEmit` for syntax/type correctness after the edit).
- [x] Found one pre-existing, unrelated bug while syntax-checking the sweep:
      `scripts/ai/embed_and_index_scenarios.mjs` has two entire scripts concatenated into one file
      (a second `#!/usr/bin/env node` shebang mid-file at line 148) — confirmed via `git diff` this
      predates the sweep entirely (my diff there is a clean 2-line change). **Flagged, not fixed**
      — different bug, out of scope for this sweep, needs its own decision on which half is the
      real script.
- [x] Documented the pattern + canonical fix in `CLAUDE.md`'s "Key Lessons" section so future
      scripts don't reintroduce it.
- [ ] **Not done**: the 2 already-fixed files this sweep intentionally excluded because their
      form is already close-but-not-identical and low-risk either way — spot check if ever
      touched again: `scripts/atlas/load-profiles-to-postgres.mjs`,
      `scripts/atlas/build-component-profiles.mjs`, `scripts/atlas/build-ast-topology-dry-run.mjs`
      still carry a redundant `|| process.argv[1].endsWith('...')` fallback clause left over from
      before they had a working primary comparison — harmless now (primary check is correct), but
      could be cleaned up as a trivial follow-up.
- [ ] **Not done**: fix `scripts/ai/embed_and_index_scenarios.mjs`'s pre-existing file-concatenation
      corruption (separate bug, flagged above).

## Next session — pick up here

| Item | State | Notes |
|---|---|---|
| First real end-to-end run on one real file | OPEN | isolate tree-sitter, embedding, Qdrant, Redis from the LLM call first |
| Second run with `--with-llm-summary` on the same file | OPEN | confirm real summaries and record cost per chunk |
| Decide whether to batch over the atlas source directories | OPEN | needs explicit approval before any broad LLM run |
| Register this capability in the runtime ownership registry only after a proven end-to-end run | OPEN | can only promote after receipt exists |
| Decide whether live wiring belongs in a startup hook, npm script, or CLI-only path | OPEN | product decision still open |

## Reference

See `proposal.md` for the full source-copy rationale, the 3 upgrades, and the namespace-separation
table. Do not re-derive what's already there.
