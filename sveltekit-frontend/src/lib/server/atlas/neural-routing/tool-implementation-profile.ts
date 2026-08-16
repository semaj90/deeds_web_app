import { z } from 'zod';

export const ToolImplementationStatusSchema = z.enum([
  'PROVEN',
  'IMPLEMENTED',
  'PARTIAL',
  'STUB',
  'MOCK',
  'QUARANTINED',
  'UNAVAILABLE',
]);
export type ToolImplementationStatus = z.infer<typeof ToolImplementationStatusSchema>;

export const ToolModeImplementationProfileV1Schema = z.object({
  mode: z.string().min(1),
  status: ToolImplementationStatusSchema,
  routingEligible: z.boolean(),
  backend: z.string().min(1),
  proofStatus: z.enum(['PROVEN', 'PARITY_PENDING', 'UNWIRED', 'BLOCKED']),
  reasonCodes: z.array(z.string().min(1)),
}).strict();
export type ToolModeImplementationProfileV1 = z.infer<typeof ToolModeImplementationProfileV1Schema>;

export const ToolImplementationProfileV1Schema = z.object({
  schemaVersion: z.literal('atlas.tool-implementation-profile.v1'),
  toolId: z.string().min(1),
  implementationStatus: ToolImplementationStatusSchema,
  routingEligible: z.boolean(),
  supportedModes: z.array(ToolModeImplementationProfileV1Schema),
  requiredPermissions: z.array(z.string().min(1)),
  preconditions: z.array(z.string().min(1)),
  backend: z.string().min(1),
  backendRevision: z.string().min(1),
  humanApprovalRequired: z.boolean(),
  fsmAliases: z.array(z.string().min(1)),
  reasonCodes: z.array(z.string().min(1)),
}).strict();
export type ToolImplementationProfileV1 = z.infer<typeof ToolImplementationProfileV1Schema>;

function profile(input: Omit<ToolImplementationProfileV1, 'schemaVersion'>): ToolImplementationProfileV1 {
  return ToolImplementationProfileV1Schema.parse({ schemaVersion: 'atlas.tool-implementation-profile.v1', ...input });
}

/** Software capability facts only. Never populate these from learned metrics. */
export const ATLAS_TOOL_IMPLEMENTATION_PROFILES: Readonly<Record<string, ToolImplementationProfileV1>> = Object.freeze({
  'atlas.search': profile({
    toolId: 'atlas.search',
    implementationStatus: 'STUB',
    routingEligible: false,
    supportedModes: [
      { mode: 'default', status: 'STUB', routingEligible: false, backend: 'unwired', proofStatus: 'BLOCKED', reasonCodes: ['EMPTY_SUCCESS_STUB'] },
    ],
    requiredPermissions: ['search:read'],
    preconditions: ['query_non_empty'],
    backend: 'unwired',
    backendRevision: 'none',
    humanApprovalRequired: false,
    fsmAliases: ['atlas.retrieve', 'atlas.embedding_neighbors', 'atlas.discover', 'atlas.search'],
    reasonCodes: ['SEARCH_RUNTIME_OWNER_NOT_WIRED', 'FAIL_CLOSED_FOR_ROUTING'],
  }),
  'atlas.graph.expand': profile({
    toolId: 'atlas.graph.expand',
    implementationStatus: 'PARTIAL',
    routingEligible: true,
    supportedModes: [
      { mode: 'bfs', status: 'IMPLEMENTED', routingEligible: true, backend: 'neo4j', proofStatus: 'PARITY_PENDING', reasonCodes: ['BOUNDED_NEO4J_BFS'] },
      { mode: 'reverse_bfs', status: 'IMPLEMENTED', routingEligible: true, backend: 'neo4j', proofStatus: 'PARITY_PENDING', reasonCodes: ['BOUNDED_NEO4J_REVERSE_BFS'] },
      { mode: 'sssp', status: 'UNAVAILABLE', routingEligible: false, backend: 'neo4j|cugraph', proofStatus: 'UNWIRED', reasonCodes: ['SSSP_EXECUTOR_NOT_WIRED'] },
      { mode: 'yen', status: 'UNAVAILABLE', routingEligible: false, backend: 'neo4j', proofStatus: 'UNWIRED', reasonCodes: ['YEN_EXECUTOR_NOT_WIRED'] },
      { mode: 'personalized_pagerank', status: 'UNAVAILABLE', routingEligible: false, backend: 'neo4j|cugraph', proofStatus: 'UNWIRED', reasonCodes: ['PPR_EXECUTOR_NOT_WIRED'] },
      { mode: 'leiden_filtered_bfs', status: 'UNAVAILABLE', routingEligible: false, backend: 'neo4j', proofStatus: 'BLOCKED', reasonCodes: ['PROMOTED_COMMUNITY_FILTER_NOT_WIRED'] },
      { mode: 'neighbor_sampling', status: 'UNAVAILABLE', routingEligible: false, backend: 'cugraph', proofStatus: 'UNWIRED', reasonCodes: ['GPU_NEIGHBOR_SAMPLER_NOT_WIRED'] },
      { mode: 'kcore', status: 'UNAVAILABLE', routingEligible: false, backend: 'cugraph|networkx', proofStatus: 'UNWIRED', reasonCodes: ['KCORE_EXECUTOR_NOT_WIRED'] },
      { mode: 'jaccard', status: 'UNAVAILABLE', routingEligible: false, backend: 'cugraph|networkx', proofStatus: 'UNWIRED', reasonCodes: ['JACCARD_EXECUTOR_NOT_WIRED'] },
      { mode: 'k_best_viterbi', status: 'IMPLEMENTED', routingEligible: false, backend: 'temporal_dp', proofStatus: 'PARITY_PENDING', reasonCodes: ['TEMPORAL_LINEAGE_NOT_GRAPH_TRAVERSAL'] },
    ],
    requiredPermissions: ['graph:read'],
    preconditions: ['canonical_seed_resolved', 'graph_revision_known'],
    backend: 'atlas/graph/graph-expansion-adapter',
    backendRevision: 'graph-expansion-adapter.v1',
    humanApprovalRequired: false,
    fsmAliases: ['atlas.graph_traversal', 'atlas.graph.expand'],
    reasonCodes: ['MODE_SPECIFIC_ELIGIBILITY_REQUIRED', 'BFS_PARITY_PENDING'],
  }),
  'atlas.graph.pagerank': profile({
    toolId: 'atlas.graph.pagerank',
    implementationStatus: 'IMPLEMENTED',
    routingEligible: true,
    supportedModes: [
      { mode: 'global', status: 'IMPLEMENTED', routingEligible: true, backend: 'postgres', proofStatus: 'PARITY_PENDING', reasonCodes: ['READS_PERSISTED_PAGERANK_SCORE'] },
    ],
    requiredPermissions: ['graph:read'],
    preconditions: [],
    backend: 'postgres:atlas_packets.pagerank_score',
    backendRevision: 'atlas-tool-registry.pagerank.v1',
    humanApprovalRequired: false,
    fsmAliases: ['atlas.graph.pagerank'],
    reasonCodes: ['NO_UNIFORM_PAGERANK_FALLBACK'],
  }),
  'atlas.patch.propose': profile({
    toolId: 'atlas.patch.propose',
    implementationStatus: 'STUB',
    routingEligible: false,
    supportedModes: [
      { mode: 'default', status: 'STUB', routingEligible: false, backend: 'unwired', proofStatus: 'BLOCKED', reasonCodes: ['NO_REAL_DIFF_PRODUCER_RESOLVED'] },
    ],
    requiredPermissions: ['code:propose'],
    preconditions: ['source_revision_known', 'evidence_present'],
    backend: 'unwired',
    backendRevision: 'none',
    humanApprovalRequired: false,
    fsmAliases: ['atlas.patch.propose'],
    reasonCodes: ['FAIL_CLOSED_UNTIL_REAL_PATCH_PRODUCER'],
  }),
  'atlas.patch.tournament': profile({
    toolId: 'atlas.patch.tournament',
    implementationStatus: 'IMPLEMENTED',
    routingEligible: true,
    supportedModes: [
      { mode: 'three_candidate_review', status: 'IMPLEMENTED', routingEligible: true, backend: 'agent/patch-tournament', proofStatus: 'PARITY_PENDING', reasonCodes: ['REAL_TOURNAMENT_BUILDER'] },
    ],
    requiredPermissions: ['code:propose'],
    preconditions: ['exactly_three_candidates', 'workspace_revision_known', 'base_branch_known', 'compile_error_present'],
    backend: 'agent/patch-tournament',
    backendRevision: 'patch-tournament.v1',
    humanApprovalRequired: false,
    fsmAliases: ['atlas.patch.tournament'],
    reasonCodes: ['NO_AUTO_APPLY'],
  }),
  'atlas.patch.apply': profile({
    toolId: 'atlas.patch.apply',
    implementationStatus: 'STUB',
    routingEligible: false,
    supportedModes: [
      { mode: 'default', status: 'STUB', routingEligible: false, backend: 'unwired', proofStatus: 'BLOCKED', reasonCodes: ['NO_REAL_SOURCE_MUTATION_OWNER_RESOLVED'] },
    ],
    requiredPermissions: ['code:write'],
    preconditions: ['approved_proposal', 'approval_token_valid', 'base_revision_matches'],
    backend: 'unwired',
    backendRevision: 'none',
    humanApprovalRequired: true,
    fsmAliases: ['atlas.apply_change', 'atlas.patch.apply'],
    reasonCodes: ['FAIL_CLOSED_UNTIL_APPLY_VERIFY_ROLLBACK_OWNER'],
  }),
});

const aliasIndex = new Map<string, string>();
for (const profileValue of Object.values(ATLAS_TOOL_IMPLEMENTATION_PROFILES)) {
  aliasIndex.set(profileValue.toolId, profileValue.toolId);
  for (const alias of profileValue.fsmAliases) aliasIndex.set(alias, profileValue.toolId);
}

export function canonicalizeAtlasToolId(toolId: string): string {
  return aliasIndex.get(toolId) ?? toolId;
}

export function getToolImplementationProfile(toolId: string): ToolImplementationProfileV1 | undefined {
  return ATLAS_TOOL_IMPLEMENTATION_PROFILES[canonicalizeAtlasToolId(toolId)];
}

export function resolveToolModeProfile(profileValue: ToolImplementationProfileV1, mode?: string): ToolModeImplementationProfileV1 | undefined {
  if (!mode) return profileValue.supportedModes.length === 1 ? profileValue.supportedModes[0] : undefined;
  return profileValue.supportedModes.find((candidate) => candidate.mode === mode);
}

export function isImplementationRoutable(input: { profile: ToolImplementationProfileV1; mode?: string }): { eligible: boolean; reasonCodes: string[] } {
  if (!input.profile.routingEligible) {
    return { eligible: false, reasonCodes: [...input.profile.reasonCodes, `IMPLEMENTATION_STATUS:${input.profile.implementationStatus}`] };
  }
  if (!input.mode) return { eligible: true, reasonCodes: [...input.profile.reasonCodes] };
  const modeProfile = resolveToolModeProfile(input.profile, input.mode);
  if (!modeProfile) return { eligible: false, reasonCodes: ['MODE_NOT_DECLARED'] };
  return { eligible: modeProfile.routingEligible, reasonCodes: [...input.profile.reasonCodes, ...modeProfile.reasonCodes, `MODE_STATUS:${modeProfile.status}`] };
}
