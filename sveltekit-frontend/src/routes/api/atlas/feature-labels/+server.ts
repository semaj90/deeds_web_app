import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { extractPacketFeatures } from '$lib/server/generation/feature-label-extractor.js';
import { logArtifact } from '$lib/server/generation/artifact-logger.js';
import type { RequestHandler } from './$types';

const extractSchema = z.object({
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  featureId: z.string().min(1),
  summary: z.string().optional(),
  symbols: z.record(z.string(), z.array(z.string())).optional(),
  useSynthesis: z.boolean().optional().default(true),
  saveToDB: z.boolean().optional().default(true)
});

type FeatureLabelRequest = {
  packetKey: string;
  sourceRef: string;
  featureId: string;
  summary?: string;
  symbols?: Record<string, string[]>;
  useSynthesis: boolean;
  saveToDB: boolean;
};

/**
 * POST /api/atlas/feature-labels
 * Extract feature labels from a single packet
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const payload = await request.json();
    const validated = extractSchema.parse(payload) as FeatureLabelRequest;

    // Extract features
    const result = await extractPacketFeatures(validated);

    // Optionally save to atlas_artifacts
    if (validated.saveToDB) {
      try {
        await logArtifact({
          packet_key: result.packetKey,
          source_ref: result.sourceRef,
          feature_id: result.featureId,
          artifact_type: 'feature_labels',
          generator: 'Gemma4',
          generator_version: 'rotorquant:latest',
          storage_backend: 'postgres_jsonb',
          status: result.status,
          gan_validation_score: result.extractedFeatures.confidence,
          generator_config: {
            labels: result.extractedFeatures.labels,
            symbols: result.extractedFeatures.symbols
          },
          content: JSON.stringify({
            labels: result.extractedFeatures.labels,
            symbols: result.extractedFeatures.symbols
          })
        });
      } catch (err) {
        console.error('[P5] Failed to log artifact:', err);
        // Non-blocking — return result even if logging fails
      }
    }

    return json({
      success: true,
      result: {
        packetKey: result.packetKey,
        sourceRef: result.sourceRef,
        featureId: result.featureId,
        labels: result.extractedFeatures.labels,
        confidence: result.extractedFeatures.confidence,
        contentHash: result.contentHash
      }
    });
  } catch (err) {
    const message = err instanceof z.ZodError
      ? `Validation error: ${err.issues[0]?.message ?? err.message}`
      : err instanceof Error
      ? err.message
      : 'Unknown error';

    return json(
      { success: false, error: message },
      { status: 400 }
    );
  }
};
