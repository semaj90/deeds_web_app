# Representation provenance write plan — draft only

Status: `DESIGN_ONLY / NOT_AUTHORIZED / NO_DDL_APPLIED / NO_ROWS_WRITTEN`
Generated from a read-only PostgreSQL 18 schema/count audit on 2026-09-26. This plan is not an apply instruction.

## Observed state

- `public.codebase_chunk_index.summary_embedding` exists as nullable `halfvec(768)`; it is the existing 768-dimensional storage owner. Do not add `summary_embedding_768`.
- `summary_embedding_384` exists as nullable `vector(384)` and remains legacy; this plan never writes or clears it.
- `summary_text` and `summary_provenance` exist and currently have zero populated rows.
- Live census: 274,465 chunk rows; 1,160 non-null 768 vectors; 10 non-null 384 vectors.
- `summary_embedding_meta` does not exist in live PostgreSQL. The unapplied manual draft `sveltekit-frontend/drizzle/manual/20260926_codebase_chunk_summary_embedding_768_v1.sql` proposes only this provenance column. Applying that DDL is a separate explicit authorization gate and must first be reconciled with Drizzle/sidecar migration ownership.
- Existing vectors have no verified generation-input/model/vector-byte lineage. Keep them unbound HINTs; do not stamp `representation_revision` or `embedding_digest` onto them.

## Future admitted-summary target contract

The only eligible write population is a frozen, explicitly approved set whose current `summary_text` has `summary_provenance.admission.status = ADMITTED`, exact canonical chunk/source/workspace binding, `summaryInputDigest = summaryDigest`, and no existing 768 vector. Legacy `summary`, July layers, packet summaries, 384 vectors, path/FTS matches, and `LEGACY_CARRIED` hints are not eligible.

Each embedding receipt must bind at least:

- canonical chunk/packet/source identity, current source and workspace revisions, and exact binding checksum;
- the admitted summary digest used as the embedding input digest;
- `representationId=semantic_768`, dimension 768, resolved model and executor revisions, and the actual normalization contract;
- a vector digest computed using a specified, deterministic serialization of the vector as stored in PostgreSQL.

Unknown model/executor/tokenizer revisions remain null and must not be replaced by `latest` or a guessed version. Before any write, the vector-byte digest serialization and halfvec readback equivalence must be established by a pure/fake-client test; current evidence does not yet close that contract.

## Required rehearsal sequence

1. Reconcile the unapplied `summary_embedding_meta` DDL with the canonical Drizzle schema and `sidecar-migrations.json`; no `drizzle-kit push` and no live DDL.
2. Freeze the exact approved target rows and a sorted target-manifest checksum. Record each row's identity, source/workspace revisions, binding checksum, summary/input digest, current 768/384 slot state, and pre-image checksum. Exclude any row that changes during preflight.
3. Produce a read-only dry receipt after re-reading the authoritative workspace binding and chunk lineage. Require exact one-row joins, `ADMITTED` summary provenance, exact digest parity, `summary_embedding IS NULL`, and model/representation contract acceptance. `summary_hash` is read-only and is never repurposed.
4. Exercise the transactional writer against fake repository/client tests: zero-row update, duplicate identity, stale source revision, changed summary digest, malformed/non-768/non-finite/non-normalized vector, halfvec round-trip mismatch, and readback digest mismatch must all roll back and emit no success receipt.
5. Only after separate operator approval of the DDL (if required) and separate approval of one exact bounded data cohort: begin one transaction; re-read authority; conditionally set the existing `summary_embedding` and provenance envelope; require exactly one updated row per target; read back vector and metadata; recompute digest; commit only on exact equality, otherwise rollback.
6. After commit, independently query exact targets and compare them with the frozen target manifest. Do not publish to Qdrant, Graphify, Valkey/BitFrost, SOM, or ACE in this transaction. Projection work remains a later, separately admitted stage.

## Rollback and stop conditions

- Before-image is the sealed target manifest plus the exact pre-write column values/checksums. Preserve it outside the database before an approved apply.
- The apply must retain a tested compensating rollback artifact for only those exact row IDs, and must stop on any changed identity, revision, digest, slot state, count, or readback.
- Never rollback by bulk-clearing all vectors or by rewriting historical packet/chunk hashes. Never modify `summary_embedding_384` or `summary_hash`.
- If model revision, exact stored-vector digest serialization, exact source binding, migration registration, or rollback replay is unresolved, status is `BLOCKED`; no write is attempted.

## Current decision

`summary_embedding_meta` is absent live, all 1,160 extant 768 vectors remain unbound, and no summary is currently admitted in `summary_text`. Therefore no row is presently eligible for an embedding write. SUM-04 summary admission, any DDL authorization, and a later SUM-06 embedding apply remain separate gates. This document authorizes none of them.
