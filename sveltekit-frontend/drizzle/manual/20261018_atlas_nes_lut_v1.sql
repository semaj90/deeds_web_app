-- NES LUT definition table (2026-10-18). ADDITIVE and idempotent. DERIVED routing metadata only.
-- Owner of the palette values: scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs
-- (NES_LUT_DOMAIN_PALETTE). Rows below are copied from it, with the exported-object checksum and the
-- source-file sha256 recorded so drift is detectable. lut_byte (dispatch index) and nes_hex (palette
-- colour byte) are DIFFERENT fields: e.g. ui has lut_byte 0x02 and nes_hex 0x2A (Svelte 5 runes label).
-- Neither is an identity, a primary key for packets/chunks, or a retrieval vote. canonical = false.
-- taxonomy_domain_id is filled only by NORMALIZED_EXACT equality with domain_taxonomy_v1.domain_id;
-- palette domains without an exact taxonomy counterpart stay UNRESOLVED (no inferred aliases).

CREATE TABLE IF NOT EXISTS atlas_nes_lut_v1 (
  lut_revision        text     NOT NULL,
  domain_key          text     NOT NULL,
  lut_byte            smallint NOT NULL CHECK (lut_byte BETWEEN 0 AND 255),
  nes_hex             text     NOT NULL CHECK (nes_hex ~ '^0x[0-9A-F]{2}$'),
  nes_byte            smallint NOT NULL CHECK (nes_byte BETWEEN 0 AND 255),
  label               text     NOT NULL,
  prior_weight        real     NOT NULL CHECK (prior_weight BETWEEN 0 AND 1),
  taxonomy_domain_id  text,
  match_method        text     NOT NULL CHECK (match_method IN ('NORMALIZED_EXACT', 'UNRESOLVED')),
  source_ref          text     NOT NULL,
  source_sha256       text     NOT NULL,
  lut_checksum        text     NOT NULL,
  canonical           boolean  NOT NULL DEFAULT false CHECK (canonical = false),
  built_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lut_revision, domain_key),
  UNIQUE (lut_revision, lut_byte),
  CHECK ((match_method = 'UNRESOLVED') = (taxonomy_domain_id IS NULL))
);

WITH palette(domain_key, lut_byte, nes_hex, label, prior_weight) AS (
  VALUES
    ('auth',      1, '0x16', 'DOM_AUTH_GUARD',            0.9),
    ('ui',        2, '0x2A', 'DOM_UI_SVELTE5_RUNES',      0.85),
    ('retrieval', 3, '0x21', 'DOM_RETRIEVAL_ANN_RRF',     0.95),
    ('network',   4, '0x2C', 'DOM_NETWORK_HTTP_TRPC',     0.8),
    ('database',  5, '0x12', 'DOM_PG18_DRIZZLE',          0.95),
    ('cache',     6, '0x27', 'DOM_VALKEY_BITFROST_LRU',   0.88),
    ('agent',     7, '0x24', 'DOM_AGENT_OAK_RLM_DSPY',    0.92),
    ('graph',     8, '0x1A', 'DOM_GRAPH_CUGRAPH_PAGERANK', 0.9),
    ('ml',        9, '0x14', 'DOM_ML_ATEN_TENSORRT_GEMM', 0.94),
    ('general',   0, '0x0F', 'DOM_GENERAL_FALLBACK',      0.4)
),
tax AS (
  SELECT domain_id, lower(regexp_replace(domain_id, '[^a-zA-Z0-9]', '', 'g')) AS norm
    FROM domain_taxonomy_v1
   WHERE is_active
)
INSERT INTO atlas_nes_lut_v1
       (lut_revision, domain_key, lut_byte, nes_hex, nes_byte, label, prior_weight,
        taxonomy_domain_id, match_method, source_ref, source_sha256, lut_checksum)
SELECT 'atlas.nes-lut.v1',
       p.domain_key, p.lut_byte, p.nes_hex,
       ('x' || substr(p.nes_hex, 3))::bit(8)::int,
       p.label, p.prior_weight,
       t.domain_id,
       CASE WHEN t.domain_id IS NULL THEN 'UNRESOLVED' ELSE 'NORMALIZED_EXACT' END,
       'scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs',
       '09dc06d444bfd9d68d4a995e00da21d947de2ea407fa16144836a5c0d8468395',
       '83c79d86308098493095ab81d12186c44db70872bb1a9e79f9e165455178d0fb'
  FROM palette p
  LEFT JOIN tax t
    ON lower(regexp_replace(p.domain_key, '[^a-zA-Z0-9]', '', 'g')) = t.norm
ON CONFLICT (lut_revision, domain_key) DO NOTHING;
