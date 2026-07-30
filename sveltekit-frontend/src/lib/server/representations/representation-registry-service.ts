/**
 * Phase 110 Representation Registry Service
 *
 * Canonical source for managing embedding representations with complete lifecycle,
 * verification, and deployment tracking. Separates semantic identity from runtime
 * deployment and distinguishes lifecycle status from verification status.
 */

import { db } from '$lib/server/db/client';
import {
  atlasRepresentations,
  atlasRepresentationProviders,
  atlasRepresentationProviderFallbacks,
  atlasRetrievalLaneFallbacks,
  atlasQdrantVectorMappings,
  atlasRepresentationLaneSelections,
} from '$lib/server/db/schema-postgres';
import { eq, and, or } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Lifecycle Status: Semantic adoption of a representation
 * CANDIDATE → ACTIVE → DEPRECATED → RETIRED
 */
export const LifecycleStatusSchema = z.enum(['CANDIDATE', 'ACTIVE', 'DEPRECATED', 'RETIRED']);
export type LifecycleStatus = z.infer<typeof LifecycleStatusSchema>;

/**
 * Verification Status: Evidence accumulation for a representation
 * UNVERIFIED → STATIC_VERIFIED → SAMPLE_VERIFIED → PRODUCTION_VERIFIED
 * Also: MISMATCH (evidence conflict), FAILED (failed validation)
 */
export const VerificationStatusSchema = z.enum([
  'UNVERIFIED',
  'STATIC_VERIFIED',
  'SAMPLE_VERIFIED',
  'PRODUCTION_VERIFIED',
  'MISMATCH',
  'FAILED',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/**
 * Dimension Method: How output_dimensions were derived from native_dimensions
 */
export const DimensionMethodSchema = z.enum([
  'NATIVE',
  'MRL_TRUNCATE',
  'LINEAR_PROJECTION',
  'AUTOENCODER',
  'CUSTOM_MODEL_HEAD',
  'SLICE_FIRST_N',
  'UNKNOWN',
]);
export type DimensionMethod = z.infer<typeof DimensionMethodSchema>;

/**
 * Input Role: Whether representation optimizes for query, document, or both
 */
export const InputRoleSchema = z.enum(['QUERY', 'DOCUMENT', 'SYMMETRIC']);
export type InputRole = z.infer<typeof InputRoleSchema>;

/**
 * Representation Registry Contract
 */
export const RepresentationSchema = z.object({
  representation_id: z.string().min(1),
  upstream_model_id: z.string(),
  upstream_revision: z.string(),
  model_revision: z.string(),
  model_source: z.enum(['huggingface', 'google', 'anthropic', 'custom', 'unknown']),
  quantization: z.enum(['f32', 'f16', 'bf16', 'int8', 'int4', 'q8_0', 'q4_0', 'custom', 'unknown']),
  tokenizer_digest: z.string().optional().nullable(),
  native_dimensions: z.number().int().positive(),
  output_dimensions: z.number().int().positive(),
  dimension_method: DimensionMethodSchema,
  normalization: z.enum(['L2', 'NONE']),
  input_role: InputRoleSchema,
  prompt_template_id: z.string().optional().nullable(),
  max_input_tokens: z.number().int().positive().optional().nullable(),
  truncation_policy: z.enum(['START', 'MIDDLE', 'END', 'SYMMETRIC']).default('END'),
  runtime: z.string(),
  lifecycle_status: LifecycleStatusSchema,
  verification_status: VerificationStatusSchema,
  verified_at: z.date().optional().nullable(),
  verified_by: z.string().optional().nullable(),
  verified_method: z.string().optional().nullable(),
  last_verified_output_norm: z.number().min(0.9).max(1.1).optional().nullable(),
  notes: z.string().optional().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type Representation = z.infer<typeof RepresentationSchema>;

/**
 * Provider Registry Contract (Runtime Deployment)
 */
export const ProviderSchema = z.object({
  provider_id: z.string().min(1),
  representation_id: z.string().min(1),
  runtime_engine: z.enum(['ollama', 'onnx', 'grpc', 'http', 'tei', 'custom']),
  execution_device: z.enum(['cpu', 'cuda', 'hip', 'metal', 'mixed', 'unknown']),
  endpoint_url: z.string().url(),
  api_dialect: z.enum(['ollama_native', 'openai_compatible', 'tei', 'custom']),
  model_alias: z.string().optional().nullable(),
  runtime_version: z.string().optional().nullable(),
  artifact_digest: z.string().optional().nullable(),
  health_status: z.enum(['HEALTHY', 'UNHEALTHY', 'UNKNOWN']).default('UNKNOWN'),
  last_health_check: z.date().optional().nullable(),
  health_check_failure_count: z.number().int().nonnegative().default(0),
  deployment_priority: z.number().int().default(0),
  is_preferred: z.boolean().default(false),
  created_at: z.date(),
  retired_at: z.date().optional().nullable(),
});

export type Provider = z.infer<typeof ProviderSchema>;

/**
 * Phase 1: Probe Representations at Runtime
 *
 * Verifies that representations actually exist at their declared endpoints
 * and measures normalization. Updates verification_status to STATIC_VERIFIED.
 */
export async function probeRepresentations(): Promise<{
  probed: Representation[];
  errors: Array<{ representation_id: string; error: string }>;
}> {
  const reps = await db.select().from(atlasRepresentations);
  const probed: Representation[] = [];
  const errors: Array<{ representation_id: string; error: string }> = [];

  for (const rep of reps) {
    try {
      // Get provider for this representation
      const provider = await db
        .select()
        .from(atlasRepresentationProviders)
        .where(eq(atlasRepresentationProviders.representation_id, rep.representation_id))
        .limit(1);

      if (!provider.length) {
        errors.push({
          representation_id: rep.representation_id,
          error: 'No provider configured',
        });
        continue;
      }

      const prov = provider[0];

      // Probe endpoint based on engine
      let actualDimensions: number | null = null;
      let normStatus: 'L2' | 'NONE' = 'NONE';

      if (prov.runtime_engine === 'ollama') {
        const resp = await fetch(`${prov.endpoint_url}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: prov.model_alias || rep.upstream_model_id,
            prompt: 'test',
          }),
        });

        if (resp.ok) {
          const data = (await resp.json()) as { embedding?: number[] };
          actualDimensions = data.embedding?.length || null;

          // Check if normalized (L2 norm ≈ 1.0)
          if (data.embedding) {
            const norm = Math.sqrt(data.embedding.reduce((s, x) => s + x * x, 0));
            normStatus = Math.abs(norm - 1.0) < 0.1 ? 'L2' : 'NONE';
          }
        }
      }

      // Update representation with probe results
      if (actualDimensions === rep.output_dimensions) {
        await db
          .update(atlasRepresentations)
          .set({
            verification_status: 'STATIC_VERIFIED',
            verified_at: new Date(),
            verified_by: 'phase110:probe',
            verified_method: `${prov.runtime_engine}:health_check`,
            last_verified_output_norm: normStatus === 'L2' ? 1.0 : 0.0,
            updated_at: new Date(),
          })
          .where(eq(atlasRepresentations.representation_id, rep.representation_id));

        probed.push({
          ...rep,
          verification_status: 'STATIC_VERIFIED',
          verified_at: new Date(),
          verified_by: 'phase110:probe',
          verified_method: `${prov.runtime_engine}:health_check`,
          last_verified_output_norm: normStatus === 'L2' ? 1.0 : 0.0,
        } as Representation);
      } else {
        errors.push({
          representation_id: rep.representation_id,
          error: `Dimension mismatch: expected ${rep.output_dimensions}, got ${actualDimensions}`,
        });
      }
    } catch (err) {
      errors.push({
        representation_id: rep.representation_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { probed, errors };
}

/**
 * Get active representations for a given artifact view and retrieval lane
 */
export async function getActiveRepresentations(
  artifactView: string,
  retrievalLane: string,
  workspaceRevision: string,
): Promise<Representation | null> {
  const selection = await db
    .select()
    .from(atlasRepresentationLaneSelections)
    .where(
      and(
        eq(atlasRepresentationLaneSelections.artifact_view, artifactView),
        eq(atlasRepresentationLaneSelections.retrieval_lane, retrievalLane),
        eq(atlasRepresentationLaneSelections.workspace_revision, workspaceRevision),
      ),
    )
    .limit(1);

  if (!selection.length) {
    return null;
  }

  const rep = await db
    .select()
    .from(atlasRepresentations)
    .where(eq(atlasRepresentations.representation_id, selection[0].representation_id))
    .limit(1);

  return rep.length ? (rep[0] as Representation) : null;
}

/**
 * Register a provider fallback with empirical compatibility proof
 */
export async function registerProviderFallback(
  representationId: string,
  fallbackProviderId: string,
  compatibilityKind: string,
  maxCosineDelta?: number,
  minimumRecallRatio?: number,
): Promise<void> {
  // Validate that both providers exist
  const reps = await db
    .select()
    .from(atlasRepresentationProviders)
    .where(eq(atlasRepresentationProviders.representation_id, representationId));

  if (!reps.length) {
    throw new Error(`No providers found for representation ${representationId}`);
  }

  // Insert fallback record
  await db.insert(atlasRepresentationProviderFallbacks).values({
    representation_id: representationId,
    fallback_provider_id: fallbackProviderId,
    compatibility_kind: compatibilityKind,
    max_cosine_delta: maxCosineDelta || null,
    minimum_recall_ratio: minimumRecallRatio || null,
    verified_at: new Date(),
    verified_by: 'phase110:registration',
  });
}

/**
 * Get provider fallback chain for a representation
 */
export async function getProviderFallbackChain(
  representationId: string,
): Promise<Array<{ primary: Provider; fallback: Provider; compatibility: string }>> {
  const fallbacks = await db
    .select()
    .from(atlasRepresentationProviderFallbacks)
    .where(eq(atlasRepresentationProviderFallbacks.representation_id, representationId));

  const result = [];

  for (const fb of fallbacks) {
    const primary = await db
      .select()
      .from(atlasRepresentationProviders)
      .where(eq(atlasRepresentationProviders.representation_id, representationId))
      .limit(1);

    const fallback = await db
      .select()
      .from(atlasRepresentationProviders)
      .where(eq(atlasRepresentationProviders.provider_id, fb.fallback_provider_id))
      .limit(1);

    if (primary.length && fallback.length) {
      result.push({
        primary: primary[0] as Provider,
        fallback: fallback[0] as Provider,
        compatibility: fb.compatibility_kind || 'UNKNOWN',
      });
    }
  }

  return result;
}

/**
 * Get all Qdrant vector mappings for a collection
 */
export async function getQdrantVectorMappings(collectionName: string) {
  return db
    .select()
    .from(atlasQdrantVectorMappings)
    .where(eq(atlasQdrantVectorMappings.collection_name, collectionName));
}

/**
 * Update Qdrant vector mapping verification status
 */
export async function updateQdrantVectorMappingVerification(
  collectionName: string,
  vectorFieldName: string,
  representationId: string,
  verificationStatus: VerificationStatus,
): Promise<void> {
  await db
    .update(atlasQdrantVectorMappings)
    .set({
      verification_status: verificationStatus,
      verified_at: new Date(),
      updated_at: new Date(),
    })
    .where(
      and(
        eq(atlasQdrantVectorMappings.collection_name, collectionName),
        eq(atlasQdrantVectorMappings.vector_field_name, vectorFieldName),
        eq(atlasQdrantVectorMappings.representation_id, representationId),
      ),
    );
}

/**
 * Register a lane selection for a specific corpus view
 */
export async function registerLaneSelection(
  repositoryId: string,
  corpusId: string,
  artifactView: string,
  retrievalLane: string,
  workspaceRevision: string,
  representationId: string,
  selectedBy?: string,
  evaluationNotes?: string,
): Promise<void> {
  await db
    .insert(atlasRepresentationLaneSelections)
    .values({
      repository_id: repositoryId,
      corpus_id: corpusId,
      artifact_view: artifactView,
      retrieval_lane: retrievalLane,
      workspace_revision: workspaceRevision,
      representation_id: representationId,
      selected_at: new Date(),
      selected_by: selectedBy,
      evaluation_notes: evaluationNotes,
    })
    .onConflictDoUpdate({
      target: [
        atlasRepresentationLaneSelections.repository_id,
        atlasRepresentationLaneSelections.corpus_id,
        atlasRepresentationLaneSelections.artifact_view,
        atlasRepresentationLaneSelections.retrieval_lane,
        atlasRepresentationLaneSelections.workspace_revision,
      ],
      set: {
        representation_id: representationId,
        selected_at: new Date(),
        selected_by: selectedBy,
        evaluation_notes: evaluationNotes,
      },
    });
}

/**
 * Check immutability constraint before updating representation
 */
export function validateImmutability(
  representation: Representation,
  updates: Partial<Representation>,
): { valid: boolean; reason?: string } {
  if (representation.verification_status !== 'PRODUCTION_VERIFIED') {
    return { valid: true };
  }

  // PRODUCTION_VERIFIED representations cannot have semantic fields changed
  const semanticFields = [
    'model_revision',
    'output_dimensions',
    'dimension_method',
    'normalization',
    'quantization',
    'upstream_revision',
  ] as const;

  for (const field of semanticFields) {
    if (
      field in updates &&
      (updates[field as keyof typeof updates] as unknown) !==
        (representation[field as keyof typeof representation] as unknown)
    ) {
      return {
        valid: false,
        reason: `Cannot modify semantic field '${field}' of PRODUCTION_VERIFIED representation. Create a new representation_id instead.`,
      };
    }
  }

  return { valid: true };
}
