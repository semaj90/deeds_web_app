## Context

The shared retrieval/web-search adapter already serves the agent tool, with
SearXNG and fallback behavior. Its current response has no reproducible snapshot
envelope. Versioned documentation acquisition/admission already has a separate owner.

## Decisions

1. SearchObservationV1 describes one provider observation; SearchSnapshotV1 freezes
   bounded ordered observations/results for replay. Both are derived discovery data.
2. Preserve normalizedQuery, queryChecksum, normalizerRevision, requested and effective
   engines/categories/language/timeRange, provider/fallback outcome, observedAt,
   ordered results, resultSetChecksum and snapshotChecksum. Unsupported options
   must be rejected or explicitly reported, never recorded as applied silently.
3. Use versioned canonical serialization. queryChecksum binds query/options and
   normalizer revision; resultSetChecksum binds ordered results; snapshotChecksum
   binds the complete observation including observedAt. Replaying a frozen observation
   is deterministic; a later live search is a new observation, not expected identical.
4. TTL/observedAt express recency only. None is sourceRevision or acquired content
   identity. Snippets, curated results, and engine rankings cannot become source facts.
5. Selected URL -> existing acquisition owner -> fetched bytes/hash -> existing
   canonical acquisition envelope -> byte-qualified chunks -> PostgreSQL admission.
   The versioned-doc owner retains DOC-04/05/06A/27. Adapt receipt references rather
   than defining a second page/chunk identity. Other media stays blocked until its
   existing owner is resolved; do not build a universal crawler in this change.

## Safety and validation

Bounds cover query size, results, response bytes, redirects and timeouts. Reuse
existing allowlist/URL safety checks at acquisition, including redirected destinations;
discovery URLs are untrusted data. Do not send secrets in queries or follow instructions
in fetched content. Use env.server service configuration; port 8888 is not SearXNG.

Fixture tests cover checksum replay, changed options/results, Unicode, empty vs failed
search, fallback provenance, unsupported filters, URL rejection and missing source spans.
The first live check is bounded discovery only; no datastore writes or admission.
Acquisition/admission requires the owning version/byte gates and explicit write scope.
Rollback for these planning artifacts is local diff reversal only; no datastore changed.
