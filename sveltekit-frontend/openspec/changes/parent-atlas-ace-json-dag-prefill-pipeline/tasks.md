# Tasks: ACE JSON DAG-prefill pipeline — production readiness

Status vocabulary per root CLAUDE.md: CREATED / WIRED / DRY_RUN_PROVEN / APPLY_PROVEN / NOT_PROVEN / BLOCKED.
Nothing below is done from aspiration. Each item needs the evidence named in it.
Phase 8 (production readiness) starts only after Phase 5 (DAG prefill synthesis) reaches APPLY_PROVEN.

Operating context (Windows 10 Home, Docker Desktop, WSL2):
- Docker Desktop's engine runs in the `docker-desktop` WSL2 distro. Sidecar containers live there, not in `Ubuntu`.
- Conda env `atlas-rapids-cu13` is in the `Ubuntu` distro at `/home/james/miniforge3/envs/atlas-rapids-cu13` (Python 3.14.6).
  Invoke as `MSYS_NO_PATHCONV=1 wsl -d Ubuntu --exec /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python`.
- GPU: one RTX 3060 Ti (8 GiB). llama-server `:8090` (Ornith 1.5 9B) holds about 6.2–6.7 GiB, so GPU classifier
  jobs stay under about 1 GiB, and RAPIDS/cuVS work needs the `GPU: Prepare cuVS KMeans` task first.
- CUDA lane: 13.0 only. CUDA 13.4 / TensorRT-RTX is not approved.

## Phase 0 — Contracts and gates (no behaviour change)

- [ ] **P0-01** Define the `AcePacketV3` extension for DAG-prefill fields (domain, NES LUT byte, prefill node ids,
      completeness receipt). Extend the existing owners: `packages/parent-atlas` `buildAcePacketV3` and
      `sveltekit-frontend/src/lib/server/ace/ace-packet-writer.ts`. Do not add a second packet builder.
      Evidence: contract spec test passes; no new packet builder file.
- [x] **P0-02** Single NES palette owner. Definition owner: `scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs`
      (`NES_LUT_DOMAIN_PALETTE`). Align or retire `python/parent_atlas_learning/ace_compiler.py` `NES_LUT_PALETTES`
      (its previous NES color values disagreed for 8 of 10 domains). Consumers now load the generated checksummed artifact;
      focused Node and Python output tests pass. No persistent cache migration/write was run.
- [ ] **P0-03** Fail-closed rule for every stage: a stage that cannot prove completeness emits a typed PARTIAL or BLOCKED
      receipt, never a silent empty result. Evidence: one negative test per stage.
- [ ] **P0-04** Hidden-thought guard: no stage persists reasoning or chain-of-thought text. Reuse the marker set from
      `validateClusterSummaryOutput` (`features/codebase-intel/indexer/cluster-summary.ts`). Evidence: guard test covers
      `<think>`, `<|channel>`, `chainOfThought`, `hiddenThoughts`, `reasoning_content`.
- [x] **P0-05** Port-ownership check. DONE 2026-10-21. The live container `miniforge-nlp-sidecar` runs
      `CMD ["python", "/app/python/miniforge_nlp_sidecar_oak.py"]` (`docker inspect`). Its `/openapi.json` lists 20 paths,
      including `/oak/health`, `/oak/lookup`, `/oak/search`, `/oak/traverse`, and `/synthesis/context-graph`.
      `/oak/health` returns `available: true` (oaklib 0.7.4). The launcher default `v2` entry does NOT mount OaK. The
      container uses the `_oak` entry, so the OaK routes are live.

## Phase 1 — Domain classification of the user query

- [ ] **P1-01** Reviewed gold set. Trust floor is 200 reviewed rows and 30 per class (not met today). Labels come from the
      domain review sheet (`scripts/atlas/build-domain-review-sheet-v1.mjs`). Evidence: row and per-class counts.
- [ ] **P1-02** Classifier: the existing offline sklearn NB+LR trainer (`python/train_domain_classifier.py`). A GPU
      challenger is allowed only with a seeded CPU reference parity receipt. Evidence: accuracy on a held-out reviewed
      split, reported per class.
- [ ] **P1-03** Classifier output is a proposal. It routes context budget and palette choice but cannot promote identity.
      Evidence: output carries `canonicalAuthority: false`, and a test asserts it.
- [ ] **P1-04** Serve classification from the NLP sidecar (`/classify`, WIRED). Evidence: live POST returns the proposal shape.

## Phase 2 — NES LUT table build

- [x] **P2-01** Build the palette table from the P0-02 owner. Keep `lutByte` (0x00–0x0A) and `nesHex` as separate fields,
      never substituted for each other. Evidence: row count and a field-level check.
- [x] **P2-02** Routing helper alignment: `python/atlas_compute/ast_chunk_routing_helpers.py` (`AstChunkDomainRouter`) uses
      the shared artifact's `lutByte` values. `svelte5_runes` (`nesHex=0x2A`) is a UI sub-label, not a domain ordinal.
      Evidence: both router versions now emit UI `lutByte=0x02` and separate NES color metadata.
- [ ] **P2-03** Exact crosswalk resolution only (`resolve_domain_76`). No fuzzy or alias matching. Unresolved is a
      first-class result (`UNRESOLVED`, `0x00`). Evidence: negative tests for near-miss labels.
- [ ] **P2-04** Trace where the ACE palette reaches prompt text. `ace_compiler.py` line 52 only selects it. Record the
      injection site. Evidence: file:line of each prompt write.
- [x] **P2-05 NES-LUT-GENERAL-COLLISION-01** The Node palette gives `general` `lutByte 0x00`, the same byte the AST router
      used for `UNRESOLVED`. Decision: reserve `0x00` for unresolved and move `general` to `0x0A`. Evidence: ACE fallback
      returns `general=0x0A`; router unknown labels retain `0x00`.
- [x] **P2-06 NES-LUT-DRIFT-GATE-01** Parity check across `scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs`,
      `python/atlas_compute/ast_chunk_routing_helpers.py`, and `python/parent_atlas_learning/ace_compiler.py`
      (`NES_LUT_PALETTES`). Historical audit found 2/10 `nesHex` values aligned. Consumers now load one checksummed artifact;
      Node source/artifact parity and Python ACE/router parameter tests pass. Seeded-drift injection is not implemented.
- [x] **P2-07 NES-LUT-DOMAIN-SET-01** Confirm the 10-domain set is the same in every owner. `ast_chunk_routing_helpers.py`
      previously named `svelte5_runes` (0x2A) as a separate value. It is now a UI sub-label; the 10 domain ordinals are unique
      and nonzero, with unresolved reserved at zero. Evidence: artifact and cross-language focused tests.

## Phase 11 — Encoding, transport, and tournament linkage (2026-10-23)

Scope: the bitset, msgpack, and gRPC ideas raised for this path. Existing owners stay in charge. Nothing here authorizes
QLoRA or adapter ingestion.

- [ ] **P11-01 WIRE-BULK-01** msgpack and JSON carry descriptors only. Bulk vectors and matrices go through Arrow IPC or raw
      F32 mmap (wire-format rule in the project CLAUDE.md). Evidence: serialized prefill and tournament packets contain no
      768-float arrays; a size and shape test fails on an inlined vector.
- [ ] **P11-02 BITSET-SELECT-01** A bitset selects CandidateOrdinals only. It records bit width, endianness, layout revision,
      and checksum. No bitset-over-gRPC path exists in the repo; any new gRPC route needs a proto and an owner entry first.
      gRPC clients default to disabled. Evidence: layout receipt round-trips with the same checksum.
- [ ] **P11-03 PREFILL-TOURNAMENT-DAG-01** Tournament DAG state transitions (`TOUR13`, in
      `parent-atlas-gpu-sidecar-patch-tournament/tasks.md`) reuse the Phase 5 prefill node IDs. Evidence: one tournament packet
      and one prefill packet reference the same node IDs. Blocked until Phase 5 reaches APPLY_PROVEN or an explicit waiver.
- [ ] **P11-04 PALETTE-TOURNAMENT-01** The tournament ACE comparison packet carries the domain `lutByte` from P2-01. Blocked
      until the admitted ContextManifest/prefill and tournament packet owners are wired and independently read back; P2-05
      and P2-06 are now locally proven.
- [ ] **P11-05 QLORA-HOLD-01** No QLoRA or adapter ingestion. Required before any adapter: `TOUR20` PASS, one palette owner,
      an adapter revision, held-out evaluation, and a promotion receipt. Status: NOT_STARTED.

## Track B alignment — query to prefill DAG (2026-10-23)

Chain under this track: query → domain `lutByte` (from the single NES owner, see `parent-atlas-nes-lut-single-owner/tasks.md`) → `:8095` AST chunks with `scan_completeness` → PageRank Top-K and golden-breadth multi-hop → ContextManifest → prefill DAG.

- [ ] **TB-01 Wire order.** Each step produces a typed receipt, and each step fails closed to `PARTIAL` or `BLOCKED`. Evidence: one negative test per step (P0-03).
- [ ] **TB-02 Bulk payloads stay out of descriptors.** Vectors and matrices move as Arrow IPC or raw F32 mmap, or as PyTorch tensors. MsgPack and JSON carry descriptors and references only (P11-01).
- [ ] **TB-03 Bitmap header.** A CandidateOrdinal bitmap records bit width, endianness, layout revision, and checksum (P11-02). A reader rejects a mismatch on any of the four.
- [ ] **TB-04 Residency descriptor.** Storage tier (NESCHR97 cold, NVMe mmap, RAM Arrow buffer, CPU cache) is a descriptor attached to the ROM-bank LOD frame. It is not a wire protocol and not an admission signal (P12-01).
- [ ] **TB-05 Multi-hop bounded.** PageRank Top-K traversal uses existing graph owners with a bounded k-hop limit. Evidence: fan-out cap test (P11-03).
- [ ] **TB-06 Hyperrag route.** `api/search/hyperrag/+server.ts` synthesis stays blocked until a ContextManifest is admitted (route gate already in place, 2026-10-23 commit `c591bf4a3a`).
- [ ] **TB-07 Redis namespace.** The `hg:edge:idx` / `hg:built_at` collision between `run-hypergraph.ts` and `cases/hypergraph-4d.ts` is resolved before any hyperedge boost is used here (P10). Blocked on the namespace decision.

## Phase 12 — Challenger proposals from the 2026-10-23 spec review (all NOT_STARTED)

Review of the pasted "NES LUT byte-synthesis, 7-bit LOD bitset, and multi-hop DAG" spec. Accepted as challengers only.
The spec's conflicts are recorded in the table below so nothing is implemented from it by accident.

| Proposal | Accepted as | Owner / existing piece | Blocker |
|---|---|---|---|
| 7-tier residency bitmask (descriptor) | Challenger, descriptor only, never authority | `nes-memory-architecture.ts` and `N64TextureLODSystem.ts` are rendering precedents; no residency-mask code exists | P2-05, P2-06 |
| Bit 7 "write-guard lock" | Reject as a residency bit. Admission stays in the admission receipt | Oct 22 admission gate and write guard | none; keep separate |
| Per-chunk 64-bit header (`AtlasPacketHeaderV1`) | Challenger, after P11-01 | Wire-format rule: descriptors only, bulk vectors via Arrow/mmap | P11-01 |
| Move/skill slots (4 x 2-bit traversal opcodes) | Reuse `atlas_procedural_sequences_v1` (DRAFT, unapplied) instead of a new registry | `docs/reports/atlas-procedural-sequence-catalog-v1.md` | sequence DDL review and operator authorization |
| Tricubic cross-ranker fusion | Challenger only. Compare against RRF on a frozen golden set. SearchRuntime keeps the single fusion owner | Tricubic exists in SOM adjacency (`compute-som-tricubic-adjacency.mjs`, `interpolation.py`), not in cross-ranker | golden set with reviewed labels |
| Multi-hop PageRank Top-K traversal | Existing graph owners only. Bounded k-hop, no unbounded fanout | `graph-analysis-runner.ts` and GDS/NetworkX owners | P11-03 |
| QLoRA adapter activated per query | Rejected for now | QLORA-HOLD-01, TOUR-QLORA-HOLD-01 | TOUR20, reward monitoring |
| gRPC bitset flags into `:8090` | Rejected. `:8090` is llama-server HTTP | llama-server contract | none |
| UUID or ULID as packet identity inside the header | Rejected. Identity is `packet_key` plus revisions | `makePacketUlid` is ordering lineage only; `randomUUIDv7` / v8 helper in `utils/uuid.ts` | UUID v8 freeze decision |
| "$1–$20" budget band | Not defined anywhere. Needs a written definition before use | none | definition from the operator |

- [ ] **P12-01 LOD-DESCRIPTOR-CHALLENGER-01** Define a 7-tier residency descriptor for the packet header with no
      authority and no admission effect. Evidence: round-trip test; a test that a set residency bit never changes ranking.
- [ ] **P12-02 TRICUBIC-CHALLENGER-01** Score a tricubic fusion as a challenger against RRF on the frozen golden set.
      Evidence: recall@k, ordering, and latency receipt. Not promoted without reviewed labels.
- [ ] **P12-03 PROCEDURAL-REGISTRY-REUSE-01** Map move/skill slots onto `atlas_procedural_sequences_v1` instead of creating a
      second registry. Evidence: the mapping is reviewed; the DDL is still DRAFT until the operator approves it.
- [ ] **P12-04 BUDGET-BAND-DEFINITION-01** Operator to define "$1–$20" in measurable terms, or drop it. Evidence: written definition.

## Phase 3 — NLP pass and structural evidence (partly done)

- [x] **P3-01** `/ast/chunk` completeness receipt (`scan_completeness`, `scan_failure`) in
      `python/miniforge_nlp_sidecar_v2.py`. Evidence: in-process checks for COMPLETE and PARTIAL_AST_FAILED; live `:8095`
      smoke returned COMPLETE after the container restart.
- [x] **P3-02** Unit tests for both receipt states in `python/test_miniforge_nlp_sidecar_v2_revision.py`. Verified through a
      pytest stub, because real pytest is not installed on Windows Python.
- [ ] **P3-03** Live PARTIAL_AST_FAILED check against `:8095` (only the in-process path is verified so far).
- [x] **P3-04** Caller wiring: `sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.ts` throws on any non-COMPLETE
      receipt (including a missing field) and includes `scan_failure`. DONE 2026-10-21. Evidence:
      `src/lib/server/nlp/miniforge-nlp-sidecar.spec.ts` 13/13 pass, including a new PARTIAL_AST_FAILED case. Existing AST
      fixtures gained `scan_completeness: 'COMPLETE'`.
- [ ] **P3-05** Replay caller (`scripts/atlas/prove-live-structural-producer-replay-v1.mjs`) refuses to mark a PARTIAL file
      as completed. Evidence: replay receipt with a PARTIAL input. Same check as P9-02 priority 3; one definition of
      completeness (the `COMPLETE` receipt) lives in P3-04/P9-02 and is not restated here.
- [ ] **P3-06** NLP size guard. `MAX_TEXT_CHARS` (50000) applies only in `_spacy_pos_tags`. Record the skip reason in the
      caller receipt (`SIZE_LIMIT_EXCEEDED`). Evidence: receipt field present for an oversized input.
- [ ] **P3-07** Byte-window slicing inside `/ast/chunk` is out of scope (byte-span identity contract). Revisit only with a
      separate design that remaps every chunk, edge, and occurrence span. Status: NOT_PROVEN, deferred.

## Phase 4 — Retrieval and ContextManifest gate

- [ ] **P4-01** Query-to-candidate retrieval through the existing SearchRuntime owner (no new RRF vote). Evidence: candidate
      count and lane attribution in a receipt.
- [ ] **P4-02** ContextManifest admission, currently BLOCKED (`BLOCKED_RETRIEVAL_GATE`). Only revision-qualified evidence is
      admitted. Evidence: admission receipt with `source_revision` and `workspace_revision` present.
- [ ] **P4-03** Do not write `source_revision` into chunks or summaries. Deferred until after Phase 20 (operator decision,
      2026-10-15). Evidence: no such write in this change's diffs.
- [ ] **P4-04** Hot cache keys follow the BitFrost/Valkey namespace rules. No BitFrost writes until the canary passes
      (`ACE-BITFROST-CANARY-01`). Evidence: write count is 0 in dry runs.

## Phase 5 — DAG prefill synthesis (gate for Phase 8)

- [ ] **P5-01** Probe the live llama-server before relying on any flag. Run `llama-server --help` on the binary behind
      `:8090` and record which of `cache_prompt`, `id_slot`, `--lookup-ngram-min`, and grammar options exist. Evidence:
      probe receipt. Unsupported flags stay out of the design.
- [ ] **P5-02** Pinned root prefix: system prompt, taxonomy, and NES LUT definitions. Keep it stable and reuse its KV slot
      across branches. Evidence: slot-hit count from `/slots` before and after.
- [ ] **P5-03** Ordered candidate nodes: order chunks by `ordinalMap` index so shared subsets reuse prefix blocks. Evidence:
      identical prompt bytes for identical candidate sets.
- [ ] **P5-04** Tournament branches: score in parallel and prune losers on prefill logprob before full decode. Evidence:
      pruning receipt with branch ids and scores.
- [ ] **P5-05** KV policy: production stays `-ctk q8_0 -ctv q8_0`. Do not introduce `q4_0` KV or `turbo3` without the
      TurboQuant stability harness (`npm run turbo:test:stability:turbo`). Evidence: `/props` shows the cache types.
- [ ] **P5-06** Grammar: a strict ACE v3 JSON grammar only if P5-01 shows the server supports a grammar switch mid-stream.
      Otherwise use one grammar for the whole decode. Evidence: parse rate on a fixed prompt set.
- [ ] **P5-07** GPU budget: check `nvidia-smi` before a run. Do not stop `:8090` for classifier work. Evidence: VRAM readings
      recorded with the run.

## Phase 6 — DSPy GEPA and OaK (offline, shadow only)

- [ ] **P6-01** Compile prompt signatures with DSPy GEPA offline, in the `atlas-rapids-cu13` env or Windows `py -3.13`
      (whichever has the package; check first). Output is a versioned artifact with a checksum. Evidence: artifact path
      and sha256.
- [ ] **P6-02** Key order of compiled few-shot examples must match the ACE v3 schema. Evidence: key-order test.
- [ ] **P6-03** OaK constraints come from `oaklib` through the NLP sidecar, after P0-05 is settled. Evidence: constraint list
      returned by a live call.
- [ ] **P6-04** Shadow mode only: results are logged and never change the served packet. Evidence: `shadow: true` on every record.

## Phase 7 — JSON ACE packet emit

- [ ] **P7-01** The packet is a bounded JSON descriptor with no float vectors inline. Bulk numeric data goes to Arrow IPC
      (`pyarrow` 24.0.0 is installed in `atlas-rapids-cu13`). `msgspec` and `xxhash` are NOT installed there; do not add them
      without DEPENDENCY-CAPABILITY-GUARD-01. Evidence: packet size bound check.
- [ ] **P7-02** Frontend transport: keep `/api/ace/stream` on SSE (CLAUDE.md transport matrix). No WebSocket migration in this
      change. Evidence: stream contract unchanged.
- [ ] **P7-03** Write the packet through the existing `AcePacketWriter` owner. Evidence: read-back matches the written packet.

## Phase 8 — Production readiness (after Phase 5 APPLY_PROVEN)

- [ ] **P8-01** Eval set: reviewed gold queries with expected domains and expected evidence. Evidence: recall, precision,
      and ECE on a held-out split; trust floor from P1-01 met.
- [ ] **P8-02** End-to-end smoke from user query to packet, through the SvelteKit route (not only the services). Evidence:
      one recorded run per domain class.
- [ ] **P8-03** Playwright E2E against the real route, with fail-closed assertions for PARTIAL, BLOCKED, and hidden-thought
      rejection. Evidence: report file. `tests/e2e/ace-tournament-dag-realtime.spec.ts` does NOT exist yet; create it under
      this task only.
- [ ] **P8-04** Svelte check on touched files only (the full project run has tens of thousands of pre-existing errors).
      Evidence: no new errors listed for touched files.
- [ ] **P8-05** Observability: each stage writes its receipt (counts, durations, completeness). Evidence: receipts found by a
      single query.
- [ ] **P8-06** Rollback: a feature flag turns the DAG-prefill path off and falls back to the current path. Evidence: toggle test.
- [ ] **P8-07** Runbook for Windows 10 + Docker + WSL2: start `docker-desktop`, start `Ubuntu` for conda, the `:8090`
      free/restart sequence, and `docker restart miniforge-nlp-sidecar`. Evidence: each command run once, output recorded.
- [ ] **P8-08** Archive, don't delete: superseded artifacts go to the archive with a manifest entry (CLAUDE.md archival rules).

## Phase 9 — Ingestion caller wiring for scan_completeness (not gated by Phase 5)

Callers found so far (ripgrep, 2026-10-21). `git grep` returned nothing for the `/ast/chunk` string, so ripgrep is the
verified method. `ast-chunker.ts` was named in an earlier note but is not a verified caller.

- SvelteKit client: `sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.ts` (15 s timeout, validates schema).
- Replay: `scripts/atlas/prove-live-structural-producer-replay-v1.mjs` (20 s timeout).
- Audit and build scripts under `scripts/atlas/` (about 10 files, e.g. `ast-chunk-keyed-map-v1.mjs`,
  `audit-ast-edge-eligibility-v1.mjs`, `build-next-steps-master-v1.mjs`).

Inventory (ripgrep, 2026-10-21). Scope: `sveltekit-frontend/src`, `sveltekit-frontend/scripts`, `scripts/`. Tests excluded.

| Priority | Caller (file:line) | Timeout | Reads response | Completeness check |
|---|---|---|---|---|
| 1 agent-facing | `sveltekit-frontend/src/lib/server/services/knowledge-search/ACPToolRegistry.ts:1080` (`nlp:ast-chunk` tool) | none found | yes, HTTP status only | NO |
| 2 app client | `sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.ts:683` | 15 s | yes, schema checked | NO |
| 3 replay | `scripts/atlas/prove-live-structural-producer-replay-v1.mjs:24` | 20 s | yes | NO |
| 4 audit/build | `scripts/atlas/audit-ast-edge-eligibility-v1.mjs:50` | 90 s | yes | NO |
| 4 audit/build | `scripts/atlas/ast-chunk-keyed-map-v1.mjs:191`, `build-emb1-semantic-card-corpus.mjs:94`, `index-8095-ast-graph.mjs:66`, `plan-current-structural-edge-artifact-v1.mjs:70`, `plan-current-structural-edge-artifact-v2.mjs:78`, `plan-structural-projection-v1.mjs:40`, `audit-sveltekit2-package-ast-v1.mjs:65`, `audit-treesitter-structural-observation-v1.mjs:90`, `audit-function-source-readback-v1.mjs:14`, `build-next-steps-master-v1.mjs:168,218` | varies | yes | NO |

Priority 1 comes first because an agent can consume a PARTIAL result as complete.

- [x] **P9-01** Inventory each caller (file:line, timeout, whether it reads the response). Inventory only; no implementation
      implied. Re-run before wiring. Also found 2026-10-21: three TypeScript callers of the shared client (`live-structural-lane-provider.ts:120`,
      `graphify-structural-materializer.ts:53`, `function-registry-postgres-snapshot-loader-v1.ts:100`) and two scripts
      (`audit-function-discovery-readback-v1.mts`, `plan-callable-projection-refresh-v1.mts`) call `astChunk()` through the client, so they
      inherit the throw.
- [~] **P9-02** Each caller treats `scan_completeness !== "COMPLETE"` as incomplete. An HTTP timeout or abort also counts as
      incomplete. Evidence: one test per caller with a PARTIAL or timeout fixture. Status 2026-10-21: all inventoried callers
      are gated (static). Unit-test evidence exists for the agent tool, app client, replay predicate, shared helper, and lane
      provider spec. The other gated scripts are syntax-checked only. Live proof pending. See the detail below.
      Status 2026-10-21: DONE for priority 1 (`ACPToolRegistry.ts` `nlp:ast-chunk`, fails with `scan incomplete` /
      `MISSING_RECEIPT`; `phase89.spec.ts` 7/7 pass with 3 new cases) and priority 2 (`miniforge-nlp-sidecar.ts`, see P3-04).
      Priority 3 (replay `scripts/atlas/prove-live-structural-producer-replay-v1.mjs`): implementation complete, awaiting
      proof. Admission is a pure function, `scripts/atlas/lib/ast-replay-admission-v1.mjs` `evaluateReplayAdmission`,
      with 9/9 node tests (COMPLETE admitted; PARTIAL_AST_FAILED, MISSING_RECEIPT, timeout, transport error, HTTP error,
      malformed body, span mismatch, ambiguous span, upstream-node mismatch, no nominations, failed precondition all
      REFUSED with zero write counters). The script always writes a report, and a refused run is recorded as a diagnostic.
      NOT yet proven: a bounded live replay against `:8095` has not been run. Open risk: the report path is fixed, so a
      refused run overwrites an earlier receipt. Archive the previous report or write exclusive-create by run id before
      a live run.

      Priority 4 (2026-10-21 deep audit). Shared helper `scripts/atlas/lib/source-observation-http-v1.mjs`:
      `astScanCompleteness` and `assertCompleteAstScan` (5/5 node tests pass). Wired, fail-closed:
      - `build-emb1-semantic-card-corpus.mjs` (writes card corpus): throws before any card is built; status stays BLOCKED.
      - `audit-treesitter-structural-observation-v1.mjs` (writes AST snapshot): throws before snapshot rows; the existing
        per-source catch records the failure.
      - `plan-current-structural-edge-artifact-v1.mjs` and `-v2.mjs` (write edge plans): record an error and skip the source.
      Priority 4, report-only group (2026-10-21, same pass): gated with the shared helper, each refusal recorded per file
      and never admitted: `ast-chunk-keyed-map-v1.mjs` (stage FAILED), `index-8095-ast-graph.mjs` (per-file error),
      `plan-structural-projection-v1.mjs` (error and skip), `audit-sveltekit2-package-ast-v1.mjs` (per-file error),
      `audit-function-source-readback-v1.mjs` (native result REJECTED, no comparison), `audit-ast-edge-eligibility-v1.mjs`
      (new `refusedFiles` array in the report; no edges counted from a refused file), `build-next-steps-master-v1.mjs`
      (both call sites, no AST hit recorded).
      Priority 3-4 "tested" does NOT yet include these seven: they have a syntax check only (`node --check`), no unit tests.
      Priority 2 app-client timeout path: not tested. Live lane provider (`live-structural-lane-provider.ts`): skips a refused
      file and continues the batch; its existing spec passes; no PARTIAL-specific test yet.

      Status of P9-02 as a whole: IMPLEMENTATION COMPLETE for all inventoried callers, static checks only. Tested: agent tool,
      app client, replay predicate, shared helper, and the lane provider's existing spec. Syntax-checked only: the seven
      report-only scripts, the emb1/treesitter/planner writers, the replay script. Live proof: none yet.
      Remaining open: a PARTIAL-fixture unit test per script (or one shared integration test), and the live runs.
- [~] **P9-03** WIRED (caller side, additive), not LIVE. The TS client (`miniforge-nlp-sidecar.ts`) now returns `sizeLimit`
      (`reason`, `maxChars`, `originalChars`) on `analyze` and `pos`. Unit tests (2) pass; they check the character count rule.
      The sidecar still truncates silently at its own `_safe_text`. A sidecar-side flag would need a restart, not yet done.
      Limit: `pos` uses a client constant (50,000) that mirrors the sidecar's `MAX_TEXT_CHARS` default; the two can drift.
- [~] **P9-04** WIRED (static evidence), not LIVE. Code paths checked: materializer (`graphify-structural-materializer.ts`)
      returns `FAILED` on a thrown partial; function-registry loader returns `[]` on error; card corpus, AST snapshot, and edge
      planners are gated before any write. No live write-count test was run; that needs a PARTIAL fixture against a writer.

      Contract (2026-10-21), kept as separate fields, never merged into one status:
      - AST scan: `COMPLETE` | `PARTIAL_AST_FAILED` | `MISSING_RECEIPT`.
      - NLP pass: `COMPLETE` | `SIZE_LIMIT_EXCEEDED` | `FAILED` | `NOT_RUN`. A COMPLETE AST scan does not imply NLP completed.
      - Admission: `ALLOWED` | `REFUSED`. A partial or missing AST scan is REFUSED for AST-based admission. Whether a skipped
        NLP pass blocks an AST-only admission is the consumer's decision, recorded per consumer.
      - Writes for a refused run must be zero: `revisionQualifiedWrites: 0`, `graphifyProjectionWrites: 0`,
        `aceAdmissionWrites: 0`. The replay predicate returns these counters, and its tests check them.
      - Status: WIRED. The replay predicate follows the contract (tested). The TS client and agent tool refuse on a non-COMPLETE
        receipt (tested). A write-level proof against a real persistence writer is still missing.

## Phase 10 — hg:* Redis namespace split (cases vs atlas)

Two distinct producers: `src/lib/server/features/cases/hypergraph-4d.ts` (legal-case path, orchestrator Stage 9) and
`scripts/run-hypergraph.ts` (codebase / Parent Atlas path). They have different logic and share key names
(`hg:edge:idx`, `hg:edge:{hash}`, `hg:4d:{id}`, `hg:built_at`). Readers: `topological-search.ts`, `ci-smoke-hypergraph.mjs`.

- [x] **P10-01** Call-site inventory (read-only). Inventory only; no namespace change implied. Done 2026-10-21 for readers
      and writers. `workspace_rev` is NOT in scope at any of them.

      | Role | Location | Keys touched | Notes |
      |---|---|---|---|
      | Reader | `src/lib/server/retrieval/topological-search.ts` (`hg:edge:idx` zrange, `hg:edge:{hash}` get) | read | Only importer: `src/lib/server/features/ai/ace/context-assembler.ts:94` (`applyTopologicalBoostAsync`), so the ACE path is affected |
      | Reader | `scripts/tests/deep-directory-audit.mjs:351` | read `hg:edge:idx` | Not listed before. Must be updated too |
      | Writer (cases) | `src/lib/server/features/cases/hypergraph-4d.ts` (pipeline ~871-884; `invalidateHypergraph` ~1318) | write `hg:4d`, `hg:edge`, `hg:edge:idx`, `hg:built_at` | Imported by 16 files, including the orchestrate route, `api/graph/hypergraph/*`, `api/ai/feedback`, `api/analytics/rl-signal`, `api/citations/saved`, `api/analytics/research-summaries`, and `gemma4-agent.ts` |
      | Writer (atlas) | `scripts/run-hypergraph.ts` (writes 529-557; deletes `hg:edge:idx` at 450; reads 588-590, 740-741, 779) | write and read | Standalone CLI |
      | Script → cases module | `scripts/hypergraph-build-4d.ts` (imports `buildHypergraph4D`) | write via cases module | A script entry point into the cases writer |
      | Smoke | `scripts/ci-smoke-hypergraph.mjs:47-61` | write test keys, read unprefixed names | Parameterize with the namespace |
      | DELETE route | `src/routes/api/graph/hypergraph/+server.ts` (`invalidateHypergraph`) | delete | Must clear only its own namespace |

      Consequence: Option B (`{workspace_rev}` in the key) requires threading a new parameter through the ACE path and
      all 16 cases-module importers. Option A (domain-only prefix) changes only key strings.
- [ ] **P10-02** Operator chooses the namespace scheme. Option A: `hg:cases:*` and `hg:atlas:*`. Option B: with
      `{workspace_rev}` in the prefix. Status: BLOCKED until chosen. Option B needs `workspace_rev` at every call site, so
      P10-01 comes first.
- [ ] **P10-03** Update both writers to the chosen prefix. Each keeps its own logic. Evidence: key-pattern test per writer.
- [ ] **P10-04** `topological-search.ts` takes an explicit namespace. Every caller from P10-01 is updated. No caller still reads
      the unprefixed key. Evidence: grep shows no unprefixed `hg:edge` reads.
- [ ] **P10-05** `ci-smoke-hypergraph.mjs` takes `--namespace` and checks the matching keys.
- [ ] **P10-06** Invalidation (`invalidateHypergraph`, DELETE `/api/graph/hypergraph`) clears only its own namespace. Evidence:
      a test shows the other namespace survives.
- [ ] **P10-07** Existing unprefixed keys: decide whether to leave, migrate, or archive. Archive, don't delete. Status: BLOCKED
      until decided.

## Review log (2026-10-21): P9 scan_completeness wiring

Proof level reached: **WIRED** (static code review plus unit tests). Not LIVE_READ_ONLY, not PROVEN. The Parent Atlas
gates (adversarial probes, live read-only census) cover the GAN packet path, not AST completeness, so they were not
run for this change. The `validating-parent-atlas` skill was used for the review, following its level rules.

Tests (all run, all pass):
- `src/lib/server/services/knowledge-search/ACPToolRegistry.phase89.spec.ts`: 8/8 (COMPLETE, PARTIAL_AST_FAILED,
  missing field, timeout, plus the existing cases).
- `src/lib/server/nlp/miniforge-nlp-sidecar.spec.ts`: 15/15 (partial-receipt rejection, size-limit unit tests, existing
  fixtures with `COMPLETE`).
- `scripts/atlas/lib/source-observation-http-v1.test.mjs`: 5/5 (`astScanCompleteness`, `assertCompleteAstScan`).
- `node --check` passes on all changed `.mjs` scripts. `svelte-check` reports no error-level diagnostics in the touched
  TypeScript files.

Not tested (open, so not claimed):
- No live `PARTIAL_AST_FAILED` run against `:8095`. The sidecar cannot be made to fail extraction from outside without a
  code change, so only the in-process path is verified.
- No bounded live replay against `:8095`. The replay admission predicate is tested (9/9); the script is syntax-checked
  only. The live run is separate integration evidence and has not been done.
- No timeout test for the replay script or the report-only scripts.
- No oversized-input test through `analyze` end to end. The receipt is unit-tested only.

Gaps found by the review (none are evidence leaks, but each needs a decision):
1. `live-structural-lane-provider.ts:120`: DECIDED 2026-10-21 as skip-the-file and continue (same rule as the planners). The
   file's hits are dropped, but the function's return type has no diagnostic channel, so the refusal is not recorded in
   the output. Adding one is a follow-up.
2. `function-registry-postgres-snapshot-loader-v1.ts` returns `[]` from a broad catch. That is fail-closed for admission,
   but it hides why a scan was rejected. Record the reason.
3. The seven report-only scripts are now gated (static). Per-script PARTIAL-fixture tests are still missing.
4. The sidecar truncates text silently at `max_chars`. Only the TS client reports it.
5. `pos` uses a client copy of the sidecar's text limit. The two values can drift.

Graph and namespace status (from the review log):
- Graphify-dependent admission: BLOCKED. The current lifecycle receipt is not accepted as a valid completed run, and
  `SNAPSHOT_NATIVE_EXECUTION_COMPLETED` alone does not prove lifecycle or projection currentness.
- P10-02 namespace decision: BLOCKED (domain-only versus workspace-revision-qualified keys).
- Recommended namespace (for the operator to confirm, not implemented): `hg:cases:{scope_id}:*` and
  `hg:atlas:{workspace_revision}:*`, with a central resolver. Migration waits until P9-02 is complete and a qualified
  graph snapshot exists. Regression tests needed for the ACE context assembler and both producers.

Recommended order (from the review): P9-02 → P9-03 → P9-04 → focused integration tests → Graphify currentness
qualification → P10 contract → namespace migration → Phase 5 DAG-prefill proof → Phase 8.

## Parked (not in this change)

- CUDA 13.4 / TensorRT-RTX lane: not approved.
- WebSocket/WebTransport migration: conflicts with the CLAUDE.md transport matrix.
- Iso-quant rotations on KV and TurboVec: research only, a challenger behind its own gate.
- HyperLogLog traversal logger: separate telemetry change.

### Deferred architecture review (after Phases 9–10; no implementation authorized)

- [ ] **D-01** Re-audit `scan_completeness` end to end after P9 caller wiring. Keep AST extraction completeness distinct from NLP size skips, LSP timeouts, source binding, and persistence eligibility. A successful parser response alone is not a complete admitted scan.
- [ ] **D-02** Assess AST pre-splitting only if bounded whole-source requests still time out after P9. Any splitter must preserve parser scope and imports, map every subspan to exact original UTF-8 bytes, and report unprocessed ranges. Do not assume brace-depth splitting is grammar-safe or introduce a process pool before measuring CPU/RSS and queue behavior.
- [ ] **D-03** Keep PostgreSQL authority in typed, schema-owned columns and constraints. JSONB/GIN may index flexible parser attributes, but cannot qualify revisions or replace typed identity. Any completeness-column or migration proposal belongs in a reviewed schema change and remains unapplied absent authorization.
- [ ] **D-04** Complete P10's read/write/invalidation namespace inventory and obtain the namespace decision before changing Redis keys. `hg:cases:*` versus `hg:atlas:*` is a candidate, not an established contract; do not add a workspace-revision prefix unless every writer, reader, and invalidator can supply it.
- [ ] **D-05** Audit Stage 9 PageRank provenance against the documented NetworkX/cuGraph parity authority and Neo4j's projection role. Do not label CouchDB-derived Redis scores, NetworkX oracle results, and Neo4j GDS values as interchangeable evidence.
- [ ] **D-06** Preserve the current transport contract (SSE for `/api/ace/stream`) unless a separately measured requirement demonstrates bidirectional control or binary streaming. Any WebSocket/WebTransport/gRPC/Protobuf proposal requires its own compatibility, auth, cancellation, backpressure, and replay contract.
- [ ] **D-07** Keep browser IndexedDB/OPFS caches, HLL traversal telemetry, prompt-prefill DAG/KV reuse, grammar switching, and orthogonal quantization rotations in separate evidence-backed proposals. Never persist KV/tensor/hidden-thought state; benchmark derived telemetry and retrieval changes against deterministic CPU baselines first.
- [ ] **D-08** Keep `simd_bridge_rs.node` in its existing SvelteKit/Node boundary. The 8095 Python sidecar remains the bounded parser/NLP service; use its existing JSON contract unless large-response measurements justify a separately reviewed transport change. Do not couple the Rust addon to FastAPI by assumption.

These items are deferred architecture questions, not acceptance criteria for the current phases. No PostgreSQL, Redis, Qdrant, GPU, transport, or admission changes are authorized by listing them here.

### Read-only owner audit (2026-10-21; historical baseline, superseded by NLUT-01–05)

The duplicate-table findings below describe the pre-consolidation state. The current runtime routing and ACE compiler consume
the checksummed shared palette artifact; see `openspec/changes/parent-atlas-nes-lut-single-owner/tasks.md` for current parity
evidence. Prompt injection tracing (P2-04), exact domain crosswalk (P2-03), and tournament packet linkage (P11-04) remain open.

- `python/parent_atlas_learning/ace_compiler.py` contains a duplicate `NES_LUT_PALETTES` table. Its `byte` field is a
  color-like NES hex value, not the AST router's `lutByte`; it also differs from the Node palette's `nesHex` for 8 of
  the 10 shared keys. `compile_ace_packet_from_proposal` selects the palette at line 52 and emits it in packet metadata
  and an OaK tuple, but this function does not construct or inject a DAG prompt. P2-04 remains open for tracing the
  actual downstream prompt consumer; do not wire a guessed injection site.
- `python/atlas_compute/ast_chunk_routing_helpers.py` uses ordinal `lutByte` values 0x01–0x09, plus `svelte5_runes`
  0x2A and `unresolved` 0x00. The Node palette uses the same ordinal values for the nine technical domains, but stores
  `nesHex` separately (for example, `ui.lutByte=0x02`, `ui.nesHex='0x2A'`). The `svelte5_runes` entry is not present in
  the Node palette. Do not treat 0x2A as a replacement for `ui.lutByte` or select a canonical owner until field semantics
  and the intended rune sub-palette are approved.
- Both `src/lib/server/features/cases/hypergraph-4d.ts` and `scripts/run-hypergraph.ts` write overlapping unprefixed
  keys (`hg:edge:idx`, `hg:edge:{id}`, `hg:4d:{id}`, `hg:built_at`). `topological-search.ts` reads the same edge
  namespace. `scripts/ci-smoke-hypergraph.mjs` also writes a sentinel into `hg:edge:idx` and `hg:edge:{id}`; it was
  inspected, not executed. This confirms a collision risk, not that a collision occurred in live Redis. P10-01's
  read-only inventory remains the evidence; P10-02 still needs an operator namespace choice.
- Scoped corpus search found no Kimi 3 or MISRA taxonomy entries. Titans 2.0 appears only as deferred/unverified
  research context in the inspected architecture/spec material; GELU/SiLU occur as technical terms, not reviewed domain
  mappings. None of these terms is a canonical domain or ontology mapping by itself.
- No prompt, Redis, database, Qdrant, or GPU operation was performed for this audit.
- The pure Python ACE compiler was expanded and unit-tested: it now validates proposal/schema/evidence/task/concept/
  instruction/TTL/confidence inputs, rejects duplicate or unapproved evidence and proposals claiming writes, sorts
  evidence deterministically, escapes OaK tuple strings, derives proposal-specific packet IDs, and emits
  `PROPOSED_NOT_ADMITTED`. The legacy NES value is emitted separately as `nes_hex`; `lut_byte` remains null until the
  conflicting palette owners are reconciled. Focused standard-library tests pass 5/5, and the existing compiler
  compatibility test passes. This does not complete P0/P2/P7 or establish an AcePacketV3 writer/readback path.
- Changed files: `python/parent_atlas_learning/ace_compiler.py`,
  `tests/parent_atlas_learning/test_ace_compiler.py`.
- The existing TypeScript DAG-prefill builder was hardened to validate unique canonical/packet/tree-node identities,
  a single representation revision, in-range reciprocal DAG links, the sealed LUT checksum at synthesis time, and
  duplicate/invalid selected ordinals. Two focused tests were added for tampering and duplicate selections. The frozen
  50-entry LUT passed read-only uniqueness, representation, and link-reciprocity checks. A single-worker Vitest run
  passed the DAG-prefill, contextual-candidate-ranker, and SearchRuntime ContextManifest-shadow specs: 3 files, 14 tests.
  This proves those existing pure/helper boundaries together under fixtures; it does not prove a diagnostic-to-repair
  pipeline, live source qualification, model inference, AcePacketV3 persistence/readback, or production admission.
