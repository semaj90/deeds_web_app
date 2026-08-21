import { createHash } from 'node:crypto';
import { z } from 'zod';
import { artifactTransportRefSchema, sampleQueryNominationSchema } from './artifact-transport.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const ACE_SYNTHESIS_NODE_KINDS = [
  'LOAD_SNAPSHOT',
  'AST_RETRIEVAL',
  'SEMANTIC_KNN',
  'GRAPH_RANK',
  'NARY_DECOMPOSITION',
  'CONTEXT_WINDOW',
  'SAMPLE_QUERY_NOMINATION',
  'FEATURE_ALIGNMENT',
  'EXACT_PROMOTION',
  'PREFILL_CACHE_LOOKUP',
  'PREFILL_COMPILE',
  'PREFILL_CACHE_STORE',
  'PREFILL_RESOLVE',
  'DECODE',
  'PLAN_PATCH',
  'APPLY_PATCH',
  'VALIDATE',
  'REPAIR',
  'MATERIALIZE',
] as const;

export const ACE_NODE_EXECUTION_CONDITIONS = [
  'ALWAYS',
  'PREFILL_CACHE_HIT',
  'PREFILL_CACHE_MISS',
] as const;

export const aceSynthesisNodeSchema = z.object({
  node_id: id,
  kind: z.enum(ACE_SYNTHESIS_NODE_KINDS),
  depends_on: z.array(id).max(64).default([]),
  input_artifact_ids: z.array(id).max(256).default([]),
  output_artifact_ids: z.array(id).max(256).default([]),
  canonical_ids: z.array(id).max(4096).default([]),
  evidence_refs: z.array(id).max(4096).default([]),
  maximum_candidates: z.number().int().positive().nullable().optional(),
  maximum_hops: z.number().int().nonnegative().max(8).nullable().optional(),
  execution_condition: z.enum(ACE_NODE_EXECUTION_CONDITIONS).default('ALWAYS'),
  condition_source_node_id: id.nullable().default(null),
  read_only: z.boolean(),
  mutation_requested: z.boolean(),
  exact_promotion_required: z.boolean(),
  validation_required: z.boolean(),
  canonical_authority: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, ctx) => {
  if (value.mutation_requested && value.read_only) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['read_only'], message: 'mutating nodes cannot be read_only' });
  }
  if (value.kind === 'APPLY_PATCH' && !value.mutation_requested) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mutation_requested'], message: 'APPLY_PATCH must declare mutation_requested=true' });
  }
  if (['AST_RETRIEVAL', 'SEMANTIC_KNN', 'GRAPH_RANK', 'NARY_DECOMPOSITION', 'CONTEXT_WINDOW', 'SAMPLE_QUERY_NOMINATION', 'FEATURE_ALIGNMENT', 'PREFILL_CACHE_LOOKUP', 'PREFILL_CACHE_STORE', 'PREFILL_RESOLVE'].includes(value.kind) && value.canonical_authority) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['canonical_authority'], message: `${value.kind} is derived evidence/routing/runtime compute and cannot own canonical truth` });
  }
  if (value.execution_condition === 'ALWAYS' && value.condition_source_node_id !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['condition_source_node_id'], message: 'ALWAYS nodes cannot declare a condition source' });
  }
  if (value.execution_condition !== 'ALWAYS' && value.condition_source_node_id === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['condition_source_node_id'], message: 'conditional nodes require condition_source_node_id' });
  }
});

export type AceSynthesisNodeV1 = z.infer<typeof aceSynthesisNodeSchema>;

export const aceSynthesisGraphSchema = z.object({
  schema: z.literal('atlas.ace-synthesis-graph.v1').default('atlas.ace-synthesis-graph.v1'),
  graph_id: id,
  graph_revision: revision,
  request_id: id,
  workspace_revision: revision,
  source_snapshot_revision: revision,
  semantic_snapshot_revision: revision,
  relationship_snapshot_revision: revision,
  workflow_revision: z.number().int().nonnegative(),
  artifacts: z.array(artifactTransportRefSchema).max(2048),
  sample_query_nominations: z.array(sampleQueryNominationSchema).max(64).default([]),
  nodes: z.array(aceSynthesisNodeSchema).min(1).max(4096),
  prefill_identity_checksum: checksum.nullable().optional(),
  canonical_writes_allowed: z.boolean().default(false),
  max_patch_files: z.number().int().positive().max(512).default(32),
  max_patch_bytes: z.number().int().positive().default(2_000_000),
  producer_revision: revision,
  graph_checksum: checksum,
}).strict();

export type AceSynthesisGraphV1 = z.infer<typeof aceSynthesisGraphSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function ancestors(node: AceSynthesisNodeV1, byId: Map<string, AceSynthesisNodeV1>): AceSynthesisNodeV1[] {
  const result: AceSynthesisNodeV1[] = [];
  const seen = new Set<string>();
  const stack = [...node.depends_on];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const parent = byId.get(current);
    if (!parent) continue;
    result.push(parent);
    stack.push(...parent.depends_on);
  }
  return result;
}

function descendants(node: AceSynthesisNodeV1, nodes: readonly AceSynthesisNodeV1[]): AceSynthesisNodeV1[] {
  const result: AceSynthesisNodeV1[] = [];
  const queue = [node.node_id];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const candidate of nodes) {
      if (candidate.depends_on.includes(current)) {
        result.push(candidate);
        queue.push(candidate.node_id);
      }
    }
  }
  return result;
}

export function validateAceSynthesisGraph(input: z.input<typeof aceSynthesisGraphSchema>): AceSynthesisGraphV1 {
  const graph = aceSynthesisGraphSchema.parse(input);
  const byId = new Map(graph.nodes.map((node) => [node.node_id, node] as const));
  if (byId.size !== graph.nodes.length) throw new Error('ACE_SYNTHESIS_DUPLICATE_NODE_ID');

  const artifactIds = new Set(graph.artifacts.map((artifact) => artifact.artifact_id));
  if (artifactIds.size !== graph.artifacts.length) throw new Error('ACE_SYNTHESIS_DUPLICATE_ARTIFACT_ID');

  for (const node of graph.nodes) {
    for (const dependency of node.depends_on) {
      if (!byId.has(dependency)) throw new Error(`ACE_SYNTHESIS_MISSING_DEPENDENCY:${node.node_id}:${dependency}`);
      if (dependency === node.node_id) throw new Error(`ACE_SYNTHESIS_SELF_DEPENDENCY:${node.node_id}`);
    }
    for (const artifactId of [...node.input_artifact_ids, ...node.output_artifact_ids]) {
      if (!artifactIds.has(artifactId)) throw new Error(`ACE_SYNTHESIS_UNKNOWN_ARTIFACT:${node.node_id}:${artifactId}`);
    }
    if (node.condition_source_node_id !== null) {
      const source = byId.get(node.condition_source_node_id);
      if (!source) throw new Error(`ACE_SYNTHESIS_MISSING_CONDITION_SOURCE:${node.node_id}:${node.condition_source_node_id}`);
      if (source.kind !== 'PREFILL_CACHE_LOOKUP') throw new Error(`ACE_SYNTHESIS_INVALID_CONDITION_SOURCE:${node.node_id}:${source.kind}`);
      if (!node.depends_on.includes(source.node_id) && !ancestors(node, byId).some((parent) => parent.node_id === source.node_id)) {
        throw new Error(`ACE_SYNTHESIS_CONDITION_SOURCE_NOT_UPSTREAM:${node.node_id}:${source.node_id}`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) throw new Error(`ACE_SYNTHESIS_CYCLE:${nodeId}`);
    visiting.add(nodeId);
    for (const parent of byId.get(nodeId)?.depends_on ?? []) visit(parent);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of [...byId.keys()].sort()) visit(nodeId);

  const hasCacheBranch = graph.nodes.some((node) => ['PREFILL_CACHE_LOOKUP', 'PREFILL_CACHE_STORE', 'PREFILL_RESOLVE'].includes(node.kind));

  for (const node of graph.nodes) {
    const upstream = ancestors(node, byId);

    if (node.exact_promotion_required && !upstream.some((parent) => parent.kind === 'EXACT_PROMOTION')) {
      throw new Error(`ACE_SYNTHESIS_EXACT_PROMOTION_REQUIRED:${node.node_id}`);
    }

    if (node.kind === 'PREFILL_CACHE_LOOKUP') {
      if (node.execution_condition !== 'ALWAYS') throw new Error(`ACE_SYNTHESIS_LOOKUP_MUST_ALWAYS_RUN:${node.node_id}`);
      const required = new Set(['FEATURE_ALIGNMENT', 'EXACT_PROMOTION']);
      const seen = new Set<string>(upstream.map((parent) => parent.kind));
      for (const kind of required) if (!seen.has(kind)) throw new Error(`ACE_SYNTHESIS_LOOKUP_MISSING_${kind}:${node.node_id}`);
    }

    if (node.kind === 'PREFILL_COMPILE') {
      const required = new Set(['FEATURE_ALIGNMENT', 'EXACT_PROMOTION']);
      const seen = new Set<string>(upstream.map((parent) => parent.kind));
      for (const kind of required) if (!seen.has(kind)) throw new Error(`ACE_SYNTHESIS_PREFILL_MISSING_${kind}:${node.node_id}`);
      if (hasCacheBranch) {
        if (node.execution_condition !== 'PREFILL_CACHE_MISS') throw new Error(`ACE_SYNTHESIS_PREFILL_COMPILE_MUST_RUN_ON_MISS:${node.node_id}`);
        if (!upstream.some((parent) => parent.kind === 'PREFILL_CACHE_LOOKUP')) throw new Error(`ACE_SYNTHESIS_PREFILL_COMPILE_REQUIRES_LOOKUP:${node.node_id}`);
      }
    }

    if (node.kind === 'PREFILL_CACHE_STORE') {
      if (node.execution_condition !== 'PREFILL_CACHE_MISS') throw new Error(`ACE_SYNTHESIS_CACHE_STORE_MUST_RUN_ON_MISS:${node.node_id}`);
      if (!upstream.some((parent) => parent.kind === 'PREFILL_COMPILE')) throw new Error(`ACE_SYNTHESIS_CACHE_STORE_REQUIRES_COMPILE:${node.node_id}`);
      if (!upstream.some((parent) => parent.kind === 'PREFILL_CACHE_LOOKUP')) throw new Error(`ACE_SYNTHESIS_CACHE_STORE_REQUIRES_LOOKUP:${node.node_id}`);
    }

    if (node.kind === 'PREFILL_RESOLVE') {
      if (node.execution_condition !== 'ALWAYS') throw new Error(`ACE_SYNTHESIS_PREFILL_RESOLVE_MUST_ALWAYS_RUN:${node.node_id}`);
      const lookup = upstream.find((parent) => parent.kind === 'PREFILL_CACHE_LOOKUP');
      const store = upstream.find((parent) => parent.kind === 'PREFILL_CACHE_STORE');
      const compile = upstream.find((parent) => parent.kind === 'PREFILL_COMPILE');
      if (!lookup || !compile || !store) throw new Error(`ACE_SYNTHESIS_PREFILL_RESOLVE_REQUIRES_HIT_MISS_BRANCH:${node.node_id}`);
      if (compile.condition_source_node_id !== lookup.node_id || store.condition_source_node_id !== lookup.node_id) {
        throw new Error(`ACE_SYNTHESIS_PREFILL_BRANCH_CONDITION_MISMATCH:${node.node_id}`);
      }
      if (node.output_artifact_ids.length !== 1) throw new Error(`ACE_SYNTHESIS_PREFILL_RESOLVE_REQUIRES_ONE_OUTPUT:${node.node_id}`);
    }

    if (node.kind === 'DECODE') {
      if (hasCacheBranch) {
        if (!upstream.some((parent) => parent.kind === 'PREFILL_RESOLVE')) throw new Error(`ACE_SYNTHESIS_DECODE_REQUIRES_PREFILL_RESOLVE:${node.node_id}`);
      } else if (!upstream.some((parent) => parent.kind === 'PREFILL_COMPILE')) {
        throw new Error(`ACE_SYNTHESIS_DECODE_REQUIRES_PREFILL:${node.node_id}`);
      }
    }

    if (node.kind === 'APPLY_PATCH') {
      if (!graph.canonical_writes_allowed) throw new Error(`ACE_SYNTHESIS_WRITES_BLOCKED:${node.node_id}`);
      if (!upstream.some((parent) => parent.kind === 'PLAN_PATCH')) throw new Error(`ACE_SYNTHESIS_PATCH_REQUIRES_PLAN:${node.node_id}`);
      if (!upstream.some((parent) => parent.kind === 'EXACT_PROMOTION')) throw new Error(`ACE_SYNTHESIS_PATCH_REQUIRES_EXACT_PROMOTION:${node.node_id}`);
      if (!node.validation_required) throw new Error(`ACE_SYNTHESIS_PATCH_REQUIRES_VALIDATION_FLAG:${node.node_id}`);
      const downstream = descendants(node, graph.nodes);
      if (!downstream.some((child) => child.kind === 'VALIDATE')) throw new Error(`ACE_SYNTHESIS_PATCH_REQUIRES_VALIDATOR:${node.node_id}`);
      if (!downstream.some((child) => child.kind === 'MATERIALIZE')) throw new Error(`ACE_SYNTHESIS_PATCH_REQUIRES_MATERIALIZER:${node.node_id}`);
    }

    if (node.kind === 'REPAIR') {
      if (!upstream.some((parent) => parent.kind === 'VALIDATE')) throw new Error(`ACE_SYNTHESIS_REPAIR_REQUIRES_VALIDATION_EVIDENCE:${node.node_id}`);
      if (node.canonical_authority) throw new Error(`ACE_SYNTHESIS_REPAIR_CANNOT_OWN_CANONICAL_TRUTH:${node.node_id}`);
    }
  }

  if (hasCacheBranch) {
    const lookups = graph.nodes.filter((node) => node.kind === 'PREFILL_CACHE_LOOKUP');
    const resolves = graph.nodes.filter((node) => node.kind === 'PREFILL_RESOLVE');
    if (lookups.length !== 1) throw new Error('ACE_SYNTHESIS_REQUIRES_SINGLE_PREFILL_CACHE_LOOKUP');
    if (resolves.length !== 1) throw new Error('ACE_SYNTHESIS_REQUIRES_SINGLE_PREFILL_RESOLVE');
  }

  const recomputed = sha256({ ...graph, graph_checksum: undefined });
  if (graph.graph_checksum !== recomputed) throw new Error('ACE_SYNTHESIS_GRAPH_CHECKSUM_MISMATCH');
  return graph;
}

export function buildAceSynthesisGraph(input: Omit<z.input<typeof aceSynthesisGraphSchema>, 'schema' | 'graph_checksum'>): AceSynthesisGraphV1 {
  const raw = {
    schema: 'atlas.ace-synthesis-graph.v1' as const,
    ...input,
  };
  const graph_checksum = sha256({ ...raw, graph_checksum: undefined });
  return validateAceSynthesisGraph({ ...raw, graph_checksum });
}

export function prefillIdentityChecksum(input: {
  context_manifest_checksum: string;
  model_revision: string;
  adapter_revision: string | null;
  prompt_template_revision: string;
  evidence_revisions: readonly string[];
  aligned_feature_matrix_checksum: string;
}): string {
  return sha256({
    context_manifest_checksum: input.context_manifest_checksum,
    model_revision: input.model_revision,
    adapter_revision: input.adapter_revision,
    prompt_template_revision: input.prompt_template_revision,
    evidence_revisions: [...input.evidence_revisions].sort(),
    aligned_feature_matrix_checksum: input.aligned_feature_matrix_checksum,
  });
}

export function describeAceSynthesisGraph(): string {
  return [
    'ACE synthesis is a revisioned DAG over immutable artifact references, not a bag of model-readable strings.',
    'AST, semantic KNN, PageRank/PPR, N-ary decomposition, contextual windows and Tang-style sample/query access produce derived nominations/signals only.',
    'Exact evidence promotion must precede logical prefill cache lookup and every mutating patch path.',
    'When logical caching is enabled the DAG branches at PREFILL_CACHE_LOOKUP: HIT skips compile/store; MISS executes PREFILL_COMPILE then PREFILL_CACHE_STORE; PREFILL_RESOLVE converges both paths into exactly one compiled-prefill artifact.',
    'Decode consumes PREFILL_RESOLVE and therefore remains backend-neutral: llama.cpp prefix caching, TensorRT-LLM paged KV reuse, Triton scheduling and future PyTorch/Triton kernels are runtime accelerators below the same logical prefill identity.',
    'Every APPLY_PATCH path is bounded, validator-gated, and materialized only after validation receipts exist; REPAIR consumes failure evidence and remains non-canonical.',
  ].join(' ');
}
