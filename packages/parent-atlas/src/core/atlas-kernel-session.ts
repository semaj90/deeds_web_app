import { createHash } from 'node:crypto';
import { z } from 'zod';
import { artifactTransportRefSchema } from './artifact-transport.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const ATLAS_ANALYZER_IDS = [
  'TREE_SITTER',
  'TREESITTER_CHUNKER',
  'AST_GREP',
  'TS_MORPH',
  'LANGEXTRACT',
  'STANZA_POS',
  'CODEQL',
  'SOUFFLE',
  'PYTORCH',
  'CUVS',
  'CUGRAPH',
  'CUSPARSE',
] as const;

export const ATLAS_ANALYZER_OWNER_RUNTIMES = [
  'IPYTHON_KERNEL',
  'TYPESCRIPT_HOST',
  'EXTERNAL_PROCESS',
  'NATIVE_LIBRARY',
] as const;

export const ATLAS_IMPLEMENTATION_LANGUAGES = [
  'C11',
  'C_CPP',
  'CUDA',
  'PYTHON',
  'TYPESCRIPT',
  'RUST',
  'QL',
  'DATALOG',
  'MIXED',
] as const;

export const ATLAS_INVOCATION_SURFACES = [
  'PYTHON_IMPORT',
  'NODE_NAPI',
  'TYPESCRIPT_API',
  'CLI_PROCESS',
  'C_ABI',
  'CPP_API',
  'LIBTORCH_STABLE_ABI',
  'JUPYTER_HOST_REQUEST',
] as const;

export const ATLAS_FREE_THREADING_STATUSES = [
  'NOT_APPLICABLE',
  'OUT_OF_PROCESS',
  'VERIFIED_NO_GIL',
  'MAY_REENABLE_GIL',
  'PYTHON_3_14T_TARGET',
  'UNKNOWN',
] as const;

export const ATLAS_OBSERVATION_KINDS = [
  'SOURCE_SPAN',
  'AST_FACT',
  'SYMBOL_FACT',
  'STRUCTURAL_MATCH',
  'TYPE_FACT',
  'LEXICAL_POS',
  'GROUNDED_EXTRACTION',
  'DATAFLOW_PATH',
  'RULE_PROOF',
  'EXACT_VECTOR_DISTANCE',
  'GRAPH_MEASUREMENT',
  'SPARSE_PROPAGATION',
  'MODEL_SCORE',
] as const;

export const atlasAnalyzerCapabilitySchema = z.object({
  analyzer_id: z.enum(ATLAS_ANALYZER_IDS),
  analyzer_revision: revision,
  owner_runtime: z.enum(ATLAS_ANALYZER_OWNER_RUNTIMES),
  implementation_languages: z.array(z.enum(ATLAS_IMPLEMENTATION_LANGUAGES)).min(1),
  invocation_surfaces: z.array(z.enum(ATLAS_INVOCATION_SURFACES)).min(1),
  observation_kinds: z.array(z.enum(ATLAS_OBSERVATION_KINDS)).default([]),
  availability: z.enum(['UNPROBED', 'AVAILABLE', 'UNAVAILABLE', 'DEGRADED']).default('UNPROBED'),
  free_threading_status: z.enum(ATLAS_FREE_THREADING_STATUSES),
  package_or_binary: z.string().min(1),
  version: z.string().min(1).nullable().default(null),
  canonical_authority: z.literal(false).default(false),
  notes: z.array(z.string().min(1)).default([]),
}).strict();
export type AtlasAnalyzerCapabilityV1 = z.infer<typeof atlasAnalyzerCapabilitySchema>;

export const atlasPythonRuntimeSchema = z.object({
  executable: z.string().min(1),
  version: z.string().min(1),
  implementation: z.string().min(1),
  abi_flags: z.string(),
  python_abi: z.string().min(1),
  free_threaded_build: z.boolean(),
  gil_enabled: z.boolean().nullable(),
  ipykernel_version: z.string().min(1).nullable(),
}).strict();
export type AtlasPythonRuntimeV1 = z.infer<typeof atlasPythonRuntimeSchema>;

export const atlasKernelTransportSchema = z.object({
  protocol: z.literal('JUPYTER_ZMQ'),
  signature_scheme: z.literal('HMAC_SHA256'),
  channels: z.array(z.enum(['shell', 'iopub', 'control'])).min(3).max(3),
  execute_serialized: z.literal(true),
  connection_secret_host_owned: z.literal(true),
}).strict();

export const atlasKernelSessionSchema = z.object({
  schema: z.literal('atlas.kernel-session.v1').default('atlas.kernel-session.v1'),
  session_id: id,
  session_revision: revision,
  workspace_revision: revision,
  source_snapshot_revision: revision,
  ace_graph_id: id.nullable().default(null),
  ace_graph_revision: revision.nullable().default(null),
  state: z.enum(['PROVISIONING', 'READY', 'BUSY', 'INTERRUPTING', 'FAILED', 'SHUTDOWN']),
  host_authority: z.literal('TYPESCRIPT'),
  kernel_language: z.literal('PYTHON'),
  persistent_namespace: z.literal(true),
  canonical_writes_allowed: z.literal(false),
  allow_gil_reenable: z.boolean().default(false),
  python_runtime: atlasPythonRuntimeSchema,
  transport: atlasKernelTransportSchema,
  capabilities: z.array(atlasAnalyzerCapabilitySchema).min(1),
  artifacts: z.array(artifactTransportRefSchema).max(4096).default([]),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  const analyzerIds = value.capabilities.map((capability) => capability.analyzer_id);
  if (new Set(analyzerIds).size !== analyzerIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capabilities'], message: 'analyzer_id must be unique within a kernel session' });
  }
  const artifactIds = value.artifacts.map((artifact) => artifact.artifact_id);
  if (new Set(artifactIds).size !== artifactIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifacts'], message: 'artifact_id must be unique within a kernel session' });
  }
  const graphPairPresent = value.ace_graph_id !== null || value.ace_graph_revision !== null;
  if (graphPairPresent && (value.ace_graph_id === null || value.ace_graph_revision === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ace_graph_id'], message: 'ace_graph_id and ace_graph_revision must be present or absent together' });
  }
  if (value.python_runtime.free_threaded_build && value.python_runtime.gil_enabled === false && !value.allow_gil_reenable) {
    for (const [index, capability] of value.capabilities.entries()) {
      if (capability.availability === 'AVAILABLE' && capability.free_threading_status === 'MAY_REENABLE_GIL') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capabilities', index, 'free_threading_status'],
          message: `${capability.analyzer_id} may re-enable the GIL; mark degraded/unavailable or explicitly allow GIL re-enable`,
        });
      }
    }
  }
});
export type AtlasKernelSessionV1 = z.infer<typeof atlasKernelSessionSchema>;

export const ATLAS_KERNEL_REQUEST_KINDS = [
  'READ_ARTIFACT',
  'RETRIEVE',
  'RUN_ANALYZER',
  'VERIFY_CLAIM',
  'COMPILE_PREFILL',
  'PROPOSE_PATCH',
  'SPAWN_SUBTASK',
] as const;

export const atlasKernelHostRequestSchema = z.object({
  schema: z.literal('atlas.kernel-host-request.v1').default('atlas.kernel-host-request.v1'),
  request_id: id,
  session_id: id,
  session_revision: revision,
  workspace_revision: revision,
  source_snapshot_revision: revision,
  ace_graph_id: id,
  ace_graph_revision: revision,
  kind: z.enum(ATLAS_KERNEL_REQUEST_KINDS),
  analyzer_id: z.enum(ATLAS_ANALYZER_IDS).nullable().default(null),
  input_artifact_ids: z.array(id).max(256).default([]),
  canonical_ids: z.array(id).max(4096).default([]),
  evidence_refs: z.array(id).max(4096).default([]),
  claim_verification_receipt_ids: z.array(id).max(1024).default([]),
  maximum_candidates: z.number().int().positive().max(100_000).nullable().default(null),
  maximum_bytes: z.number().int().positive().nullable().default(null),
  maximum_seconds: z.number().finite().positive().nullable().default(null),
  deterministic_required: z.boolean().default(true),
  mutation_intent: z.enum(['NONE', 'PROPOSE_ONLY']).default('NONE'),
  payload: z.record(z.string(), z.unknown()).default({}),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'RUN_ANALYZER' && value.analyzer_id === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['analyzer_id'], message: 'RUN_ANALYZER requires analyzer_id' });
  }
  if (value.kind !== 'RUN_ANALYZER' && value.analyzer_id !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['analyzer_id'], message: 'analyzer_id is reserved for RUN_ANALYZER requests' });
  }
  if (value.kind === 'PROPOSE_PATCH') {
    if (value.mutation_intent !== 'PROPOSE_ONLY') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mutation_intent'], message: 'PROPOSE_PATCH may propose a mutation but cannot apply it' });
    }
    if (value.claim_verification_receipt_ids.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['claim_verification_receipt_ids'], message: 'PROPOSE_PATCH requires at least one verified-claim receipt' });
    }
  } else if (value.mutation_intent !== 'NONE') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mutation_intent'], message: 'only PROPOSE_PATCH may carry mutation intent' });
  }
});
export type AtlasKernelHostRequestV1 = z.infer<typeof atlasKernelHostRequestSchema>;

export const atlasKernelHostResponseSchema = z.object({
  schema: z.literal('atlas.kernel-host-response.v1').default('atlas.kernel-host-response.v1'),
  request_id: id,
  session_id: id,
  status: z.enum(['ACCEPTED', 'COMPLETED', 'REJECTED', 'FAILED']),
  output_artifact_ids: z.array(id).max(256).default([]),
  evidence_refs: z.array(id).max(4096).default([]),
  receipt_refs: z.array(id).max(4096).default([]),
  child_handle_id: id.nullable().default(null),
  error_code: z.string().min(1).nullable().default(null),
  canonical_authority: z.literal(false).default(false),
  payload: z.record(z.string(), z.unknown()).default({}),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.status === 'FAILED' && value.error_code === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['error_code'], message: 'FAILED response requires error_code' });
  }
  if (value.status !== 'FAILED' && value.error_code !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['error_code'], message: 'error_code is reserved for FAILED responses' });
  }
});
export type AtlasKernelHostResponseV1 = z.infer<typeof atlasKernelHostResponseSchema>;

export const lexicalTokenObservationSchema = z.object({
  schema: z.literal('atlas.lexical-token-observation.v1').default('atlas.lexical-token-observation.v1'),
  source_ref: z.string().min(1),
  source_revision: revision,
  start_char: z.number().int().nonnegative(),
  end_char: z.number().int().positive(),
  text: z.string().min(1),
  lemma: z.string().min(1).nullable().default(null),
  upos: z.string().min(1).nullable().default(null),
  xpos: z.string().min(1).nullable().default(null),
  morphology: z.string().nullable().default(null),
  dependency_relation: z.string().min(1).nullable().default(null),
  producer: z.enum(['STANZA', 'RULE_BASED']),
  producer_revision: revision,
  model_revision: revision.nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.end_char <= value.start_char) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_char'], message: 'end_char must be greater than start_char' });
  }
  if (value.producer === 'STANZA' && value.model_revision === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['model_revision'], message: 'STANZA lexical observations require model_revision' });
  }
});
export type LexicalTokenObservationV1 = z.infer<typeof lexicalTokenObservationSchema>;

function capability(input: Omit<AtlasAnalyzerCapabilityV1, 'availability' | 'version' | 'canonical_authority'>): AtlasAnalyzerCapabilityV1 {
  return atlasAnalyzerCapabilitySchema.parse({ ...input, availability: 'UNPROBED', version: null, canonical_authority: false });
}

/**
 * Expected ownership/interfaces only. Availability/version are deliberately
 * UNPROBED until the kernel and host perform runtime probes.
 */
export function buildDefaultAtlasAnalyzerCapabilities(revisionValue: string): AtlasAnalyzerCapabilityV1[] {
  return [
    capability({
      analyzer_id: 'TREE_SITTER', analyzer_revision: revisionValue, owner_runtime: 'IPYTHON_KERNEL',
      implementation_languages: ['C11'], invocation_surfaces: ['PYTHON_IMPORT', 'C_ABI'],
      observation_kinds: ['SOURCE_SPAN', 'AST_FACT'], free_threading_status: 'UNKNOWN', package_or_binary: 'tree_sitter',
      notes: ['Tree-sitter runtime is C11; Python is a binding, not the parser implementation.', 'Language grammar ABI must be recorded separately from Atlas canonical identity.'],
    }),
    capability({
      analyzer_id: 'TREESITTER_CHUNKER', analyzer_revision: revisionValue, owner_runtime: 'IPYTHON_KERNEL',
      implementation_languages: ['PYTHON', 'C11'], invocation_surfaces: ['PYTHON_IMPORT'],
      observation_kinds: ['SOURCE_SPAN', 'AST_FACT', 'SYMBOL_FACT'], free_threading_status: 'UNKNOWN', package_or_binary: 'treesitter-chunker',
      notes: ['Python package orchestrates Tree-sitter grammars and structural chunk/XRef extraction.', 'Upstream chunk/node/file/symbol IDs remain provenance until GIS promotion.'],
    }),
    capability({
      analyzer_id: 'AST_GREP', analyzer_revision: revisionValue, owner_runtime: 'IPYTHON_KERNEL',
      implementation_languages: ['RUST'], invocation_surfaces: ['PYTHON_IMPORT', 'NODE_NAPI', 'CLI_PROCESS'],
      observation_kinds: ['SOURCE_SPAN', 'AST_FACT', 'STRUCTURAL_MATCH'], free_threading_status: 'UNKNOWN', package_or_binary: 'ast-grep',
      notes: ['Rust core; Python interface uses PyO3 and Node interface uses N-API.', 'Use for structural query/rewrite nomination; Atlas host still owns mutation.'],
    }),
    capability({
      analyzer_id: 'TS_MORPH', analyzer_revision: revisionValue, owner_runtime: 'TYPESCRIPT_HOST',
      implementation_languages: ['TYPESCRIPT'], invocation_surfaces: ['TYPESCRIPT_API'],
      observation_kinds: ['AST_FACT', 'SYMBOL_FACT', 'TYPE_FACT'], free_threading_status: 'NOT_APPLICABLE', package_or_binary: 'ts-morph',
      notes: ['Wraps the TypeScript compiler API and language service; keep it in the Node/TypeScript host rather than tunneling through Python.'],
    }),
    capability({
      analyzer_id: 'LANGEXTRACT', analyzer_revision: revisionValue, owner_runtime: 'IPYTHON_KERNEL',
      implementation_languages: ['PYTHON'], invocation_surfaces: ['PYTHON_IMPORT'],
      observation_kinds: ['GROUNDED_EXTRACTION'], free_threading_status: 'UNKNOWN', package_or_binary: 'langextract',
      notes: ['Model-backed extraction must remain source-grounded and non-canonical.', 'Free-threaded readiness depends on its dependency stack, not requires-python metadata alone.'],
    }),
    capability({
      analyzer_id: 'STANZA_POS', analyzer_revision: revisionValue, owner_runtime: 'IPYTHON_KERNEL',
      implementation_languages: ['PYTHON'], invocation_surfaces: ['PYTHON_IMPORT'],
      observation_kinds: ['LEXICAL_POS'], free_threading_status: 'PYTHON_3_14T_TARGET', package_or_binary: 'stanza',
      notes: ['Use noun/verb/POS/lemma observations for natural-language comments/docs, not as canonical code facts.', 'Stanza is PyTorch-backed, so no-GIL deployment follows the verified PyTorch wheel/runtime matrix.'],
    }),
    capability({
      analyzer_id: 'CODEQL', analyzer_revision: revisionValue, owner_runtime: 'EXTERNAL_PROCESS',
      implementation_languages: ['QL'], invocation_surfaces: ['CLI_PROCESS'],
      observation_kinds: ['DATAFLOW_PATH', 'TYPE_FACT'], free_threading_status: 'OUT_OF_PROCESS', package_or_binary: 'codeql',
      notes: ['CodeQL data-flow graph is a distinct semantic representation from the source AST.', 'Run bounded databases/queries out of process and attach source locations to evidence.'],
    }),
    capability({
      analyzer_id: 'SOUFFLE', analyzer_revision: revisionValue, owner_runtime: 'EXTERNAL_PROCESS',
      implementation_languages: ['DATALOG', 'C_CPP'], invocation_surfaces: ['CLI_PROCESS', 'CPP_API'],
      observation_kinds: ['RULE_PROOF'], free_threading_status: 'OUT_OF_PROCESS', package_or_binary: 'souffle',
      notes: ['Datalog relations derive deterministic rule conclusions; provenance proof trees explain tuples.', 'Generated C++ can later be embedded behind a native adapter after rule semantics are frozen.'],
    }),
    capability({
      analyzer_id: 'PYTORCH', analyzer_revision: revisionValue, owner_runtime: 'IPYTHON_KERNEL',
      implementation_languages: ['PYTHON', 'C_CPP', 'CUDA'], invocation_surfaces: ['PYTHON_IMPORT', 'LIBTORCH_STABLE_ABI'],
      observation_kinds: ['MODEL_SCORE'], free_threading_status: 'PYTHON_3_14T_TARGET', package_or_binary: 'torch',
      notes: ['Python frontend delegates expensive tensor operations to the C++/CUDA backend.', 'Prefer LibTorch Stable ABI for production custom operators where its supported surface is sufficient.'],
    }),
    capability({
      analyzer_id: 'CUVS', analyzer_revision: revisionValue, owner_runtime: 'IPYTHON_KERNEL',
      implementation_languages: ['C_CPP', 'CUDA'], invocation_surfaces: ['PYTHON_IMPORT', 'C_ABI', 'CPP_API'],
      observation_kinds: ['EXACT_VECTOR_DISTANCE', 'MODEL_SCORE'], free_threading_status: 'UNKNOWN', package_or_binary: 'cuvs',
      notes: ['Brute force is the vector-space oracle; ANN executors remain candidate nomination/challengers.'],
    }),
    capability({
      analyzer_id: 'CUGRAPH', analyzer_revision: revisionValue, owner_runtime: 'IPYTHON_KERNEL',
      implementation_languages: ['C_CPP', 'CUDA'], invocation_surfaces: ['PYTHON_IMPORT', 'C_ABI'],
      observation_kinds: ['GRAPH_MEASUREMENT'], free_threading_status: 'UNKNOWN', package_or_binary: 'cugraph',
      notes: ['PageRank/PPR/HITS/community/path algorithms are graph measurements, not source relationship facts.'],
    }),
    capability({
      analyzer_id: 'CUSPARSE', analyzer_revision: revisionValue, owner_runtime: 'NATIVE_LIBRARY',
      implementation_languages: ['C_CPP', 'CUDA'], invocation_surfaces: ['C_ABI', 'CPP_API'],
      observation_kinds: ['SPARSE_PROPAGATION'], free_threading_status: 'NOT_APPLICABLE', package_or_binary: 'cuSPARSE',
      notes: ['Use CSR/COO incidence projections for N-ary propagation while PostgreSQL remains canonical relationship authority.'],
    }),
  ];
}

export function buildAtlasKernelSession(input: z.input<typeof atlasKernelSessionSchema>): AtlasKernelSessionV1 {
  return atlasKernelSessionSchema.parse(input);
}

export function buildAtlasKernelHostRequest(input: z.input<typeof atlasKernelHostRequestSchema>): AtlasKernelHostRequestV1 {
  return atlasKernelHostRequestSchema.parse(input);
}

export function checksumAtlasKernelRequest(input: AtlasKernelHostRequestV1): string {
  const stable = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  };
  return createHash('sha256').update(stable(input), 'utf8').digest('hex');
}

export function describeAtlasKernelSession(): string {
  return [
    'TypeScript owns session, workflow, credentials, canonical identities, mutation authorization and materialization; the persistent IPython kernel is a composable compute/control environment.',
    'Kernel requests may retrieve, analyze, verify, compile prefills, propose patches and request subtask admission, but never apply canonical mutations directly.',
    'Tree-sitter Chunker/LangExtract/Stanza/PyTorch/RAPIDS may run in Python; ts-morph stays in the TypeScript host; CodeQL and Souffle are isolated process analyzers; native CUDA libraries remain implementation backends.',
    'Free-threaded Python is capability-probed per dependency: a package version declaration is not proof that its native extension stack is no-GIL safe.',
  ].join(' ');
}
