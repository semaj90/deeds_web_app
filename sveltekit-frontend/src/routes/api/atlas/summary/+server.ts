/**
 * PHASE 85a: PACKET SUMMARY GENERATION API
 *
 * POST /api/atlas/summary
 *   body: { packet_key, source_ref, feature_id?, context, trace_id?, git_commit? }
 *   response: SummaryPipelineResult
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runPacketSummaryPipeline, runPacketSummaryPipelineBatch } from '$lib/server/generation/packet-summary-pipeline.js';
import { z } from 'zod';

const summaryRequestSchema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  feature_id: z.string().optional(),
  context: z.string().min(10),
  trace_id: z.string().uuid().optional(),
  git_commit: z.string().length(40).optional(),
});

const batchRequestSchema = z.array(summaryRequestSchema);

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    // Check if batch or single request
    if (Array.isArray(body)) {
      // Batch request
      const parsed = batchRequestSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: 'Invalid batch request', details: parsed.error }, { status: 400 });
      }

      const results = await runPacketSummaryPipelineBatch(parsed.data);
      return json({
        status: 'success',
        count: results.length,
        results,
      });
    } else {
      // Single request
      const parsed = summaryRequestSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: 'Invalid request', details: parsed.error }, { status: 400 });
      }

      const result = await runPacketSummaryPipeline(parsed.data);
      return json(result);
    }
  } catch (err) {
    console.error('Summary pipeline error:', err);
    return json(
      {
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
};
