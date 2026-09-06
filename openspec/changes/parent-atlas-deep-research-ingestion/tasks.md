# Tasks — Parent Atlas Deep Research Ingestion

## Planning reconciliation — 2026-09-05

- [x] DISCOVERY-00 promote the existing scope reservation into proposal/design/spec/tasks;
  identify shared retrieval/web-search and versioned-doc acquisition as reuse boundaries.
  This closes planning only, not discovery implementation or admission.

## Bounded implementation (scripts/atlas first)

- [ ] DISCOVERY-01 audit existing web-search/LDR response and acquisition contracts;
  implement schema-validated derived SearchObservationV1/SearchSnapshotV1 adapters,
  with bounds and no new crawler/store or candidate identity.
- [ ] DISCOVERY-02 freeze query normalization/checksum, normalizer revision,
  requested/effective engines/categories/language/timeRange, provider/fallback status,
  observedAt, ordered results, resultSetChecksum and snapshotChecksum. Prove replay
  on frozen fixtures and changed-query/options/result rejection; unavailable or
  unsupported metadata must not be fabricated.
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
