-- Phase 2 Part 3: Create atlas_svg_glyphs table for glyph record enrichment
CREATE TABLE IF NOT EXISTS atlas_svg_glyphs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key varchar(255) UNIQUE NOT NULL,
  source_ref varchar(255),
  glyph_id varchar(255) NOT NULL,
  glyph_type varchar(50),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_svg_glyphs_packet_key ON atlas_svg_glyphs(packet_key);
CREATE INDEX IF NOT EXISTS idx_svg_glyphs_source_ref ON atlas_svg_glyphs(source_ref);
CREATE INDEX IF NOT EXISTS idx_svg_glyphs_glyph_id ON atlas_svg_glyphs(glyph_id);
CREATE INDEX IF NOT EXISTS idx_svg_glyphs_glyph_type ON atlas_svg_glyphs(glyph_type);
