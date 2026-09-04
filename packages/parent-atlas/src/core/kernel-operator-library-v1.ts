import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

/**
 * Which execution surface an operator actually runs on. Kept distinct from
 * `implementationKind` (a pointer classification: table/tool/file/command)
 * because `executorClass` is about runtime behavior — a Postgres table
 * lookup and an MCP graph-traversal tool are both real, but a compiler
 * scheduling a task function needs to know "this blocks on a DB round
 * trip" vs "this blocks on a network call to an MCP server" vs "this
 * shells out to a CLI process" to reason about cost/latency/retry policy.
 */
export const KERNEL_OPERATOR_EXECUTOR_CLASS_VALUES = [
  'DB_QUERY_EXECUTOR', 'GRAPH_TRAVERSAL_EXECUTOR', 'SEARCH_EXECUTOR',
  'RANK_EXECUTOR', 'CONTEXT_BUILD_EXECUTOR', 'CLI_PROCESS_EXECUTOR',
  'IN_MEMORY_COMPUTE_EXECUTOR',
] as const;
export const kernelOperatorExecutorClassSchema = z.enum(KERNEL_OPERATOR_EXECUTOR_CLASS_VALUES);
export type KernelOperatorExecutorClass = z.infer<typeof kernelOperatorExecutorClassSchema>;

/**
 * AtlasKernelOperatorLibraryV1 — the fixed, trusted, generic operator
 * vocabulary that `AtlasKernelFunctionV1` (OAK-05) composes over.
 *
 * This is a CONTRACT/REGISTRY, not a runtime. Each `KernelOperatorV1`
 * carries an `implementationRef` string naming a real, already-existing
 * capability in this repo — it does not execute anything itself. The
 * actual call-site wiring (the equivalent of `simdjson-typed-evidence-
 * bridge.ts` for DAG-XJSON-01) belongs in `sveltekit-frontend/src/lib/
 * server/atlas/`, not here, matching this repo's own rule (root CLAUDE.md
 * "Audit `packages/*` Before Moving Anything From `scripts/atlas/`" /
 * "packages/parent-atlas is the canonical contract layer").
 */
export const KERNEL_OPERATOR_KIND_VALUES = [
  'FILTER', 'JOIN', 'PROJECT', 'GROUP', 'AGGREGATE',
  'LOOKUP_SYMBOL', 'LOOKUP_PACKET',
  'SEARCH_LEXICAL', 'SEARCH_SEMANTIC',
  'EXPAND_GRAPH', 'SHORTEST_PATH', 'BOUNDED_BFS',
  'GET_CALLERS', 'GET_CALLEES', 'GET_REFERENCES',
  'GET_SOURCE_SPAN', 'GET_AST_EVIDENCE',
  'INTERSECT_ELIGIBILITY', 'RERANK',
  'VALIDATE_SCHEMA', 'RUN_TEST', 'RUN_TYPECHECK',
  'COMPARE_REVISION', 'BUILD_CONTEXT',
  // FETCH-LATENT-OPERATOR-01 (parent-atlas-retrieval-lineage-dag-convergence): fetches an
  // already-materialized candidate-side representation slice (currently only latent_256 is
  // physically stored -- see LATENT256-REPRESENTATION-CONTRACT-02). This is candidate-side
  // hydration by known candidate id, NEVER live query-time encoding -- it has no dependency on
  // LATENT256-QUERY-ENCODER-01 (still blocked/OPEN) and must not be conflated with it.
  'FETCH_LATENT_REPRESENTATION',
] as const;

export const kernelOperatorKindSchema = z.enum(KERNEL_OPERATOR_KIND_VALUES);
export type KernelOperatorKind = z.infer<typeof kernelOperatorKindSchema>;

export const kernelOperatorSchema = z.object({
  schema: z.literal('atlas.kernel-operator.v1').default('atlas.kernel-operator.v1'),
  operatorId: id,
  operatorRevision: revision,
  kind: kernelOperatorKindSchema,
  inputSchemaId: id,
  outputSchemaId: id,
  /** Zod/JSON-Schema ref for the operator's own tunable parameters (e.g. a
   * BOUNDED_BFS's max-hop count). `null` for operators with no parameters
   * beyond their typed input. */
  parameterSchemaRef: id.nullable(),
  executorClass: kernelOperatorExecutorClassSchema,
  /** Revision axes this operator's output is bound to and must be
   * re-validated against if any of them change (e.g. a graph traversal
   * result is stale if `graphRevision` moves). */
  requiredRevisionAxes: z.array(z.string().min(1)),
  /** The artifact kinds this operator is allowed to read or produce —
   * bounds what a composed function can claim as `requiredEvidenceKinds`. */
  allowedArtifactKinds: z.array(z.string().min(1)).min(1),
  /**
   * A verified-real pointer to the existing implementation this operator
   * wraps — a file path, a live MCP tool name, or a table name. This is
   * evidence the operator isn't fabricated, not an executable reference.
   */
  implementationRef: z.string().min(1),
  implementationKind: z.enum(['mcp_tool', 'postgres_table', 'source_file', 'qdrant_collection', 'cli_command']),
  verifiedLive: z.boolean(),
  deterministic: z.boolean(),
  operatorChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  producerRevision: revision,
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export type KernelOperatorV1 = z.infer<typeof kernelOperatorSchema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export interface BuildKernelOperatorV1Input {
  operatorId: string;
  operatorRevision: string;
  kind: KernelOperatorKind;
  inputSchemaId: string;
  outputSchemaId: string;
  parameterSchemaRef?: string | null;
  executorClass: KernelOperatorExecutorClass;
  requiredRevisionAxes?: string[];
  allowedArtifactKinds: string[];
  implementationRef: string;
  implementationKind: KernelOperatorV1['implementationKind'];
  verifiedLive: boolean;
  deterministic: boolean;
  producerRevision: string;
}

/** Builder that seals a checksum over every field except the checksum
 * itself — mirrors the pattern used by every other kernel contract in this
 * file family (schema/function/manifest), so per-operator determinism is
 * provable the same way, not asserted differently per file. */
export function buildKernelOperatorV1(input: BuildKernelOperatorV1Input): KernelOperatorV1 {
  const body = {
    schema: 'atlas.kernel-operator.v1' as const,
    operatorId: input.operatorId,
    operatorRevision: input.operatorRevision,
    kind: input.kind,
    inputSchemaId: input.inputSchemaId,
    outputSchemaId: input.outputSchemaId,
    parameterSchemaRef: input.parameterSchemaRef ?? null,
    executorClass: input.executorClass,
    requiredRevisionAxes: input.requiredRevisionAxes ?? [],
    allowedArtifactKinds: input.allowedArtifactKinds,
    implementationRef: input.implementationRef,
    implementationKind: input.implementationKind,
    verifiedLive: input.verifiedLive,
    deterministic: input.deterministic,
    producerRevision: input.producerRevision,
    canonicalAuthority: false as const,
  };
  return kernelOperatorSchema.parse({ ...body, operatorChecksum: sha256(body) });
}

export const kernelOperatorLibrarySchema = z.object({
  schema: z.literal('atlas.kernel-operator-library.v1').default('atlas.kernel-operator-library.v1'),
  libraryRevision: revision,
  operators: z.array(kernelOperatorSchema),
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const op of value.operators) {
    if (seen.has(op.operatorId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['operators'], message: `Duplicate operatorId ${op.operatorId}` });
    }
    seen.add(op.operatorId);
  }
});

export type KernelOperatorLibraryV1 = z.infer<typeof kernelOperatorLibrarySchema>;

export function buildKernelOperatorLibraryV1(input: {
  libraryRevision: string;
  operators: KernelOperatorV1[];
}): KernelOperatorLibraryV1 {
  return kernelOperatorLibrarySchema.parse({
    schema: 'atlas.kernel-operator-library.v1',
    libraryRevision: input.libraryRevision,
    operators: input.operators,
    canonicalAuthority: false,
  });
}

export function findKernelOperator(library: KernelOperatorLibraryV1, operatorId: string): KernelOperatorV1 | undefined {
  return library.operators.find((op) => op.operatorId === operatorId);
}
