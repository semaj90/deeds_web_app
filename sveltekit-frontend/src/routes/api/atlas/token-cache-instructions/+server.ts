import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import { runNesFeatureTokenPipeline } from '$lib/server/atlas/fsm/nes-feature-token-pipeline.js';

const requestSchema = z.object({
  query: z.string().min(1),
  featureCandidate: z.string().optional(),
  seed: z.number().int().optional(),
  dryRun: z.boolean().optional().default(true),
});

/**
 * POST /api/atlas/token-cache-instructions
 *
 * Runs the end-to-end token and cache instruction resolution pipeline:
 * User Query -> Feature Label Resolution -> NES FSM -> Ewin Tang Low-Rank Sample -> ACE Packet -> Token Cache Instructions.
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
          cachedToValkey: false,
          valkeyPacketKey: '',
          durationMs: 0,
          error: `Validation error: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
        },
        { status: 400 }
      );
    }

    const { query, featureCandidate, seed, dryRun } = parseResult.data;

    const result = await runNesFeatureTokenPipeline(query, {
      featureCandidate,
      seed,
      dryRun,
    });

    return json({
      success: true,
      query: result.query,
      featureLabel: result.featureLabel,
      fsmState: result.fsmState,
      descriptor: result.descriptor,
      acePacket: result.acePacket,
      cachedToValkey: result.cachedToValkey,
      valkeyPacketKey: result.valkeyPacketKey,
      durationMs: result.durationMs,
      error: null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      {
        success: false,
        query: '',
        featureLabel: '',
        fsmState: 'FAILED',
        descriptor: null,
        acePacket: null,
        cachedToValkey: false,
        valkeyPacketKey: '',
        durationMs: 0,
        error: message,
      },
      { status: 500 }
    );
  }
};
