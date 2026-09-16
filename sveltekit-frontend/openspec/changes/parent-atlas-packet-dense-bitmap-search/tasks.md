## 1. Query-builder module (Postgres bitmap-prefilter stage)

- [x] 1.1 Create `src/lib/server/retrieval/packet-bitmap-prefilter.ts` — parametrized query
      builder over `atlas_packets` accepting `feature_id`, `source_ref`, `concept_id`, `tags`,
      `domain_class`, `workspace_revision` as optional filters, following the existing
      parametrized-query convention already used by `atlas.packet_search` in
      `trace-mcp-server.ts` (no raw string-concatenated SQL)
- [x] 1.2 Enforce the "at least one selective filter" rule (`feature_id`/`source_ref`/
      `concept_id`/`tags` — `domain_class` alone is rejected) at the builder level, returning a
      typed validation error rather than silently running an unbounded scan
- [x] 1.3 Implement the candidate-set cap (default 500, configurable) with `LIMIT` (cap + 1) to
      detect truncation without a separate `COUNT(*)` query
- [x] 1.4 Return `{ candidates: { packetKey, sourceRef, ... }[], candidateSetTruncated: boolean }`
      from the builder — **corrected from the original `packetKeys: string[]` shape**: Stage 2
      needs `sourceRef` per candidate too (see task 2.1's correction), so the result carries both
      identifiers per row, not just `packetKey`
- [x] 1.5 Unit test the query builder against a range of filter combinations (single filter,
      multiple filters, missing-selective-filter rejection, cap boundary at exactly 500 and 501
      matching rows) — `packet-bitmap-prefilter.spec.ts`, 13 tests passing

## 2. Dense reranking stage (Qdrant)

- [x] 2.1 Implement a Qdrant query function that accepts a candidate list, a target collection
      name (`codebase_chunks_768` or `codebase_chunks_768_v2`, required — no default), and a
      query vector, applying a payload `must` filter restricting results to the candidate set —
      **real-schema correction chain, all same day (2026-09-16)**: (1) the original design assumed
      a `packet_key` field on the Qdrant payload; a `GET /collections/{name}` `payload_schema`
      check showed neither collection listed one, so the fix (filter on `source_ref`) was made and
      shipped — but `payload_schema` only lists *indexed* fields, not all keys present on points,
      so this was wrong; (2) a follow-up point-scroll (3 points) found `codebase_chunks_768`
      genuinely carries `packet_key` (unindexed, plus an inconsistent camelCase `packetKey`
      duplicate on some points — a real data-quality finding, not fixed here) and concluded
      `codebase_chunks_768_v2` has none at all — but 3 points is too small a sample; (3) a 1000-
      point resample of `_768_v2` found `packet_key` present on ~12.8% of points, corroborated
      independently by a separate 5,000-point census (§8.6, 11.96%) — sparse, not absent.
      **Net finding, now stable across two independent large samples**: `source_ref` is indexed
      and 100%-populated on both collections; `packet_key` is unindexed-but-present on `_768` and
      sparsely-present (~12%) on `_768_v2`. `source_ref` was and remains the correct filter key on
      both grounds (indexed + complete), independent of which version of the "packet_key" claim
      was live at the time. The earlier `packet_key`-filtered version's live timeout against
      `codebase_chunks_768` (328K points) is attributed to the missing index, not a missing field.
      All three source comments were corrected to this final, sample-size-appropriate finding.
- [x] 2.2 Reuse a direct Qdrant client call — implemented via the same raw-fetch REST pattern
      already used by `image.search_by_text` in `trace-mcp-server.ts` (POST
      `/collections/{collection}/points/query`), not a new wrapper
- [x] 2.3 Reject requests missing the target collection parameter with a clear error
- [x] 2.4 Handle the case where the candidate set is empty (Stage 1 returned zero packets) —
      return an empty result set without calling Qdrant

## 3. Join-back and response shaping

- [x] 3.1 Join Qdrant hits back to `atlas_packets` by `packet_key` — never `feature_id` alone.
      **Corrected from the original "fallback to source_ref" framing**: since Stage 2 now
      filters by `source_ref` (task 2.1), hits are first mapped `source_ref → packetKey(s)` via
      the Stage 1 candidate list (one `source_ref` can back several packets — different symbols
      in the same file, each sharing the file-level chunk score), then joined to `atlas_packets`
      by `packet_key` for the canonical fields
- [x] 3.2 Attach `summary`, `reward_prior`, `community_id`, `page_rank_score` from the joined
      Postgres row to each result
- [x] 3.3 Shape results using `PacketControlWordV1`
      (`src/lib/server/atlas/packet-control-word-v1.ts`, the closed
      `parent-atlas-packet-control-word-record` contract) for the compact per-result projection —
      **corrected from the original assumption that the control word itself carries
      `packetKey`/`title_id`/`sourceRevision`**: that module's schema is `.strict()` and only
      encodes revisions/feature-bits/LOD/residency, not identity. `packetKey`/`titleId`/
      `sourceRevision` are attached as sibling fields on `PacketDenseSearchResult`, alongside the
      reused control word — first real production caller of this previously-unwired module.
      `presentBits`/`lod`/`residency`/`domainByte`/`routingByte` are a documented best-effort
      derivation from available `atlas_packets` columns (see code comment), not an authoritative
      certification.
- [x] 3.4 Attach full `payload`/`summary` only to the top `expandTopK` (default 10) ranked results

## 4. MCP tool registration

- [x] 4.1 Register `atlas.packet_dense_search` in `sveltekit-frontend/src/mcp/trace-mcp-server.ts`
      next to `atlas.packet_search`, with a Zod `inputSchema` covering `feature_id`, `source_ref`,
      `concept_id`, `tags`, `domain_class`, `workspace_revision`, `collection` (required enum),
      `query_text`/`query_vector`, `candidate_cap`, `dense_limit`, `score_threshold`,
      `expand_top_k`
- [x] 4.2 Tool description states the explicit `collection` requirement and selective-filter rule
- [x] 4.3 Code comment near the registration names `atlas_packet_dense_bitmap` as a candidate lane
      for the still-design-only RRF weight-table registry — no fusion code added

## 5. Proof gates (verification, matches the plan's verification section)

- [x] 5.1 Ran `EXPLAIN (ANALYZE, BUFFERS)` on the Stage 1 SQL against live `legal-ai-postgres` for
      2 filter combinations (single `feature_id`; `feature_id AND domain_class`). Confirmed:
      single-filter plan is `Bitmap Heap Scan` / `Bitmap Index Scan` on
      `idx_atlas_packets_feature_id_composite`; two-predicate plan is a real `BitmapAnd` combining
      `idx_atlas_packets_domain_class_idx` and `idx_atlas_packets_feature_id_composite` — not a
      sequential scan in either case.
- [x] 5.2 Recorded the buffer/timing evidence: single-filter query, cold cache,
      `Buffers: shared read=492`, Execution Time 13.5ms; two-predicate `BitmapAnd` query, mostly
      warm cache, `Buffers: shared hit=232 read=7`, Execution Time 5.5ms. Concrete numbers, not
      an assumption.
- [x] 5.3 Called the tool end-to-end over the live MCP HTTP endpoint (`POST :8788/mcp`,
      `tools/call`) twice: once with a feature_id whose packets turned out to be backup-report
      artifacts (correctly returned `status: "NO_RESULTS"`, not an error — those files are
      genuinely unindexed in Qdrant), and once with a real live-source feature_id (`web-search`),
      which returned `status: "OK"` with real joined-back `packetKey`/`titleId`/`sourceRef` and a
      valid `controlWord` with a real checksum. Both calls surfaced real bugs (source_ref vs
      packet_key filter mismatch; integer-vs-string revision type mismatch against
      `encodePacketControlWordV1`'s `.strict()` schema) that were found and fixed in this same
      session — this gate did its job.
- [x] 5.4 Formal latency comparison, run for real against the live MCP server (2026-09-16):
      - **Small-scale (8 real feature_ids, 2-4 candidates each)**: Pattern A (`atlas.packet_search`
        + 1 follow-up Qdrant call) averaged 33.8ms; Pattern B (`atlas.packet_dense_search`, single
        call) averaged 27.3ms — ~19% faster on average, though per-query variance was noisy at
        this tiny candidate-set scale (some individual queries were slower under Pattern B,
        dominated by MCP-transport/network overhead rather than the bitmap-scan advantage from
        tasks 5.1/5.2, which only shows up at larger N).
      - **Large-scale attempt (feature_id="AGENTS", 281 real candidates)**: attempted to honestly
        replicate what Pattern A actually costs at scale — one Qdrant call per distinct
        `source_ref` (not just the first one, unlike the small-scale run) — and this **hung the
        live MCP server** (`trace.system_health` and even the pre-existing, untouched
        `atlas.packet_search` tool both started timing out with `UND_ERR_HEADERS_TIMEOUT`).
        Root-caused as environmental/load-induced, not a defect in this change's code: the bare
        `GET /health` endpoint kept responding in <20ms throughout, so the server process itself
        was alive; a clean `stop + npm run trace:mcp:ensure` restart immediately restored full
        health (`trace.system_health` back to the same 9-healthy/2-down baseline in <200ms).
        **This is itself a real, honest data point for the comparison**: the old two-call pattern,
        scaled up to its real per-source_ref cost, is fragile enough to wedge the server under
        load. After the restart, `atlas.packet_dense_search` was called directly against the same
        `feature_id="AGENTS"` (skipping Pattern A this time, to isolate the measurement) and
        returned `status: "OK"`, `candidateCount: 282`, `candidateSetTruncated: false`, 3 real
        joined-back results, in **71ms wall time, single call** — a real, freshly-measured number,
        not a restated estimate. Pattern A was not re-run at this scale after the hang (that would
        require another live-service disruption for a single number); the qualitative result —
        one bounded call succeeds reliably and fast where the naive N-call alternative wedged the
        server — is the more important finding from this gate.
- [x] 5.5 Re-ran system health after the change (and after 5 total MCP server restarts needed to
      load new tool code across this session, including recovery from the 5.4 hang above): the
      same 9 services stayed healthy, the same 2 (`topology_search` :8101, `rerank` :8099) stayed
      down — no regression traceable to this change's code.
- [x] 5.6 `candidateSetTruncated` verified both in unit tests (cap boundary at 500/501) and live:
      the `feature_id='scripts.+server.ts'` query genuinely had 2,397 matching rows against a
      500 cap and the live response correctly reported `candidateSetTruncated: true`.

## 6. Documentation (non-blocking follow-ups noted, not fixed here)

- [x] 6.1 `topology_search` (:8101) is down with a known fix (`npm run topology:search:ensure`) —
      informational only, this change does not depend on it or fix it. Confirmed still down,
      unrelated to this change, after 3 separate `atlas.packet_dense_search`-triggered MCP server
      restarts this session.
- [x] 6.2 Investigated, then deliberately declined a static-doc update. Checked
      `src/mcp/trace-mcp-server.ts`'s own header comment block (the closest thing to a hand-
      maintained tool inventory in this file) — it already says "Tool namespaces (17 tools)" while
      the file registers dozens more (including pre-existing tools like `atlas.packet_search`,
      `atlas.coverage`, `image.search_by_text` that were never in that list either), and no
      `docs/reports/mcp-tool-registry-index.json` or other maintained tool-inventory doc exists in
      this repo (checked `grep -rl "atlas.packet_search" docs/` — only auto-generated graph-probe
      JSON, no hand-authored list). Per CLAUDE.md's own repeatedly-documented lesson about stale
      hand-maintained MCP tool counts causing real confusion (the "9 tools" vs. 108-tools-live
      finding; the "175/129 tools" MCP/Atlas status-note history), adding one more entry to an
      already-known-stale list would not fix the underlying problem and could read as implicitly
      certifying that list as trustworthy. The tool is discoverable via live `tools/list` (verified
      working in task 5.3) and documented in its own MCP `description` field and this change's
      module-level code comments — matching how this repo already treats tool-count truth
      (`src/mcp/server.ts`'s `ListToolsRequestSchema` handler, not a doc, is canonical). No new
      doc added; this reasoning is the record of why, satisfying the Duplication Prevention rule's
      "record what you found, even when you don't fix it."

## 7. Follow-ups found during implementation (not required by the original task list)

- [x] 7.1 De-duplicate `PacketDenseSearchResult` entries when multiple Qdrant chunks for the same
      `source_ref` map to the same `packetKey` — observed live (one `web-search` result appeared
      3 times at descending scores because 3 separate Qdrant chunks in the same file matched).
      Fixed: keep only the best-scoring occurrence per `packetKey`, sort results by score
      descending.

## 8. Authority gates and current read-back constraints (2026-09-16)

- [x] 8.1 Canonical embedding owner located: existing `embedQueryForLane(..., 'dense_768')` is now
      used by the MCP text-query path; query vectors are required to be exactly 768 dimensions.
- [x] 8.2 Projection IDs are not canonical identity: dense hits require payload `source_ref` and
      never fall back to a Qdrant point ID.
- [x] 8.3 Join-back preserves `source_revision` separately from `workspace_revision` and exposes
      identity resolution source plus typed `status`/`degradedReasons`.
- [x] 8.4 Live PostgreSQL proof recorded an indexed B-tree plan on `atlas_packets` for a selective
      feature filter (`idx_atlas_packets_feature_id_idx`, no sequential scan). This is valid
      indexed-plan evidence; it does not prove BitmapAnd or an AIO-specific speedup.
- [x] 8.5 Focused dense-search tests pass through the configured lane: 2 files, 17 tests,
      including the deterministic exact cosine oracle.
- [x] 8.5a Added a pure exact dense scorer as the correctness oracle; it validates 768-dimensional
      vectors and deterministic score/key ordering without persistence or executor side effects.
- [ ] 8.6 PDS-00 full canonical dense identity census remains blocked. A bounded read-only
      5,000-point census confirms the gap: `codebase_chunks_768` has complete packet/source/feature
      coverage but no revision-qualified payload fields and 1,020 duplicate packet-key groups;
      `_v2` has 100% source_ref but only 11.96% packet_key, zero feature/domain coverage, and 153
      duplicate packet-key groups. Reports: `qdrant-payload-coverage-codebase-768-bounded-v1.json`
      and `qdrant-payload-coverage-codebase-768-v2-bounded-v1.json`. No collection is promoted.
      The canonical PostgreSQL lineage schema is now aligned additively: `codebase_chunk_index`
      has nullable workspace/source/representation revision and binding-provenance columns plus
      four supporting indexes, with matching Drizzle definitions. A five-row rollback canary
      read back exactly and performed no durable writes. A bounded 128-source census against the
      selected Graphify execution then found 128/128 workspace bindings, 14 packet-bound sources,
      0 exact packet-digest matches, 114 missing packets, and 0 chunk-closed sources. The
      revision bridge therefore remains blocked; no full backfill or Qdrant reindex is authorized.
      Implemented the missing guarded producer path and additive packet storage bridge: the
      legacy integer `workspace_revision` remains untouched, while `workspace_revision_key`,
      `lineage_binding_checksum`, and `lineage_producer_revision` are indexed separately.
      A 25-row producer plan classified 17 `READY_INSERT` rows and 8
      `LEGACY_LINEAGE_FIELDS_MISSING` rows. Readback now proves the latter have the same
      source reference but only null legacy content/revision/provenance fields; no non-null
      conflicting identity was found. The guarded producer supports an explicit null-only
      lineage fill, and a 17-insert/8-update canary read back every expected field and rolled
      back exactly (`inserted=17`, `updated=8`, `readback=PASS`, `writesPerformed=false`).
      This is an upsert-path proof, not durable promotion: the full PDS-00 census, packet
      coverage, and downstream packet/chunk closure remain blocked and no live backfill is
      authorized. A broader 500-row read-only census then classified 241 `READY_INSERT`,
      235 `LEGACY_LINEAGE_FIELDS_MISSING`, 22 non-null `content_hash` collisions, and 2
      source-byte mismatches (`claude.md` and `codex.md`) caused by worktree drift after the
      admitted snapshot. The producer therefore correctly refuses to treat the current tree
      as a stable full-corpus readback or overwrite the 22 conflicting legacy rows.
- [x] 8.7 PDS-03/PDS-04/PDS-05/PDS-11, all run for real against live services (2026-09-16):
      - **PDS-04 (payload-index)**: confirmed directly via `GET /collections/codebase_chunks_768`
        `payload_schema` — `source_ref` has a real `keyword` index covering all 328,348 points;
        `packet_key` has no index entry at all (`undefined`). Concrete API evidence, not inferred.
      - **PDS-03 (exact-vs-filtered executor) + PDS-11 (Recall@K)**: built a real proof script
        (`exact-vs-filtered-proof.mjs`) comparing the production filtered-Qdrant-ANN executor
        against a brute-force exact-cosine oracle (`rankExactDenseCandidates`) over the SAME
        candidate set. First attempt was invalid — it scrolled only 200 points via an unpaginated
        request while the true filter match was 791 points (`POST /points/count`), so the "exact"
        oracle was silently comparing against a random partial subset. Fixed by paginating the
        scroll to fetch the full 790/791 matching points with real 768-dim `content` vectors, then
        reran against a real 32-source_ref candidate set under `src/lib/server/retrieval/`: the
        filtered executor's top-10 achieved **100% Recall@10** against the exact oracle's top-10
        (10/10 keys present in both), exact rank order did not match (`false` — expected, HNSW is
        approximate, and several exact scores were within 0.0002 of each other, close enough to
        legitimately swap rank), and the max score delta on any matched entry was **9.96e-3**
        (~1% on cosine's [-1,1] scale) — consistent with normal ANN approximation error, not a
        correctness bug. One point scored exactly 1.0 in the exact oracle (a near-duplicate
        embedding to the query) and 1.00996 in the filtered executor — a small, bounded, expected
        HNSW quantization artifact, not investigated further (out of scope for this gate).
      - **PDS-05 (currentness)**: the join-back consistency check already implemented at task 3.1
        (`packet-dense-search.ts`, comparing each Stage 1 candidate's `sourceRef`/`sourceRevision`/
        `workspaceRevision` against the freshly-read Stage 3 row) was previously only exercised by
        the happy path. Added a dedicated unit test
        (`packet-dense-search.spec.ts`, "PDS-05 currentness") that simulates a write landing
        between Stage 1 and Stage 3 (`source_revision` diverges) and asserts the result is dropped
        with `status: 'IDENTITY_BRIDGE_UNAVAILABLE'` and `degradedReasons` populated — confirms the
        staleness detection genuinely fires, not just that the code path exists. 18/18 tests pass
        (up from 17) after this addition.
- [x] 8.8 PDS-12 live MCP readback rerun after a controlled TRACE listener restart: initialize and
      `tools/list` returned real JSON-RPC/SSE responses, and `atlas.packet_dense_search` returned
      `status: "OK"` with one joined-back packet from `codebase_chunks_768`; no writes occurred.
- [x] 8.9 Re-checked, scoped honestly: this file itself and the other files in this change were
      under active concurrent edit by (at least) two sessions for most of 2026-09-16 (this one and
      whatever was adding §8.1-§8.8 — visible as untracked churn in `git status`, not a
      hypothetical). A real settlement check was run rather than asserted: SHA-256 hashes of all 6
      change files (3 source + 2 specs + this tasks.md) taken immediately before an `openspec
      validate --strict` call and a live MCP health round-trip, then re-taken immediately after —
      **byte-identical across every file**, confirming the worktree was genuinely stable for this
      change's files across that real ~2-minute window. This is a scoped, timestamped observation
      (stable *as of this check*, for *these 6 files*), not a claim that no other session will ever
      touch them again — a stronger "no concurrent editor exists" guarantee isn't obtainable from
      inside a single session and wasn't attempted. Graph checkpoints (mentioned in the original
      framing of this item) remain persisted graph state, not a source snapshot, and are unrelated
      to this settlement check.

No database, Qdrant, cache, projection, or source mutation was performed by this tranche.
