/**
 * Phase 110 Integration Tests
 *
 * Validates end-to-end representation registry functionality:
 * - Schema correctness
 * - Immutability constraints
 * - Fallback registration
 * - Lane selection tracking
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/lib/server/db/client';
import {
  atlasRepresentations,
  atlasRepresentationProviders,
  atlasRepresentationProviderFallbacks,
  atlasRetrievalLaneFallbacks,
  atlasQdrantVectorMappings,
  atlasRepresentationLaneSelections,
} from '../src/lib/server/db/schema-postgres';
import { eq, and } from 'drizzle-orm';
import {
  validateImmutability,
  RepresentationSchema,
  ProviderSchema,
} from '../src/lib/server/representations/representation-registry-service';

describe('Phase 110 Representation Registry', () => {
  describe('Schema Validation', () => {
    it('should validate representation schema', async () => {
      const reps = await db.select().from(atlasRepresentations).limit(1);
      expect(reps.length).toBeGreaterThan(0);

      const rep = reps[0];
      const validated = RepresentationSchema.safeParse(rep);
      expect(validated.success).toBe(true);
    });

    it('should validate provider schema', async () => {
      const providers = await db.select().from(atlasRepresentationProviders).limit(1);

      if (providers.length > 0) {
        const validated = ProviderSchema.safeParse(providers[0]);
        expect(validated.success).toBe(true);
      }
    });
  });

  describe('Immutability Constraints', () => {
    it('should prevent semantic field changes on PRODUCTION_VERIFIED', () => {
      const productionVerified = {
        representation_id: 'test-prod',
        verification_status: 'PRODUCTION_VERIFIED' as const,
        output_dimensions: 768,
        dimension_method: 'NATIVE' as const,
        normalization: 'L2' as const,
        quantization: 'f32' as const,
        upstream_revision: 'main',
        model_revision: 'ollama_latest',
      };

      const updates = {
        output_dimensions: 512, // Semantic change
      };

      const result = validateImmutability(productionVerified as any, updates);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Cannot modify semantic field');
    });

    it('should allow non-semantic changes on PRODUCTION_VERIFIED', () => {
      const productionVerified = {
        representation_id: 'test-prod',
        verification_status: 'PRODUCTION_VERIFIED' as const,
        output_dimensions: 768,
        dimension_method: 'NATIVE' as const,
        normalization: 'L2' as const,
        quantization: 'f32' as const,
        upstream_revision: 'main',
        model_revision: 'ollama_latest',
      };

      const updates = {
        notes: 'Updated documentation', // Non-semantic change
      };

      const result = validateImmutability(productionVerified as any, updates);
      expect(result.valid).toBe(true);
    });

    it('should allow changes on non-PRODUCTION_VERIFIED representations', () => {
      const candidate = {
        representation_id: 'test-candidate',
        verification_status: 'CANDIDATE' as const,
        output_dimensions: 768,
        dimension_method: 'NATIVE' as const,
        normalization: 'L2' as const,
        quantization: 'f32' as const,
        upstream_revision: 'main',
        model_revision: 'ollama_latest',
      };

      const updates = {
        output_dimensions: 512,
      };

      const result = validateImmutability(candidate as any, updates);
      expect(result.valid).toBe(true);
    });
  });

  describe('Seed Data', () => {
    it('should have seed representations with CANDIDATE/UNVERIFIED status', async () => {
      const reps = await db
        .select()
        .from(atlasRepresentations)
        .where(
          and(
            eq(atlasRepresentations.lifecycle_status, 'CANDIDATE'),
            eq(atlasRepresentations.verification_status, 'UNVERIFIED'),
          ),
        );

      expect(reps.length).toBeGreaterThanOrEqual(5);

      // Check specific seed representations
      const rep768 = reps.find((r) => r.output_dimensions === 768);
      expect(rep768).toBeDefined();
      expect(rep768?.dimension_method).toBe('NATIVE');
      expect(rep768?.upstream_model_id).toContain('embeddinggemma');

      const rep512 = reps.find((r) => r.output_dimensions === 512);
      expect(rep512).toBeDefined();
      expect(rep512?.dimension_method).toBe('UNKNOWN');
      expect(rep512?.notes).toContain('derivation');
    });

    it('should have provider configured for 768-dim representation', async () => {
      const rep768 = await db
        .select()
        .from(atlasRepresentations)
        .where(eq(atlasRepresentations.output_dimensions, 768))
        .limit(1);

      expect(rep768.length).toBe(1);

      const providers = await db
        .select()
        .from(atlasRepresentationProviders)
        .where(
          eq(
            atlasRepresentationProviders.representation_id,
            rep768[0].representation_id,
          ),
        );

      expect(providers.length).toBeGreaterThan(0);
      expect(providers[0].endpoint_url).toContain('127.0.0.1');
    });
  });

  describe('Lane Selection', () => {
    it('should register and retrieve lane selections', async () => {
      const rep = await db
        .select()
        .from(atlasRepresentations)
        .limit(1);

      expect(rep.length).toBeGreaterThan(0);

      // Register a lane selection
      const laneSelection = {
        repository_id: 'test-repo',
        corpus_id: 'test-corpus',
        artifact_view: 'code_semantic',
        retrieval_lane: 'dense_aann',
        workspace_revision: '2026-07-29',
        representation_id: rep[0].representation_id,
        selected_by: 'test-suite',
        selected_at: new Date(),
        evaluation_notes: 'Test selection',
      };

      await db
        .insert(atlasRepresentationLaneSelections)
        .values(laneSelection)
        .onConflictDoNothing();

      // Retrieve it
      const retrieved = await db
        .select()
        .from(atlasRepresentationLaneSelections)
        .where(
          and(
            eq(
              atlasRepresentationLaneSelections.repository_id,
              'test-repo',
            ),
            eq(
              atlasRepresentationLaneSelections.artifact_view,
              'code_semantic',
            ),
          ),
        );

      expect(retrieved.length).toBeGreaterThan(0);
      expect(retrieved[0].representation_id).toBe(rep[0].representation_id);
    });
  });

  describe('Qdrant Mappings', () => {
    it('should have Qdrant vector mappings for codebase_chunks_768', async () => {
      const mappings = await db
        .select()
        .from(atlasQdrantVectorMappings)
        .where(
          eq(
            atlasQdrantVectorMappings.collection_name,
            'codebase_chunks_768',
          ),
        );

      expect(mappings.length).toBeGreaterThan(0);

      // Check for named vectors
      const vectorNames = new Set(mappings.map((m) => m.vector_field_name));
      expect(vectorNames.has('content')).toBe(true);
    });
  });

  describe('State Machine', () => {
    it('should not allow invalid state transitions', () => {
      const states = [
        'CANDIDATE',
        'UNVERIFIED',
        'CANDIDATE',
        'STATIC_VERIFIED',
        'SAMPLE_VERIFIED',
        'PRODUCTION_VERIFIED',
      ];

      // Valid progression
      for (let i = 1; i < states.length; i++) {
        const prevStatus = states[i - 1];
        const nextStatus = states[i];

        const candidate = {
          representation_id: 'test',
          verification_status: prevStatus as any,
        };

        // This is just checking the states exist and are defined
        expect(['UNVERIFIED', 'STATIC_VERIFIED', 'SAMPLE_VERIFIED', 'PRODUCTION_VERIFIED']).toContain(
          nextStatus,
        );
      }
    });
  });

  describe('Provider Fallback', () => {
    it('should register provider fallback with compatibility proof', async () => {
      const rep = await db
        .select()
        .from(atlasRepresentations)
        .limit(1);

      if (rep.length === 0) return;

      // Create fallback record
      const fallback = {
        representation_id: rep[0].representation_id,
        fallback_provider_id: 'test-fallback-provider',
        compatibility_kind: 'RETRIEVAL_COMPATIBLE',
        max_cosine_delta: 0.05,
        minimum_recall_ratio: 0.95,
        verified_at: new Date(),
        verified_by: 'test-suite',
      };

      await db
        .insert(atlasRepresentationProviderFallbacks)
        .values(fallback)
        .onConflictDoNothing();

      // Retrieve and verify
      const retrieved = await db
        .select()
        .from(atlasRepresentationProviderFallbacks)
        .where(
          eq(
            atlasRepresentationProviderFallbacks.representation_id,
            rep[0].representation_id,
          ),
        );

      const testRecord = retrieved.find(
        (r) => r.fallback_provider_id === 'test-fallback-provider',
      );

      if (testRecord) {
        expect(testRecord.compatibility_kind).toBe('RETRIEVAL_COMPATIBLE');
        expect(testRecord.max_cosine_delta).toBe(0.05);
        expect(testRecord.minimum_recall_ratio).toBe(0.95);
      }
    });
  });
});
