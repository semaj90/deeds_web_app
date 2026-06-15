-- P1 Phase 2C: SVG Glyphs Table
-- Visual + text representation for multimodal retrieval and rendering
-- Created: June 15, 2026

CREATE TABLE IF NOT EXISTS atlas_svg_glyphs (
  glyph_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key      VARCHAR(255) NOT NULL,
  source_ref      VARCHAR(512),
  file_path       VARCHAR(1024),

  svg_xml         TEXT,
  utf8_text       TEXT,
  bbox            JSONB,

  embedding_768   vector(768),

  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (packet_key) REFERENCES atlas_codebase_packets(packet_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_glyph_packet ON atlas_svg_glyphs(packet_key);
CREATE INDEX IF NOT EXISTS idx_glyph_source_ref ON atlas_svg_glyphs(source_ref);
CREATE INDEX IF NOT EXISTS idx_glyph_file_path ON atlas_svg_glyphs(file_path);
CREATE INDEX IF NOT EXISTS idx_glyph_embedding
  ON atlas_svg_glyphs USING HNSW(embedding_768 vector_cosine_ops);
