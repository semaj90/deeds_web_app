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
- [x] DISCOVERY-03 (2026-09-22) — audited existing acquisition machinery before building anything:
  a full, real, already-wired acquisition plane exists (`src/lib/server/atlas/acquisition/`) --
  `acquisition-writer.ts::requestAcquisition()` (Postgres + outbox, transactional),
  `acquisition-worker.ts` (stream consumer, calls `conditionalFetch`, stores raw bytes to
  SeaweedFS), `conditional-fetch.ts` (SSRF-safe, per-redirect-hop validated via
  `security/url-validator.ts::validateExternalUrl`, `MAX_REDIRECTS=5`,
  `REQUEST_TIMEOUT_MS=15000`, `MAX_RESPONSE_BYTES=10MB` -- bounded fetch limits already enforced,
  reused not reinvented). Zero existing tests for `url-validator.ts` or the acquisition module were
  found (a real, disclosed gap, not fixed in this pass -- out of DISCOVERY-03's bounded scope).
  New module `src/lib/server/retrieval/search-acquisition-routing-v1.ts`: pure, bounded
  `planAcquisitionRoutingV1(snapshot)` classifies a `SearchSnapshotV1`'s ordered results as
  ELIGIBLE/REJECTED, reusing `validateExternalUrl()` directly (no second SSRF check invented).
  Deliberately does **not** call `requestAcquisition()` or touch Postgres/Redis — matches
  proposal.md's "no datastore writes in this planning pass" scope boundary; submission to the real
  acquisition writer is a separate, later, explicitly-authorized step.
  **"Missing/ambiguous acquisition ownership" made concrete, not left vague**: DOC-06A is the one
  real, live owner today, and it only covers generic HTML/PDF/text content — proposal.md itself
  says other media "stays blocked until its existing owner is resolved." Since real content-type is
  only known after fetching (which this module never does), a conservative extension-based
  heuristic (`UNOWNED_CONTENT_TYPE`: images/video/audio/archives/executables) stands in for
  ownership ambiguity; extension-less and document-shaped URLs (`.html`, `.pdf`, `.md`, no
  extension) route through as ELIGIBLE. Other rejection reasons: `INVALID_URL`,
  `UNSUPPORTED_SCHEME` (non-http(s), e.g. `mailto:`/`javascript:`), `SSRF_BLOCKED` (delegated
  entirely to the existing `validateExternalUrl`), `DUPLICATE_NORMALIZED_URL` (minimal, documented
  non-RFC-3986 normalizer: lowercase scheme/host, strip fragment, strip default port — dedup only,
  never changes the actual fetch target). Candidate evaluation itself is bounded
  (`ACQUISITION_ROUTING_MAX_CANDIDATES = 10`) — results beyond that never even reach
  `validateExternalUrl`, reported via `truncated: true` rather than silently dropped.
  11/11 focused Vitest tests pass (accept-path, each rejection reason individually, duplicate
  dedup correctness, bounded truncation, order preservation, checksum pass-through). `tsgo
  --noEmit`: 0 new errors (same 16 pre-existing unrelated errors as DISCOVERY-01/02).
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
