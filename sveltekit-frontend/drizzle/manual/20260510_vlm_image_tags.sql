-- 20260510_vlm_image_tags.sql
-- VLM-generated image tag registry.
-- Each row is one unique tag name with optional description text loaded from
-- the database when a user clicks a tag chip in the UI.

CREATE TABLE IF NOT EXISTS vlm_image_tags (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT        NOT NULL,
    description  TEXT,                         -- optional human/LLM-written blurb
    examples     TEXT[],                       -- example filenames or evidence IDs
    source       TEXT        NOT NULL DEFAULT 'vlm',   -- 'vlm' | 'yolo' | 'manual'
    hit_count    INTEGER     NOT NULL DEFAULT 0,       -- incremented on each search hit
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT vlm_image_tags_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS vlm_image_tags_name_idx    ON vlm_image_tags (name);
CREATE INDEX IF NOT EXISTS vlm_image_tags_source_idx  ON vlm_image_tags (source);
CREATE INDEX IF NOT EXISTS vlm_image_tags_hits_idx    ON vlm_image_tags (hit_count DESC);

-- evidence ↔ tag join table
CREATE TABLE IF NOT EXISTS evidence_vlm_tags (
    evidence_id  UUID        NOT NULL,
    tag_id       UUID        NOT NULL REFERENCES vlm_image_tags(id) ON DELETE CASCADE,
    score        REAL        NOT NULL DEFAULT 1.0,  -- VLM confidence or overlap score
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (evidence_id, tag_id)
);

CREATE INDEX IF NOT EXISTS evidence_vlm_tags_tag_idx ON evidence_vlm_tags (tag_id);
