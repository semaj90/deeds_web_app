-- Record the extractor/chunker recipe that produced each legal chunk.
-- Candidate sidecar only: do not apply to a live database without migration review.
-- Existing chunks remain NULL; their producer is not inferred from their shape.

ALTER TABLE public.legal_chunks
  ADD COLUMN IF NOT EXISTS chunk_hash text,
  ADD COLUMN IF NOT EXISTS parser_revision text,
  ADD COLUMN IF NOT EXISTS char_offset_unit text;

COMMENT ON COLUMN public.legal_chunks.parser_revision IS
  'Extractor and chunker revision used to produce chunk_text and character offsets.';

COMMENT ON COLUMN public.legal_chunks.chunk_hash IS
  'SHA-256 of exact UTF-8 chunk_text bytes. Legacy rows remain NULL until independently reconciled.';

COMMENT ON COLUMN public.legal_chunks.char_offset_unit IS
  'Unit for char_start/char_end. New JavaScript-produced chunks use utf16_code_units; legacy rows remain NULL until proven.';
