-- Phase 2a: atlas_svg_glyphs Table
-- Purpose: Store SVG rendering metadata for file-level glyphs
-- Dependencies: atlas_codebase_packets.file_path (100% ✅)
-- Measurement: Compare NDCG@10 before/after Phase 2a

CREATE TABLE IF NOT EXISTS atlas_svg_glyphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key TEXT NOT NULL,
  file_path TEXT NOT NULL,
  glyph_name TEXT NOT NULL,
  svg_data TEXT,
  bounding_box JSONB,  -- {x: number, y: number, width: number, height: number}
  color_dominant TEXT,  -- hex color
  color_palette TEXT[],  -- array of hex colors
  typography_hints JSONB,  -- {font_family, font_size, line_height}
  rendering_complexity NUMERIC,  -- 0.0-1.0 (simple → complex)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Foreign key (soft reference, no constraint to allow independent migration)
  -- REFERENCES atlas_codebase_packets(packet_key) ON DELETE CASCADE,

  -- Unique constraint: one glyph per packet
  UNIQUE(packet_key, glyph_name)
);

-- Indexes for Phase 2a queries
CREATE INDEX IF NOT EXISTS idx_svg_glyphs_packet_key ON atlas_svg_glyphs(packet_key);
CREATE INDEX IF NOT EXISTS idx_svg_glyphs_file_path ON atlas_svg_glyphs(file_path);
CREATE INDEX IF NOT EXISTS idx_svg_glyphs_complexity_desc ON atlas_svg_glyphs(rendering_complexity DESC);
CREATE INDEX IF NOT EXISTS idx_svg_glyphs_palette_gin ON atlas_svg_glyphs USING GIN(color_palette);
CREATE INDEX IF NOT EXISTS idx_svg_glyphs_created_at ON atlas_svg_glyphs(created_at DESC);

-- Verification queries
-- SELECT COUNT(*) FROM atlas_svg_glyphs;
-- SELECT COUNT(DISTINCT packet_key) FROM atlas_svg_glyphs;
-- SELECT rendering_complexity, COUNT(*) FROM atlas_svg_glyphs GROUP BY rendering_complexity ORDER BY rendering_complexity;
