/**
 * fix-recommender.ts — CodeIntel-aware error-fix recommendation engine
 *
 * Pipeline:
 *   1. Parse the incoming error (message + optional stack/file/line)
 *   2. Semantic search against codebase_chunk_index via Qdrant dual-vector
 *   3. Enrich with Postgres metadata (domain, kind, semantic_tags, gpu_cluster)
 *   4. Fetch cluster summary from cluster_summaries for top-hit cluster
 *   5. Assemble a structured system prompt with all context
 *   6. Call Gemma4 via Ollama and return structured recommendations
 */
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { runGemma4Agent } from '$lib/server/ai/gemma4-agent.js';
import { loadCodebaseContext, rerankChunks, type RerankResult } from '$lib/server/retrieval/codebase-context.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface FixRecommendRequest {
  /** The raw error message or TypeScript/compiler diagnostic */
  error: string;
  /** Optional: file path where the error occurred */
  filePath?: string;
  /** Optional: line number in the file */
  line?: number;
  /** Optional: surrounding code snippet for context */
  codeSnippet?: string;
  /** Optional: framework hint (svelte5, sveltekit, drizzle, etc.) */
  framework?: string;
  /** Max fix recommendations to return (default 3) */
  topK?: number;
  /** Include cluster narrative in output (default true) */
  includeClusterSummary?: boolean;
}

export interface FixRecommendation {
  /** Short label for this recommendation */
  title: string;
  /** Explanation of why this fix applies */
  explanation: string;
  /** Concrete code change or command to run */
  fix: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Reference files from the codebase that informed this recommendation */
  referenceFiles: string[];
  /** True if the fix was verified via LinterService */
  verified?: boolean;
  /** Combined output from svelte-check/tsc during verification */
  verificationLogs?: string;
}

export interface FixRecommendResult {
  ok: boolean;
  error?: string;
  recommendations: FixRecommendation[];
  clusterContext?: {
    clusterId: number;
    purpose: string;
    summary: string;
    patterns: string[];
    warnings: string[];
    tags: string[];
  };
  diagnostics: {
    chunksSearched: number;
    chunksUsed: number;
    /** GPU cluster ID that was hit, or null if none matched */
    clusterHit: number | null;
    modelUsed: string | null;
    latencyMs: number;
    searchQuery: string;
    /** True when LLM failed and heuristic fallback was used */
    degraded: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function getFixRecommendations(req: FixRecommendRequest): Promise<FixRecommendResult> {
  const startMs = Date.now();
  const model = 'gemma4-rotorquant:latest-fast:latest';
  const topK = Math.min(req.topK ?? 3, 6);

  // ── Step 1: Build search query from error + context ───────────────────────
  const searchQuery = buildSearchQuery(req);

  let searchResults: SearchHit[] = [];
  let clusterSummary: RerankResult['clusterSummary'] | undefined;
  let topologyContext: RerankResult['topologyContext'] | undefined;
  
  try {
    const reranked = await rerankChunks(searchQuery, {
      limit: 15,
      contentWeight: 0.6,
      signatureWeight: 0.4,
      caller: 'fix-recommender',
      includeClusterSummary: true,
      includeTopologyContext: true,
    });

    clusterSummary = reranked.clusterSummary;
    topologyContext = reranked.topologyContext;

    searchResults = reranked.results.map((r) => ({
      filePath: r.relativePath,
      content: r.content,
      score: r.score,
      kind: r.kind,
      gpuCluster: r.gpuCluster ?? null,
      semanticTags: r.tags || [],
    }));
  } catch (e: any) {
    console.error('[fix-recommender] Stage C retrieval failed:', e.message);
  }

  // ── Step 3: Enrich with Postgres metadata for top hits ───────────────────
  const topHitPaths = searchResults.slice(0, 10).map((r) => r.filePath);
  if (topHitPaths.length > 0) {
    try {
      const pgRows = await db.execute(sql`
        SELECT relative_path, domain, kind, semantic_tags, gpu_cluster, som_cluster,
               COALESCE(summary, '') AS summary,
               cluster_summary
        FROM codebase_chunk_index
        WHERE relative_path = ANY(${topHitPaths})
        LIMIT 20
      `);
      const metaMap = new Map(pgRows.rows.map((r: any) => [r.relative_path, r]));
      for (const hit of searchResults) {
        const meta = metaMap.get(hit.filePath) as any;
        if (meta) {
          hit.domain = meta.domain;
          hit.semanticTags = Array.isArray(meta.semantic_tags) ? meta.semantic_tags : [];
          hit.summary = meta.summary;
          if (meta.cluster_summary && typeof meta.cluster_summary === 'object') {
            hit.clusterSummaryJson = meta.cluster_summary as Record<string, unknown>;
          }
          if (hit.gpuCluster == null && meta.gpu_cluster != null) {
            hit.gpuCluster = Number(meta.gpu_cluster);
          }
        }
      }

      // Apply Karpathy tag boost — improves cluster targeting accuracy
      applyKarpathyTagBoost(searchResults, req.error);
      searchResults.sort((a, b) => b.score - a.score);
    } catch {
      // non-fatal
    }
  }

  // ── Step 4: Fetch cluster summary for top-hit cluster ────────────────────
  const topCluster = searchResults.find((r) => r.gpuCluster != null)?.gpuCluster ?? null;
  let clusterContext: FixRecommendResult['clusterContext'] = undefined;

  if (topCluster != null && req.includeClusterSummary !== false) {
    try {
      // Primary: cluster_summaries table (may be sparsely populated)
      const csRows = await db.execute(sql`
        SELECT gpu_cluster, COALESCE(purpose,'') AS purpose,
               COALESCE(summary,'') AS summary,
               COALESCE(patterns,'{}') AS patterns,
               COALESCE(warnings,'{}') AS warnings,
               COALESCE(tags,'{}') AS tags
        FROM cluster_summaries
        WHERE gpu_cluster = ${topCluster}
        LIMIT 1
      `);
      if (csRows.rows.length > 0) {
        const cs = csRows.rows[0] as any;
        clusterContext = {
          clusterId: topCluster,
          purpose: cs.purpose,
          summary: cs.summary,
          patterns: Array.isArray(cs.patterns) ? cs.patterns : [],
          warnings: Array.isArray(cs.warnings) ? cs.warnings : [],
          tags: Array.isArray(cs.tags) ? cs.tags : [],
        };
      }
    } catch {
      // non-fatal
    }

    // Fallback: read cluster_summary JSONB persisted by cluster-summary.ts
    // into codebase_chunk_index — populated by the GPU/SOM pipeline loop.
    if (!clusterContext) {
      const topHitWithJson = searchResults.find(
        (r) => r.gpuCluster === topCluster && r.clusterSummaryJson != null
      );
      if (topHitWithJson?.clusterSummaryJson) {
        const cs = topHitWithJson.clusterSummaryJson as any;
        clusterContext = {
          clusterId: topCluster,
          purpose: String(cs.purpose ?? ''),
          summary: String(cs.summary ?? ''),
          patterns: Array.isArray(cs.patterns) ? (cs.patterns as string[]) : [],
          warnings: Array.isArray(cs.warnings) ? (cs.warnings as string[]) : [],
          tags: Array.isArray(cs.keyFiles) ? (cs.keyFiles as string[]) : [],
        };
      }
    }
  }

  // ── Step 5: Build structured prompt ──────────────────────────────────────
  const chunksUsed = searchResults.slice(0, 8);
  
  // Apply language-aware boost stub as requested
  for (const hit of chunksUsed) {
    hit.score = applyLanguageAwareBoost(hit, req.filePath);
  }
  chunksUsed.sort((a, b) => b.score - a.score);

  // Context envelope for logging and future logic
  const contextEnvelope = {
    query: searchQuery,
    caller: 'fix-recommender',
    hits: chunksUsed,
    clusterSummary: clusterSummary ?? null,
    topologyContext: topologyContext ?? null,
  };

  const systemPrompt = buildSystemPrompt(req, chunksUsed, clusterContext, topK);

  // ── Step 6: Call Gemma4 ───────────────────────────────────────────────────
  let recommendations: FixRecommendation[] = [];
  let llmError: string | undefined;

  try {
    // Stage 6: Agentic Loop (supports web_search, rag_search, etc.)
    const agentResult = await runGemma4Agent(buildUserPrompt(req), {
      systemPrompt,
      pipeline: 'ace-fix',
    });

    if (agentResult.answer) {
      recommendations = parseRecommendations(agentResult.answer.trim(), chunksUsed);
    } else {
      throw new Error('Agent returned empty answer');
    }
  } catch (e: any) {
    // Log raw error server-side only — never expose to callers
    console.error('[fix-recommender] Agentic loop failed:', e?.message ?? e);
    llmError = 'Agentic loop failed — using heuristic recommendations';
    recommendations = heuristicRecommendations(req, chunksUsed, topK);
  }

  return {
    ok: !llmError,
    error: llmError,
    recommendations: recommendations.slice(0, topK),
    clusterContext,
    diagnostics: {
      chunksSearched: searchResults.length,
      chunksUsed: chunksUsed.length,
      clusterHit: topCluster,
      modelUsed: llmError ? null : model,
      latencyMs: Date.now() - startMs,
      searchQuery,
      degraded: !!llmError,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

interface SearchHit {
  filePath: string;
  content: string;
  score: number;
  kind: string;
  gpuCluster: number | null;
  domain?: string;
  semanticTags?: string[];
  summary?: string;
  /** Cluster narrative from codebase_chunk_index.cluster_summary JSONB */
  clusterSummaryJson?: Record<string, unknown>;
}

// ── Karpathy vocabulary (mirrors context-assembler.ts tag map) ────────────────
// These are the semantic tags assigned during codebase indexing.
// Each matching tag in a chunk's semantic_tags array earns +0.08 on score (max +0.24).
const KARPATHY_VOCAB = new Set([
  'state-management',
  'api-route',
  'database-access',
  'authentication',
  'form-handling',
  'error-handling',
  'caching',
  'streaming',
  'vector-search',
  'llm-inference',
  'file-upload',
  'ml-inference',
  'graph-analysis',
  'embedding',
  'queue',
  'svelte-component',
  'server-action',
  'drizzle-orm',
  'qdrant',
  'redis',
]);

/**
 * Apply a small Karpathy-tag score boost to chunks whose semantic_tags
 * overlap with vocabulary words extracted from the error message.
 * Mirrors the boost in context-assembler.ts::applyKarpathyBoost().
 */
function applyKarpathyTagBoost(hits: SearchHit[], errorText: string): void {
  const words = errorText
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  const matchingTags = new Set<string>();
  for (const word of words) {
    for (const tag of KARPATHY_VOCAB) {
      if (tag.includes(word) || word.includes(tag.split('-')[0])) matchingTags.add(tag);
    }
  }
  if (matchingTags.size === 0) return;
  for (const hit of hits) {
    const overlap = (hit.semanticTags ?? []).filter((t) => matchingTags.has(t)).length;
    if (overlap > 0) hit.score += Math.min(overlap * 0.08, 0.24);
  }
}

/** Lightweight language-aware score boost as requested in the Phase 89 plan */
function applyLanguageAwareBoost(hit: SearchHit, activeFile?: string): number {
  if (!activeFile) return hit.score;
  const activeExt = activeFile.split('.').pop();
  const hitExt = hit.filePath.split('.').pop();
  
  let score = hit.score;
  // Same-extension boost
  if (activeExt && hitExt && activeExt === hitExt) {
    score *= 1.05;
  }
  return Math.min(1.0, score);
}

function buildSearchQuery(req: FixRecommendRequest): string {
  const parts: string[] = [req.error.slice(0, 200)];
  if (req.filePath) {
    // Extract filename stem for better matching
    const stem = req.filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
    if (stem) parts.push(stem);
  }
  if (req.framework) parts.push(req.framework);
  return parts.join(' ');
}

function buildSystemPrompt(
  req: FixRecommendRequest,
  chunks: SearchHit[],
  cluster: FixRecommendResult['clusterContext'],
  topK: number
): string {
  const lines: string[] = [
    'You are an expert TypeScript/SvelteKit code assistant. Your mission is to diagnose and fix errors using production-grade verification.',
    '',
    '### AUTONOMOUS REPAIR PROTOCOL:',
    '1. READ: Use `read_file` to understand the target file and any related dependencies.',
    '2. PATCH: Use `apply_shadow_patch` to apply your proposed fix to the target file.',
    '3. VERIFY: Use `verify_fix` to run compiler/linter checks on your patch.',
    '4. ANALYZE: If there are errors, read the file again and iterate (max 2 retries).',
    '5. CLEANUP: Mandatory! Call `revert_fix` on every file you patched before finishing.',
    '',
    'Return ONLY a JSON object with a "recommendations" array of exactly ${topK} objects, each with:',
    '  "title": short label (≤10 words)',
    '  "explanation": why this fix applies (1-2 sentences)',
    '  "fix": the concrete code change (the final version that passed verification)',
    '  "confidence": float 0.0-1.0',
    '  "referenceFiles": array of file paths from the codebase that informed this fix',
    '  "verified": boolean (true if verify_fix returned success:true)',
    '  "verificationLogs": string (summary of the linter output)',
    '',
    'Do NOT include any text outside the JSON object.',
  ];

  // Cluster narrative (architecture understanding)
  if (cluster?.summary) {
    lines.push(
      '',
      `## Codebase Cluster ${cluster.clusterId} — ${cluster.purpose}`,
      cluster.summary,
    );
    if (cluster.patterns.length) lines.push(`Patterns: ${cluster.patterns.join(', ')}`);
    if (cluster.warnings.length) lines.push(`Known issues: ${cluster.warnings.join('; ')}`);
  }

  // Relevant code chunks
  if (chunks.length > 0) {
    lines.push('', '## Relevant codebase context (ranked by semantic similarity)');
    for (const c of chunks.slice(0, 6)) {
      const tags = c.semanticTags?.slice(0, 4).join(', ') ?? '';
      const meta = [c.domain, c.kind, tags].filter(Boolean).join(' | ');
      lines.push(`\n### ${c.filePath}${meta ? ` (${meta})` : ''} score:${c.score.toFixed(2)}`);
      lines.push(c.content.slice(0, 600));
    }
  }

  return lines.join('\n');
}

function buildUserPrompt(req: FixRecommendRequest): string {
  const parts: string[] = [`Error: ${req.error}`];
  if (req.filePath) parts.push(`File: ${req.filePath}${req.line != null ? `:${req.line}` : ''}`);
  if (req.framework) parts.push(`Framework: ${req.framework}`);
  if (req.codeSnippet) parts.push(`\nCode snippet:\n${req.codeSnippet.slice(0, 800)}`);
  return parts.join('\n');
}

function parseRecommendations(raw: string, chunks: SearchHit[]): FixRecommendation[] {
  try {
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const parsed = JSON.parse(cleaned);
    const arr: any[] = Array.isArray(parsed) ? parsed : (parsed.recommendations ?? []);
    return arr.map((r: any) => ({
      title: String(r.title ?? ''),
      explanation: String(r.explanation ?? ''),
      fix: String(r.fix ?? ''),
      confidence: Math.min(1, Math.max(0, Number(r.confidence ?? 0.5))),
      referenceFiles: Array.isArray(r.referenceFiles)
        ? r.referenceFiles.map(String)
        : chunks.slice(0, 2).map((c) => c.filePath),
      verified: Boolean(r.verified ?? false),
      verificationLogs: String(r.verificationLogs ?? ''),
    }));
  } catch {
    return heuristicRecommendations({ error: raw } as FixRecommendRequest, chunks, 3);
  }
}

/** Fallback when LLM fails: derive recommendations from chunk metadata */
function heuristicRecommendations(
  req: FixRecommendRequest,
  chunks: SearchHit[],
  topK: number
): FixRecommendation[] {
  const recs: FixRecommendation[] = [];

  // Pattern: TypeScript type error
  if (/TS\d{4}|type.*is not assignable|property.*does not exist/i.test(req.error)) {
    recs.push({
      title: 'Check TypeScript type definition',
      explanation: 'The error indicates a type mismatch. Review the type definition in the referenced file.',
      fix: `// Check the type at ${req.filePath ?? 'the error location'}\n// Ensure the value matches the expected type`,
      confidence: 0.6,
      referenceFiles: chunks.filter((c) => c.kind === 'type' || c.domain === 'types').slice(0, 2).map((c) => c.filePath),
    });
  }

  // Pattern: Import/module not found
  if (/Cannot find module|Module not found|ERR_MODULE_NOT_FOUND/i.test(req.error)) {
    recs.push({
      title: 'Fix module import path',
      explanation: 'The import path is incorrect or the module does not exist at the specified location.',
      fix: '// Verify the import uses .js extension:\n// import { x } from \'$lib/module.js\'',
      confidence: 0.7,
      referenceFiles: chunks.slice(0, 2).map((c) => c.filePath),
    });
  }

  // Pattern: Svelte 4 → 5 migration
  if (/export let|on:|createEventDispatcher|\$:/i.test(req.error + (req.codeSnippet ?? ''))) {
    recs.push({
      title: 'Migrate to Svelte 5 runes syntax',
      explanation: 'Svelte 4 patterns (export let, on:, $:) are not valid in Svelte 5 runes mode.',
      fix: '// export let x  →  let { x } = $props()\n// $: y = x * 2  →  let y = $derived(x * 2)\n// on:click={fn}  →  onclick={fn}',
      confidence: 0.85,
      referenceFiles: chunks.filter((c) => c.domain === 'ui').slice(0, 2).map((c) => c.filePath),
    });
  }

  // Generic fallback from top chunk
  if (recs.length < topK && chunks.length > 0) {
    recs.push({
      title: 'Review similar codebase patterns',
      explanation: `Similar code found in ${chunks[0].filePath}. Compare your implementation with this reference.`,
      fix: `// Reference: ${chunks[0].filePath}\n${chunks[0].content.slice(0, 300)}`,
      confidence: 0.4,
      referenceFiles: chunks.slice(0, 3).map((c) => c.filePath),
    });
  }

  return recs.slice(0, topK);
}
