/**
 * SOM cell narrative summaries.
 *
 * Each (x,y) SOM cell is a topological neighbourhood — files at adjacent
 * BMU coordinates share structural patterns even if they differ semantically.
 * This module generates and caches a short Gemma4 narrative for each cell.
 *
 * Cache key:  summary:som:<x>:<y>   (6h TTL, same as cluster summaries)
 *
 * Data flow:
 *   1. Scroll Qdrant for chunks where som_bmu_col=x AND som_bmu_row=y.
 *   2. Aggregate tags + representative file paths.
 *   3. Call Gemma4 (TurboQuant :8090 → Ollama :11434 fallback) with
 *      a structured prompt.
 *   4. Store JSON { x, y, summary, patterns, fileCount } in Redis.
 *
 * ACE integration:
 *   context-assembler.ts calls getSomCellSummary(x, y) after the cluster
 *   summary step to inject topological neighbourhood context.
 */

import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import { TTL } from '$lib/server/cache-keys.js';

export interface SomCellSummary {
  x: number;
  y: number;
  summary:   string;
  patterns:  string[];
  tags:      string[];
  fileCount: number;
  generatedAt: string;
}

const SOM_TTL = TTL.CLUSTER_SUMMARY; // 6 hours

function somSummaryKey(x: number, y: number) {
  return `summary:som:${x}:${y}`;
}

// ── read ──────────────────────────────────────────────────────────────────────

export async function getCachedSomCellSummary(
  x: number,
  y: number
): Promise<SomCellSummary | null> {
  try {
    const redis = getRedis();
    const raw   = await redis.get(somSummaryKey(x, y));
    if (!raw) return null;
    return JSON.parse(raw) as SomCellSummary;
  } catch {
    return null;
  }
}

// ── generate ──────────────────────────────────────────────────────────────────

export async function generateSomCellSummary(
  x: number,
  y: number,
  skipLlm = false
): Promise<{ ok: boolean; summary: SomCellSummary | null }> {
  // Check cache first
  const cached = await getCachedSomCellSummary(x, y);
  if (cached) return { ok: true, summary: cached };

  // Scroll Qdrant for files at this SOM cell
  let points: Array<{ id: string; payload?: Record<string, unknown> }> = [];
  try {
    const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            { key: 'som_bmu_col', match: { value: x } },
            { key: 'som_bmu_row', match: { value: y } },
          ],
        },
        limit:        60,
        with_payload: true,
        with_vector:  false,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { result: { points: typeof points } };
      points = data.result?.points ?? [];
    }
  } catch { /* Qdrant unavailable */ }

  if (!points.length) return { ok: false, summary: null };

  const fileCount  = points.length;
  const allTags    = [...new Set(points.flatMap(p => (p.payload?.tags as string[] | undefined) ?? []))].slice(0, 12);
  const repFiles   = points
    .sort((a, b) => ((b.payload?.fanIn as number | undefined) ?? 0) - ((a.payload?.fanIn as number | undefined) ?? 0))
    .slice(0, 5)
    .map(p => String(p.payload?.filePath ?? p.payload?.chunkText?.toString().slice(0, 50) ?? p.id));

  let summaryText = `SOM cell (${x},${y}): ${fileCount} files, tags: ${allTags.join(', ')}`;

  if (!skipLlm) {
    const prompt =
`You are analysing a Self-Organising Map (SOM) topological cell in a legal AI SvelteKit + TypeScript platform.

SOM cell coordinates: (${x}, ${y})
Files at this cell (top by fan-in):
${repFiles.map(f => `  - ${f}`).join('\n')}

Tags: ${allTags.join(', ')}
File count: ${fileCount}

Write 2 sentences describing what architectural concern this SOM neighbourhood represents.
Focus on structural patterns and data-flow, not individual files.`;

    try {
      // TurboQuant first, Ollama fallback
      const turbo = process.env.TURBO_URL ?? 'http://127.0.0.1:8090';
      let   llmText = '';

      try {
        const r = await fetch(`${turbo}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model:       'gemma4-legal-vlm:latest',
            messages:    [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens:  180,
            cache_prompt: true,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (r.ok) {
          const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
          llmText = d.choices?.[0]?.message?.content?.trim() ?? '';
        }
      } catch { /* TurboQuant unavailable */ }

      if (!llmText) {
        const ollamaUrl = ENV.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
        const r = await fetch(`${ollamaUrl}/api/generate`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ model: 'gemma4-legal-vlm:latest', prompt, stream: false, options: { temperature: 0.2, num_predict: 180 } }),
          signal:  AbortSignal.timeout(60_000),
        });
        if (r.ok) {
          const d = (await r.json()) as { response?: string };
          llmText = d.response?.trim() ?? '';
        }
      }

      if (llmText) summaryText = llmText;
    } catch { /* LLM unavailable — use tag-based fallback */ }
  }

  const result: SomCellSummary = {
    x, y,
    summary:     summaryText,
    patterns:    allTags.slice(0, 5),
    tags:        allTags,
    fileCount,
    generatedAt: new Date().toISOString(),
  };

  // Cache
  try {
    const redis = getRedis();
    await redis.setex(somSummaryKey(x, y), SOM_TTL, JSON.stringify(result));
  } catch { /* non-fatal */ }

  return { ok: true, summary: result };
}

// ── ACE helper (called from context-assembler) ────────────────────────────────

/**
 * Get SOM cell summary — non-blocking best-effort.
 * Returns null immediately if Qdrant / LLM unavailable.
 */
export async function getSomCellSummary(
  x: number,
  y: number
): Promise<SomCellSummary | null> {
  const cached = await getCachedSomCellSummary(x, y);
  if (cached) return cached;
  // Generate without LLM for ACE hot path (LLM generation runs async in background)
  const { summary } = await generateSomCellSummary(x, y, /* skipLlm */ true);
  // Fire-and-forget LLM generation for next call
  generateSomCellSummary(x, y, false).catch(() => {});
  return summary;
}
