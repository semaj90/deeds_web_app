# Tasks — Parent Atlas Deep Research Ingestion

## Planning reconciliation — 2026-09-05

- [x] DISCOVERY-00 promote the existing scope reservation into proposal/design/spec/tasks;
  identify shared retrieval/web-search and versioned-doc acquisition as reuse boundaries.
  This closes planning only, not discovery implementation or admission.

## Bounded implementation (scripts/atlas first)

- [x] DISCOVERY-01 (2026-09-22) — audited existing web-search/LDR response and acquisition
  contracts before writing anything: `src/lib/server/retrieval/web-search.ts`'s `webSearch()` is
  the one real network call site (SearXNG then DuckDuckGo fallback); `local-research-circuit-v1.ts`
  is a separate, non-overlapping downstream layer (operates over already-resolved
  CandidateOrdinals/AceCards, never raw provider responses) — confirmed no duplication before
  building. New module `src/lib/server/retrieval/search-observation-v1.ts`:
  `SearchObservationV1Schema`/`SearchSnapshotV1Schema` (Zod, `.strict()`), `buildSearchObservationV1()`
  (pure transform, no network I/O), `freezeSearchSnapshotV1()`, `observeAndFreezeWebSearchV1()`
  (thin wrapper around the existing `webSearch()` — no new crawler, no new store, no candidate
  identity minted). Reuses `canonicalSha256V1`/`sha256HexSchema` from the existing
  `atlas/prefill/canonical-hash-v1.ts` primitive already used across `atlas/retrieval/*` (per
  Duplication Prevention — did not invent a second checksum scheme).
  **Real, disclosed limitation found while building, not glossed over**: `webSearch()`'s current
  return shape does not report which engines were actually queried on the winning path (default
  SearXNG set vs. its `['wp']` fallback vs. DuckDuckGo, which has no engine concept). Recording
  `requested.engines` as if confirmed-applied would violate design.md's "unsupported settings must
  not appear as successfully applied" rule, so `effective.enginesObservable` is explicitly `false`
  rather than guessed — a real gap in the existing adapter's observability, not fixed here (would
  require extending `webSearch()`'s return shape, deliberately left untouched this pass).
  10/10 focused Vitest tests pass. `tsgo --noEmit`: 0 new errors (16 pre-existing, unrelated,
  confirmed by diff against the file list — missing-package/module errors this repo already knows
  about, e.g. `piper-wasm`, `pdf-lib`, `nodejs-whisper`).
- [x] DISCOVERY-02 (2026-09-22) — substantively covered by the same module + test suite above, not
  a separate build: `SearchSnapshotV1Schema` freezes exactly the required field set (normalized
  query + checksum, normalizer revision, requested/effective options, provider/fallback outcome,
  observedAt, ordered results, resultSetChecksum, snapshotChecksum). Fixture tests prove: identical
  inputs -> identical checksums (replay determinism); changed query -> different `queryChecksum`,
  unchanged `resultSetChecksum`; changed options (e.g. `maxResults`) -> different `queryChecksum`;
  changed result order -> different `resultSetChecksum` (order-sensitive, per design.md decision 3);
  changed-only `observedAt` -> different `snapshotChecksum` but unchanged `queryChecksum`/
  `resultSetChecksum`; unsupported `category`/`language`/`timeRange` requests are recorded in
  `unsupportedOptions` and never copied into `effective` (not fabricated as applied). **Not
  covered**: `category`/`language`/`timeRange` are unsupported at the adapter level entirely (the
  underlying `webSearch()` has no such parameters) — this proves the rejection-not-fabrication
  behavior correctly, but does not prove a "supported and effective" path for those fields, because
  none exists yet.
- [ ] DISCOVERY-03 route selected result URLs through existing acquisition owners;
  fixture-prove allowlist and redirect checks, bounded fetch limits and rejection of
  missing/ambiguous acquisition ownership. Snippets remain discovery observations.
- [ ] DISCOVERY-04 reuse fetched content hashes, canonical acquisition envelope and
  exact source spans from the document owner; prove receipt-linked handoff and
  version/checksum readback. Any admission writer remains owned by DOC-06A and
  requires separate bounded authorization; no direct Qdrant/Neo4j/cache projection.
- [ ] DISCOVERY-05 prove observedAt/TTL affect recency policy only, never source
  identity/revision; distinguish empty search, provider failure and curated fallback.
  Then run a bounded live discovery replay with explicit zero datastore writes.

## Dependency and proof boundary

DISCOVERY-01 -> 02 -> 03 -> 04; recency/fallback fixtures in 05 may run alongside 02.
Live handoff depends on the versioned-doc owner's admission/version/byte receipts,
not on timestamps or SearchSnapshot existence. Semantic/GPU/BitFrost warming remains
downstream. Validation: openspec validate parent-atlas-deep-research-ingestion --strict.
