-- Parent Atlas NES LUT v2 candidate (derived metadata only).
-- Generated from exact candidate bytes; DO NOT edit by hand.
-- INSERT-ONLY new lut_revision in existing atlas_nes_lut_v1.
-- v1 remains immutable. Operator-controlled *_scratch transaction only.
-- SQL never extends the canonical PostgreSQL domain ontology.
-- A direct psql caller must explicitly SET LOCAL atlas.nes_lut_v2_write_allowed='1'
-- inside a transaction, and must target an isolated *_scratch PostgreSQL 18 database.
DO $nes_guard$
BEGIN
  IF current_database() !~ '^[a-z0-9_]+_scratch$'
     OR current_setting('server_version_num')::int < 180000
     OR current_setting('atlas.nes_lut_v2_write_allowed', true) IS DISTINCT FROM '1'
  THEN RAISE EXCEPTION 'NES_LUT_V2_SCRATCH_GATE_REJECTED'; END IF;
END $nes_guard$;

WITH candidate(domain_key, lut_byte, nes_hex, label, prior_weight) AS (
  VALUES
    ('auth', 1, '0x16', 'DOM_AUTH_GUARD', 0.9),
    ('ui', 2, '0x2A', 'DOM_UI_SVELTE5_RUNES', 0.85),
    ('retrieval', 3, '0x21', 'DOM_RETRIEVAL_ANN_RRF', 0.95),
    ('network', 4, '0x2C', 'DOM_NETWORK_HTTP_TRPC', 0.8),
    ('database', 5, '0x12', 'DOM_PG18_DRIZZLE', 0.95),
    ('cache', 6, '0x27', 'DOM_VALKEY_BITFROST_LRU', 0.88),
    ('agent', 7, '0x24', 'DOM_AGENT_OAK_RLM_DSPY', 0.92),
    ('graph', 8, '0x1A', 'DOM_GRAPH_CUGRAPH_PAGERANK', 0.9),
    ('ml', 9, '0x14', 'DOM_ML_ATEN_TENSORRT_GEMM', 0.94),
    ('general', 10, '0x0F', 'DOM_GENERAL_FALLBACK', 0.4),
    ('compiler', 11, '0x17', 'DOM_COMPILER_AST_TOOLING', 0.5),
    ('devops', 12, '0x28', 'DOM_DEVOPS_INFRA_RUNTIME', 0.5),
    ('error-handling', 13, '0x26', 'DOM_ERROR_RECOVERY', 0.5),
    ('test', 14, '0x2B', 'DOM_TEST_VERIFICATION', 0.5)
), taxonomy AS (
  SELECT domain_id FROM public.domain_taxonomy_v1 WHERE is_active = true
)
INSERT INTO public.atlas_nes_lut_v1
  (lut_revision, domain_key, lut_byte, nes_hex, nes_byte, label, prior_weight, taxonomy_domain_id, match_method, source_ref, source_sha256, lut_checksum, canonical)
SELECT 'atlas.nes-lut.v2-candidate', c.domain_key, c.lut_byte, c.nes_hex,
       ('x' || substring(c.nes_hex FROM 3))::bit(8)::int,
       c.label, c.prior_weight, t.domain_id,
       CASE WHEN t.domain_id IS NULL THEN 'UNRESOLVED' ELSE 'NORMALIZED_EXACT' END,
       'scripts/atlas/data/nes-domain-palette-v2.candidate.json', 'cacccdddd15b95bf2ab02250b6c2e3bd8402d029a2578e66002cde812bbbb50d', '9aa054b012ff29a5a9a050533b25db86b8dfafca0a469569c043b466b42a1334', false
FROM candidate c LEFT JOIN taxonomy t ON t.domain_id = c.domain_key
ON CONFLICT (lut_revision, domain_key) DO NOTHING;
