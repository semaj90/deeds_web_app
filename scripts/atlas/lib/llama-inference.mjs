#!/usr/bin/env node
/**
 * Canonical llama-server inference helper.
 *
 * Replaces all Ollama /api/generate and /api/chat calls for generation tasks.
 * Embeddings (embeddinggemma via /api/embed) are NOT affected — those stay on Ollama.
 *
 * Server: llama-server at :8090 (gemma4-legal-iq4xs-direct.gguf)
 * Protocol: OpenAI-compat POST /v1/chat/completions, stream: false
 *
 * Usage:
 *   import { llamaChat, LLAMA_URL, LLAMA_MODEL } from './lib/llama-inference.mjs';
 *   const text = await llamaChat(prompt, { maxTokens: 256, temperature: 0.2 });
 */

import { sanitizeGemma4Summary } from './gemma4-summary-sanitizer.mjs';

export const LLAMA_URL =
  (process.env.LOCAL_OPENAI_BASE_URL ?? 'http://127.0.0.1:8090/v1')
    .replace(/\/+$/, '') + '/chat/completions';

export const LLAMA_MODEL =
  process.env.LOCAL_GEMMA_MODEL ?? 'gemma4-legal-iq4xs-direct.gguf';

const STOP_TOKENS = [
  '<end_of_turn>', '<start_of_turn>', '<|channel>thought',
  '<think>', '</think>', 'Thinking:', 'Self-Correction',
];

/**
 * Send a single prompt to llama-server and return the text response.
 *
 * @param {string|Array<{role:string,content:string}>} prompt
 *   - string  → sent as a single user message
 *   - array   → sent as-is (allows system + user pairs)
 * @param {object} opts
 * @param {number} [opts.maxTokens=512]
 * @param {number} [opts.temperature=0.2]
 * @param {number} [opts.timeoutMs=90000]
 * @param {boolean} [opts.cachePrompt=true]
 * @returns {Promise<string>}  trimmed content text, empty string on error
 */
export async function llamaChat(prompt, opts = {}) {
  const {
    maxTokens   = 512,
    temperature = 0.2,
    timeoutMs   = 90_000,
    cachePrompt = true,
  } = opts;

  const messages = Array.isArray(prompt)
    ? prompt
    : [{ role: 'user', content: String(prompt) }];

  const res = await fetch(LLAMA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LOCAL_OPENAI_API_KEY ?? 'local'}`,
    },
    body: JSON.stringify({
      model:  LLAMA_MODEL,
      messages,
      max_tokens:  maxTokens,
      temperature,
      stream: false,
      stop:   STOP_TOKENS,
      cache_prompt: cachePrompt,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) throw new Error(`llama-server HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  return sanitizeGemma4Summary(content).summary;
}

/**
 * Check whether llama-server is reachable.
 * @returns {Promise<boolean>}
 */
export async function isLlamaAvailable() {
  const healthUrl = LLAMA_URL.replace('/chat/completions', '/health').replace('/v1/health', '/health');
  try {
    const r = await fetch(
      (process.env.LOCAL_OPENAI_BASE_URL ?? 'http://127.0.0.1:8090').replace(/\/v1.*/, '') + '/health',
      { signal: AbortSignal.timeout(2000) }
    );
    return r.ok;
  } catch {
    return false;
  }
}
