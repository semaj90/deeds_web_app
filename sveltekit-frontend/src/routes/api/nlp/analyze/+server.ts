/**
 * POST /api/nlp/analyze
 *
 * Structured NLP/code analysis via the Miniforge sidecar.
 * This endpoint exposes the compiler outputs already produced by the
 * WSL2 Docker sidecar:
 *   - pass_results
 *   - control5
 *   - experiment_feature_matrix
 *   - grounded extraction metadata when explicitly requested
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { createMiniforgeNlpSidecarClient } from '$lib/server/nlp/miniforge-nlp-sidecar.js';

const AnalyzeRequestSchema = z.object({
  text: z.string().min(1, 'text is required').max(200_000),
  sourceType: z.enum(['plain_text', 'docling_markdown', 'docling_json', 'ocr_text', 'transcript', 'codebase', 'general']).optional(),
  extractionMode: z.enum(['entities', 'relationships', 'concepts', 'full']).optional(),
  documentId: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
  packetKey: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  maxChars: z.number().int().positive().max(200_000).optional(),
  passes: z.array(z.enum(['structural', 'lexical', 'linguistic', 'semantic', 'sequence', 'rerank', 'grounded'])).optional(),
  groundedExtractionRequired: z.boolean().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const client = createMiniforgeNlpSidecarClient();
  const analysis = await client.analyze(parsed.data);

  return json({
    ...analysis,
    structured: {
      pass_results: analysis.pass_results ?? [],
      control5: analysis.control5 ?? null,
      experiment_feature_matrix: analysis.experiment_feature_matrix ?? null,
    },
  });
};
