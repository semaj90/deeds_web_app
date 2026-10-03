## Context

The matrix and ACE artifacts are currently diagnostic/tournament outputs. Summary generation has produced immutable, noncanonical proposals for exact chunk inputs. PostgreSQL `codebase_chunk_index.summary_text` and `summary_provenance` are the existing nullable canonical chunk-summary slots; legacy `summary`, `summary_hash`, embeddings, and projections have different owners and must remain untouched in this tranche.

The live schema mapping and sidecar migration ledger are being edited concurrently. The repository adapter must therefore be independent of schema migration bookkeeping and must not modify those shared files. The database canary remains a separate operator-authorized gate (SUM-04).

## Goals / Non-Goals

**Goals:** define one proposal admission kernel; re-read exact current chunk, source binding, and proven chunk lineage in one transaction; bind the proposal to the existing source-identity owner; write only the two empty canonical summary slots through a conditional update; preserve exact provenance and deterministic replay behavior.

**Non-Goals:** generating summaries, applying the 12-row canary, changing lifecycle or Graphify wiring, changing `summary_hash`, stamping embeddings/revisions, or writing Qdrant, graph, cache, or ACE state.

## Decisions

- Keep `admitCanonicalChunkSummaryV1` as the sole admission decision owner. A PostgreSQL adapter implements its injected transactional repository interface; it is not a second admission API or an auto-running writer.
- Require the adapter caller to inject the PostgreSQL repository UUID and the existing `computeSourceIdentityKeyV1` function plus its canonical namespace ID. Do not infer logical repository identity from a database UUID, filesystem path, or proposal alone.
- Use a serializable transaction and exact equality joins on chunk row, chunk ID, canonical chunk ID, source reference, source revision, workspace revision, repository binding, and `revision_status = 'PROVEN'`. Require exactly one binding and lineage row; zero or multiple matches fail closed.
- Recompute the current content digest and byte length from PostgreSQL bytes, then let the shared admission kernel verify proposal checksum, digest, identity, and contamination. The target update is conditional on both `summary_text` and `summary_provenance` being NULL.
- Persist the admitted summary and provenance envelope only. Do not touch legacy `summary`, `summary_hash`, model fields, embeddings, or projections. Tests use a fake PostgreSQL client; live readback is a distinct proof gate.

Alternatives rejected: creating a parallel summary table duplicates the existing canonical owner; writing through the historical batch summarizer couples summary text to hashes, vectors, and projection writes; trusting row-local revision mirrors is invalid because current rows may have NULL mirrors.

## Risks / Trade-offs

- [Concurrent schema/migration edits may disagree about whether the additive migration is applied] → preserve both shared files and treat their status as a separate live-schema/readback check; do not modify migration bookkeeping here.
- [A serializable transaction can abort under concurrent writes] → surface transaction errors; do not retry automatically or weaken isolation.
- [The repository UUID and logical namespace could be confused] → require separate explicit inputs and derive the source identity only through the injected canonical function.
- [Fake-backed tests do not prove live SQL/schema compatibility] → keep SUM-04 and its exact 12-row readback as an explicit later authorization gate.

## Migration Plan

No migration or live mutation is performed by this design tranche. First land and test the inert adapter and schema mapping; then perform a read-only live compatibility check. Only after explicit approval may SUM-04 run as one bounded transaction with full prevalidation, digest readback, and rollback on any discrepancy. No automatic retry or projection fanout is part of that canary.

## Open Questions

- Confirm current live schema and sidecar ledger agree for both nullable summary columns before any canary.
- The live proposal audit reports NULL row-local source/workspace revision mirrors; authoritative binding and chunk-lineage rows remain the required source of those revisions.
- SUM-04 still requires explicit operator approval; this design does not grant it.
