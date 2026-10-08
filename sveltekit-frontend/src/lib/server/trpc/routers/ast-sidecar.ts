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
import { createAstChunkOperationRequestV1, executeAtlasOperationV1, type AstChunkOperationResultV1 } from '$lib/server/atlas/operations/atlas-operation-runtime-v1.js';

function isAstChunkResult(value: unknown): value is AstChunkOperationResultV1 {
	return (
		value !== null &&
		typeof value === 'object' &&
		(value as Record<string, unknown>)['provider'] === 'treesitter-chunker-8095'
	);
}

const AstChunkInputSchema = z.object({
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1).optional(),
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

const AstEvidenceEdgeSchema = z.object({
  from_evidence_key: z.string(),
  to_evidence_key: z.string(),
  type: z.enum(['DEFINES', 'IMPORTS', 'EXPORTS', 'CALLS', 'REFERENCES']),
  evidence_start_line: z.number().int().nonnegative(),
  evidence_start_column: z.number().int().nonnegative(),
  evidence_end_line: z.number().int().nonnegative(),
  evidence_end_column: z.number().int().nonnegative(),
  resolved: z.boolean(),
  resolution: z.string().nullish(),
  occurrence_positions: z.array(z.tuple([z.number().int().positive(), z.number().int().nonnegative()])).nullish(),
});

const AstStructuralDiagnosticSchema = z.object({
	schema: z.literal('atlas.ast-structural-diagnostic.v1'),
	status: z.enum(['COMPILED', 'SKIPPED_PROVIDER_FAILED', 'SKIPPED_WORKSPACE_REVISION_UNBOUND', 'COMPILE_FAILED']),
	canonicalAuthority: z.literal(false),
	persistence: z.literal('NOT_ATTEMPTED'),
	workspaceRevision: z.string().nullable(),
	workspaceRevisionAuthority: z.literal('UNPROVEN'),
	projectionDiagnostic: z.object({
		schema: z.literal('atlas.graphify-structural-projection-diagnostic.v1'),
		status: z.enum(['DIAGNOSTIC_ONLY', 'BLOCKED_WORKSPACE_BINDING']),
		counts: z.object({
			totalEdges: z.number().int().nonnegative(),
			compiledFacts: z.number().int().nonnegative(),
			compiledCoordinates: z.number().int().nonnegative(),
			spanEvidenceCandidates: z.number().int().nonnegative(),
			evidenceMapEntries: z.number().int().nonnegative(),
			sourceSymbolNominated: z.number().int().nonnegative(),
			sourceSpanPresent: z.number().int().nonnegative(),
			sourceEligible: z.number().int().nonnegative(),
			targetSymbolNominated: z.number().int().nonnegative(),
			bothSymbolEndpointsNominated: z.number().int().nonnegative(),
			workspaceQualified: z.number().int().nonnegative(),
			graphQualified: z.number().int().nonnegative(),
			admissible: z.number().int().nonnegative(),
			rejectedFacts: z.number().int().nonnegative(),
		}),
		failureCounts: z.record(z.string(), z.number().int().nonnegative()),
		canonicalAuthority: z.literal(false),
		writesPerformed: z.literal(false),
	}).nullable(),
	diagnostics: z.array(z.string()).default([]),
});

const AstChunkOutputSchema = z.object({
  provider: z.literal('treesitter-chunker-8095'),
  status: z.enum(['PROVEN', 'RECOVERED_WITH_ERRORS', 'FAILED']),
  canonicalAuthority: z.literal(false),
  chunks: z.array(AstEvidenceChunkSchema).default([]),
  edges: z.array(AstEvidenceEdgeSchema).default([]),
  structural: AstStructuralDiagnosticSchema.nullable().optional(),
  diagnostics: z.array(z.string()).default([]),
  errorTag: z.string().nullish(),
});

export const astSidecarRouter = router({
  chunk: publicProcedure
    .input(AstChunkInputSchema)
    .output(AstChunkOutputSchema)
    .query(async ({ input }) => {
      const operation = await executeAtlasOperationV1(createAstChunkOperationRequestV1({
        sourceRef: input.sourceRef,
        sourceRevision: input.sourceRevision,
        workspaceRevision: input.workspaceRevision,
        language: input.language,
        source: input.source,
      }, crypto.randomUUID()));
      const astPayload = isAstChunkResult(operation.payload) ? operation.payload : null;
      return AstChunkOutputSchema.parse({
        provider: 'treesitter-chunker-8095',
        status: astPayload?.status ?? 'FAILED',
        canonicalAuthority: false,
        chunks: astPayload?.chunks ?? [],
        edges: astPayload?.edges ?? [],
        structural: astPayload?.structural ? {
			schema: astPayload.structural.schema,
			status: astPayload.structural.status,
			canonicalAuthority: astPayload.structural.canonicalAuthority,
			persistence: astPayload.structural.persistence,
			workspaceRevision: astPayload.structural.workspaceRevision,
			workspaceRevisionAuthority: astPayload.structural.workspaceRevisionAuthority,
			projectionDiagnostic: astPayload.structural.projectionDiagnostic,
			diagnostics: astPayload.structural.diagnostics,
		} : null,
        diagnostics: astPayload?.diagnostics ?? [operation.errorMessage].filter(Boolean),
        errorTag: astPayload?.errorTag ?? operation.errorCode ?? null,
      });
    }),
});
