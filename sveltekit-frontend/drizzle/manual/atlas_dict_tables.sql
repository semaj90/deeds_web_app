-- Atlas dictionary tables for integer-ID compression of NES/CHROM packets.
-- Enables short-key packet encoding: sourceRef → int, feature → int, lane → smallint.
-- Applied manually: psql $DATABASE_URL -f drizzle/manual/atlas_dict_tables.sql

CREATE TABLE IF NOT EXISTS atlas_source_ref_dict (
    id         SERIAL  PRIMARY KEY,
    source_ref TEXT    UNIQUE NOT NULL,
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_feature_dict (
    id         SERIAL  PRIMARY KEY,
    feature_id TEXT    UNIQUE NOT NULL,
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_lane_dict (
    id         SERIAL  PRIMARY KEY,
    lane_id    TEXT    UNIQUE NOT NULL,
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed canonical lane IDs so they get stable small integers
INSERT INTO atlas_lane_dict (lane_id) VALUES
    ('sourceRef_spine'),
    ('durable_truth'),
    ('graph_topology'),
    ('compute_ranking'),
    ('orchestration_ace'),
    ('orchestration_future')
ON CONFLICT (lane_id) DO NOTHING;

-- Add compact routing columns to nes_chrom_packets (hot path, no JSONB scan needed)
ALTER TABLE nes_chrom_packets
    ADD COLUMN IF NOT EXISTS source_ref_id INTEGER;

ALTER TABLE nes_chrom_packets
    ADD COLUMN IF NOT EXISTS feature_code INTEGER;

ALTER TABLE nes_chrom_packets
    ADD COLUMN IF NOT EXISTS som_code SMALLINT;

ALTER TABLE nes_chrom_packets
    ADD COLUMN IF NOT EXISTS confidence_score SMALLINT;

ALTER TABLE nes_chrom_packets
    ADD COLUMN IF NOT EXISTS packet_zstd BYTEA;

CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_ref_id_idx
    ON nes_chrom_packets (source_ref_id);

CREATE INDEX IF NOT EXISTS nes_chrom_packets_feature_code_idx
    ON nes_chrom_packets (feature_code);

CREATE INDEX IF NOT EXISTS nes_chrom_packets_som_code_idx
    ON nes_chrom_packets (som_code);

COMMENT ON TABLE atlas_source_ref_dict IS
    'Integer dictionary for source_ref strings. id → compact packet field source_ref_id.';

COMMENT ON TABLE atlas_feature_dict IS
    'Integer dictionary for feature_id strings. id → compact packet field feature_code.';

COMMENT ON TABLE atlas_lane_dict IS
    'Smallint dictionary for lane_id strings. id → compact packet lane byte.';
