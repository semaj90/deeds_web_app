/**
 * LangGraph run types and Mastra agent contracts.
 *
 * Responsibility split:
 *   AtlasRunState   — LangGraph graph state. Holds IDs, not content.
 *                     Large outputs live in Postgres artifacts; their IDs
 *                     go here. This keeps checkpoint snapshots small.
 *
 *   AgentDefinition — Contract for a Mastra reasoning worker invoked as a
 *                     LangGraph node. LangGraph owns the lifecycle;
 *                     Mastra owns the tool-choosing reasoning step.
 *
 * Do not put giant agent transcripts, full query results, or embedding arrays
 * in AtlasRunState — store them in artifacts and reference by ID.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// AtlasRunState — LangGraph graph state
// ---------------------------------------------------------------------------

export const atlasRunStatusSchema = z.enum([
  'received',
  'planning',
  'executing',
  'validating',
  'blocked',
  'completed',
  'failed',
]);

export type AtlasRunStatus = z.infer<typeof atlasRunStatusSchema>;

export interface AtlasRunState {
  /** Postgres agent_runs.id — primary key for recovery */
  runId: string;

  /** Propagated from the originating HTTP/tRPC request */
  requestId: string;

  /** Raw user query text */
  query: string;

  status: AtlasRunStatus;

  // ── Plan references ────────────────────────────────────────────────────

  /** Postgres workflow_plans.id — created by the planning node */
  planId?: string;

  /** ID of the currently executing LangGraph node */
  currentNodeId?: string;

  // ── Task / artifact / evidence IDs ────────────────────────────────────

  /** Postgres workflow_tasks.id[] — created before RabbitMQ publish */
  taskIds: string[];

  /** Postgres artifacts.id[] — written by workers, read by validators */
  artifactIds: string[];

  /** Postgres evidence_refs.id[] — context fed to reasoning nodes */
  evidenceIds: string[];

  // ── Flow control ───────────────────────────────────────────────────────

  /** How many more automatic retries are allowed at the current node */
  retryBudget: number;

  /** If true, the graph pauses and waits for a human approval event */
  approvalRequired: boolean;

  /** Structured error code from the last failed node — used for routing */
  lastErrorCode?: string;

  // ── Trace ──────────────────────────────────────────────────────────────

  traceId?: string;

  /** ISO-8601 timestamps for latency tracking */
  startedAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// AgentDefinition — Mastra reasoning worker contract
// ---------------------------------------------------------------------------

/**
 * Each Mastra agent has a fixed identity, tool allowlist, and output contract.
 * LangGraph invokes Mastra agents as nodes — it does not allow Mastra to drive
 * graph transitions. The agent produces a structured result; LangGraph decides
 * what happens next.
 *
 * Named agent roles:
 *   query-analysis-agent     — classify intent, extract entities
 *   retrieval-planner-agent  — choose lanes and parameters
 *   code-investigator-agent  — read-only codebase analysis
 *   patch-proposer-agent     — suggest code changes (no writes)
 *   test-analysis-agent      — interpret test results and suggest fixes
 *   evidence-review-agent    — assess candidate quality and relevance
 */
export const agentDefinitionSchema = z.object({
  agentId: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),

  /** Which llama-server / Ollama model policy this agent uses */
  modelPolicy: z.enum([
    'gemma4-legal-iq4xs',     // canonical reasoning — llama-server :8090
    'gemma4-rotorquant',      // Ollama fallback
    'gemma4-fast',            // short-context fast tasks
  ]),

  /** MCP tool names this agent may call — enforced by the Mastra runtime */
  allowedTools: z.array(z.string()),

  /** Hard cap on LLM iterations before the agent is forced to return */
  maxIterations: z.number().int().positive().max(20),

  /** Wall-clock timeout for the entire agent invocation */
  timeoutMs: z.number().int().positive().max(300_000),

  /**
   * Evidence artifact types this agent REQUIRES before it can run.
   * LangGraph validates these are present in AtlasRunState.evidenceIds
   * before invoking the agent.
   */
  requiredEvidence: z.array(z.string()),

  /**
   * Zod schema ID (registered in a schema registry) for the structured
   * output the agent must produce. LangGraph validates before transition.
   */
  outputSchemaId: z.string().min(1),
});

export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;

// ---------------------------------------------------------------------------
// Canonical agent registry
// ---------------------------------------------------------------------------

export const AGENT_DEFINITIONS: Record<string, AgentDefinition> = {
  'query-analysis-agent': {
    agentId: 'query-analysis-agent',
    version: '1.0.0',
    modelPolicy: 'gemma4-legal-iq4xs',
    allowedTools: ['trace.kag_search', 'context.build_kv_packet'],
    maxIterations: 3,
    timeoutMs: 30_000,
    requiredEvidence: [],
    outputSchemaId: 'query-analysis-result.v1',
  },
  'retrieval-planner-agent': {
    agentId: 'retrieval-planner-agent',
    version: '1.0.0',
    modelPolicy: 'gemma4-legal-iq4xs',
    allowedTools: ['trace.kag_search', 'topology.search_near', 'clusters.get_summary_lenses'],
    maxIterations: 5,
    timeoutMs: 60_000,
    requiredEvidence: ['query-analysis-result.v1'],
    outputSchemaId: 'retrieval-plan.v1',
  },
  'code-investigator-agent': {
    agentId: 'code-investigator-agent',
    version: '1.0.0',
    modelPolicy: 'gemma4-legal-iq4xs',
    allowedTools: ['trace.kag_search', 'graph.expand_neighborhood', 'graph.shortest_path'],
    maxIterations: 10,
    timeoutMs: 120_000,
    requiredEvidence: [],
    outputSchemaId: 'code-investigation-result.v1',
  },
  'patch-proposer-agent': {
    agentId: 'patch-proposer-agent',
    version: '1.0.0',
    modelPolicy: 'gemma4-legal-iq4xs',
    allowedTools: ['trace.kag_search', 'context.build_kv_packet'],
    maxIterations: 5,
    timeoutMs: 90_000,
    requiredEvidence: ['code-investigation-result.v1'],
    outputSchemaId: 'patch-proposal.v1',
  },
  'test-analysis-agent': {
    agentId: 'test-analysis-agent',
    version: '1.0.0',
    modelPolicy: 'gemma4-fast',
    allowedTools: ['trace.kag_search'],
    maxIterations: 3,
    timeoutMs: 30_000,
    requiredEvidence: [],
    outputSchemaId: 'test-analysis-result.v1',
  },
  'evidence-review-agent': {
    agentId: 'evidence-review-agent',
    version: '1.0.0',
    modelPolicy: 'gemma4-legal-iq4xs',
    allowedTools: ['trace.kag_search', 'trace.explain_retrieval'],
    maxIterations: 5,
    timeoutMs: 60_000,
    requiredEvidence: [],
    outputSchemaId: 'evidence-review-result.v1',
  },
} as const;
