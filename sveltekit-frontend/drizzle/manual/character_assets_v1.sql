-- Candidate only: character assets and modular socket registry (MEM-05).
-- Foreign-keyed to cases.id and scene_assets.asset_id.
CREATE TABLE IF NOT EXISTS character_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES scene_assets(asset_id) ON DELETE RESTRICT,
  handle text NOT NULL CONSTRAINT character_assets_handle_ck CHECK (handle ~ '^CHAR-[A-Z0-9-]{1,48}$'),
  label text NOT NULL,
  archetype text NOT NULL CONSTRAINT character_assets_archetype_ck CHECK (archetype IN ('neutral_humanoid', 'lowpoly_detective', 'custom_glb')),
  rig_signature text NOT NULL,
  created_by integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT character_assets_case_handle_uq UNIQUE (case_id, handle)
);
CREATE INDEX IF NOT EXISTS character_assets_case_idx ON character_assets(case_id);

CREATE TABLE IF NOT EXISTS character_asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_asset_id uuid NOT NULL REFERENCES character_assets(id) ON DELETE CASCADE,
  version integer NOT NULL,
  lod_tier text NOT NULL CONSTRAINT character_asset_versions_lod_ck CHECK (lod_tier IN ('retro', 'balanced', 'detailed')),
  sha256 text NOT NULL CONSTRAINT character_asset_versions_sha_ck CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length integer NOT NULL CONSTRAINT character_asset_versions_byte_length_ck CHECK (byte_length > 0 AND byte_length <= 67108864),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT character_asset_versions_character_ver_lod_uq UNIQUE (character_asset_id, version, lod_tier)
);
CREATE INDEX IF NOT EXISTS character_asset_versions_character_idx ON character_asset_versions(character_asset_id);

CREATE TABLE IF NOT EXISTS character_part_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_asset_id uuid NOT NULL REFERENCES character_assets(id) ON DELETE CASCADE,
  slot_name text NOT NULL CONSTRAINT character_part_slots_slot_name_ck CHECK (slot_name ~ '^[a-z][a-z0-9_.]+$'),
  mounted_asset_id uuid REFERENCES scene_assets(asset_id) ON DELETE RESTRICT,
  offset_transform jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT character_part_slots_char_slot_uq UNIQUE (character_asset_id, slot_name)
);
CREATE INDEX IF NOT EXISTS character_part_slots_character_idx ON character_part_slots(character_asset_id);
