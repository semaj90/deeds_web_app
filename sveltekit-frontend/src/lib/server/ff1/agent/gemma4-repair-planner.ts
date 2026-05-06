/**
 * FF1 Gemma4 Repair Planner
 *
 * Takes a ranked DiagnosticEntry → produces a structured RepairPlan via Gemma4.
 *
 * Context pipeline (all capped to avoid OOM / token overflow):
 *   1. File content around error line (≤80 lines)
 *   2. Qdrant semantic search for similar code patterns (top-3, ≤400 chars each)
 *   3. Redis KAG note for the file's directory (≤300 chars)
 *
 * Total prompt budget: ~2000 tokens. Gemma4 responds with a JSON code block.
 *
 * Output: structured RepairPlan (NOT applied — planning only, safe to call freely)
 */

import { readFileSync, existsSync } from 'fs';
import { createHash }               from 'crypto';
import path                         from 'path';
import type { DiagnosticEntry, RepairPlan } from '../graph/graph-schema.js';

const ROOT         = path.resolve(process.cwd());
const MAX_BYTES    = 50_000;
const CTX_LINES    = 10;   // lines before + after error
const MAX_DISPLAY  = 80;   // total lines shown if no line hint
const TURBO_BASE   = process.env.GEMMA_BASE   ?? 'http://localhost:8090';
const OLLAMA_URL   = process.env.OLLAMA_URL   ?? 'http://localhost:11434';
const QDRANT_URL   = process.env.QDRANT_URL   ?? 'http://localhost:6333';
const REDIS_URL    = process.env.REDIS_URL    ?? 'redis://127.0.0.1:6379';

// ── File context ──────────────────────────────────────────────────────────

function fileContext(filePath: string, errorLine?: number): string {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!existsSync(abs)) return `(file not found: ${filePath})`;

  const raw   = readFileSync(abs, { encoding: 'utf8', flag: 'r' });
  const lines = raw.slice(0, MAX_BYTES).split('\n');
  const total = lines.length;

  if (!errorLine || total <= MAX_DISPLAY) {
    return lines.slice(0, MAX_DISPLAY)
      .map((l, i) => `${String(i + 1).padStart(4)} │ ${l}`)
      .join('\n');
  }

  const start = Math.max(0, errorLine - CTX_LINES - 1);
  const end   = Math.min(total, errorLine + CTX_LINES);
  return `… (lines ${start + 1}–${end} of ${total}) …\n` +
    lines.slice(start, end)
      .map((l, i) => {
        const n = start + i + 1;
        return `${n === errorLine ? '>>>' : '   '} ${String(n).padStart(4)} │ ${l}`;
      })
      .join('\n');
}

// ── Qdrant semantic context ───────────────────────────────────────────────

async function qdrantContext(query: string): Promise<string> {
  try {
    const eRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!eRes.ok) return '';
    const { embedding } = await eRes.json() as { embedding: number[] };

    const sRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector: embedding, limit: 3, with_payload: true, score_threshold: 0.5 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!sRes.ok) return '';
    const { result } = await sRes.json() as {
      result: Array<{ payload: { path?: string; content?: string; summary?: string }; score: number }>;
    };
    return result
      .map(r => `// [${r.payload.path ?? '?'} score=${r.score.toFixed(2)}]\n` +
                `${(r.payload.content ?? r.payload.summary ?? '').slice(0, 400)}`)
      .join('\n\n');
  } catch {
    return '';
  }
}

// ── Redis KAG note ────────────────────────────────────────────────────────

async function kagNote(filePath: string): Promise<string> {
  try {
    const dir = path.dirname(filePath).replace(/\\/g, '/');
    const { attachDispose } = await import('$lib/server/redis-disposable.js');
    const { createClient } = await import('redis');
    const raw = createClient({ url: REDIS_URL, socket: { connectTimeout: 2000 } });
    await raw.connect();
    // D16: `await using` auto-calls .quit() on scope exit (even on throw)
    await using r = attachDispose(raw);
    const note = await r.get(`wiki:note:dir:${dir}`) as string | null;
    return (note ?? '').slice(0, 300);
  } catch {
    return '';
  }
}

// ── Gemma4 call ───────────────────────────────────────────────────────────

const SYSTEM = `You are an expert TypeScript/SvelteKit engineer.
Analyze the given diagnostic and produce a minimal, safe repair plan.
Respond ONLY with a JSON code block matching this schema:
\`\`\`json
{
  "rootCause": "one sentence",
  "confidence": 0.0,
  "risk": "low|medium|high",
  "files": [
    {
      "path": "workspace/relative/path.ts",
      "reason": "why this file needs changing",
      "edits": [
        { "type": "replace", "startLine": 1, "endLine": 1,
          "before": "exact existing text", "after": "replacement text" }
      ]
    }
  ],
  "validation": ["npm run check:fast"],
  "rollbackNotes": "how to undo"
}
\`\`\``;

async function callGemma4(userPrompt: string): Promise<{ text: string; pt: number; ct: number }> {
  const res = await fetch(`${TURBO_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:       'gemma4-legal',
      messages:    [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt }],
      max_tokens:  1024,
      temperature: 0.2,
      stream:      false,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Gemma4 HTTP ${res.status}`);
  const d = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    text: d.choices?.[0]?.message?.content ?? '',
    pt:   d.usage?.prompt_tokens    ?? 0,
    ct:   d.usage?.completion_tokens ?? 0,
  };
}

// ── Plan extraction ───────────────────────────────────────────────────────

function extractPlan(text: string, d: DiagnosticEntry): RepairPlan {
  const m = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (m) {
    try {
      const p = JSON.parse(m[1]) as Partial<RepairPlan>;
      return {
        issueId:      d.id,
        rootCause:    p.rootCause    ?? 'Unknown',
        confidence:   p.confidence   ?? 0.5,
        risk:         p.risk         ?? 'medium',
        files:        p.files        ?? [],
        validation:   p.validation   ?? ['npm run check:fast'],
        rollbackNotes: p.rollbackNotes ?? 'Revert file edits manually.',
        model:        'gemma4',
      };
    } catch { /* fall through */ }
  }
  // Fallback — extract root cause from free text
  const rc = text.match(/root\s+cause[:\s]+(.+)/i)?.[1]?.slice(0, 200)
             ?? text.slice(0, 200);
  const risk = text.toLowerCase().includes('high risk') ? 'high'
             : text.toLowerCase().includes('low risk')  ? 'low' : 'medium';
  return {
    issueId:      d.id,
    rootCause:    rc,
    confidence:   0.3,
    risk:         risk as 'low' | 'medium' | 'high',
    files:        [{ path: d.filePath, reason: d.message, edits: [] }],
    validation:   ['npm run check:fast', 'npm run check:svelte'],
    rollbackNotes: 'Manual review required — structured JSON plan not produced.',
    model:        'gemma4',
  };
}

// ── LLM response cache (in-process, resets per run) ──────────────────────

const _cache = new Map<string, RepairPlan>();

function promptHash(d: DiagnosticEntry): string {
  return createHash('sha1').update(`${d.filePath}:${d.line}:${d.message}`).digest('hex').slice(0, 12);
}

// ── Public API ────────────────────────────────────────────────────────────

export async function planRepair(
  diagnostic: DiagnosticEntry,
  opts: { skipQdrant?: boolean; skipKag?: boolean } = {},
): Promise<RepairPlan> {
  const key = promptHash(diagnostic);
  if (_cache.has(key)) return _cache.get(key)!;

  const fileSrc   = fileContext(diagnostic.filePath, diagnostic.line);
  const qdrant    = opts.skipQdrant ? '' : await qdrantContext(
    `TypeScript error: ${diagnostic.message} in ${diagnostic.filePath}`
  );
  const kag       = opts.skipKag ? '' : await kagNote(diagnostic.filePath);

  const userPrompt = [
    `## Diagnostic`,
    `Source: ${diagnostic.source}`,
    `File:   ${diagnostic.filePath}:${diagnostic.line ?? '?'}`,
    `Code:   ${diagnostic.code ?? 'N/A'}`,
    `Msg:    ${diagnostic.message}`,
    '',
    '## File context',
    '```typescript',
    fileSrc,
    '```',
    qdrant ? `\n## Similar code patterns\n${qdrant}` : '',
    kag    ? `\n## Directory notes\n${kag}` : '',
    '\nProduce a minimal, safe repair plan as JSON.',
  ].filter(Boolean).join('\n');

  const { text, pt, ct } = await callGemma4(userPrompt);
  const plan = extractPlan(text, diagnostic);
  plan.promptTokens     = pt;
  plan.completionTokens = ct;
  plan.createdAt        = new Date().toISOString();

  _cache.set(key, plan);
  return plan;
}

export async function planRepairBatch(
  diagnostics: DiagnosticEntry[],
  opts: { maxPlans?: number; skipQdrant?: boolean; skipKag?: boolean } = {},
): Promise<RepairPlan[]> {
  const max    = opts.maxPlans ?? 5;
  const sorted = [...diagnostics].sort((a, b) => b.riskScore - a.riskScore);
  const plans: RepairPlan[] = [];

  for (const d of sorted.slice(0, max)) {
    try {
      plans.push(await planRepair(d, opts));
    } catch (err) {
      console.warn(`[ff1] planRepair failed for ${d.filePath}: ${(err as Error).message}`);
    }
  }
  return plans;
}
