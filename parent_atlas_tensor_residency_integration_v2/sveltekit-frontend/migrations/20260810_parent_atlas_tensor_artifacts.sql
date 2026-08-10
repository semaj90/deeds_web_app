BEGIN;

CREATE TABLE IF NOT EXISTS atlas_tensor_artifacts (
    artifact_id uuid PRIMARY KEY DEFAULT uuidv7(),
    artifact_type text NOT NULL,
    workspace_revision text NOT NULL,
    source_revision text,
    representation_id text,
    representation_revision text,
    schema_version text NOT NULL DEFAULT 'atlas.tensor-artifact.v1',
    dtype text NOT NULL,
    shape integer[] NOT NULL,
    arrow_path text NOT NULL,
    batch_count integer NOT NULL CHECK (batch_count >= 0),
    compression text NOT NULL DEFAULT 'none',
    content_hash text NOT NULL,
    merkle_root text,
    byte_length bigint NOT NULL CHECK (byte_length >= 0),
    producer text NOT NULL,
    producer_revision text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (artifact_type, workspace_revision, representation_revision, content_hash)
);

CREATE TABLE IF NOT EXISTS atlas_tensor_tiles (
    tile_id uuid PRIMARY KEY DEFAULT uuidv7(),
    artifact_id uuid NOT NULL REFERENCES atlas_tensor_artifacts(artifact_id) ON DELETE CASCADE,
    tile_key text NOT NULL,
    som_x smallint,
    som_y smallint,
    authority_bin smallint,
    entropy_bin smallint,
    record_batch_index integer NOT NULL CHECK (record_batch_index >= 0),
    row_count integer NOT NULL CHECK (row_count >= 0),
    dtype text NOT NULL,
    byte_length bigint NOT NULL CHECK (byte_length >= 0),
    content_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (artifact_id, tile_key)
);

CREATE TABLE IF NOT EXISTS atlas_tensor_tile_members (
    tile_id uuid NOT NULL REFERENCES atlas_tensor_tiles(tile_id) ON DELETE CASCADE,
    packet_key text NOT NULL,
    row_offset integer NOT NULL CHECK (row_offset >= 0),
    PRIMARY KEY (tile_id, packet_key),
    UNIQUE (tile_id, row_offset)
);

CREATE TABLE IF NOT EXISTS atlas_tensor_residency_events (
    event_id uuid PRIMARY KEY DEFAULT uuidv7(),
    tile_id uuid REFERENCES atlas_tensor_tiles(tile_id) ON DELETE SET NULL,
    tile_key text NOT NULL,
    from_state text,
    to_state text NOT NULL,
    bytes bigint NOT NULL DEFAULT 0,
    utility double precision,
    reason text NOT NULL,
    workspace_revision text NOT NULL,
    representation_revision text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_tensor_artifacts_representation_idx
    ON atlas_tensor_artifacts (representation_id, representation_revision, workspace_revision);

CREATE INDEX IF NOT EXISTS atlas_tensor_tiles_key_idx
    ON atlas_tensor_tiles (tile_key, artifact_id);

CREATE INDEX IF NOT EXISTS atlas_tensor_tile_members_packet_idx
    ON atlas_tensor_tile_members (packet_key, tile_id);

CREATE INDEX IF NOT EXISTS atlas_tensor_residency_created_brin
    ON atlas_tensor_residency_events USING brin (created_at);

COMMIT;
