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

export async function getFixRecommendations(
  req: FixRecommendRequest
): Promise<FixRecommendResult> {
  const startMs = Date.now();
  const model = 'gemma4-legal-fast:latest';
  const topK = Math.min(req.topK ?? 3, 6);

  // ── Step 1: Build search query from error + context ───────────────────────
  const searchQuery = buildSearchQuery(req);

  // ── Step 2: Semantic search via Qdrant (reuses existing dual-embedder) ────
  let searchResults: SearchHit[] = [];
  try {
    const { searchCodebase } = await import('$lib/server/indexer/dual-embedder.js');
    const raw = await searchCodebase(searchQuery, {
      limit: 20,
      contentWeight: 0.65,
      signatureWeight: 0.35,
    });
    searchResults = raw.map((r) => ({
      filePath: String(r.chunk.path ?? r.chunk.relativePath ?? 'unknown'),
      content: String(r.chunk.content ?? ''),
      score: r.score,
      kind: String(r.chunk.kind ?? ''),
      gpuCluster:
        r.chunk.neo4j_gpuCluster != null ? Number(r.chunk.neo4j_gpuCluster) : null,
    }));
  } catch {
    // Qdrant unavailable — fall through to Postgres-only path
  }

  // ── Step 3: Enrich with Postgres metadata for top hits ───────────────────
  const topHitPaths = searchResults.slice(0, 10).map((r) => r.filePath);
  if (topHitPaths.length > 0) {
    try {
      const pgRows = await db.execute(sql`
        SELECT relative_path, domain, kind, semantic_tags, gpu_cluster, som_cluster,
               COALESCE(summary, '') AS summary
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
          if (hit.gpuCluster == null && meta.gpu_cluster != null) {
            hit.gpuCluster = Number(meta.gpu_cluster);
          }
        }
      }
    } catch {
      // non-fatal
    }
  }

  // ── Step 4: Fetch cluster summary for top-hit cluster ────────────────────
  const topCluster = searchResults.find((r) => r.gpuCluster != null)?.gpuCluster ?? null;
  let clusterContext: FixRecommendResult['clusterContext'] = undefined;

  if (topCluster != null && (req.includeClusterSummary !== false)) {
    try {
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
  }

  // ── Step 5: Build structured prompt ──────────────────────────────────────
  const chunksUsed = searchResults.slice(0, 8);
  const systemPrompt = buildSystemPrompt(req, chunksUsed, clusterContext, topK);

  // ── Step 6: Call Gemma4 ───────────────────────────────────────────────────
  let recommendations: FixRecommendation[] = [];
  let llmError: string | undefined;

  try {
    const resp = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: buildUserPrompt(req),
        system: systemPrompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.2, num_predict: 1024 },
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
    const data = await resp.json();
    const raw = (data.response as string).trim();

    recommendations = parseRecommendations(raw, chunksUsed);
  } catch (e: any) {
    // Log raw error server-side only — never expose to callers
    console.error('[fix-recommender] LLM call failed:', e?.message ?? e);
    llmError = 'LLM unavailable — using heuristic recommendations';
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
    'You are an expert TypeScript/SvelteKit code assistant. Your task is to diagnose and fix compilation errors.',
    `Return ONLY a JSON object with a "recommendations" array of exactly ${topK} objects, each with:`,
    '  "title": short label (≤10 words)',
    '  "explanation": why this fix applies (1-2 sentences)',
    '  "fix": the concrete code change or command (≤20 lines)',
    '  "confidence": float 0.0-1.0',
    '  "referenceFiles": array of file paths from the codebase that informed this fix',
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
