/**
 * Hermes Planner — structured tool-call router / dispatcher brain.
 *
 * Hermes (gemma4-hermes-64k via gateway :8642) handles:
 *   - Choosing which retrieval tools to call
 *   - Returning strict JSON plans (Zod-validated)
 *   - Routing ACE queries to the right store
 *   - Detecting missing pipeline states (HMM gap inference)
 *   - Producing repair plans for broken graph/cluster state
 *   - Validating ACE context packets before Gemma4 sees them
 *
 * Gemma4/TurboQuant handles final legal/code reasoning and user-facing prose.
 * Hermes is the air traffic controller; Gemma4 is the pilot.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const HermesPlanSchema = z.object({
  intent: z.string(),
  risk: z.enum(['low', 'medium', 'high']),
  tools: z.array(
    z.object({
      name: z.string(),
      arguments: z.record(z.string(), z.unknown()),
    })
  ),
  finalComposer: z.enum(['gemma4', 'hermes', 'none']),
});

export type HermesPlan = z.infer<typeof HermesPlanSchema>;

export const AceContextValidationSchema = z.object({
  valid: z.boolean(),
  tokenEstimate: z.number(),
  containsRawPromptInjection: z.boolean(),
  hasCitations: z.boolean(),
  hasClusterSummaries: z.boolean(),
  hasGraphTriples: z.boolean(),
  recommendedComposer: z.enum(['gemma4', 'hermes', 'none']),
});

export type AceContextValidation = z.infer<typeof AceContextValidationSchema>;

export const GapRepairPlanSchema = z.object({
  missingStates: z.array(z.string()),
  recommendedCommands: z.array(z.string()),
  doNotRun: z.array(z.string()),
  reason: z.string(),
});

export type GapRepairPlan = z.infer<typeof GapRepairPlanSchema>;

// ---------------------------------------------------------------------------
// Tool policy — which tools each ACE mode may call
// ---------------------------------------------------------------------------

const TOOL_POLICY: Record<string, string[]> = {
  search: [
    'deep_research',
    'source_summarize',
    'citation_builder',
    'qdrant_search',
    'cluster_summary_lenses',
    'neo4j_expand_neighborhood',
    'couchdb_view_query'
  ],
  debug: [
    'search_codebase',
    'trace_imports',
    'check_services',
    'infer_pipeline_gaps',
    'stack_health_report',
    'redis_cache_lookup'
  ],
  repair: [
    'infer_pipeline_gaps',
    'repair_missing_summary',
    'retry_failed_jobs',
    'check_services'
  ],
  analyze: [
    'deep_research',
    'opinion_summarizer',
    'issue_spotter',
    'case_intake',
    'batch_summarize',
    'batch_export_jsonl'
  ],
};

// ---------------------------------------------------------------------------
// System prompt for Hermes planner
// ---------------------------------------------------------------------------

function buildPlannerSystemPrompt(
  aceMode: string,
  availableSignals: AvailableSignals
): string {
  const allowed = TOOL_POLICY[aceMode] ?? TOOL_POLICY.search;
  return `You are Hermes, the dispatcher for a legal-AI platform.
Your job is to select the right SKILL RECIPES to satisfy a user's request.

Hermes operates on a 2-layer architecture:
1. Stable Tools: ~20 primitive building blocks (search:vector, db:query, etc.)
2. Skill Recipes: 200+ high-level actions composed of multiple tools.

Available signals:
- encoded_64 centroids in Redis: ${availableSignals.hasEncoded64}
- cluster summaries in Qdrant: ${availableSignals.hasClusterSummaries}
- Neo4j graph: ${availableSignals.hasNeo4j}
- CouchDB MapReduce views: ${availableSignals.hasCouchViews}

Mode: ${aceMode}

Core Skill Families to choose from:
- Research (deep_research, source_summarize, citation_builder, etc.)
- Evidence (ingest_pdf, transcribe_audio, build_timeline, etc.)
- Codebase (search_codebase, explain_file, trace_imports, etc.)
- Graph (deep_import_graph_expand, neo4j_expand_neighborhood, find_missing_edges, etc.)
- Vector/Cluster (qdrant_search, cluster_summary_lenses, etc.)
- Memory (couchdb_view_query, redis_cache_lookup, etc.)
- Batch (batch_ingest_folder, batch_summarize, etc.)
- Repair (check_services, infer_pipeline_gaps, suggest_commands, etc.)
- Legal/Case (case_intake, issue_spotter, opinion_summarizer, etc.)
- Simulation (mock_trial, prosecutor_argument, judge_questions, etc.)
- GPU/Acceleration (embedding_batch, rerank_batch, etc.)
- UI/Diagnostics (route_smoke_test, stack_health_report, etc.)

Your plan should list the SKILL names in the "tools" array.

Return ONLY valid JSON matching this schema exactly:
{
  "intent": "string — what you understand the user wants",
  "risk": "low" | "medium" | "high",
  "tools": [{ "name": "string", "arguments": { ... } }],
  "finalComposer": "gemma4" | "hermes" | "none"
}`;
}

// ---------------------------------------------------------------------------
// Hermes gateway client
// ---------------------------------------------------------------------------

const HERMES_GATEWAY_URL =
  process.env.HERMES_API_URL ?? 'http://127.0.0.1:8642';

export interface AvailableSignals {
  hasEncoded64: boolean;
  hasClusterSummaries: boolean;
  hasNeo4j: boolean;
  hasCouchViews: boolean;
}

async function callHermesJsonMode(
  systemPrompt: string,
  userMessage: string,
  timeoutMs = 30_000
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${HERMES_GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gemma4-hermes-64k',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) throw new Error(`Hermes gateway ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ask Hermes to produce a structured tool-call plan for an ACE retrieval query.
 * Validates the response with Zod before returning.
 */
export async function runHermesPlanner(input: {
  userQuery: string;
  aceMode: 'search' | 'debug' | 'repair' | 'analyze';
  availableSignals: AvailableSignals;
}): Promise<HermesPlan> {
  const systemPrompt = buildPlannerSystemPrompt(input.aceMode, input.availableSignals);
  const raw = await callHermesJsonMode(systemPrompt, input.userQuery);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Hermes returned non-JSON: ${raw.slice(0, 200)}`);
  }

  return HermesPlanSchema.parse(parsed);
}

/**
 * Deterministic local fallback plan used when Hermes gateway is unreachable.
 * Uses available signals to select tools without any LLM call.
 */
export function buildFallbackPlan(
  mode: string,
  query: string,
  signals: AvailableSignals
): HermesPlan {
  const tools: HermesPlan['tools'] = [
    { name: 'qdrant_search', arguments: { query, limit: 8 } },
  ];
  if (signals.hasClusterSummaries) {
    tools.push({
      name: 'cluster_summary_lenses',
      arguments: { topK: 5 },
    });
  }
  if (signals.hasNeo4j) {
    tools.push({ name: 'neo4j_expand_neighborhood', arguments: { enabled: true, maxHops: 2 } });
  }
  if (signals.hasCouchViews) {
    tools.push({
      name: 'couchdb_view_query',
      arguments: { view: 'by_cluster' },
    });
  }

  const riskMap: Record<string, HermesPlan['risk']> = {
    repair: 'high',
    debug: 'medium',
    analyze: 'medium',
    search: 'low',
  };

  return {
    intent: mode,
    risk: riskMap[mode] ?? 'low',
    tools,
    finalComposer: 'gemma4',
  };
}

/**
 * Ask Hermes to validate an assembled ACE context packet before sending to Gemma4.
 */
export async function validateAceContextPacket(contextPacket: string): Promise<AceContextValidation> {
  const systemPrompt = `You are a strict JSON validator for RAG context packets.
Inspect the provided context and return a JSON object with these exact fields:
valid (bool), tokenEstimate (int), containsRawPromptInjection (bool),
hasCitations (bool), hasClusterSummaries (bool), hasGraphTriples (bool),
recommendedComposer ("gemma4" | "hermes" | "none").
Return ONLY the JSON object — no prose.`;

  const raw = await callHermesJsonMode(systemPrompt, contextPacket.slice(0, 8000));

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Hermes validation returned non-JSON: ${raw.slice(0, 200)}`);
  }

  return AceContextValidationSchema.parse(parsed);
}

/**
 * Ask Hermes to produce a gap repair plan from a pipeline state snapshot.
 */
export async function inferPipelineGaps(stateSnapshot: {
  qdrantChunkCount: number;
  redisClusterSummaryCount: number;
  neo4jEdgeCount: number;
  couchdbPageRankNodeCount: number;
  postgresAceRunCount: number;
}): Promise<GapRepairPlan> {
  const systemPrompt = `You are a graph-RAG pipeline repair planner.
Given a pipeline state snapshot, detect missing states and output a JSON repair plan.
Schema: { missingStates: string[], recommendedCommands: string[], doNotRun: string[], reason: string }
Known pipeline states: QDRANT_INDEXED, CLUSTER_SUMMARIZED, GRAPH_MATERIALIZED,
PAGERANK_CACHED, ACE_CONTEXT_VALID, ENCODED_64_READY, TOPOLOGY_COMPLETE.
Do NOT recommend running graphml:grpc, cuda:graphs, or any destructive migration.
Return ONLY the JSON — no prose.`;

  const raw = await callHermesJsonMode(
    systemPrompt,
    JSON.stringify(stateSnapshot)
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Hermes gap plan returned non-JSON: ${raw.slice(0, 200)}`);
  }

  return GapRepairPlanSchema.parse(parsed);
}

// ---------------------------------------------------------------------------
// Karpathy wiki executor
// ---------------------------------------------------------------------------

export interface WikiLookupArgs {
  type: 'cluster' | 'retrieval' | 'playbook' | 'research' | 'directory';
  id?: string;
  limit?: number;
}

export interface WikiLookupResult {
  notes: unknown[];
  source: 'redis' | 'couchdb' | 'empty';
  durationMs: number;
}

/**
 * Execute a karpathy_wiki_lookup tool call.
 * Checks Redis hot cache first (wiki:note:{id}), then falls back to CouchDB.
 */
export async function executeWikiLookup(args: WikiLookupArgs): Promise<WikiLookupResult> {
  const t0 = Date.now();
  const limit = args.limit ?? 10;

  if (args.id) {
    try {
      const { getRedis } = await import('$lib/server/redis.js');
      const redis = getRedis();
      const raw = await redis.get(`wiki:note:${args.id}`);
      if (raw) {
        return { notes: [JSON.parse(raw)], source: 'redis', durationMs: Date.now() - t0 };
      }
    } catch { /* fall through to CouchDB */ }

    const { getWikiNote } = await import('$lib/server/indexer/karpathy-wiki.js');
    const doc = await getWikiNote(args.id);
    return {
      notes: doc ? [doc] : [],
      source: doc ? 'couchdb' : 'empty',
      durationMs: Date.now() - t0,
    };
  }

  const { listWikiNotes } = await import('$lib/server/indexer/karpathy-wiki.js');
  const notes = await listWikiNotes(args.type, limit);
  return {
    notes,
    source: notes.length > 0 ? 'couchdb' : 'empty',
    durationMs: Date.now() - t0,
  };
}