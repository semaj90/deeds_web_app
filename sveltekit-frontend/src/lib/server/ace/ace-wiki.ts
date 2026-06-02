/**
 * ace-wiki.ts — Generate wiki-style articles from ACE codebase context.
 *
 * Pipeline:
 *   1. assembleAceContext()          — pull cluster summaries + code chunks
 *   2. buildGemma4AcePrompt(ctx)     — build base codebase context section
 *   3. Compose systemPromptOverride  — base + wiki instructions on top
 *   4. callGemma4WithAceContext()    — reuse shared transport/fallback/telemetry
 *   5. parseWikiJson()               — validate + clamp JSON fields
 *   6. Heuristic fallback            — cluster summaries when LLM unavailable
 *
 * Always returns AceWikiResult — never throws.
 * Falls back gracefully at every stage.
 */
import {
  assembleAceContext,
  getChunkForAce,
  type AceCodeIntelContext,
} from './codeintel-datastore.js';
import {
  buildGemma4AcePrompt,
  callGemma4WithAceContext,
  createEmptyGemmaStageTimings,
  type Gemma4StageTimings,
} from './gemma4-codeintel.js';
import { retrievalClient, type RetrievedCodebaseChunk } from '../grpc/retrieval-client.js';
import { searchByCluster, type RankedChunk } from '$lib/server/features/rag/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AceWikiRequest {
  query: string;
  repoId?: string;
  clusterIds?: number[];
  maxWords?: number;
  task?: 'explain' | 'troubleshoot' | 'overview' | 'deep-dive';
  useTools?: boolean;
}

export interface AceWikiSection {
  heading: string;
  content: string;
}

export interface AceWikiResult {
  ok: boolean;
  query: string;
  title: string | null;
  summary: string | null;
  sections: AceWikiSection[];
  relatedFiles: string[];
  relatedClusters: number[];
  degraded: boolean;
  errors: string[];
  latencyMs: number;
  toolCallsExecuted: number;
  toolCallNames: string[];
  stageTimings: AceWikiStageTimings;
}

export interface AceWikiStageTimings {
  assembleContextMs: number;
  draftPassMs: number;
  formatPassMs: number;
  totalMs: number;
  draft: Gemma4StageTimings;
  format: Gemma4StageTimings;
}

interface WikiToolPrefetchResult {
  prompt: string;
  toolCallsExecuted: number;
  toolCallNames: string[];
  toolCalls: Gemma4StageTimings['toolCalls'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Wiki JSON response schema (passed to Ollama as structured output hint)
// ─────────────────────────────────────────────────────────────────────────────

const WIKI_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['heading', 'content'],
      },
    },
    relatedFiles: { type: 'array', items: { type: 'string' } },
    relatedClusters: { type: 'array', items: { type: 'number' } },
  },
  required: ['title', 'summary', 'sections', 'relatedFiles', 'relatedClusters'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const TASK_INSTRUCTION: Record<string, string> = {
  explain:
    'Explain the query subject clearly: what it does, why it exists, and how it fits the codebase.',
  troubleshoot:
    'Diagnose likely failure modes, common pitfalls, and debugging steps for the query subject.',
  overview:
    'Give a high-level architectural overview: key modules, data flow, and integration points.',
  'deep-dive':
    'Provide a thorough technical deep-dive: internals, edge cases, performance considerations, and risks.',
};

function buildWikiSystemPrompt(
  contextPrompt: string,
  query: string,
  maxWords: number,
  task: string
): string {
  const instruction = TASK_INSTRUCTION[task] ?? TASK_INSTRUCTION.explain;
  return [
    contextPrompt,
    '',
    'You are generating an internal code intelligence wiki article.',
    `Task: ${instruction}`,
    `Topic: "${query}"`,
    '',
    'Return ONLY valid JSON — no markdown fences, no extra text — matching this shape:',
    '{ "title": "<concise title>", "summary": "<1-2 sentence overview>", "sections": [{ "heading": "...", "content": "..." }], "relatedFiles": ["src/..."], "relatedClusters": [0] }',
    '',
    `Constraints: 3-5 sections, each content ≤ 120 words, total body ≤ ${maxWords} words.`,
    'Only include relatedFiles and relatedClusters actually present in the context above.',
  ].join('\n');
}

function buildWikiContextPrompt(context: AceCodeIntelContext): string {
  const clusterContext = Array.isArray(context.clusterContext) ? context.clusterContext : [];
  const chunkContext = Array.isArray(context.chunkContext) ? context.chunkContext : [];
  const researchContext = Array.isArray(context.researchContext) ? context.researchContext : [];

  const compactContext: AceCodeIntelContext = {
    ...context,
    clusterContext: clusterContext.slice(0, 3).map((cluster) => ({
      ...cluster,
      summary: cluster.summary?.slice(0, 180) ?? null,
      patterns: cluster.patterns.slice(0, 3),
      warnings: cluster.warnings.slice(0, 2),
      tags: cluster.tags.slice(0, 3),
    })),
    chunkContext: chunkContext.slice(0, 4).map((chunk) => ({
      ...chunk,
      summary: chunk.summary?.slice(0, 140) ?? null,
      semanticTags: chunk.semanticTags.slice(0, 3),
    })),
    researchContext: researchContext.slice(0, 2).map((entry) => ({
      ...entry,
      body: entry.body.slice(0, 220),
      semanticTags: entry.semanticTags.slice(0, 3),
    })),
  };

  return buildGemma4AcePrompt(
    compactContext,
    'Favor concise synthesis over exhaustive coverage. Use the most relevant evidence only.'
  );
}

function buildWikiDraftSystemPrompt(
  contextPrompt: string,
  query: string,
  maxWords: number,
  task: string
): string {
  const instruction = TASK_INSTRUCTION[task] ?? TASK_INSTRUCTION.explain;
  const draftWordBudget = Math.min(maxWords, 420);
  return [
    contextPrompt,
    '',
    'You are gathering research notes for an internal code intelligence wiki article.',
    `Task: ${instruction}`,
    `Topic: "${query}"`,
    '',
    'When tools are available, use them before answering if they add evidence.',
    'Return plain text notes, not JSON.',
    'Use this outline exactly:',
    'TITLE: <concise title>',
    'SUMMARY: <1-2 sentence overview>',
    'SECTION 1: <heading>',
    '<content>',
    'SECTION 2: <heading>',
    '<content>',
    'RELATED FILES: path1 | path2',
    'RELATED CLUSTERS: id1 | id2',
    'Use 2 or 3 sections only. Keep each section concise and evidence-driven.',
    `Keep the total body under ${draftWordBudget} words.`,
  ].join('\n');
}

function buildWikiFormatterSystemPrompt(maxWords: number): string {
  return [
    'You are a JSON formatter for an internal code intelligence wiki pipeline.',
    'Transform the provided draft notes into one valid JSON object only.',
    'Do not add commentary, markdown fences, or any text before or after the JSON object.',
    'Use exactly these keys: title, summary, sections, relatedFiles, relatedClusters.',
    'Each section must be an object with heading and content keys.',
    'Do not invent files or clusters that are missing from the draft notes.',
    'If a field is missing in the draft, use an empty array or a concise fallback string.',
    `Keep the total body under ${maxWords} words.`,
  ].join('\n');
}

function formatPrefetchedChunk(chunk: RetrievedCodebaseChunk): string {
  const meta = [chunk.filePath || chunk.chunkId, chunk.kind, chunk.routeId]
    .filter(Boolean)
    .join(' | ');
  const location =
    typeof chunk.bmuRow === 'number' && typeof chunk.bmuCol === 'number'
      ? `BMU: (${chunk.bmuRow}, ${chunk.bmuCol})`
      : null;
  return [meta, location, chunk.contentPreview?.slice(0, 220) || null].filter(Boolean).join('\n');
}

function formatClusterPrefetchedChunk(chunk: RankedChunk): string {
  const meta = [
    chunk.relativePath || chunk.path || String(chunk.qdrantId ?? ''),
    chunk.kind,
    chunk.routeId,
  ]
    .filter(Boolean)
    .join(' | ');
  const location = typeof chunk.somCluster === 'number' ? `SOM cluster: ${chunk.somCluster}` : null;
  return [meta, location, chunk.content?.slice(0, 220) || null].filter(Boolean).join('\n');
}

async function prefetchWikiToolEvidence(
  query: string,
  repoId: string
): Promise<WikiToolPrefetchResult> {
  const toolCallNames: string[] = [];
  const toolCalls: Gemma4StageTimings['toolCalls'] = [];
  const sections: string[] = [];

  let searchResults: Awaited<ReturnType<typeof retrievalClient.searchChunks>> | null = null;
  const searchStartedAt = Date.now();
  try {
    searchResults = await retrievalClient.searchChunks(query, 3);
    toolCallNames.push('search_codebase');
    toolCalls.push({
      round: 1,
      toolName: 'search_codebase',
      durationMs: Date.now() - searchStartedAt,
    });
  } catch {
    searchResults = null;
  }

  if (searchResults?.results?.length) {
    sections.push(
      [
        '## PREFETCHED SEARCH RESULTS',
        ...searchResults.results.slice(0, 3).map(formatPrefetchedChunk),
      ].join('\n\n')
    );
  }

  let anchor = searchResults?.results?.find(
    (result) => typeof result.bmuRow === 'number' && typeof result.bmuCol === 'number'
  );
  let somClusterAnchor = searchResults?.results?.find(
    (result) => typeof result.somCluster === 'number'
  );

  if ((!anchor || !somClusterAnchor) && searchResults?.results?.length) {
    for (const result of searchResults.results.slice(0, 3)) {
      const identifiers = [result.filePath, result.id, result.chunkId].filter(Boolean);

      for (const identifier of identifiers) {
        const { chunk } = await getChunkForAce(repoId, identifier);
        if (
          !anchor &&
          typeof chunk?.somBmuRow === 'number' &&
          typeof chunk?.somBmuCol === 'number'
        ) {
          anchor = {
            ...result,
            bmuRow: chunk.somBmuRow,
            bmuCol: chunk.somBmuCol,
          };
        }

        if (!somClusterAnchor && typeof chunk?.somCluster === 'number') {
          somClusterAnchor = {
            ...result,
            somCluster: chunk.somCluster,
          };
        }

        if (anchor && somClusterAnchor) {
          break;
        }
      }

      if (anchor && somClusterAnchor) {
        break;
      }
    }
  }

  const recordTopologyCall = (durationMs: number) => {
    if (!toolCallNames.includes('get_topology_context')) {
      toolCallNames.push('get_topology_context');
    }
    toolCalls.push({
      round: 1,
      toolName: 'get_topology_context',
      durationMs,
    });
  };

  if (anchor && typeof anchor.bmuRow === 'number' && typeof anchor.bmuCol === 'number') {
    const topologyStartedAt = Date.now();
    try {
      const topology = await retrievalClient.getTopologyContext(anchor.bmuRow, anchor.bmuCol, 1);
      recordTopologyCall(Date.now() - topologyStartedAt);

      if (topology.neighbors.length) {
        sections.push(
          [
            `## PREFETCHED TOPOLOGY CONTEXT (${anchor.bmuRow}, ${anchor.bmuCol})`,
            ...topology.neighbors.slice(0, 3).map(formatPrefetchedChunk),
          ].join('\n\n')
        );
      }
    } catch {
      // Non-fatal: drafting can still proceed with search results only.
    }
  } else if (somClusterAnchor && typeof somClusterAnchor.somCluster === 'number') {
    const topologyStartedAt = Date.now();
    try {
      const topology = await searchByCluster(query, somClusterAnchor.somCluster, 3);
      recordTopologyCall(Date.now() - topologyStartedAt);

      if (topology.length) {
        sections.push(
          [
            `## PREFETCHED TOPOLOGY CONTEXT (SOM cluster ${somClusterAnchor.somCluster})`,
            ...topology.slice(0, 3).map(formatClusterPrefetchedChunk),
          ].join('\n\n')
        );
      }
    } catch {
      // Non-fatal: drafting can still proceed with search results only.
    }
  }

  return {
    prompt: sections.join('\n\n'),
    toolCallsExecuted: toolCallNames.length,
    toolCallNames,
    toolCalls,
  };
}

function buildWikiFormattingUserPrompt(query: string, maxWords: number, draftText: string): string {
  return [
    `Convert the draft wiki notes below into the required JSON article for "${query}".`,
    `Keep the total body under ${maxWords} words.`,
    'Return ONLY valid JSON matching this shape:',
    '{"title":"...","summary":"...","sections":[{"heading":"...","content":"..."}],"relatedFiles":["src/..."],"relatedClusters":[0]}',
    '',
    'Draft notes:',
    draftText,
  ].join('\n');
}

function buildWikiStageTimings(params: {
  assembleContextMs: number;
  draftPassMs: number;
  formatPassMs: number;
  totalMs: number;
  draft?: Gemma4StageTimings;
  format?: Gemma4StageTimings;
}): AceWikiStageTimings {
  return {
    assembleContextMs: params.assembleContextMs,
    draftPassMs: params.draftPassMs,
    formatPassMs: params.formatPassMs,
    totalMs: params.totalMs,
    draft: params.draft ?? createEmptyGemmaStageTimings(params.draftPassMs),
    format: params.format ?? createEmptyGemmaStageTimings(params.formatPassMs),
  };
}

function parseWikiJson(raw: unknown): {
  title: string;
  summary: string;
  sections: AceWikiSection[];
  relatedFiles: string[];
  relatedClusters: number[];
} | null {
  const candidate =
    typeof raw === 'object' && raw !== null
      ? raw
      : (() => {
          try {
            const text = String(raw ?? '');
            const m = text.match(/\{[\s\S]*\}/);
            return m ? JSON.parse(m[0]) : null;
          } catch {
            return null;
          }
        })();

  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, unknown>;
  if (!obj.title || !obj.summary || !Array.isArray(obj.sections)) return null;

  return {
    title: String(obj.title).slice(0, 200),
    summary: String(obj.summary).slice(0, 400),
    sections: (obj.sections as Record<string, unknown>[]).slice(0, 5).map((s) => ({
      heading: String(s.heading ?? '').slice(0, 100),
      content: String(s.content ?? s.body ?? '').slice(0, 800),
    })),
    relatedFiles: Array.isArray(obj.relatedFiles)
      ? (obj.relatedFiles as unknown[]).slice(0, 10).map(String)
      : [],
    relatedClusters: Array.isArray(obj.relatedClusters)
      ? (obj.relatedClusters as unknown[])
          .slice(0, 10)
          .map(Number)
          .filter((n) => !isNaN(n))
      : [],
  };
}

function parseWikiDraftText(raw: string): {
  title: string;
  summary: string;
  sections: AceWikiSection[];
  relatedFiles: string[];
  relatedClusters: number[];
} | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  const titleMatch = text.match(/(?:^|\n)TITLE:\s*(.+)/i);
  const summaryMatch = text.match(
    /(?:^|\n)SUMMARY:\s*([\s\S]*?)(?=\nSECTION\s+\d+:|\nRELATED FILES:|\nRELATED CLUSTERS:|$)/i
  );
  const sectionMatches = [
    ...text.matchAll(
      /(?:^|\n)SECTION\s+\d+:\s*(.+)\n([\s\S]*?)(?=\nSECTION\s+\d+:|\nRELATED FILES:|\nRELATED CLUSTERS:|$)/gi
    ),
  ];
  const filesMatch = text.match(/(?:^|\n)RELATED FILES:\s*(.+)/i);
  const clustersMatch = text.match(/(?:^|\n)RELATED CLUSTERS:\s*(.+)/i);

  const sections = sectionMatches
    .map((match) => ({
      heading: match[1]?.trim().slice(0, 100) ?? '',
      content: match[2]?.trim().slice(0, 800) ?? '',
    }))
    .filter((section) => section.heading || section.content)
    .slice(0, 5);

  if (!titleMatch && !summaryMatch && sections.length === 0) return null;

  const relatedFiles = filesMatch?.[1]
    ? filesMatch[1]
        .split('|')
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const relatedClusters = clustersMatch?.[1]
    ? clustersMatch[1]
        .split('|')
        .map((value) => Number(value.trim()))
        .filter((value) => !Number.isNaN(value))
        .slice(0, 10)
    : [];

  return {
    title: titleMatch?.[1]?.trim().slice(0, 200) || 'Codebase Overview',
    summary:
      summaryMatch?.[1]?.trim().slice(0, 400) ||
      sections[0]?.content.slice(0, 400) ||
      'No summary available.',
    sections,
    relatedFiles,
    relatedClusters,
  };
}

function normalizeWikiTopicQuery(query: string): string {
  const cleaned = query
    .split(/(?<=[.!?])\s+/)
    .filter((part) => !/search_codebase|get_topology_context/i.test(part))
    .join(' ')
    .trim();

  return cleaned || query.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a wiki-style article about `query` using ACE codebase context.
 * Never throws. Falls back to heuristic content from cluster summaries on any LLM failure.
 */
export async function generateAceWiki(req: AceWikiRequest): Promise<AceWikiResult> {
  const start = Date.now();
  const { query, repoId = 'default', clusterIds, maxWords = 600, task = 'explain' } = req;
  const topicQuery = normalizeWikiTopicQuery(query);
  const collectedErrors: string[] = [];
  const assembleStartedAt = Date.now();

  // ── Stage 1: Assemble ACE context ───────────────────────────────────────
  const ctx = await assembleAceContext(topicQuery, {
    repoId,
    clusterIds: clusterIds?.length ? clusterIds : undefined,
    limit: 6,
  });
  const assembleContextMs = Date.now() - assembleStartedAt;

  if (ctx.errors.length) collectedErrors.push(...ctx.errors);

  // Heuristic fallback — always computable regardless of LLM availability
  const fallbackSections: AceWikiSection[] = ctx.clusterContext.slice(0, 4).map((c) => ({
    heading: c.purpose ?? `Cluster ${c.gpuCluster}`,
    content: c.summary ?? 'No summary available for this cluster.',
  }));
  const fallbackFiles = ctx.chunkContext
    .slice(0, 8)
    .map((c) => c.relativePath ?? '')
    .filter(Boolean);
  const fallbackClusters = ctx.clusterContext.slice(0, 5).map((c) => c.gpuCluster);

  if (ctx.degraded && ctx.clusterContext.length === 0) {
    return {
      ok: false,
      query,
      title: null,
      summary: null,
      sections: [],
      relatedFiles: [],
      relatedClusters: [],
      degraded: true,
      errors: [
        ...collectedErrors,
        'Codebase context unavailable — check cluster summaries and indexing status.',
      ],
      latencyMs: Date.now() - start,
      toolCallsExecuted: 0,
      toolCallNames: [],
      stageTimings: buildWikiStageTimings({
        assembleContextMs,
        draftPassMs: 0,
        formatPassMs: 0,
        totalMs: Date.now() - start,
      }),
    };
  }

  // ── Stage 2: Build system prompt override ────────────────────────────────
  const draftStartedAt = Date.now();
  const prefetchedToolEvidence = req.useTools
    ? await prefetchWikiToolEvidence(topicQuery, repoId)
    : null;
  const baseContextPrompt = buildWikiContextPrompt(ctx);
  const draftContextPrompt =
    req.useTools && prefetchedToolEvidence?.prompt
      ? [baseContextPrompt, prefetchedToolEvidence.prompt].filter(Boolean).join('\n\n')
      : baseContextPrompt;
  const draftSystemPrompt = req.useTools
    ? buildWikiDraftSystemPrompt(draftContextPrompt, topicQuery, maxWords, task)
    : buildWikiSystemPrompt(baseContextPrompt, topicQuery, maxWords, task);

  // ── Stage 3: Call shared Gemma4 helper ───────────────────────────────────
  const userPrompt = req.useTools
    ? `Draft a ${task} wiki article about: ${topicQuery}`
    : `Generate a ${task} wiki article about: ${topicQuery}`;

  const draftResult = await callGemma4WithAceContext(ctx, userPrompt, {
    temperature: 0.1,
    maxTokens: req.useTools ? 540 : 900,
    systemPromptOverride: draftSystemPrompt,
    responseSchema: req.useTools ? undefined : WIKI_RESPONSE_SCHEMA,
    lane: 'interactive-agent' as any, // Use Lane 1
    taskType: req.useTools ? 'wiki-generation-draft' : 'wiki-generation',
  });
  const draftPassMs = Date.now() - draftStartedAt;
  const draftStageTimings = req.useTools
    ? {
        totalMs: draftPassMs,
        assistantTurns: (draftResult.stageTimings?.assistantTurns?.length
          ? draftResult.stageTimings.assistantTurns
          : [{ round: 1, durationMs: draftResult.latencyMs, toolCalls: 0 }]
        ).map((turn, index) =>
          index === 0
            ? { ...turn, toolCalls: prefetchedToolEvidence?.toolCallsExecuted ?? 0 }
            : turn
        ),
        toolCalls: prefetchedToolEvidence?.toolCalls ?? [],
        finalAssistantMs: draftResult.stageTimings?.finalAssistantMs ?? draftResult.latencyMs,
      }
    : (draftResult.stageTimings ?? createEmptyGemmaStageTimings(draftPassMs));
  const wikiToolCallsExecuted = req.useTools
    ? (prefetchedToolEvidence?.toolCallsExecuted ?? 0)
    : draftResult.toolCallsExecuted;
  const wikiToolCallNames = req.useTools
    ? (prefetchedToolEvidence?.toolCallNames ?? [])
    : draftResult.toolCallNames;

  if (!draftResult.ok) {
    collectedErrors.push('LLM unavailable — returning heuristic wiki from cluster summaries.');
    return {
      ok: false,
      query,
      title: `${query} — Codebase Overview`,
      summary: ctx.clusterContext[0]?.summary ?? null,
      sections: fallbackSections,
      relatedFiles: fallbackFiles,
      relatedClusters: fallbackClusters,
      degraded: true,
      errors: collectedErrors,
      latencyMs: Date.now() - start,
      toolCallsExecuted: wikiToolCallsExecuted,
      toolCallNames: wikiToolCallNames,
      stageTimings: buildWikiStageTimings({
        assembleContextMs,
        draftPassMs,
        formatPassMs: 0,
        totalMs: Date.now() - start,
        draft: draftStageTimings,
      }),
    };
  }

  const formatSystemPrompt = req.useTools
    ? buildWikiFormatterSystemPrompt(maxWords)
    : buildWikiSystemPrompt(baseContextPrompt, topicQuery, maxWords, task);
  const finalResult = req.useTools
    ? await callGemma4WithAceContext(
        ctx,
        buildWikiFormattingUserPrompt(topicQuery, maxWords, draftResult.text),
        {
          temperature: 0.05,
          maxTokens: 520,
          systemPromptOverride: formatSystemPrompt,
          responseSchema: WIKI_RESPONSE_SCHEMA,
          lane: 'interactive-agent' as any,
          taskType: 'wiki-generation-format',
        }
      )
    : draftResult;
  const formatPassMs = req.useTools ? finalResult.latencyMs : 0;
  const formatStageTimings = req.useTools
    ? (finalResult.stageTimings ?? createEmptyGemmaStageTimings(formatPassMs))
    : createEmptyGemmaStageTimings(0);

  if (req.useTools && !finalResult.ok) {
    collectedErrors.push(
      'Wiki formatting pass unavailable — returning heuristic wiki from cluster summaries.'
    );
    return {
      ok: false,
      query,
      title: `${query} — Codebase Overview`,
      summary: (draftResult.text.slice(0, 200) || ctx.clusterContext[0]?.summary) ?? null,
      sections: fallbackSections,
      relatedFiles: fallbackFiles,
      relatedClusters: fallbackClusters,
      degraded: true,
      errors: collectedErrors,
      latencyMs: Date.now() - start,
      toolCallsExecuted: wikiToolCallsExecuted,
      toolCallNames: wikiToolCallNames,
      stageTimings: buildWikiStageTimings({
        assembleContextMs,
        draftPassMs,
        formatPassMs,
        totalMs: Date.now() - start,
        draft: draftStageTimings,
        format: formatStageTimings,
      }),
    };
  }

  // ── Stage 4: Parse JSON ──────────────────────────────────────────────────
  const parsed = parseWikiJson(finalResult.parsed ?? finalResult.text);
  if (!parsed) {
    const recoveredFromDraft = req.useTools ? parseWikiDraftText(draftResult.text) : null;
    if (recoveredFromDraft) {
      collectedErrors.push(
        'Recovered structured wiki from draft outline after formatter JSON parse failure.'
      );
      return {
        ok: true,
        query,
        title: recoveredFromDraft.title,
        summary: recoveredFromDraft.summary,
        sections: recoveredFromDraft.sections.length
          ? recoveredFromDraft.sections
          : fallbackSections,
        relatedFiles: recoveredFromDraft.relatedFiles.length
          ? recoveredFromDraft.relatedFiles
          : fallbackFiles,
        relatedClusters: recoveredFromDraft.relatedClusters.length
          ? recoveredFromDraft.relatedClusters
          : fallbackClusters,
        degraded: ctx.degraded,
        errors: collectedErrors,
        latencyMs: Date.now() - start,
        toolCallsExecuted: wikiToolCallsExecuted,
        toolCallNames: wikiToolCallNames,
        stageTimings: buildWikiStageTimings({
          assembleContextMs,
          draftPassMs,
          formatPassMs,
          totalMs: Date.now() - start,
          draft: draftStageTimings,
          format: formatStageTimings,
        }),
      };
    }

    collectedErrors.push('Wiki formatting response could not be parsed as structured wiki.');
    return {
      ok: false,
      query,
      title: `${query} — Codebase Overview`,
      summary: (req.useTools ? draftResult.text : finalResult.text).slice(0, 200) || null,
      sections: fallbackSections,
      relatedFiles: fallbackFiles,
      relatedClusters: fallbackClusters,
      degraded: true,
      errors: collectedErrors,
      latencyMs: Date.now() - start,
      toolCallsExecuted: wikiToolCallsExecuted,
      toolCallNames: wikiToolCallNames,
      stageTimings: buildWikiStageTimings({
        assembleContextMs,
        draftPassMs,
        formatPassMs,
        totalMs: Date.now() - start,
        draft: draftStageTimings,
        format: formatStageTimings,
      }),
    };
  }

  return {
    ok: true,
    query,
    ...parsed,
    degraded: ctx.degraded,
    errors: collectedErrors,
    latencyMs: Date.now() - start,
    toolCallsExecuted: wikiToolCallsExecuted,
    toolCallNames: wikiToolCallNames,
    stageTimings: buildWikiStageTimings({
      assembleContextMs,
      draftPassMs,
      formatPassMs,
      totalMs: Date.now() - start,
      draft: draftStageTimings,
      format: formatStageTimings,
    }),
  };
}
