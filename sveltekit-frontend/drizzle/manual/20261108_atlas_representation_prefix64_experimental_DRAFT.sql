-- DRAFT / REHEARSAL ONLY. Registers the 64-D EmbeddingGemma MRL-prefix lane used by task-vector-texture-adapter.ts
-- (representation tag EMBEDDINGGEMMA_PREFIX64_EXPERIMENTAL) in the EXISTING public.atlas_representations registry.
-- Does NOT create a table. latent_64 in that registry is the learned autoencoder latent, a different representation; do not reuse it.
-- Rehearsal target: legal_ai_live_integration_scratch (atlas_representations has 0 rows there). Live legal_ai_db has 7 rows; NOT applied there.
-- Conventions copied from live rows: unknown identity fields are the literal 'unknown'; new lanes start CANDIDATE / UNVERIFIED.
-- Not asserted here (unverified): that the texture's 64-D prefix was L2-renormalized, the input role, and the model/tokenizer revisions.
-- Execution: docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_live_integration_scratch -v ON_ERROR_STOP=1 < this file
BEGIN;

INSERT INTO public.atlas_representations (
    representation_id, schema_version, upstream_model_id, upstream_revision, tokenizer_revision, artifact_digest,
    native_dimensions, output_dimensions, dimension_method, normalization, pooling, quantization, input_role,
    prompt_template_id, prompt_template_revision, max_input_tokens, truncation_policy,
    lifecycle_status, verification_status, notes
) VALUES (
    'semantic_mrl_prefix_64_experimental', 'atlas_representation_registry_v3', 'google/embeddinggemma-300m',
    'unknown', 'unknown', 'unknown',
    768, 64, 'MRL_TRUNCATE', 'L2', 'MEAN', 'f32', 'SYMMETRIC',
    'unknown', 'unknown', 0, 'END',
    'CANDIDATE', 'UNVERIFIED',
    'Experimental first-64 MRL prefix of semantic_768 for the 6,527-task texture (task-vector-texture-adapter.ts, tag EMBEDDINGGEMMA_PREFIX64_EXPERIMENTAL). Derived, not canonical retrieval. L2 renormalization and source/model revisions unverified; promotion must wait for runtime evidence.'
)
ON CONFLICT (representation_id) DO NOTHING;

-- Post-checks (rehearsal): exactly one new row, CANDIDATE/UNVERIFIED, output 64 of native 768, no other row changed.
SELECT representation_id, dimension_method, native_dimensions AS native, output_dimensions AS out, lifecycle_status, verification_status
FROM public.atlas_representations WHERE representation_id = 'semantic_mrl_prefix_64_experimental';
SELECT count(*) AS total_rows FROM public.atlas_representations;

-- Idempotency: re-running the INSERT must change nothing.
INSERT INTO public.atlas_representations (
    representation_id, schema_version, upstream_model_id, upstream_revision, tokenizer_revision, artifact_digest,
    native_dimensions, output_dimensions, dimension_method, normalization, pooling, quantization, input_role,
    prompt_template_id, prompt_template_revision, max_input_tokens, truncation_policy, lifecycle_status, verification_status
) VALUES ('semantic_mrl_prefix_64_experimental', 'x', 'x', 'x', 'x', 'x', 768, 64, 'MRL_TRUNCATE', 'L2', 'MEAN', 'f32', 'SYMMETRIC',
          'x', 'x', 0, 'END', 'CANDIDATE', 'UNVERIFIED')
ON CONFLICT (representation_id) DO NOTHING;
SELECT upstream_model_id AS unchanged_after_second_insert FROM public.atlas_representations WHERE representation_id = 'semantic_mrl_prefix_64_experimental';

ROLLBACK;  -- rehearsal. Replace with COMMIT only after explicit approval and a recorded pre-image.
