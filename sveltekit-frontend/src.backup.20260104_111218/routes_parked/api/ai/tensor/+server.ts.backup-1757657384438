import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { cache, cacheEmbedding, cacheSearchResults } from '$lib/server/cache/redis';

// Accept text and return embedding tensor with caching and indexing hooks
export const POST: RequestHandler = async ({ request, fetch }) => {
  try {
    const body = await request.json();
    const envModel =
      process.env.EMBED_MODEL ||
      process.env.PUBLIC_EMBED_MODEL ||
      process.env.EMBED_MODEL_DEFAULT ||
      process.env.PUBLIC_EMBED_MODEL_DEFAULT ||
      'nomic-embed-text';
    const {
      text,
      model = envModel,
      tags = [],
      type = 'ocr'
    } = body as { text: string; model?: string; tags?: string[]; type?: string };
    if (!text || typeof text !== 'string') return json({ error: 'Missing text' }, { status: 400 });

  // Node-safe base64 (avoid btoa which is not defined in Node)
  const base64 = Buffer.from(text, 'utf8').toString('base64');
  const key = `tensor:${model}:${base64.slice(0, 64)}`;
    const cached = await cache.get<number[]>(key);
    if (cached) {
      // Mirror both fields for compatibility
      return json({ tensor: cached, embedding: cached, cached: true, model, tags, type, backend: 'cache' });
    }

  const fastApiUrl = process.env.FASTAPI_URL || process.env.PUBLIC_FASTAPI_URL;
  const vllmUrl = (process.env.VLLM_ENDPOINT || process.env.PUBLIC_VLLM_ENDPOINT || '').replace(/\/$/, '');

    // Helper to finalize and cache response
    const finalize = async (embedding: number[], wasCached = false, backend: 'fastapi' | 'vllm' | 'ollama' | 'go') => {
      await cache.set(key, embedding, 24 * 60 * 60 * 1000);
      await cacheEmbedding(text, embedding, model);
      await cacheSearchResults(text, 'tensor', [{ id: key, score: 1 }], { model, tags });
      return json({ tensor: embedding, embedding, cached: wasCached, model, tags, type, backend });
    };

    // Primary: FastAPI embed service
    if (fastApiUrl) {
      try {
        const resp = await fetch(`${fastApiUrl.replace(/\/$/, '')}/embed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, model, tags })
        });
        if (resp.ok) {
          const data = (await resp.json()) as { embedding: number[] };
          return await finalize(data.embedding, false, 'fastapi');
        }
        // fall through to Go fallback when FastAPI responds non-OK
      } catch {
        // fall through to Go fallback on error
      }
    }

    // Secondary fallback: OpenAI-compatible embeddings (e.g., vLLM) if configured
    if (vllmUrl) {
      try {
        const vResp = await fetch(`${vllmUrl}/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, input: text })
        });
    if (vResp.ok) {
          const vJson = await vResp.json();
          const emb: number[] | undefined = vJson?.data?.[0]?.embedding as number[] | undefined;
          if (Array.isArray(emb) && emb.length > 0) {
      return await finalize(emb, false, 'vllm');
          }
        }
      } catch {
        // continue to Ollama fallback
      }
    }

    // Tertiary fallback: Ollama embeddings API (local default port 11434)
    try {
      const ollamaUrl = (process.env.OLLAMA_URL || process.env.PUBLIC_OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
      const oResp = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt: text })
      });
    if (oResp.ok) {
        const oJson = await oResp.json();
        const emb: number[] | undefined = (oJson?.embedding as number[] | undefined) ?? (oJson?.data?.[0]?.embedding as number[] | undefined);
        if (Array.isArray(emb) && emb.length > 0) {
      return await finalize(emb, false, 'ollama');
        }
      }
    } catch {
      // continue to Go fallback
    }

    // Quaternary fallback: Go tensor bridge (mock-capable) when others aren't available
    try {
      const goReq = {
        operation: 'vectorize',
        documentId: key,
        data: [] as number[],
        options: { timeout: 5000 }
      };
      const goResp = await fetch('/api/tensor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(goReq)
      });
    if (goResp.ok) {
        const goJson = await goResp.json();
        const emb = goJson?.data?.result?.embeddings as number[] | undefined;
        if (Array.isArray(emb) && emb.length > 0) {
      return await finalize(emb, false, 'go');
        }
      }
    } catch {
      // swallow and report below
    }

    // If we reached here, no backend produced an embedding
    return json({ error: 'Embedding backend unavailable (FASTAPI_URL not configured and Go fallback failed)' }, { status: 502 });
  } catch (e: any) {
    return json({ error: e?.message || 'Tensor error' }, { status: 500 });
  }
};
