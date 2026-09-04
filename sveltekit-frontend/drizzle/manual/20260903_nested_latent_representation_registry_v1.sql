-- Nested autoencoder representation-family registry (DRAFT; unapplied).
--
-- Storage authority remains codebase_chunk_index.latent_256.  latent_128 and
-- nested latent_64 are deterministic prefix+L2-renormalized views and are not
-- duplicated as independent vector columns or tables.
-- Dependency: apply/review 0152_atlas_representations_registry.sql first in
-- the proof database; this file must not recreate atlas_representations.

BEGIN;

INSERT INTO public.atlas_representations (
  representation_id, schema_version, upstream_model_id, upstream_revision,
  tokenizer_revision, artifact_digest, native_dimensions, output_dimensions,
  dimension_method, normalization, pooling, quantization, input_role,
  prompt_template_id, prompt_template_revision, max_input_tokens,
  truncation_policy, lifecycle_status, verification_status, notes
) VALUES
(
  'latent_256', 'atlas_representation_registry_v3',
  'atlas/nested-semantic-autoencoder', 'v3_full01', 'not_applicable',
  'pending_checkpoint_receipt', 768, 256, 'AUTOENCODER', 'L2', 'NONE',
  'f16', 'SYMMETRIC', 'not_applicable', 'not_applicable', 0, 'END',
  'CANDIDATE', 'UNVERIFIED',
  'Physical learned bottleneck derived from semantic_768; routing/reranking only; canonical_authority=false.'
),
(
  'latent_128', 'atlas_representation_registry_v3',
  'atlas/nested-semantic-autoencoder', 'v3_full01', 'not_applicable',
  'derived_from_latent_256', 256, 128, 'SLICE_FIRST_N', 'L2', 'NONE',
  'f16', 'SYMMETRIC', 'not_applicable', 'not_applicable', 0, 'END',
  'CANDIDATE', 'UNVERIFIED',
  'Deterministic normalized prefix of latent_256; no independent learned checkpoint or duplicate storage.'
)
ON CONFLICT (representation_id) DO NOTHING;

COMMIT;

-- Admission remains blocked until RepresentationArtifactV1 proves the exact
-- semantic_768 input, checkpoint/model checksum, producer revision, population
-- checksum, workspace/source revisions, and deterministic derived-view checksums.
-- The pre-existing registry row named latent_64 is not silently reinterpreted:
-- reconcile that legacy routing identity before assigning a canonical nested
-- latent_64 identifier.
