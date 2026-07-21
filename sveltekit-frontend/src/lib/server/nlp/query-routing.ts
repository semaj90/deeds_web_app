import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import {
  queryRoutingAnalysisSchema,
  type QueryRoutingAnalysis,
  type QueryRoutingIntent,
  normalizeQueryText,
} from '$lib/server/ace/ace-query-packet.js';

const MINIFORGE_SIDECAR_URL = ENV.MINIFORGE_SIDECAR_URL ?? 'http://127.0.0.1:8095';

const queryRoutingRequestSchema = z.object({
  query: z.string().min(1),
  context: z
    .object({
      repositoryId: z.string().optional(),
      previousIntent: z.string().optional(),
      taskState: z.string().optional(),
      domainHint: z.string().optional(),
    })
    .default({}),
  requestedModels: z.array(z.string()).default([]),
});

type QueryRoutingRequest = z.infer<typeof queryRoutingRequestSchema>;

function inferIntent(query: string): QueryRoutingIntent {
  const normalized = normalizeQueryText(query);

  if (/\b(search|find|locate|where|rg|grep|symbol|file)\b/.test(normalized)) {
    return 'symbol_lookup';
  }
  if (/\b(explain|why|how|summarize|summary|synthesis|synthesize)\b/.test(normalized)) {
    return 'code_explanation';
  }
  if (/\b(error|fail|broken|bug|exception|stack|traceback|fix)\b/.test(normalized)) {
    return 'debug_error';
  }
  if (/\b(schema|table|column|migration|postgres|drizzle|sql)\b/.test(normalized)) {
    return 'schema_lookup';
  }
  if (/\b(depends|dependency|graph|neo4j|pagerank|community|topology|expand)\b/.test(normalized)) {
    return 'dependency_trace';
  }
  if (/\b(todo|missing|next step|next pass|open lane|backfill|coverage)\b/.test(normalized)) {
    return 'missing_work';
  }
  if (/\b(task|kanban|approve|approval|gate|review)\b/.test(normalized)) {
    return 'task_board_action';
  }
  if (/\b(research|docs|official|paper|source|web|firecrawl)\b/.test(normalized)) {
    return 'deep_research';
  }
  return 'general';
}

function intentProbabilities(intent: QueryRoutingIntent): Record<string, number> {
  const entries: Array<[string, number]> = [
    ['symbol_lookup', intent === 'symbol_lookup' ? 0.9 : 0.05],
    ['code_explanation', intent === 'code_explanation' ? 0.9 : 0.05],
    ['debug_error', intent === 'debug_error' ? 0.9 : 0.05],
    ['schema_lookup', intent === 'schema_lookup' ? 0.9 : 0.05],
    ['dependency_trace', intent === 'dependency_trace' ? 0.9 : 0.05],
    ['missing_work', intent === 'missing_work' ? 0.9 : 0.05],
    ['task_board_action', intent === 'task_board_action' ? 0.9 : 0.05],
    ['deep_research', intent === 'deep_research' ? 0.9 : 0.05],
    ['general', intent === 'general' ? 0.7 : 0.1],
  ];
  return Object.fromEntries(entries);
}

function domainClassForIntent(intent: QueryRoutingIntent, domainHint?: string): string {
  if (domainHint?.trim()) return domainHint.trim();
  switch (intent) {
    case 'symbol_lookup':
      return 'retrieval';
    case 'code_explanation':
    case 'debug_error':
      return 'analysis';
    case 'schema_lookup':
      return 'schema';
    case 'dependency_trace':
      return 'graph';
    case 'missing_work':
      return 'agent';
    case 'task_board_action':
      return 'workflow';
    case 'deep_research':
      return 'research';
    default:
      return 'general';
  }
}

function buildFallbackAnalysis(query: string, context: QueryRoutingRequest['context']): QueryRoutingAnalysis {
  const intent = inferIntent(query);
  const domainClass = domainClassForIntent(intent, context.domainHint);
  const normalizedQuery = normalizeQueryText(query);
  const intentConfidence = intent === 'general' ? 0.55 : 0.8;
  const domainConfidence = context.domainHint?.trim() ? 0.92 : intent === 'general' ? 0.5 : 0.78;
  const graphExpansion = intent === 'dependency_trace' || intent === 'deep_research' || intent === 'missing_work';
  const rerank = intent !== 'task_board_action';

  return queryRoutingAnalysisSchema.parse({
    query,
    normalizedQuery,
    intent,
    intentConfidence,
    intentProbabilities: intentProbabilities(intent),
    domainClass,
    domainConfidence,
    domainProbabilities: { [domainClass]: domainConfidence },
    needsRetrieval: intent !== 'task_board_action',
    graphExpansion,
    rerank,
    authorizationRequired: intent === 'task_board_action',
    analysisSource: 'heuristic',
    modelVersion: 'heuristic-v1',
    generatedAt: new Date().toISOString(),
  });
}

async function tryMiniforgeQueryRouting(request: QueryRoutingRequest): Promise<QueryRoutingAnalysis | null> {
  const endpoints = [
    `${MINIFORGE_SIDECAR_URL.replace(/\/$/, '')}/query-route`,
    `${MINIFORGE_SIDECAR_URL.replace(/\/$/, '')}/route`,
    `${MINIFORGE_SIDECAR_URL.replace(/\/$/, '')}/query/analyze`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;

      const raw = await res.json();
      const parsed = queryRoutingAnalysisSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // try next endpoint
    }
  }

  return null;
}

export async function analyzeQueryRouting(query: string, context: QueryRoutingRequest['context'] = {}): Promise<QueryRoutingAnalysis> {
  const request = queryRoutingRequestSchema.parse({
    query,
    context,
    requestedModels: ['intent-logistic-v1', 'domain-logistic-v1', 'intent-naive-bayes-v1'],
  });

  const sidecar = await tryMiniforgeQueryRouting(request);
  if (sidecar) return sidecar;
  return buildFallbackAnalysis(query, request.context);
}

export function buildQueryRoutingFallback(query: string, context: QueryRoutingRequest['context'] = {}): QueryRoutingAnalysis {
  return buildFallbackAnalysis(query, context);
}

