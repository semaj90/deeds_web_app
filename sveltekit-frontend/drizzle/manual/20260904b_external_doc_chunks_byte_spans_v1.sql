-- parent-atlas-versioned-doc-intelligence (DOC-05 byte-safe span alignment): adds
-- start_byte/end_byte as the authoritative evidence span on atlas_external_doc_chunks
-- (20260904_external_doc_intelligence_v1.sql), matching this repo's other canonical
-- chunk contract -- CanonicalChunkV1 in
-- parent-atlas-canonical-directory-ingestion-fabric/design.md, which uses
-- startByte/endByte over exact UTF-8 bytes, not start_char/end_char over Python
-- string indices. start_char/end_char (already on the table) remain as secondary,
-- diagnostic-only convenience fields -- never the identity/evidence-span authority.
--
-- Additive only (ALTER ... ADD COLUMN IF NOT EXISTS), per the Drizzle Safety Rule:
-- never rewrite an already-applied migration file, add a new one instead.

ALTER TABLE atlas_external_doc_chunks
  ADD COLUMN IF NOT EXISTS start_byte INT,
  ADD COLUMN IF NOT EXISTS end_byte INT;

-- NOT NULL is deferred until DOC-06A's admission writer is live and every row
-- passing through it populates both columns -- adding NOT NULL now would break
-- nothing today (the table is empty, per DOC-06's own live-proof cleanup) but
-- would be a premature constraint ahead of the writer that's supposed to enforce it.
