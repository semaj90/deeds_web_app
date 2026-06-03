CREATE INDEX IF NOT EXISTS metadata_metadata_gin
  ON metadata_envelopes
  USING GIN(metadata);

CREATE INDEX IF NOT EXISTS metadata_source_type_idx
  ON metadata_envelopes(source_type);

CREATE INDEX IF NOT EXISTS metadata_content_hash_idx
  ON metadata_envelopes(content_hash);