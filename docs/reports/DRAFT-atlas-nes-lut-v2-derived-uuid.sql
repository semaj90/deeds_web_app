-- DRAFT, NOT APPLIED. Candidate: atlas_nes_lut_v1 additive change (operator approved the direction 2026-11-08; no exact go for legal_ai_db yet).
-- Pre-image note: record count(*) and sha256 of the existing 10 rows (lut_revision='nes-domain-palette-v1') before running.
-- Procedure: rehearse inside BEGIN ... ROLLBACK on a *_scratch database first; apply to legal_ai_db only after explicit go.
-- PG18 has no uuidv5(); derived UUIDs are computed in scripts and stored as literals (namespace 7e18b58b-ea73-54ac-b947-66f71112efda).
-- Existing v1 rows are NOT rewritten except the nullable derived_uuid backfill below (it does not alter lut_byte/nes_hex).
BEGIN;
ALTER TABLE atlas_nes_lut_v1 ADD COLUMN IF NOT EXISTS derived_uuid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS atlas_nes_lut_v1_derived_uuid_uq ON atlas_nes_lut_v1 (derived_uuid) WHERE derived_uuid IS NOT NULL;
-- v2 rows (proposed revision). Fill source_ref/source_sha256/lut_checksum from the v2 json before apply.
-- INSERT INTO atlas_nes_lut_v1 (lut_revision, domain_key, lut_byte, nes_hex, nes_byte, label, prior_weight, taxonomy_domain_id, match_method, source_ref, source_sha256, lut_checksum, derived_uuid) VALUES ...
--   domain rows (key, lutByte, nesHex, label, weight, derived_uuid):
--    ('auth', 1, '0x16', 'DOM_AUTH_GUARD', 0.9, '693ef070-e1ed-5dd4-94d0-47fac5cd0111'::uuid),
--    ('ui', 2, '0x2A', 'DOM_UI_SVELTE5_RUNES', 0.85, '844bf1d7-ab71-5034-bdfc-4f7744f37cd4'::uuid),
--    ('retrieval', 3, '0x21', 'DOM_RETRIEVAL_ANN_RRF', 0.95, 'cb952b96-b235-51df-857a-511c765fe820'::uuid),
--    ('network', 4, '0x2C', 'DOM_NETWORK_HTTP_TRPC', 0.8, '215b571c-9402-5bf4-b622-523e53a47d1c'::uuid),
--    ('database', 5, '0x12', 'DOM_PG18_DRIZZLE', 0.95, '782c6ac3-2548-59d3-918c-1c75ce953fe3'::uuid),
--    ('cache', 6, '0x27', 'DOM_VALKEY_BITFROST_LRU', 0.88, 'c1df8034-3008-5fd8-b83a-d6384dede647'::uuid),
--    ('agent', 7, '0x24', 'DOM_AGENT_OAK_RLM_DSPY', 0.92, 'fcdf7e5c-1dcf-5d7d-b5aa-833b0fcfafc6'::uuid),
--    ('graph', 8, '0x1A', 'DOM_GRAPH_CUGRAPH_PAGERANK', 0.9, '2c105d34-a306-5bd7-8542-593bd477455d'::uuid),
--    ('ml', 9, '0x14', 'DOM_ML_ATEN_TENSORRT_GEMM', 0.94, 'c69e0471-69d5-54a5-bb93-3ca8ffe903e7'::uuid),
--    ('general', 10, '0x0F', 'DOM_GENERAL_FALLBACK', 0.4, 'c82edf18-dac2-54a2-8832-b550b35286ee'::uuid),
--    ('compiler', 11, '0x19', 'DOM_COMPILER_TOOLING', 0.7, '6aaa25b0-898e-519a-b2cf-810d2c5fde8b'::uuid),
--    ('devops', 12, '0x28', 'DOM_DEVOPS_PROCESS', 0.6, 'cc6da69e-b7d0-5b5c-bbb7-4948c7d57b06'::uuid),
--    ('error-handling', 13, '0x06', 'DOM_ERROR_RECOVERY', 0.6, '39f98c66-4aa3-507e-ac0a-2881e7c8d390'::uuid),
--    ('test', 14, '0x2B', 'DOM_TEST_HARNESS', 0.5, '89fb3b7c-6e42-5eb8-84c5-49f307123fd5'::uuid)
-- Post-check: SELECT count(*), count(DISTINCT derived_uuid) FROM atlas_nes_lut_v1 WHERE lut_revision='nes-domain-palette-v2-PROPOSED'; expect 14/14; v1 rows unchanged.
ROLLBACK; -- replace with COMMIT only on an approved apply
