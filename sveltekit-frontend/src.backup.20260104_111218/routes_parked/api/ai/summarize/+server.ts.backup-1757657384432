/// <reference types="vite/client" />
import { json } from "@sveltejs/kit";
import { getCache, setCache, hashPayload, CACHE_CONSTANTS, deleteCache } from '$lib/server/summarizeCache';
import type { RequestHandler } from './$types.js';
import { URL } from "url";

// Enhanced summarization endpoint now supports: streaming, multi-layer caching (Memory + Redis + client IndexedDB hint), structured summaries.
// Cache strategy: hash(text + salient options) => LRU/TTL memory; write-through to Redis if available; emit clientCacheHint for IndexedDB persistence.

// Enhanced summarization endpoint wrapping Gemma3 (general LLM) with steering prompts + fallbacks
const OLLAMA_BASE_URL = import.meta.env.OLLAMA_BASE_URL || "http://localhost:11434";
const PRIMARY_MODEL = import.meta.env.OLLAMA_MODEL || 'gemma3-legal' || 'gemma3:latest';
const FALLBACK_MODEL = 'gemma2:2b'; // lightweight alternative
const MAX_INPUT_CHARS = 80_000;
const REQUEST_TIMEOUT_MS = 25_000;

export interface SummarizeOptions {
  max_tokens?: number;
  mode?: 'auto' | 'bullets' | 'abstract' | 'structured';
  bullets?: number;
  temperature?: number;
  model?: string;
  stream?: boolean; // enable streaming response
  structured?: boolean; // request structured JSON sections
  cache?: boolean; // enable server-side cache
  clientCacheHint?: boolean; // request IndexedDB persistence hint
}

export interface SummarizeResponseMeta {
  duration: number;
  tokens: number;
  promptTokens: number;
  tokensPerSecond: number | string;
  modelUsed: string;
  fallbackUsed: boolean;
}

export interface OllamaResponse {
  response?: string;
  eval_count?: number;
  prompt_eval_count?: number;
  done?: boolean;
}

export interface SummarizeRequest {
  text: string;
  type?: 'legal' | 'general';
  options?: SummarizeOptions;
}

export interface StructuredSummary {
  overview: string;
  keyPoints: string[];
  risks: string[];
  actions: string[];
}

export interface SummarizeResponse {
  success: boolean;
  summary?: string;
  model?: string;
  type?: string;
  mode?: string;
  structured?: StructuredSummary | null;
  cached?: boolean;
  cacheKey?: string;
  cacheSource?: string;
  originalLength?: number;
  summaryLength?: number;
  compressionRatio?: string;
  performance?: SummarizeResponseMeta;
  timestamp: string;
  clientCacheHint?: {
    key: string;
    ttlMs: number;
  };
  suggestions?: string[];
  error?: string;
  details?: string;
}

function buildSummarizerPrompt(text: string, mode: SummarizeOptions['mode'], bullets: number, maxTokens: number, docType: string, structured: boolean) {
  const trimmed = text.trim();
  const baseInstruction = `You are an expert legal summarizer. Provide a faithful, concise summary with NO fabrication.`;
  const structuredSuffix = structured ? `\nReturn JSON with keys: overview (string), keyPoints (string[]), risks (string[]), actions (string[]). If insufficient info for a field, use an empty array or short placeholder string. JSON ONLY.` : '';
  if (mode === 'bullets') {
    return `${baseInstruction}\nSummarize the following ${docType} in exactly ${bullets} bullet points.\nEach bullet: ≤ ${Math.max(12, Math.round(maxTokens / bullets / 2))} words, factual, no intro/outro.${structured ? '\nIf structured output requested, still include bullet text in keyPoints array.' : ''}\n\nTEXT:\n${trimmed}\n\nBULLET SUMMARY (use '-' prefix):${structuredSuffix}`;
  }
  if (mode === 'abstract') {
    return `${baseInstruction}\nProduce an abstract-style summary (≈ ${Math.round(maxTokens / 4)} words) covering: Purpose, Key Points, Risks.\nAvoid bullet formatting.\n\nTEXT:\n${trimmed}\n\nABSTRACT:${structuredSuffix}`;
  }
  if (mode === 'structured') {
    return `${baseInstruction}\nReturn a structured summary with the following labeled sections in this order: Overview, Key Points, Legal Risks, Action Items.${structuredSuffix ? '\nYou MUST output JSON only.' : ''}\nKeep each section concise.\n\nTEXT:\n${trimmed}\n\nSTRUCTURED SUMMARY:${structuredSuffix}`;
  }
  return `${baseInstruction}\nFirst give a 2 sentence abstract, then ${Math.min(5, bullets)} bullet points of key facts (no duplicates).${structured ? '\nProvide structured JSON after bullets.' : ''}\n\nTEXT:\n${trimmed}\n\nSUMMARY:${structuredSuffix}`;
}

function naiveFallbackSummary(text: string, bullets = 3) {
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(s => s.length > 0).slice(0, bullets * 3);
  const keywords = [/contract/i, /liabil/i, /court/i, /risk/i, /evidence/i, /statut/i, /claim/i];
  const scored = sentences.map(s => ({ s, score: s.length * 0.001 + keywords.reduce((acc, k) => acc + (k.test(s) ? 1 : 0), 0) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, bullets).map(v => `- ${v.s.trim()}`).join('\n');
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let to: any;
  const timeout = new Promise<never>((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout after ${ms}ms`)), ms); });
  try { return await Promise.race([p, timeout]); } finally { clearTimeout(to); }
}

export const GET: RequestHandler = async () => {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const models = await res.json().catch(() => ({ models: [] }));
    return json({
      ok: true,
      status: 'healthy',
      service: 'ai-summarization',
      models: models.models?.map((m: any) => m.name) || [],
      endpoint: `${OLLAMA_BASE_URL}/api/generate`,
      primaryModel: PRIMARY_MODEL,
      fallbackModel: FALLBACK_MODEL,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return json({
      ok: false,
      error: 'Ollama service unreachable',
      service: 'ai-summarization',
      endpoint: `${OLLAMA_BASE_URL}/api/generate`,
      primaryModel: PRIMARY_MODEL,
      fallbackModel: FALLBACK_MODEL,
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
};

// Removed local ad-hoc cache; using central summarizeCache utility.

export const POST: RequestHandler = async ({ request }) => {
  let raw: SummarizeRequest;
  try {
    raw = await request.json() as SummarizeRequest;
  } catch {
    return json({ success: false, error: 'Invalid JSON body' } as SummarizeResponse, { status: 400 });
  }
  try {
    const { text, type = 'legal', options = {} as SummarizeOptions } = raw;
    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return json({ success: false, error: 'Text is required and must be at least 10 characters long' }, { status: 400 });
    }
    if (text.length > MAX_INPUT_CHARS) {
      return json({ success: false, error: `Text exceeds maximum length (${MAX_INPUT_CHARS} chars)` }, { status: 413 });
    }
    const maxTokens = Math.min(options.max_tokens || 500, 2048);
    const mode = options.mode || 'auto';
    const bullets = options.bullets && options.bullets > 0 ? Math.min(options.bullets, 10) : 5;
    const model = options.model || PRIMARY_MODEL;
    const structuredRequested = !!options.structured;
    const prompt = buildSummarizerPrompt(text, mode, bullets, maxTokens, type === 'legal' ? 'legal document' : 'document', structuredRequested);

    // Cache key (text length large: hash instead)
    const cacheKey = options.cache ? await hashPayload(`${model}|${mode}|${structuredRequested ? 'structured' : 'plain'}|${bullets}|${text}`) : null;
    if (cacheKey && options.cache) {
      const cached = await getCache(cacheKey);
      if (cached.entry) {
        return json({
          success: true,
          summary: cached.entry.summary,
          model: cached.entry.model,
          type,
          mode,
          structured: cached.entry.structured || null,
          cached: true,
          cacheKey,
          cacheSource: cached.source,
          originalLength: text.length,
          summaryLength: cached.entry.summary.length,
          compressionRatio: (cached.entry.summary.length / text.length * 100).toFixed(1) + '%',
          performance: cached.entry.perf,
          timestamp: new Date().toISOString(),
          clientCacheHint: options.clientCacheHint ? { key: cacheKey, ttlMs: CACHE_CONSTANTS.TTL_MS } : undefined,
          suggestions: ['Cached result. Adjust text or options to recompute.']
        });
      }
    }
    const startTime = Date.now();
    let fallbackUsed = false;
    let modelUsed = model;
    const body = { model, prompt, stream: !!options.stream, options: { temperature: options.temperature ?? 0.25, top_p: 0.9, max_tokens: maxTokens } };
    let result: any;
    const executePrimary = async (): Promise<any> => {
      // Streaming path
      if (body.stream) {
        const response = await withTimeout(fetch(`${OLLAMA_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), REQUEST_TIMEOUT_MS, 'ollama-generate');
        if (!response.ok || !response.body) throw new Error(`Ollama API error: ${response.status}`);
        const reader = response.body.getReader();
        let accumulated = '';
        let finalJSON: any = null;
        return new Response(new ReadableStream({
          async pull(controller) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            const chunk = new TextDecoder().decode(value);
            accumulated += chunk;
            // Attempt to parse partial JSON when structured requested
            if (structuredRequested) {
              const match = accumulated.match(/\{[\s\S]*\}$/); // last JSON object
              if (match) {
                try { finalJSON = JSON.parse(match[0]); } catch {/* ignore */ }
              }
            }
            controller.enqueue(value);
          },
          cancel() { reader.cancel(); }
        }), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Model': model } });
      } else {
        const response = await withTimeout(fetch(`${OLLAMA_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), REQUEST_TIMEOUT_MS, 'ollama-generate');
        if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
        const jsonRes = await response.json();
        if (!jsonRes?.response) throw new Error('No response field in Ollama result');
        return jsonRes;
      }
    };
    try {
      result = await executePrimary();
    } catch (err: any) {
      if (model !== FALLBACK_MODEL) {
        try {
          fallbackUsed = true;
          modelUsed = FALLBACK_MODEL;
          const fbBody = { ...body, model: FALLBACK_MODEL };
          fbBody.stream = false; // disable streaming in fallback for simplicity
          const fbRes = await withTimeout(fetch(`${OLLAMA_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fbBody) }), REQUEST_TIMEOUT_MS, 'ollama-fallback');
          if (!fbRes.ok) throw new Error(`Fallback Ollama API error: ${fbRes.status}`);
          result = await fbRes.json();
        } catch (fbErr) {
          const naive = naiveFallbackSummary(text, bullets);
          const duration = Date.now() - startTime;
          const meta: SummarizeResponseMeta = { duration, tokens: result?.eval_count || 0, promptTokens: result?.prompt_eval_count || 0, tokensPerSecond: 0, modelUsed: 'naive-local-fallback', fallbackUsed: true };
          return json({
            success: true,
            summary: naive,
            model: meta.modelUsed,
            type,
            originalLength: text.length,
            summaryLength: naive.length,
            compressionRatio: (naive.length / text.length * 100).toFixed(1) + '%',
            performance: meta,
            timestamp: new Date().toISOString(),
            suggestions: ['Ollama unavailable - using heuristic summary', 'Reduce input size or retry later', 'Install a small summarization model for stronger fallback']
          });
        }
      } else { throw err; }
    }
    // Streaming path ended early: if result is a Response return it directly
    if (result instanceof Response) {
      return result; // raw stream to client
    }
    const duration = Date.now() - startTime;
    const rawSummary = String(result.response || '').trim();
    let summary = rawSummary;
    if (mode === 'bullets' && !/^\s*- /.test(rawSummary)) {
      const segmented = rawSummary.split(/\n+|(?<=\.)\s+/).map(l => l.trim()).filter(Boolean).slice(0, bullets);
      summary = segmented.map(s => s.startsWith('- ') ? s : `- ${s}`).join('\n');
    }
    const performance: SummarizeResponseMeta = { duration, tokens: result.eval_count || 0, promptTokens: result.prompt_eval_count || 0, tokensPerSecond: result.eval_count ? (result.eval_count / (duration / 1000)).toFixed(2) : 0, modelUsed, fallbackUsed };
    let structured: any = null;
    if (structuredRequested) {
      // Try to extract final JSON object from summary tail
      const jsonMatch = summary.match(/\{[\s\S]*\}$/);
      if (jsonMatch) {
        try {
          structured = JSON.parse(jsonMatch[0]);
          // Remove JSON from plain summary display portion
          summary = summary.replace(jsonMatch[0], '').trim();
        } catch {/* ignore parse error */ }
      }
    }

    // Store in cache layers (memory + redis write-through)
    if (cacheKey && options.cache) {
      await setCache(cacheKey, { summary, structured, model: modelUsed, mode, type, ts: Date.now(), perf: performance, ttlMs: CACHE_CONSTANTS.TTL_MS });
    }
    return json({
      success: true,
      summary,
      model: modelUsed,
      type,
      mode,
      structured: structured || null,
      originalLength: text.length,
      summaryLength: summary.length,
      compressionRatio: (summary.length / text.length * 100).toFixed(1) + '%',
      performance,
      timestamp: new Date().toISOString(),
      cacheKey: cacheKey || undefined,
      cached: false,
      clientCacheHint: cacheKey && options.clientCacheHint ? { key: cacheKey, ttlMs: CACHE_CONSTANTS.TTL_MS } : undefined,
      suggestions: ['Try mode="bullets" or mode="structured" for different formats', 'Provide "bullets": N to control bullet count', 'Use smaller excerpts for more precise summaries']
    });
  } catch (error: any) {
    console.error('AI summarization error:', error);
    return json({ success: false, error: 'AI summarization service temporarily unavailable', details: import.meta.env.NODE_ENV === 'development' ? String(error) : undefined, timestamp: new Date().toISOString() }, { status: 500 });
  }
};

// Auxiliary DELETE for invalidation: /api/ai/summarize/cache/:key
export const DELETE: RequestHandler = async ({ params, url }) => {
  try {
    const key = params.key || url.searchParams.get('key');
    if (!key) return json({ success: false, error: 'Cache key required' }, { status: 400 });
    await deleteCache(key);
    return json({ success: true, deleted: key, timestamp: new Date().toISOString() });
  } catch (err: any) {
    return json({ success: false, error: 'Failed to delete cache entry' }, { status: 500 });
  }
};
