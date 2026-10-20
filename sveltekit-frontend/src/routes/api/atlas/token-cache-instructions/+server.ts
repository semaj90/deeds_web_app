import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import { runNesFeatureTokenPipeline } from '$lib/server/atlas/fsm/nes-feature-token-pipeline.js';
import { FeatureClassificationUnavailableError } from '$lib/server/atlas/fsm/nes-feature-fsm.js';
import { loadFeatureAnchorPacketEvidenceV1 } from '$lib/server/atlas/taxonomy/feature-anchor-packet-evidence-v1.js';

const requestSchema = z.object({
  query: z.string().min(1),
  featureCandidate: z.string().optional(),
  dryRun: z.boolean().optional().default(true),
});

/**
 * POST /api/atlas/token-cache-instructions
 *
 * Builds an advisory token/cache descriptor proposal. This does not verify
 * source evidence, read or write Valkey, or populate a model KV cache.
 *
 * Adheres strictly to AGENTS.md:
 * - Stable JSON response shape on success and error.
 * - Zod validated request body.
 * - Never returns or stores hiddenThoughts, kv_cache, or raw tensor bytes.
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = requestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return json(
        {
          success: false,
          query: typeof rawBody?.query === 'string' ? rawBody.query : '',
          featureLabel: '',
          fsmState: 'FAILED',
          descriptor: null,
          acePacket: null,
          sourceEvidence: null,
          cachedToValkey: false,
          valkeyPacketKey: '',
          durationMs: 0,
          error: `Validation error: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
        },
        { status: 400 }
      );
    }

    const { query, featureCandidate, dryRun } = parseResult.data;

    const result = await runNesFeatureTokenPipeline(query, {
      featureCandidate,
      dryRun,
    });
    const sourceEvidence = await loadFeatureAnchorPacketEvidenceV1(result.featureLabel);

    return json({
      success: true,
      query: result.query,
      featureLabel: result.featureLabel,
      fsmState: result.fsmState,
      descriptor: result.descriptor,
      acePacket: result.acePacket,
      sourceEvidence,
      cachedToValkey: result.cachedToValkey,
      valkeyPacketKey: result.valkeyPacketKey,
      durationMs: result.durationMs,
      error: null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof FeatureClassificationUnavailableError ? 422 : 500;
    return json(
      {
        success: false,
        query: '',
        featureLabel: '',
        fsmState: 'FAILED',
        descriptor: null,
        acePacket: null,
        sourceEvidence: null,
        cachedToValkey: false,
        valkeyPacketKey: '',
        durationMs: 0,
        error: message,
      },
      { status }
    );
  }
};
