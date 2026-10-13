## Context

This change owns the disposition of the specific `atlas_packets.content_embedding_384` field and its readers/writers. A separate frontend OpenSpec change, `parent-atlas-384-representation-retirement`, owns the broader cross-repository census of all 384-width mentions and representation families; its findings feed this change rather than creating another database retirement owner.

The current proposal contained database counts dated 2026-10-13, while the workspace date is 2026-10-12. These counts are not current evidence and must be revalidated before decisions about archive size, writes, or schema removal.

## Goals / Non-Goals

**Goals:** establish current field state; trace its actual producer and callers; correct the presence-flag behavior only after decision and before/after validation; preserve populated values before any separately approved schema retirement.

**Non-Goals:** infer the producing model from the dimension; convert 384 vectors into 768/MRL/latent vectors; alter Qdrant or retrieval routing; drop or overwrite data without explicit approval.

## Decisions

- Keep the root change as the sole owner for `atlas_packets.content_embedding_384` archive and eventual schema disposition. The repo-wide census may classify occurrences and point here but must not duplicate these mutation tasks.
- Revalidate counts through read-only SQL in a repeatable-read/read-only transaction; save query, timestamp, schema identity, row counts, and receipt. Use exact table and column names verified from current schema first.
- Trace writer provenance from code history and caller graph. A 384 width is insufficient to attribute MiniLM, FastEmbed, EmbeddingGemma, or any particular recipe.
- Preserve the current column while reader changes and archive recovery remain incomplete. Keep every schema drop as a separately authorized final step.
- Any reader migration must compare behavior on the same bounded rows and capture a deterministic before/after output; if output changes, stop for owner review.

## Risks / Trade-offs

- [Future-dated or stale row counts] → mark `NOT_PROVEN` and remeasure before planning an archive.
- [Unidentified producer] → do not state model identity or claim vectors are reproducible; retain values.
- [Presence-flag change alters classifier inputs] → run a bounded no-write comparison before changing production behavior.
- [Archival mistaken for deletion authorization] → checksum/readback and explicit approval remain separate gates.

## Migration Plan

1. Revalidate current schema and row counts read-only.
2. Complete writer and consumer provenance; verify the no-write guard and its CI coverage.
3. Obtain the operator decisions recorded in `tasks.md`.
4. If approved, freeze new writes and validate any consumer replacement on a bounded cohort.
5. Export and independently verify a checksummed archive before considering a schema drop.
6. Only after all prior gates, propose a separate, explicitly approved sidecar migration and rollback plan.

No steps in this design authorize live mutation.

## Open Questions

- Which producer/revision generated the populated values?
- Are there runtime callers beyond the statically identified readers?
- What approved cold-storage destination and restore procedure should own the archive?
