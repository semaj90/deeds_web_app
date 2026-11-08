-- Candidate metadata registry for renderer-neutral PBR swatches. This is NOT the NES taxonomy LUT.
-- Candidate only: do not apply until schema ownership and PostgreSQL 18 scratch rehearsal are approved.
-- Store RGB/alpha/metallic/roughness as bounded scalars; keep shader code, textures and compiled
-- artifacts outside PostgreSQL in versioned source/object storage with independent hashes.
CREATE TABLE IF NOT EXISTS atlas_render_material_presets_v1 (
  preset_id text NOT NULL,
  preset_revision smallint NOT NULL CHECK (preset_revision > 0),
  display_name text NOT NULL,
  color_encoding text NOT NULL DEFAULT 'SRGB_8BIT' CHECK (color_encoding = 'SRGB_8BIT'),
  base_color_r smallint NOT NULL CHECK (base_color_r BETWEEN 0 AND 255),
  base_color_g smallint NOT NULL CHECK (base_color_g BETWEEN 0 AND 255),
  base_color_b smallint NOT NULL CHECK (base_color_b BETWEEN 0 AND 255),
  alpha real NOT NULL DEFAULT 1 CHECK (alpha BETWEEN 0 AND 1),
  metallic real NOT NULL DEFAULT 0 CHECK (metallic BETWEEN 0 AND 1),
  roughness real NOT NULL DEFAULT 1 CHECK (roughness BETWEEN 0 AND 1),
  material_model text NOT NULL DEFAULT 'METALLIC_ROUGHNESS' CHECK (material_model = 'METALLIC_ROUGHNESS'),
  classification text NOT NULL DEFAULT 'SYNTHETIC_DEMONSTRATIVE_PRESET',
  source_ref text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (preset_id, preset_revision)
);
CREATE INDEX IF NOT EXISTS atlas_render_material_presets_v1_class_idx
  ON atlas_render_material_presets_v1 (classification);
COMMENT ON TABLE atlas_render_material_presets_v1 IS
  'Non-canonical renderer material metadata; not evidence, a shader binary cache, or the NES routing LUT.';
