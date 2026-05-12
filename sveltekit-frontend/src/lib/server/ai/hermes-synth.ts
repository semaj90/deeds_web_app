/**
 * Hermes Synthesizer — assembles ExecutionResult tool payloads into a compact
 * ACE context string, then optionally sends it to Gemma4 for final prose.
 *
 * Used by /api/ai/hermes-run after executeHermesPlan() returns.
 */

import { createHash } from 'crypto';
import type { ExecutionResult, ToolResult } from './hermes-executor.js';

// ── Context assembler ─────────────────────────────────────────────────────────

function formatToolResult(r: ToolResult): string {
  if (!r.ok) return `[${r.tool}] ERROR: ${r.error ?? 'unknown'}`;

  const data = r.data;
  if (data === null || data === undefined) return `[${r.tool}] (no data)`;

  // Flatten well-known shapes for readability
  if (r.tool === 'qdrant_search_codebase' && Array.isArray(data)) {
    const hits = (data as Array<{ filePath?: string; score?: number; content?: string }>)
      .slice(0, 5)
      .map((h) => `  • ${h.filePath ?? '?'} (score ${(h.score ?? 0).toFixed(3)})\n    ${String(h.content ?? '').slice(0, 200)}`)
      .join('\n');
    return `[${r.tool}]\n${hits}`;
  }

  if (r.tool === 'clusters_get_summary_lenses') {
    const d = data as {
      summaries?: Array<{ clusterId: number; label: string; summary: string }>;
      qdrantTags?: Array<{ clusterKey: string; topTags: Array<{ tag: string; count: number }>; topoClasses: string[] }>;
    };
    const somLines = (d.summaries ?? [])
      .slice(0, 5)
      .map((s) => `  • SOM Cluster ${s.clusterId} — ${s.label}: ${s.summary.slice(0, 100)}`);
    const tagLines = (d.qdrantTags ?? [])
      .slice(0, 5)
      .map((c) => `  • ${c.clusterKey} [${c.topoClasses.join('/')}] tags: ${c.topTags.map((t) => t.tag).join(', ')}`);
    const all = [...somLines, ...(tagLines.length ? ['  Qdrant tag clusters:', ...tagLines] : [])];
    return `[${r.tool}]\n${all.join('\n') || '(no cluster data)'}`;
  }

  if (r.tool === 'hmm_infer_pipeline_gaps') {
    const d = data as {
      healthy?: boolean;
      missingStates?: string[];
      recommendedCommands?: string[];
      centroidCount?: number;
      autoencoderWeightsAt?: string | null;
      prefilterActive?: boolean;
      karpathyScoredFiles?: number;
    };
    if (d.healthy) return `[${r.tool}] Pipeline healthy ✓ (centroids=${d.centroidCount} karpathy=${d.karpathyScoredFiles} prefilter=active weights=${d.autoencoderWeightsAt?.slice(0, 10) ?? 'none'})`;
    return [
      `[${r.tool}] Missing: ${(d.missingStates ?? []).join(', ')}`,
      `  centroids=${d.centroidCount ?? 0} karpathy=${d.karpathyScoredFiles ?? 0} prefilter=${d.prefilterActive ? 'active' : 'inactive'} weights=${d.autoencoderWeightsAt ? 'trained' : 'placeholder'}`,
      `  Fix: ${(d.recommendedCommands ?? []).join('; ')}`,
    ].join('\n');
  }

  if (r.tool === 'deep_import_graph_expand') {
    const d = data as { skipped?: boolean; reason?: string; nodes?: string[]; contextBlock?: string; seedCount?: number };
    if (d.skipped) return `[Import graph expansion — Redis] skipped — ${d.reason ?? 'unavailable'}`;
    return [
      `[Import graph expansion — Redis] file path neighbors, dynamic import paths, route/module relationships`,
      `  seed files (${d.seedCount ?? 0}): ${(d.nodes ?? []).slice(0, 4).join(', ')}`,
      d.contextBlock ? d.contextBlock.slice(0, 600) : '',
    ].filter(Boolean).join('\n');
  }

  if (r.tool === 'neo4j_expand_neighborhood' || r.tool === 'graph:neo4j_cached') {
    const d = data as {
      skipped?: boolean; reason?: string; hint?: string; fromCache?: boolean;
      queryHash?: string; startNodeIds?: string[]; maxHops?: number;
      nodes?: Array<{ id?: string; filePath?: string; name?: string; labels?: string[] }>;
      relationships?: Array<{ source: string; target: string; type: string }>;
      triples?: Array<[string, string, string]>;
    };
    if (d.skipped) return `[Neo4j graph expansion — Cypher] skipped — ${d.reason ?? 'unavailable'}${d.hint ? ` (${d.hint})` : ''}`;
    const cacheLabel = d.fromCache ? ' (Redis hit)' : '';
    const seeds = (d.startNodeIds ?? []).slice(0, 3);
    const tripleLines = (d.triples ?? []).slice(0, 8)
      .map(([s, rel, t]) => `  [${s}] —${rel}→ [${t}]`).join('\n');
    const nodeLines = !d.triples?.length
      ? (d.nodes ?? []).slice(0, 8)
          .map((n) => `  • ${n.id ?? n.filePath ?? n.name ?? '?'} [${(n.labels ?? []).join('/')}]`)
          .join('\n')
      : '';
    return [
      `[Neo4j graph expansion — Cypher${cacheLabel}] graph nodes, relationships, hop depth, labels, case/evidence/cluster links`,
      `  ${d.maxHops ?? 1}-hop from [${seeds.join(', ')}] → ${d.nodes?.length ?? 0} nodes, ${d.relationships?.length ?? 0} edges`,
      tripleLines || nodeLines,
    ].filter(Boolean).join('\n');
  }

  if (r.tool === 'couchdb_view_query') {
    const d = data as { skipped?: boolean; reason?: string; view?: string; rows?: Array<{ key: unknown; value: unknown }>; count?: number };
    if (d.skipped) return `[${r.tool}] skipped — ${d.reason ?? 'unavailable'}`;
    const rows = (d.rows ?? []).slice(0, 8).map((row) =>
      `  • key=${JSON.stringify(row.key).slice(0, 60)} val=${JSON.stringify(row.value).slice(0, 60)}`
    ).join('\n');
    return `[${r.tool}] view=${d.view} rows=${d.count ?? 0}\n${rows}`;
  }

  if (r.tool === 'karpathy_wiki_lookup') {
    const d = data as { notes?: Array<Record<string, unknown>>; source?: string; durationMs?: number };
    const notes = d.notes ?? [];
    const lines = notes.slice(0, 5).map((n) => {
      const type = String(n.type ?? '?');
      if (type === 'cluster')   return `  • cluster ${n.purpose ?? n.summary ?? ''}`.slice(0, 120);
      if (type === 'retrieval') return `  • retrieval q="${String(n.query ?? '').slice(0, 60)}" cacheHit=${n.cacheHit}`;
      if (type === 'playbook')  return `  • playbook: ${n.symptom ?? ''} → ${String(n.resolution ?? '').slice(0, 80)}`;
      if (type === 'research')  return `  • research: ${String(n.query ?? '').slice(0, 60)} conf=${n.confidence}`;
      if (type === 'directory') return `  • dir ${n.path} score=${n.auditScore} ${(n.warnings as string[] ?? []).length} warnings`;
      return `  • ${type}: ${JSON.stringify(n).slice(0, 100)}`;
    });
    return `[${r.tool}] source=${d.source ?? '?'} count=${notes.length}\n${lines.join('\n')}`;
  }

  if (r.tool === 'attention_rank_files') {
    const d = data as {
      skipped?: boolean; reason?: string;
      query?: string; files?: Array<{ filePath: string; qdrantScore: number; blend: number; combinedScore: number }>;
      count?: number; karpathyFilesAvailable?: number;
    };
    if (d.skipped) return `[${r.tool}] skipped — ${d.reason ?? 'unavailable'}`;
    const fileLines = (d.files ?? []).slice(0, 8).map((f) =>
      `  • ${f.filePath} (combined=${f.combinedScore.toFixed(3)} qdrant=${f.qdrantScore?.toFixed(3)} blend=${f.blend?.toFixed(2)})`
    ).join('\n');
    return `[${r.tool}] query="${(d.query ?? '').slice(0, 60)}" top=${d.count ?? 0} karpathy_pool=${d.karpathyFilesAvailable ?? 0}\n${fileLines}`;
  }

  if (r.tool === 'som_topology_stats') {
    const d = data as {
      skipped?: boolean; reason?: string;
      gridRows?: number | null; gridCols?: number | null; centroidCount?: number | null;
      scoredFiles?: number; lastRunAt?: string | null;
      clusterCount?: number; clusterSizes?: Record<string, number>;
    };
    if (d.skipped) return `[${r.tool}] skipped — ${d.reason ?? 'unavailable'}`;
    const grid = d.gridRows && d.gridCols ? `${d.gridRows}×${d.gridCols}` : 'unknown';
    return `[${r.tool}] grid=${grid} centroids=${d.centroidCount ?? '?'} clusters=${d.clusterCount ?? 0} scored_files=${d.scoredFiles ?? 0} last_run=${d.lastRunAt?.slice(0, 10) ?? 'never'}`;
  }

  if (r.tool === 'language_distribution') {
    const d = data as {
      skipped?: boolean; reason?: string;
      distribution?: Array<{ ext: string; label: string; count: number }>;
      totalTaggedFiles?: number; clusterCount?: number; source?: string;
    };
    if (d.skipped) return `[${r.tool}] skipped — ${d.reason ?? 'unavailable'}`;
    const langLines = (d.distribution ?? []).slice(0, 8)
      .map((l) => `  • ${l.label} (${l.ext}): ${l.count} files`).join('\n');
    return `[${r.tool}] source=${d.source ?? '?'} total=${d.totalTaggedFiles ?? 0} clusters=${d.clusterCount ?? 0}\n${langLines}`;
  }

  if (r.tool === 'ace:pack_context') {
    const d = data as {
      tokenUsed?: number;
      serialized?: string;
      slotCounts?: { evidence: number; clusterSummaries: number; graphTriples: number; couchGroups: number; priorCases: number };
    };
    const s = d.slotCounts;
    const summary = s
      ? `ev=${s.evidence} clusters=${s.clusterSummaries} triples=${s.graphTriples} couch=${s.couchGroups} prior=${s.priorCases}`
      : '';
    return [
      `[Token-aware ACE packer] tokens=${d.tokenUsed ?? '?'} ${summary}`,
      d.serialized ? d.serialized.slice(0, 1200) : '(empty packet)',
    ].join('\n');
  }

  // Generic fallback
  return `[${r.tool}] ${JSON.stringify(data).slice(0, 400)}`;
}

/**
 * Assemble all tool results into a compact ACE context string.
 *
 * If an `ace:pack_context` result is present in the execution, its serialized
 * packet is used directly (already token-budgeted). Otherwise falls back to
 * concatenating individual formatToolResult() sections.
 */
export function assembleContext(
  userQuery: string,
  execution: ExecutionResult,
  opts?: { maxInputTokens?: number; reservedOutputTokens?: number }
): string {
  // Prefer the pre-packed context if the skill ran ace:pack_context
  const packerResult = execution.results.find((r) => r.tool === 'ace:pack_context' && r.ok);
  if (packerResult) {
    const d = packerResult.data as { serialized?: string; tokenUsed?: number } | null;
    if (d?.serialized) return d.serialized;
  }

  // If budget opts are provided, run an inline pack from raw results
  if (opts?.maxInputTokens) {
    const qdrantResult = execution.results.find((r) => r.tool === 'search:vector' || r.tool === 'qdrant_search_codebase');
    const clusterResult = execution.results.find((r) => r.tool === 'clusters_get_summary_lenses' || r.tool === 'topology:summary');
    const graphResult = execution.results.find((r) => r.tool === 'neo4j_expand_neighborhood' || r.tool === 'graph:neo4j_cached');
    const couchResult = execution.results.find((r) => r.tool === 'couchdb_view_query' || r.tool === 'search:couchdb');

    const qdrantHits = Array.isArray(qdrantResult?.data) ? (qdrantResult!.data as unknown[]) as never[] : [];
    const clusterSummaries = (clusterResult?.data as { summaries?: never[] } | null)?.summaries ?? [];
    const graphTriples = (graphResult?.data as { triples?: Array<[string, string, string]> } | null)?.triples ?? [];
    const couchRows = couchResult?.data ? [couchResult.data as { view: string; rows: never[] }] : [];

    // Lazy import to avoid circular dep at module load
    import('$lib/server/ace/token-aware-packer.js').then(({ packContext, serializePacket }) => {
      /* intentional no-op — used below via sync placeholder */
      void packContext; void serializePacket;
    }).catch(() => {/* ignore */});

    // Sync fallback — inline packing is async-unfriendly here; build a minimal summary instead
    const tokenNote = `Budget: ${opts.maxInputTokens}t input / ${opts.reservedOutputTokens ?? 1200}t reserved`;
    const sections = execution.results.map(formatToolResult);
    return [
      `# Retrieval context for: ${userQuery}`,
      tokenNote,
      `Tools: ${execution.toolsExecuted} ok / ${execution.toolsFailed} failed / ${execution.totalDurationMs.toFixed(0)}ms`,
      `Context lanes: qdrant=${qdrantHits.length} clusters=${clusterSummaries.length} triples=${graphTriples.length} couch=${couchRows.length}`,
      '',
      ...sections,
    ].join('\n');
  }

  const sections = execution.results.map(formatToolResult);
  return [
    `# Retrieval context for: ${userQuery}`,
    `Tools executed: ${execution.toolsExecuted}  failed: ${execution.toolsFailed}  totalMs: ${execution.totalDurationMs.toFixed(0)}`,
    '',
    ...sections,
  ].join('\n');
}

// ── Redis synthesis cache ─────────────────────────────────────────────────────

const SYNTH_CACHE_TTL = 300; // 5 min — identical query+context skips the LLM

function synthCacheKey(composer: string, userQuery: string, context: string): string {
  return `hermes:synth:${createHash('sha256')
    .update(`${composer}\0${userQuery}\0${context.slice(0, 512)}`)
    .digest('hex')
    .slice(0, 24)}`;
}

async function readSynthCache(key: string): Promise<string | null> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const raw = await getRedis().get(key);
    if (!raw) return null;
    return (JSON.parse(raw) as { answer: string }).answer;
  } catch {
    return null;
  }
}

async function writeSynthCache(key: string, answer: string): Promise<void> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    await getRedis().setex(key, SYNTH_CACHE_TTL, JSON.stringify({ answer }));
  } catch { /* non-fatal */ }
}

// ── Gemma4 synthesis ──────────────────────────────────────────────────────────

export interface SynthesisResult {
  answer:      string;
  cacheHit:    boolean;
  durationMs:  number;
  composer:    'gemma4' | 'hermes' | 'none';
}

/**
 * Call the finalComposer with the assembled context.
 *
 *   'none'   → return context as-is (CLI/raw output, no LLM call)
 *   'hermes' → try HERMES_API_URL dedicated server first (:8642 opt-in),
 *              fallback to bifrostChat gemma4-legal. Same quality either way;
 *              the dedicated server provides better concurrency when available.
 *              Use model=yorha-hermes on the OpenAI v1 facade to land here.
 *   'gemma4' → bifrostChat gemma4-legal directly (L1 → Bifrost L2 → L3)
 *
 * All LLM paths check Redis first (hermes:synth:* TTL 300s) and write on miss.
 */
export async function synthesize(
  composer: 'gemma4' | 'hermes' | 'none',
  userQuery: string,
  context: string
): Promise<SynthesisResult> {
  const t0 = performance.now();

  if (composer === 'none') {
    return { answer: context, cacheHit: false, durationMs: performance.now() - t0, composer };
  }

  const cacheKey = synthCacheKey(composer, userQuery, context);
  const cached = await readSynthCache(cacheKey);
  if (cached) {
    return { answer: cached, cacheHit: true, durationMs: performance.now() - t0, composer };
  }

  const systemPrompt = `You are a legal-AI assistant with access to retrieved context below.
Answer the user query concisely. Cite file paths or cluster labels where relevant.
If the context is insufficient, say so explicitly — do NOT hallucinate.

${context}`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user'   as const, content: userQuery },
  ];

  let answer: string;

  if (composer === 'hermes') {
    const { ENV } = await import('$lib/server/env.server.js');
    const hermesUrl = (ENV as unknown as Record<string, string>).HERMES_API_URL;

    if (hermesUrl) {
      try {
        const res = await fetch(`${hermesUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({ model: 'gemma4-legal', messages, temperature: 0.2, max_tokens: 512 }),
        });
        if (res.ok) {
          const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
          answer = data.choices[0]?.message?.content ?? '';
          await writeSynthCache(cacheKey, answer);
          return { answer, cacheHit: false, durationMs: performance.now() - t0, composer };
        }
      } catch {
        // HERMES_API_URL unreachable — fall through to bifrostChat
      }
    }

    // Fallback: bifrostChat gemma4-legal (L1 → Bifrost L2 → TurboQuant/Ollama L3)
    const { bifrostChat } = await import('$lib/server/ollama.js');
    answer = await bifrostChat(messages, 'gemma4-legal', { temperature: 0.2, maxTokens: 512 });
  } else {
    // composer === 'gemma4' — direct bifrostChat path
    const { bifrostChat } = await import('$lib/server/ollama.js');
    answer = await bifrostChat(messages, 'gemma4-legal', { temperature: 0.2, maxTokens: 512 });
  }

  await writeSynthCache(cacheKey, answer);
  return { answer, cacheHit: false, durationMs: performance.now() - t0, composer };
}
