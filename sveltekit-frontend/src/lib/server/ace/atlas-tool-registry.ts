/**
 * Atlas Tool Registry
 *
 * Never dynamically invoke arbitrary model-generated names.
 * Every tool the agent may call must be listed here with:
 *   - Zod-validated input and output schemas
 *   - A permission string checked against the caller's grant set
 *   - An optional humanApproval flag (true = must not auto-execute)
 *   - A typed execute function
 *
 * The tool loop MUST follow:
 *   model produces structured call
 *   → application parses call
 *   → allow-listed tool lookup (this registry)
 *   → Zod validation
 *   → authorization check
 *   → execution
 *   → tool result validation
 *   → append result to model context
 *   → final synthesis
 *
 * Gemma 4 sampling configuration defaults (§7 of audit):
 *   Tool selection:      temperature 0.2, top_p 0.9, top_k 32,  max_tokens 256
 *   Evidence synthesis:  temperature 0.5, top_p 0.9, top_k 48,  max_tokens 2048
 *   Exploration:         temperature 0.8, top_p 0.95,top_k 64,  max_tokens 1536
 */

import { z } from 'zod';

// ─── Schema primitives ────────────────────────────────────────────────────────

const AtlasSearchInputSchema = z.object({
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(100).default(20),
  lane: z.enum(['dense', 'sparse', 'exact', 'ast', 'bm25', 'rg']).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});
export type AtlasSearchInput = z.infer<typeof AtlasSearchInputSchema>;

const AtlasSearchOutputSchema = z.object({
  candidates: z.array(z.object({
    packetKey: z.string(),
    sourceRef: z.string(),
    score: z.number().nullable(),
    rank: z.number().int(),
  })),
  totalMs: z.number(),
});
export type AtlasSearchOutput = z.infer<typeof AtlasSearchOutputSchema>;

// ─────────────────────────────────────────────────────────────────────────────

const GraphExpandInputSchema = z.object({
  packetKey: z.string().min(1),
  maxHops: z.number().int().min(1).max(5).default(2),
  edgeTypes: z.array(z.string()).optional(),
});
export type GraphExpandInput = z.infer<typeof GraphExpandInputSchema>;

const GraphExpandOutputSchema = z.object({
  nodes: z.array(z.object({ id: z.string(), labels: z.array(z.string()) })),
  edges: z.array(z.object({ from: z.string(), to: z.string(), type: z.string() })),
  hops: z.number().int(),
});
export type GraphExpandOutput = z.infer<typeof GraphExpandOutputSchema>;

// ─────────────────────────────────────────────────────────────────────────────

const PatchProposalInputSchema = z.object({
  sourceRef: z.string().min(1),
  description: z.string().min(1).max(4000),
  hypothesisScore: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()),
});
export type PatchProposalInput = z.infer<typeof PatchProposalInputSchema>;

const PatchProposalOutputSchema = z.object({
  proposalId: z.string(),
  diff: z.string(),
  riskScore: z.number(),
  requiresApproval: z.literal(false),
});
export type PatchProposalOutput = z.infer<typeof PatchProposalOutputSchema>;

// ─────────────────────────────────────────────────────────────────────────────

const PatchApplyInputSchema = z.object({
  proposalId: z.string().min(1),
  approvedBy: z.string().min(1),
  approvalToken: z.string().min(1),
});
export type PatchApplyInput = z.infer<typeof PatchApplyInputSchema>;

const PatchApplyOutputSchema = z.object({
  appliedAt: z.string().datetime(),
  commitSha: z.string().optional(),
  testsPassed: z.boolean(),
});
export type PatchApplyOutput = z.infer<typeof PatchApplyOutputSchema>;

// ─────────────────────────────────────────────────────────────────────────────

const PatchTournamentCheckSchema = z.object({
  name: z.string().min(1),
  passed: z.boolean(),
  command: z.string().optional(),
  evidenceRef: z.string().optional(),
});

const PatchTournamentCandidateSchema = z.object({
  candidateId: z.string().min(1),
  branchName: z.string().min(1),
  worktreePath: z.string().min(1),
  patchSummary: z.string().min(1),
  compileError: z.string().min(1),
  touchedFiles: z.array(z.string().min(1)),
  staticChecks: z.array(PatchTournamentCheckSchema),
  focusedTests: z.array(PatchTournamentCheckSchema),
  evidenceRefs: z.array(z.string().min(1)),
  riskSignals: z.array(z.string().min(1)).optional(),
});
export type PatchTournamentCandidate = z.infer<typeof PatchTournamentCandidateSchema>;

const PatchTournamentInputSchema = z.object({
  objective: z.string().min(1).max(4000),
  workspaceId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  baseBranch: z.string().min(1),
  compileError: z.string().min(1),
  candidates: z.tuple([
    PatchTournamentCandidateSchema,
    PatchTournamentCandidateSchema,
    PatchTournamentCandidateSchema,
  ]),
});
export type PatchTournamentInput = z.infer<typeof PatchTournamentInputSchema>;

const PatchTournamentOutputSchema = z.object({
  tournamentId: z.string(),
  objective: z.string(),
  workspaceId: z.string(),
  workspaceRevision: z.string(),
  baseBranch: z.string(),
  compileError: z.string(),
  rankedCandidates: z.array(z.object({
    candidateId: z.string(),
    branchName: z.string(),
    worktreePath: z.string(),
    patchSummary: z.string(),
    compileError: z.string(),
    touchedFiles: z.array(z.string()),
    staticChecks: z.array(PatchTournamentCheckSchema),
    focusedTests: z.array(PatchTournamentCheckSchema),
    evidenceRefs: z.array(z.string()),
    riskSignals: z.array(z.string()).optional(),
    rank: z.number().int().positive(),
    score: z.number(),
    reviewStatus: z.enum(['review_first', 'review_later', 'blocked']),
    rationale: z.string(),
  })),
  acePacket: z.object({
    schemaVersion: z.literal('atlas.ace.patch-tournament.v1'),
    packetId: z.string(),
    objective: z.string(),
    workspaceRevision: z.string(),
    compileErrorDigest: z.string(),
    reviewOrder: z.array(z.object({
      candidateId: z.string(),
      rank: z.number().int().positive(),
      score: z.number(),
      reviewStatus: z.enum(['review_first', 'review_later', 'blocked']),
      rationale: z.string(),
      patchSummary: z.string(),
      worktreePath: z.string(),
      branchName: z.string(),
      evidenceRefs: z.array(z.string()),
    })),
    constraints: z.array(z.string()),
  }),
  kanbanCard: z.object({
    cardId: z.string(),
    title: z.string(),
    status: z.enum(['ready_for_human_review', 'needs_more_evidence']),
    summary: z.string(),
    topCandidateId: z.string().nullable(),
    safeNextCommand: z.string(),
  }),
  noAutoApply: z.literal(true),
  noTraining: z.literal(true),
  safeNextCommand: z.string(),
});
export type PatchTournamentOutput = z.infer<typeof PatchTournamentOutputSchema>;

// ─────────────────────────────────────────────────────────────────────────────

const PageRankInputSchema = z.object({
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});
export type PageRankInput = z.infer<typeof PageRankInputSchema>;

const PageRankOutputSchema = z.object({
  results: z.array(z.object({
    packetKey: z.string(),
    sourceRef: z.string().nullable(),
    pageRankScore: z.number(),
    rank: z.number().int(),
  })),
  total: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
  metadata: z.object({
    source: z.string(),
    snapshotVersion: z.string(),
    handler: z.string(),
  }),
});
export type PageRankOutput = z.infer<typeof PageRankOutputSchema>;

// ─────────────────────────────────────────────────────────────────────────────

export type AtlasToolPermission =
  | 'search:read'
  | 'graph:read'
  | 'code:propose'
  | 'code:write';

/** Caller permission grant (resolved from auth/session) */
export interface PermissionGrant {
  userId: string;
  permissions: Set<AtlasToolPermission>;
}

export interface AtlasToolDefinition<TIn, TOut> {
  inputSchema: z.ZodType<TIn>;
  outputSchema: z.ZodType<TOut>;
  permission: AtlasToolPermission;
  /** When true, execution must not proceed without explicit human approval */
  humanApproval?: true;
  execute: (input: TIn, grant: PermissionGrant) => Promise<TOut>;
}

// ─── Registry (add new tools here; never invoke model-generated names) ────────

// Placeholder execute stubs — replace with real implementations in their
// respective modules. The registry owns the contract; the implementations live
// in the adapter layer.

async function atlasSearch(input: AtlasSearchInput, _grant: PermissionGrant): Promise<AtlasSearchOutput> {
  // Wire to retrieve-candidates.ts / search-runtime.ts
  void input;
  return { candidates: [], totalMs: 0 };
}

async function expandGraph(input: GraphExpandInput, _grant: PermissionGrant): Promise<GraphExpandOutput> {
  // Wire to graph/graph-centrality.ts or ace/graph-expander.ts
  void input;
  return { nodes: [], edges: [], hops: 0 };
}

async function proposePatch(input: PatchProposalInput, _grant: PermissionGrant): Promise<PatchProposalOutput> {
  // Wire to agent/execution-review.ts or error-fixing loop
  void input;
  return { proposalId: crypto.randomUUID(), diff: '', riskScore: 0, requiresApproval: false };
}

async function runPatchTournament(
  input: PatchTournamentInput,
  _grant: PermissionGrant,
): Promise<PatchTournamentOutput> {
  const { buildPatchTournamentPlan } = await import('$lib/server/agent/patch-tournament.js');
  return buildPatchTournamentPlan(input);
}

async function applyPatch(input: PatchApplyInput, _grant: PermissionGrant): Promise<PatchApplyOutput> {
  // Requires humanApproval — authorization layer validates approvalToken
  void input;
  return { appliedAt: new Date().toISOString(), testsPassed: false };
}

async function getPageRank(input: PageRankInput, _grant: PermissionGrant): Promise<PageRankOutput> {
  const { db } = await import('$lib/server/db/client.js');
  const { sql } = await import('drizzle-orm');
  const rows = await db.execute(sql`
    SELECT
      packet_key,
      source_ref,
      COALESCE(pagerank_score, authority_score, 0) AS pagerank_score,
      COUNT(*) OVER() AS total_count
    FROM atlas_packets
    WHERE COALESCE(pagerank_score, authority_score, 0) > 0
    ORDER BY COALESCE(pagerank_score, authority_score, 0) DESC, packet_key ASC
    LIMIT ${input.limit}
    OFFSET ${input.offset}
  `);

  const resultRows = ((rows as { rows?: Array<Record<string, unknown>> }).rows ?? []).map((row, index) => ({
    packetKey: String(row.packet_key ?? ''),
    sourceRef: row.source_ref == null ? null : String(row.source_ref),
    pageRankScore: Number(row.pagerank_score ?? 0),
    rank: input.offset + index + 1,
  }));
  const total = Number(((rows as { rows?: Array<Record<string, unknown>> }).rows ?? [])[0]?.total_count ?? 0);

  return {
    results: resultRows,
    total,
    offset: input.offset,
    limit: input.limit,
    metadata: {
      source: 'postgres:atlas_packets.pagerank_score',
      snapshotVersion: 'atlas_packets-live',
      handler: 'atlas-tool-registry.getPageRank',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export const atlasToolRegistry = {
  'atlas.search': {
    inputSchema: AtlasSearchInputSchema,
    outputSchema: AtlasSearchOutputSchema,
    permission: 'search:read' as AtlasToolPermission,
    execute: atlasSearch,
  } satisfies AtlasToolDefinition<AtlasSearchInput, AtlasSearchOutput>,

  'atlas.graph.expand': {
    inputSchema: GraphExpandInputSchema,
    outputSchema: GraphExpandOutputSchema,
    permission: 'graph:read' as AtlasToolPermission,
    execute: expandGraph,
  } satisfies AtlasToolDefinition<GraphExpandInput, GraphExpandOutput>,

  'atlas.graph.pagerank': {
    inputSchema: PageRankInputSchema,
    outputSchema: PageRankOutputSchema,
    permission: 'graph:read' as AtlasToolPermission,
    execute: getPageRank,
  } satisfies AtlasToolDefinition<PageRankInput, PageRankOutput>,

  'atlas.patch.propose': {
    inputSchema: PatchProposalInputSchema,
    outputSchema: PatchProposalOutputSchema,
    permission: 'code:propose' as AtlasToolPermission,
    execute: proposePatch,
  } satisfies AtlasToolDefinition<PatchProposalInput, PatchProposalOutput>,

  'atlas.patch.tournament': {
    inputSchema: PatchTournamentInputSchema,
    outputSchema: PatchTournamentOutputSchema,
    permission: 'code:propose' as AtlasToolPermission,
    execute: runPatchTournament,
  } satisfies AtlasToolDefinition<PatchTournamentInput, PatchTournamentOutput>,

  'atlas.patch.apply': {
    inputSchema: PatchApplyInputSchema,
    outputSchema: PatchApplyOutputSchema,
    permission: 'code:write' as AtlasToolPermission,
    humanApproval: true,
    execute: applyPatch,
  } satisfies AtlasToolDefinition<PatchApplyInput, PatchApplyOutput>,
} as const;

export type AtlasToolName = keyof typeof atlasToolRegistry;

// ─── Shared execution helper (avoids duplication between invoke variants) ────

async function executeToolUnchecked<N extends AtlasToolName>(
  name: N,
  rawInput: unknown,
  grant: PermissionGrant
): Promise<z.infer<(typeof atlasToolRegistry)[N]['outputSchema']>> {
  const tool = atlasToolRegistry[name];

  if (!grant.permissions.has(tool.permission)) {
    throw new Error(`Permission denied: ${grant.userId} lacks '${tool.permission}' for tool '${name}'`);
  }

  const parsed = tool.inputSchema.parse(rawInput) as Parameters<typeof tool.execute>[0];
  const result = await (tool.execute as (i: unknown, g: PermissionGrant) => Promise<unknown>)(parsed, grant);
  return tool.outputSchema.parse(result) as z.infer<(typeof atlasToolRegistry)[N]['outputSchema']>;
}

/** Look up a tool by name and validate input, checking caller permissions */
export async function invokeTool<N extends AtlasToolName>(
  name: N,
  rawInput: unknown,
  grant: PermissionGrant
): Promise<z.infer<(typeof atlasToolRegistry)[N]['outputSchema']>> {
  const tool = atlasToolRegistry[name];

  // Human approval gate — must be checked before execution
  if ('humanApproval' in tool && tool.humanApproval) {
    throw new Error(`Tool '${name}' requires explicit human approval before execution`);
  }

  const { checkToolAccess } = await import('../auth/tool-authorization.js');
  await checkToolAccess(name, grant);

  return executeToolUnchecked(name, rawInput, grant);
}

/**
 * Invoke a tool that has humanApproval=true, bypassing the auto-guard.
 * Call this ONLY after obtaining a validated approval token from the
 * human-approval subsystem. The token is recorded in the audit trail by
 * the caller; this function verifies permissions but not token validity.
 */
export async function invokeApprovedTool<N extends AtlasToolName>(
  name: N,
  rawInput: unknown,
  grant: PermissionGrant,
  approvalToken: string
): Promise<z.infer<(typeof atlasToolRegistry)[N]['outputSchema']>> {
  if (!approvalToken) {
    throw new Error(`Tool '${name}' requires a non-empty approval token`);
  }
  return executeToolUnchecked(name, rawInput, grant);
}

/** Gemma 4 sampling config presets (§7 of audit) */
export const GEMMA4_SAMPLING = {
  toolSelection: { temperature: 0.2, top_p: 0.9, top_k: 32, max_tokens: 256 },
  evidenceSynthesis: { temperature: 0.5, top_p: 0.9, top_k: 48, max_tokens: 2048 },
  exploration: { temperature: 0.8, top_p: 0.95, top_k: 64, max_tokens: 1536 },
} as const;
