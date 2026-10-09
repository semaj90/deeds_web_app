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
import { createHash } from 'node:crypto';
import {
  compileEventHypergraphBundle,
  HypergraphLineageUnavailableError,
} from '$lib/server/analysis/nlp-feature-compiler.js';
import {
  GroundedExtractionSourceBindingError,
  resolveGroundedExtractionSourceBindingV1,
  type GroundedExtractionSourceBindingReceiptV1,
} from '$lib/server/atlas/identity/grounded-extraction-source-binding-v1.js';
import {
  createMiniforgeNlpSidecarClient,
  MiniforgeNlpRuntimeBindingUnavailableError,
} from '$lib/server/nlp/miniforge-nlp-sidecar.js';

const AnalyzeRequestSchema = z.object({
  text: z.string().min(1, 'text is required').max(200_000),
  sourceType: z.enum(['plain_text', 'docling_markdown', 'docling_json', 'ocr_text', 'transcript', 'codebase', 'general']).optional(),
  extractionMode: z.enum(['entities', 'relationships', 'concepts', 'full']).optional(),
  documentId: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
  packetKey: z.string().min(1).optional(),
  sourceRevision: z.string().min(1).optional(),
  workspaceRevision: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  maxChars: z.number().int().positive().max(200_000).optional(),
  passes: z.array(z.enum(['structural', 'lexical', 'linguistic', 'semantic', 'sequence', 'rerank', 'grounded', 'classify'])).optional(),
  groundedExtractionRequired: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.groundedExtractionRequired !== true) return;
  for (const field of ['sourceRef', 'packetKey', 'sourceRevision', 'workspaceRevision'] as const) {
    if (!value[field]?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `grounded extraction requires ${field}` });
    }
  }
  if (!value.sourceRevision || !/^sha256:[a-f0-9]{64}$/.test(value.sourceRevision)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRevision'], message: 'grounded extraction requires a SHA-256 sourceRevision' });
  } else {
    const submittedTextRevision = `sha256:${createHash('sha256').update(value.text, 'utf8').digest('hex')}`;
    if (value.sourceRevision !== submittedTextRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRevision'], message: 'sourceRevision does not match the exact submitted UTF-8 text bytes' });
    }
  }
  if (!value.workspaceRevision || !/^sha256:[a-f0-9]{64}$/.test(value.workspaceRevision)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['workspaceRevision'], message: 'grounded extraction requires a SHA-256 workspaceRevision' });
  }
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

  let groundedSourceBinding: GroundedExtractionSourceBindingReceiptV1 | null = null;
  if (parsed.data.groundedExtractionRequired === true) {
    try {
      groundedSourceBinding = await resolveGroundedExtractionSourceBindingV1({
        packetKey: parsed.data.packetKey!,
        sourceRef: parsed.data.sourceRef!,
        sourceRevision: parsed.data.sourceRevision!,
        workspaceRevision: parsed.data.workspaceRevision!,
        submittedText: parsed.data.text,
      });
    } catch (error) {
      const code = error instanceof GroundedExtractionSourceBindingError
        ? error.code
        : 'GROUNDED_SOURCE_BINDING_UNAVAILABLE';
      return json({
        error: code,
        code,
        grounded_source_binding: null,
        canonicalAuthority: false,
        writesPerformed: false,
      }, { status: error instanceof GroundedExtractionSourceBindingError ? 409 : 503 });
    }
  }

  const client = createMiniforgeNlpSidecarClient();
  let analysis: Awaited<ReturnType<typeof client.analyze>>;
  try {
    analysis = await client.analyze(parsed.data);
  } catch (error) {
    if (error instanceof MiniforgeNlpRuntimeBindingUnavailableError) {
      return json({
        error: error.code,
        code: error.code,
        grounded_source_binding: groundedSourceBinding,
        canonicalAuthority: false,
        writesPerformed: false,
      }, { status: 503 });
    }
    throw error;
  }
  let eventHypergraph = analysis.event_hypergraph;
  if (!eventHypergraph) {
    try {
      eventHypergraph = compileEventHypergraphBundle({
        requestId: analysis.document_id,
        packetKey: parsed.data.packetKey ?? null,
        sourceRef: parsed.data.sourceRef ?? parsed.data.documentId ?? analysis.document_id,
        sourceRevision: parsed.data.sourceRevision ?? '',
        workspaceRevision: parsed.data.workspaceRevision ?? null,
        passResults: analysis.pass_results ?? [],
        control5: analysis.control5 ?? null,
        experimentFeatureMatrix: analysis.experiment_feature_matrix ?? null,
      }) as unknown as typeof eventHypergraph;
    } catch (error) {
      if (error instanceof HypergraphLineageUnavailableError) {
        return json({
          error: error.message,
          code: error.code,
          event_hypergraph: null,
          canonicalAuthority: false,
          writesPerformed: false,
        }, { status: 409 });
      }
      throw error;
    }
  }

  return json({
    ...analysis,
    grounded_source_binding: groundedSourceBinding,
    structured: {
      pass_results: analysis.pass_results ?? [],
      control5: analysis.control5 ?? null,
      experiment_feature_matrix: analysis.experiment_feature_matrix ?? null,
      event_hypergraph: eventHypergraph as unknown as Record<string, unknown>,
    },
  });
};
