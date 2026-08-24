/**
 * tRPC-facing boundary for the Python NLP sidecar (miniforge_nlp_sidecar_v2.py,
 * Docker port 8095) — Consiliency treesitter-chunker structural evidence.
 *
 * This does not create a second HTTP client to the sidecar: it wraps the
 * existing create8095AstProvider()/createMiniforgeNlpSidecarClient() from
 * graphify-structural-materializer.ts / miniforge-nlp-sidecar.ts, the same
 * client the AST corpus parity proof (scripts/atlas/prove-node-tree-sitter-
 * corpus-parity-v2.mts) and Graphify indexing already use. tRPC's role here
 * is purely the typed contract boundary for SvelteKit route/client callers —
 * the Python leg underneath remains HTTP+JSON (tRPC has no native
 * cross-language type inference into a non-TypeScript server; the Zod
 * schemas below are what make this boundary schema-validated instead of an
 * untyped fetch()).
 *
 * Same degraded-response pattern as atlas.ts's retrieveEvidence: sidecar
 * unavailable/failure becomes a schema-valid FAILED-status response, not an
 * unstructured 500, per this repo's Degraded Response Contract.
 */

import { z } from 'zod';
import { publicProcedure, router } from '../init.js';
import { create8095AstProvider } from '$lib/server/atlas/indexing/graphify-structural-materializer.js';

const AstChunkInputSchema = z.object({
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  language: z.string().min(1),
  source: z.string(),
});

const AstEvidenceChunkSchema = z.object({
  upstream_chunk_id: z.string().nullish(),
  upstream_node_id: z.string().nullish(),
  upstream_file_id: z.string().nullish(),
  upstream_symbol_id: z.string().nullish(),
  node_type: z.string(),
  kind: z.string(),
  name: z.string().nullish(),
  parent_route: z.array(z.string()).default([]),
  parent_context: z.string().nullish(),
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().nonnegative(),
  start_line: z.number().int().nonnegative(),
  start_column: z.number().int().nonnegative(),
  end_line: z.number().int().nonnegative(),
  end_column: z.number().int().nonnegative(),
  calls: z.array(z.string()).default([]),
  imports: z.array(z.string()).default([]),
  exports: z.array(z.string()).default([]),
});

const AstChunkOutputSchema = z.object({
  provider: z.literal('treesitter-chunker-8095'),
  status: z.enum(['PROVEN', 'RECOVERED_WITH_ERRORS', 'FAILED']),
  chunks: z.array(AstEvidenceChunkSchema).default([]),
  diagnostics: z.array(z.string()).default([]),
  errorTag: z.string().nullish(),
});

export const astSidecarRouter = router({
  chunk: publicProcedure
    .input(AstChunkInputSchema)
    .output(AstChunkOutputSchema)
    .query(async ({ input }) => {
      const provider = create8095AstProvider();
      const result = await provider.materialize({
        sourceRef: input.sourceRef,
        sourceRevision: input.sourceRevision,
        language: input.language,
        source: input.source,
      });
      return AstChunkOutputSchema.parse({
        provider: 'treesitter-chunker-8095',
        status: result.status,
        chunks: result.evidence?.chunks ?? [],
        diagnostics: result.diagnostics,
        errorTag: result.errorTag ?? null,
      });
    }),
});
