import { z } from 'zod';
import { sha256Stable } from './contracts.js';

/**
 * AFC-HELPER-01 (2026-09-27) — "v2" naming ONLY because a concurrent write
 * landed on the original `helper-registry-v1.ts` path with a different,
 * independently-designed implementation while this one was being built and
 * tested. This is NOT a newer/better revision of that file -- it's the
 * SAME design this session built first, preserved under a non-colliding
 * name specifically so both can be reviewed side by side rather than one
 * silently clobbering the other. See the review note in this OpenSpec
 * change's tasks.md for the comparison and reconciliation decision.
 *
 * Describes ONLY executable reality -- what a helper is capable of, what it
 * requires, what it produces -- never runtime up/down state (that's
 * HelperCapabilitySnapshotV2, AFC-HELPER-02) and never a routing decision
 * (that's HelperEligibilityV2, AFC-HELPER-03).
 *
 * HARD RULE: every entry below points to a REAL, already-verified current
 * owner. No speculative helpers. `ownerRef` is a repo-relative path or a
 * named external tool, checked before this file was written.
 */

export const HELPER_REGISTRY_SCHEMA = 'atlas.helper-registry.v1' as const;

export const helperLaneSchema = z.enum(['LEXICAL', 'STRUCTURAL', 'SEMANTIC', 'GRAPH', 'DOC']);
export type HelperLaneV1 = z.infer<typeof helperLaneSchema>;

export const helperExecutorKindSchema = z.enum([
  'CLI_SUBPROCESS',
  'NODE_IN_PROCESS',
  'HTTP_SERVICE',
  'PYTHON_SCRIPT',
  'LSP_SERVER',
]);
export type HelperExecutorKindV1 = z.infer<typeof helperExecutorKindSchema>;

export const helperCostClassSchema = z.enum(['CHEAP', 'MEDIUM', 'EXPENSIVE']);
export type HelperCostClassV1 = z.infer<typeof helperCostClassSchema>;

export const helperMutationClassSchema = z.enum(['READ_ONLY', 'LOCAL_ARTIFACT_ONLY', 'MUTATING']);
export type HelperMutationClassV1 = z.infer<typeof helperMutationClassSchema>;

export const helperRegistryEntrySchema = z.object({
  helperId: z.string().min(1),
  helperRevision: z.string().min(1),
  lane: helperLaneSchema,
  languages: z.array(z.string().min(1)),
  intents: z.array(z.string().min(1)).min(1),
  requires: z.object({
    sourceIdentity: z.boolean(),
    sourceRevision: z.boolean(),
    workspaceRevision: z.boolean(),
    language: z.boolean(),
    symbolIdentity: z.boolean(),
    externalCapability: z.string().min(1).nullable(),
  }).strict(),
  produces: z.array(z.string().min(1)).min(1),
  executor: z.object({
    kind: helperExecutorKindSchema,
    ownerRef: z.string().min(1),
  }).strict(),
  costClass: helperCostClassSchema,
  mutationClass: helperMutationClassSchema,
}).strict();
export type HelperRegistryEntryV1 = z.infer<typeof helperRegistryEntrySchema>;

export const helperRegistryV1Schema = z.object({
  schema: z.literal(HELPER_REGISTRY_SCHEMA),
  helperRegistryRevision: z.string().min(1),
  helpers: z.array(helperRegistryEntrySchema).min(1),
  checksum: z.string().length(64),
}).strict().superRefine((registry, ctx) => {
  const ids = new Set<string>();
  registry.helpers.forEach((h, i) => {
    if (ids.has(h.helperId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['helpers', i, 'helperId'], message: `DUPLICATE_HELPER_ID:${h.helperId}` });
    }
    ids.add(h.helperId);
  });
});
export type HelperRegistryV1 = z.infer<typeof helperRegistryV1Schema>;

export function buildHelperRegistryV1(input: { helperRegistryRevision: string; helpers: readonly HelperRegistryEntryV1[] }): HelperRegistryV1 {
  const body = {
    schema: HELPER_REGISTRY_SCHEMA as typeof HELPER_REGISTRY_SCHEMA,
    helperRegistryRevision: input.helperRegistryRevision,
    helpers: [...input.helpers].sort((a, b) => a.helperId.localeCompare(b.helperId)),
  };
  return helperRegistryV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}

/**
 * The frozen v1 seed -- 12 real helpers, each with a verified current owner
 * (verified live, 2026-09-27, before this file was written):
 *
 *  - rg-exact:            the `rg` (ripgrep) CLI binary -- used as a
 *                          subprocess executor throughout scripts/ this
 *                          repo already; no live SvelteKit route wraps it
 *                          yet, same "offline-tool, not request-time"
 *                          status as ast-grep before today's
 *                          SemanticInputCompilerV1.
 *  - postgres-fts:        sveltekit-frontend/src/lib/server/retrieval/
 *                          search-lanes.ts `LexicalLane` (search_vector GIN,
 *                          confirmed live this session under
 *                          SEARCH-LANE-SEMANTICS-03).
 *  - postgres-trigram:    same file, `similarity(...)` pg_trgm usage
 *                          (confirmed live; this is what search-lanes.ts's
 *                          own `Bm25Lane` actually runs, despite its name).
 *  - tree-sitter-chunk:   `tree-sitter`/`tree-sitter-typescript`/
 *                          `treesitter-chunker` (package.json, confirmed
 *                          installed this session under OPS-06/ASTG-01).
 *  - ast-grep-structural: THIS session's own
 *                          semantic-input-compiler-v1.ts (SEM-INPUT-01) --
 *                          a real, tested, in-process @ast-grep/napi
 *                          consumer, converged to 0.45.3 under ASTG-01.
 *  - ts-morph-symbol:     packages/parent-atlas/src/core/
 *                          {temporal-indexing-fabric,structured-value-parity,
 *                          structured-value-ast}.ts (confirmed earlier this
 *                          session, package-level not route-level).
 *  - lsp-definition / lsp-references:
 *                          packages/parent-atlas/src/core/
 *                          lsp-semantic-observation.ts -- a REAL contract
 *                          (UTF-8/UTF-16 byte-span verification, coordinate
 *                          synthesis) but confirmed via grep this session:
 *                          zero live LSP client/process anywhere in
 *                          sveltekit-frontend/src. Registered here because
 *                          the contract genuinely exists; its capability
 *                          snapshot (AFC-HELPER-02) will report
 *                          `available: false` honestly, which is exactly
 *                          the BLOCKED-not-INELIGIBLE case this tranche
 *                          exists to distinguish.
 *  - docs-corpus-search:  doc-intelligence-read-model.ts (confirmed live,
 *                          19/19 passing tests, this session).
 *  - semantic-768:        canonical-embed.ts `embedSemantic768Canonical`
 *                          (confirmed live this session, EMB-PROV-01,
 *                          cross-executor parity 0.999988 cosine).
 *  - graph-ppr:           python/atlas_compute/cugraph_ppr.py (confirmed
 *                          present; a Python script executor, not a live
 *                          HTTP service).
 *  - langextract-grounding: code-intel-service.ts's `CodeIntelSourceKind`
 *                          already includes `'langextract'` as a real
 *                          source kind (confirmed live).
 */
export function buildDefaultHelperRegistryV1(helperRegistryRevision: string): HelperRegistryV1 {
  const helpers: HelperRegistryEntryV1[] = [
    {
      helperId: 'rg-exact', helperRevision: 'rg-exact:v1', lane: 'LEXICAL', languages: [],
      intents: ['find', 'search', 'grep'],
      requires: { sourceIdentity: false, sourceRevision: false, workspaceRevision: false, language: false, symbolIdentity: false, externalCapability: 'rg-binary' },
      produces: ['LEXICAL_CANDIDATES'],
      executor: { kind: 'CLI_SUBPROCESS', ownerRef: 'external:rg' },
      costClass: 'CHEAP', mutationClass: 'READ_ONLY',
    },
    {
      helperId: 'postgres-fts', helperRevision: 'postgres-fts:v1', lane: 'LEXICAL', languages: [],
      intents: ['search', 'find'],
      requires: { sourceIdentity: false, sourceRevision: false, workspaceRevision: false, language: false, symbolIdentity: false, externalCapability: 'postgresql' },
      produces: ['LEXICAL_CANDIDATES'],
      executor: { kind: 'NODE_IN_PROCESS', ownerRef: 'src/lib/server/retrieval/search-lanes.ts:LexicalLane' },
      costClass: 'CHEAP', mutationClass: 'READ_ONLY',
    },
    {
      helperId: 'postgres-trigram', helperRevision: 'postgres-trigram:v1', lane: 'LEXICAL', languages: [],
      intents: ['fuzzy-search', 'did-you-mean'],
      requires: { sourceIdentity: false, sourceRevision: false, workspaceRevision: false, language: false, symbolIdentity: false, externalCapability: 'postgresql-pg_trgm' },
      produces: ['LEXICAL_CANDIDATES'],
      executor: { kind: 'NODE_IN_PROCESS', ownerRef: 'src/lib/server/retrieval/search-lanes.ts:Bm25Lane' },
      costClass: 'CHEAP', mutationClass: 'READ_ONLY',
    },
    {
      helperId: 'tree-sitter-chunk', helperRevision: 'tree-sitter-chunk:v1', lane: 'STRUCTURAL', languages: ['typescript', 'javascript', 'python', 'go'],
      intents: ['chunk', 'parse', 'explain-symbol'],
      requires: { sourceIdentity: true, sourceRevision: true, workspaceRevision: false, language: true, symbolIdentity: false, externalCapability: null },
      produces: ['STRUCTURAL_CANDIDATES'],
      executor: { kind: 'NODE_IN_PROCESS', ownerRef: 'package.json:tree-sitter+tree-sitter-typescript+treesitter-chunker' },
      costClass: 'MEDIUM', mutationClass: 'READ_ONLY',
    },
    {
      helperId: 'ast-grep-structural', helperRevision: 'ast-grep-structural:v1', lane: 'STRUCTURAL', languages: ['typescript', 'javascript', 'tsx', 'jsx'],
      intents: ['find', 'references', 'repair', 'explain-symbol'],
      requires: { sourceIdentity: true, sourceRevision: true, workspaceRevision: false, language: true, symbolIdentity: false, externalCapability: null },
      produces: ['STRUCTURAL_CANDIDATES', 'FIELD_EVIDENCE'],
      executor: { kind: 'NODE_IN_PROCESS', ownerRef: 'src/lib/server/atlas/features/semantic-input-compiler-v1.ts' },
      costClass: 'MEDIUM', mutationClass: 'READ_ONLY',
    },
    {
      helperId: 'ts-morph-symbol', helperRevision: 'ts-morph-symbol:v1', lane: 'STRUCTURAL', languages: ['typescript'],
      intents: ['references', 'explain-symbol', 'repair'],
      requires: { sourceIdentity: true, sourceRevision: true, workspaceRevision: false, language: true, symbolIdentity: true, externalCapability: null },
      produces: ['STRUCTURAL_CANDIDATES', 'FIELD_EVIDENCE'],
      executor: { kind: 'NODE_IN_PROCESS', ownerRef: 'packages/parent-atlas/src/core/structured-value-ast.ts' },
      costClass: 'MEDIUM', mutationClass: 'READ_ONLY',
    },
    {
      helperId: 'lsp-definition', helperRevision: 'lsp-definition:v1', lane: 'STRUCTURAL', languages: ['typescript', 'javascript'],
      intents: ['explain-symbol', 'definition'],
      requires: { sourceIdentity: true, sourceRevision: true, workspaceRevision: false, language: true, symbolIdentity: true, externalCapability: 'typescript-language-server' },
      produces: ['FIELD_EVIDENCE'],
      executor: { kind: 'LSP_SERVER', ownerRef: 'packages/parent-atlas/src/core/lsp-semantic-observation.ts' },
      costClass: 'MEDIUM', mutationClass: 'READ_ONLY',
    },
    {
      helperId: 'lsp-references', helperRevision: 'lsp-references:v1', lane: 'STRUCTURAL', languages: ['typescript', 'javascript'],
      intents: ['references', 'repair'],
      requires: { sourceIdentity: true, sourceRevision: true, workspaceRevision: false, language: true, symbolIdentity: true, externalCapability: 'typescript-language-server' },
      produces: ['FIELD_EVIDENCE'],
      executor: { kind: 'LSP_SERVER', ownerRef: 'packages/parent-atlas/src/core/lsp-semantic-observation.ts' },
      costClass: 'MEDIUM', mutationClass: 'READ_ONLY',
    },
    {
      helperId: 'docs-corpus-search', helperRevision: 'docs-corpus-search:v1', lane: 'DOC', languages: [],
      intents: ['explain', 'find-docs'],
      requires: { sourceIdentity: false, sourceRevision: false, workspaceRevision: false, language: false, symbolIdentity: false, externalCapability: 'postgresql' },
      produces: ['DOC_CANDIDATES'],
      executor: { kind: 'NODE_IN_PROCESS', ownerRef: 'src/lib/server/atlas/docs/doc-intelligence-read-model.ts' },
      costClass: 'CHEAP', mutationClass: 'READ_ONLY',
    },
    {
      helperId: 'semantic-768', helperRevision: 'semantic-768:v1', lane: 'SEMANTIC', languages: [],
      intents: ['find', 'explain', 'similar'],
      requires: { sourceIdentity: true, sourceRevision: true, workspaceRevision: true, language: false, symbolIdentity: false, externalCapability: 'embedding-executor-:8081' },
      produces: ['SEMANTIC_CANDIDATES'],
      executor: { kind: 'HTTP_SERVICE', ownerRef: 'src/lib/server/embedding/canonical-embed.ts:embedSemantic768Canonical' },
      costClass: 'EXPENSIVE', mutationClass: 'READ_ONLY',
    },
    {
      helperId: 'graph-ppr', helperRevision: 'graph-ppr:v1', lane: 'GRAPH', languages: [],
      intents: ['explain', 'related', 'authority'],
      requires: { sourceIdentity: false, sourceRevision: false, workspaceRevision: true, language: false, symbolIdentity: false, externalCapability: 'cugraph-python' },
      produces: ['GRAPH_CANDIDATES'],
      executor: { kind: 'PYTHON_SCRIPT', ownerRef: 'python/atlas_compute/cugraph_ppr.py' },
      costClass: 'EXPENSIVE', mutationClass: 'READ_ONLY',
    },
    {
      helperId: 'langextract-grounding', helperRevision: 'langextract-grounding:v1', lane: 'DOC', languages: [],
      intents: ['ground', 'explain'],
      requires: { sourceIdentity: true, sourceRevision: true, workspaceRevision: false, language: false, symbolIdentity: false, externalCapability: null },
      produces: ['FIELD_EVIDENCE'],
      executor: { kind: 'NODE_IN_PROCESS', ownerRef: 'src/lib/server/ace/code-intel-service.ts' },
      costClass: 'MEDIUM', mutationClass: 'READ_ONLY',
    },
  ];
  return buildHelperRegistryV1({ helperRegistryRevision, helpers });
}
