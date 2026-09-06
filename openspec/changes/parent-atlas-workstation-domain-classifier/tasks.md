# Tasks — Parent Atlas Workstation Domain Classifier

## Local claim reconciliation (2026-08-20)

The supplied Phase 6/85 note describes Query Routing V2, an EmbeddingGemma
`classification_mrl_128` tensor, and a PyTorch trainer, but those files and a
matching OpenSpec are not present in this checkout. The local implementation
remains the V1 neural-routing feature contract. Focused V1 query-routing,
neural-routing, and RAPIDS capability-probe tests pass 10/10. This does not
prove the claimed classifier, dataset, executor-policy training, or MiniLM
retirement; no model training or runtime/index writes were performed.

## Revision-qualified classification export (2026-08-20)

- [x] Added a pure `EmbeddingGemmaClassificationExampleV1` exporter beside the
      existing V1 dataset owner.
- [x] Requires feature, model, prompt, and label revisions; supports explicit
      `FEATURES_ONLY` rows and only marks a row `TRAINING_READY` when a finite,
      normalized 128-d `classification_mrl_128` vector is supplied.
- [x] Focused exporter/query tests pass 4/4 in the dedicated exporter lane. The exporter does not call Ollama,
      train PyTorch, write JSONL, mutate retrieval policy, or write stores.
- [ ] A live query/label producer and same-corpus EmbeddingGemma 128-d dataset
      remain unproven; MiniLM retirement remains blocked.
- [x] Added an explicit adapter from verified `ToolTrainingExampleV1` rows;
      domain, operation, retrieval-needs, and all revision metadata remain
      required inputs and are never inferred from `toolId` or query text.
- [x] Added the local fixture harness `npm run atlas:embedding:classification:export:proof`;
      it produced one `FEATURES_ONLY` row with zero training-ready rows and
      reported `FIXTURE_PROVEN_LIVE_PRODUCER_NOT_WIRED` without store writes.
- [x] Added a pure adapter from the existing workflow-loop execution receipt;
      it requires an explicit successful, replay-stable receipt before a caller
      may mark a row verified and unions receipt evidence into the export row.
- [ ] The workflow loop still has no live classifier producer. It does not own
      EmbeddingGemma inference, domain/operation labels, retrieval-needs labels,
      or classifier policy revisions; no live wiring is claimed.
- [x] Audited the live error-agent API route and recorded the missing producer
      inputs in `docs/reports/query-routing-live-producer-audit.json`.

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

## Re-verification pass (2026-09-05, read-only — no code/schema/index changes)

Cross-checked every open item above against the live repo and the rest of the OpenSpec portfolio,
not just re-stated. Nothing has moved since the 2026-08-12/08-20 entries above; recorded here so a
future session doesn't have to re-derive the same checks.

- **Wiring status unchanged.** `grep -rl "parent-atlas-workstation-domain-classifier" sveltekit-frontend/src`
  returns zero callers outside the module's own file. `classifyWorkstationDomain`/
  `classifyWorkstationFile`/`embedAndIngestWorkstationNodes` are still exported but invoked from
  nowhere in the live tree — the "NOT WIRED INTO ANY LIVE ROUTE" premise from `proposal.md`'s
  header and the "Next session — pick up here" table above both still hold exactly as written.
- **Not superseded by `DOMAIN-CLASSIFIER-OWNER-01`** (closed 2026-09-04 in
  `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`), despite the
  name similarity and both landing on "9 domains." Checked directly:
  `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts`'s `CANONICAL_DOMAINS` is
  `['auth','ui','retrieval','network','database','cache','agent','graph','ml']` — a generic
  code/query routing taxonomy, unrelated to this change's Parent-Atlas-Workstation architecture
  lanes (`IDENTITY, EXPORT_STORAGE, GRAPH, TELEMETRY, EMBEDDING, OKF_ONTOLOGY, TRANSPORT, COMPILER,
  RUNTIME_TRAINING`). Independently corroborated by `parent-atlas-search-classifier-sidecar/tasks.md`
  (closed, 36/36), which explicitly lists this change as "kept fully separate — do not touch its
  files from this change" and classifies `parent-atlas-workstation-domain-classifier.ts` as its own
  legitimate second `CANONICAL_OWNER` under `WORKSTATION_LANE_CLASSIFICATION`, not a duplicate to
  consolidate.
- **Line 22's "live query/label producer + `classification_mrl_128`" blocker is correctly tracked
  in a sibling change, not duplicated here.** `openspec/changes/parent-atlas-query-routing-classifier/tasks.md`
  owns this exact work stream (`classification_768 -> classification_mrl_128` MRL truncate+L2
  projection) and is itself still open at the blocking step: `NLP-1`'s "Produce fixture embeddings
  with the proven EmbeddingGemma executor" and "Verify 128-d norm/digest determinism" remain
  unchecked there too. MiniLM retirement (this change's line 22) accordingly remains blocked — not
  resolved, but the right place to watch is that sibling file, not to re-derive the blocker here.
- **Line 33 (workflow loop has no live classifier producer)** — no new evidence found anywhere in
  the portfolio; still accurately open.
- **Lines 108/115 (isMainModule sweep leftovers) re-verified live, unchanged:**
  `scripts/ai/embed_and_index_scenarios.mjs` still has two shebangs (`grep -n "^#!/usr/bin/env node"`
  → lines 1 and 148) — the file-concatenation corruption is still present, still unfixed.
  `scripts/atlas/load-profiles-to-postgres.mjs`, `scripts/atlas/build-component-profiles.mjs`, and
  `scripts/atlas/build-ast-topology-dry-run.mjs` all still carry the redundant
  `|| process.argv[1].endsWith('...')` fallback clause alongside the correct primary
  `fileURLToPath(import.meta.url)` comparison — harmless, still a trivial follow-up, not done.

**Net effect of this pass**: no items closed, no items newly blocked, no duplicate-owner risk found.
This change remains exactly what its own "Next session — pick up here" table says: waiting on a
first real end-to-end proof run (tree-sitter → embedding → Qdrant → Redis, LLM summary as a second
pass) before any live-wiring decision is worth making.

## Reference

See `proposal.md` for the full source-copy rationale, the 3 upgrades, and the namespace-separation
table. Do not re-derive what's already there.
