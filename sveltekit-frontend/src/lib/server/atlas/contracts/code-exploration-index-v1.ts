import { z } from 'zod';

const nonEmpty = z.string().min(1);

export const CodeExplorationIndexV1Schema = z.object({
  schema: z.literal('atlas.code-exploration-index.v1'),
  version: z.literal(1),
  index: z.object({
    id: z.literal('parent-atlas-code-exploration'),
    owner: z.literal('parent-atlas'),
    role: z.literal('rebuildable_agent_exploration_projection'),
    authority: z.literal('derived'),
    canonical_store: z.literal('postgresql18'),
    principles: z.array(nonEmpty).min(1),
  }),
  source: z.object({
    seed: z.object({ path: nonEmpty, role: z.literal('discovery_seed'), authoritative: z.literal(false) }),
    structural_authority: z.array(nonEmpty).min(2),
  }),
  identity: z.object({
    required: z.array(nonEmpty).min(4),
    promotion_keys: z.array(nonEmpty).min(1),
    coordinates: z.object({ canonical: z.literal('utf8_byte'), fields: z.array(nonEmpty).length(2), line_role: nonEmpty, lsp_role: z.literal('transport_only_utf16') }),
  }),
  providers: z.object({
    tree_sitter: z.object({ role: z.literal('structural_authority') }),
    ast_grep: z.object({ role: z.literal('exact_observation') }),
    regex: z.object({ role: z.literal('discovery_only'), retrieval_admission: z.literal(false) }),
  }),
  admission: z.object({
    require_exact_source_ref: z.literal(true), require_source_revision: z.literal(true), require_workspace_revision: z.literal(true), require_canonical_utf8_span: z.literal(true), require_canonical_join: z.literal(true), reject: z.array(nonEmpty).min(1),
  }),
  retrieval: z.object({
    metadata_only_default: z.literal(true),
    lanes: z.object({
      exact_symbol: z.object({ enabled: z.literal(true) }), structural: z.object({ enabled: z.literal(true) }), lexical: z.object({ enabled: z.literal(true) }),
      semantic: z.object({ enabled: z.literal(false), representation: z.literal('semantic_768'), enable_when: nonEmpty }),
    }),
  }),
  context: z.object({
    default_lod: z.literal('identity'), limits: z.object({ candidates: z.number().int().min(1).max(50), promoted_spans: z.number().int().min(1).max(8), span_bytes: z.number().int().min(256).max(16384), total_source_bytes: z.number().int().min(1024).max(65536) }), full_file: z.object({ enabled_by_default: z.literal(false), explicit_promotion_required: z.literal(true) }),
  }),
}).strict();

export type CodeExplorationIndexV1 = z.infer<typeof CodeExplorationIndexV1Schema>;

