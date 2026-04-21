/**
 * ace-error-kag.ts — Error summarization → KAG pipeline
 *
 * Takes raw error context (compiler output, runtime logs, test failures)
 * and:
 *   1. Calls Gemma 4 to produce a structured error summary (via /api/chat)
 *   2. Persists the summary to Postgres research_summaries
 *   3. Embeds the summary and upserts it to Qdrant (research_summaries collection)
 *   4. Tags the Qdrant point with error_type, affected_files, fix_hint
 *   5. Optionally triggers a follow-up ace-agent query for fix recommendations
 *
 * The summary row becomes part of the KAG graph and RL policy loop
 * (buildResearchGraph in research-graph-rl.ts picks it up automatically).
 *
 * Exports:
 *   summarizeErrorToKag  — main entry point
 *   ErrorKagResult       — return type
 */

import { ENV } from '$lib/server/env.server.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorKagInput {
  /** Raw error text: compiler output, test failure, runtime stack trace */
  errorText: string;
  /** Optional: file paths already known to be involved */
  affectedFiles?: string[];
  /** Optional: query string for the ace-agent follow-up (if omitted, no follow-up) */
  followUpQuery?: string;
  /** Source label stored in KAG tag: 'svelte-check' | 'vitest' | 'runtime' | 'playwright' */
  source?: string;
}

export interface ErrorSummary {
  errorType:     string;   // e.g. "TypeScript type mismatch", "SSR hydration failure"
  rootCause:     string;   // one-sentence root cause
  affectedFiles: string[]; // files mentioned in the error
  fixHint:       string;   // actionable one-liner
  severity:      'low' | 'medium' | 'high' | 'critical';
  tags:          string[]; // KAG tags for Qdrant
}

export interface ErrorKagResult {
  ok:           boolean;
  summaryId?:   string;    // UUID of the research_summaries row
  summary?:     ErrorSummary;
  qdrantPoint?: string;    // Qdrant point ID
  degraded:     boolean;
  error?:       string;
  latencyMs:    number;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM error summarization (uses /api/chat for tool compatibility)
// ─────────────────────────────────────────────────────────────────────────────

const ERROR_SYSTEM = `You are a TypeScript/SvelteKit error analyst.
Given raw error output, extract a structured JSON summary with exactly these fields:
{
  "errorType": "short category name",
  "rootCause": "one sentence",
  "affectedFiles": ["relative/path.ts"],
  "fixHint": "one actionable sentence",
  "severity": "low|medium|high|critical",
  "tags": ["tag1", "tag2"]
}
Respond with ONLY the JSON object, no markdown fences.`;

async function callGemma4ForErrorSummary(errorText: string, model: string): Promise<ErrorSummary | null> {
  try {
    const resp = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.1, num_predict: 512 },
        format: {
          type: 'json_schema',
          json_schema: {
            name: 'error_summary',
            schema: {
              type: 'object',
              properties: {
                errorType:     { type: 'string' },
                rootCause:     { type: 'string' },
                affectedFiles: { type: 'array', items: { type: 'string' } },
                fixHint:       { type: 'string' },
                severity:      { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                tags:          { type: 'array', items: { type: 'string' } },
              },
              required: ['errorType', 'rootCause', 'affectedFiles', 'fixHint', 'severity', 'tags'],
            },
          },
        },
        messages: [
          { role: 'system', content: ERROR_SYSTEM },
          { role: 'user',   content: `Error output:\n\n${errorText.slice(0, 4000)}` },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
    const data = await resp.json() as { message: { content: string } };
    return JSON.parse(data.message.content) as ErrorSummary;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Embed helper
// ─────────────────────────────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[] | null> {
  try {
    const resp = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ENV.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest', input: text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { embeddings?: number[][] };
    return data.embeddings?.[0] ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main pipeline
// ─────────────────────────────────────────────────────────────────────────────

export async function summarizeErrorToKag(input: ErrorKagInput): Promise<ErrorKagResult> {
  const start   = Date.now();
  const model   = ENV.OLLAMA_CHAT_MODEL ?? 'gemma4-legal-fast:latest';
  const source  = input.source ?? 'unknown';

  // ── 1. LLM summarization ────────────────────────────────────────────────
  const summary = await callGemma4ForErrorSummary(input.errorText, model);
  if (!summary) {
    // Fallback: construct a minimal summary from raw text without LLM
    const fallback: ErrorSummary = {
      errorType:     'parse-failed',
      rootCause:     input.errorText.split('\n')[0]?.slice(0, 200) ?? 'unknown',
      affectedFiles: input.affectedFiles ?? [],
      fixHint:       'Review error output manually',
      severity:      'medium',
      tags:          [source, 'auto-summarize-failed'],
    };
    return {
      ok: false, summary: fallback, degraded: true,
      error: 'LLM summarization failed — fallback used',
      latencyMs: Date.now() - start,
    };
  }

  // Merge caller-supplied files
  if (input.affectedFiles?.length) {
    summary.affectedFiles = [...new Set([...summary.affectedFiles, ...input.affectedFiles])];
  }
  summary.tags = [...new Set([...summary.tags, source, summary.severity])];

  // ── 2. Embed the summary ────────────────────────────────────────────────
  const summaryText = `${summary.errorType}: ${summary.rootCause}. Fix: ${summary.fixHint}`;
  const embedding = await embedText(summaryText);

  // ── 3. Persist to Postgres research_summaries ───────────────────────────
  let summaryId: string | undefined;
  try {
    const { pool } = await import('$lib/server/db/client');
    const res = await pool.query<{ id: string }>(
      `INSERT INTO research_summaries
         (title, summary, embedding, tags, source, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [
        `[${source}] ${summary.errorType}`,
        JSON.stringify(summary),
        embedding ? `[${embedding.join(',')}]` : null,
        summary.tags,
        source,
      ],
    );
    summaryId = res.rows[0]?.id;
  } catch (err) {
    // Non-fatal — continue to Qdrant even if Postgres write fails
    console.warn('[ace-error-kag] Postgres write failed:', (err as Error).message);
  }

  // ── 4. Upsert to Qdrant research_summaries collection ──────────────────
  let qdrantPoint: string | undefined;
  if (embedding) {
    try {
      const pointId = summaryId ?? crypto.randomUUID();
      const upsertResp = await fetch(
        `${ENV.QDRANT_URL ?? 'http://localhost:6333'}/collections/research_summaries/points`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [{
              id: pointId,
              vector: embedding,
              payload: {
                title:         `[${source}] ${summary.errorType}`,
                summary:       summaryText,
                rootCause:     summary.rootCause,
                fixHint:       summary.fixHint,
                severity:      summary.severity,
                affectedFiles: summary.affectedFiles,
                tags:          summary.tags,
                source,
                createdAt:     new Date().toISOString(),
              },
            }],
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (upsertResp.ok) qdrantPoint = pointId;
    } catch (err) {
      console.warn('[ace-error-kag] Qdrant upsert failed:', (err as Error).message);
    }
  }

  return {
    ok:           true,
    summaryId,
    summary,
    qdrantPoint,
    degraded:     !summaryId || !qdrantPoint,
    latencyMs:    Date.now() - start,
  };
}
