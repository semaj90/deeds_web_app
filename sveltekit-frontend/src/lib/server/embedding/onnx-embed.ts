/**
 * Server-side ONNX embedding — uses the local embeddinggemma 300M ONNX model
 * via onnxruntime-node (no network call, no Ollama dependency).
 *
 * Model lives at: static/embeddinggemma_300m_onnx/model.onnx  (gitignored, 291 MB)
 * Tokenizer at:   static/embeddinggemma_300m_onnx/tokenizer.json
 *
 * Produces 768-dim L2-normalized vectors identical to the client-side
 * client-embed.ts path (same model, same mean-pool + normalize pipeline).
 *
 * Usage:
 *   import { tryEmbedOnnx, isOnnxEmbedAvailable } from './onnx-embed.js';
 *   const vec = await tryEmbedOnnx('search query');   // number[] | null
 *
 * Falls back to null when:
 *   - model.onnx is not present (gitignored on CI / fresh clone)
 *   - onnxruntime-node is not installed
 *   - inference fails for any reason
 *
 * Call order in the server embedding cascade:
 *   gRPC → QUIC → HTTP/Ollama → onnx-embed (this file) → null
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '../../../../../..');
// Resolves to sveltekit-frontend/ root
const FRONTEND_ROOT = resolve(__dirname, 'sveltekit-frontend');
const MODEL_PATH = resolve(FRONTEND_ROOT, 'static', 'embeddinggemma_300m_onnx', 'model.onnx');
const TOKENIZER_DIR = resolve(FRONTEND_ROOT, 'static', 'embeddinggemma_300m_onnx');

const DIMS = 768;
const MAX_LENGTH = 512;

// Module-level singletons — loaded once, reused across calls
let _session: any = null;
let _tokenizer: any = null;
let _sessionLoading: Promise<any> | null = null;
let _tokenizerLoading: Promise<any> | null = null;
let _unavailable = false;

export function isOnnxEmbedAvailable(): boolean {
  if (_unavailable) return false;
  return existsSync(MODEL_PATH);
}

async function getSession(): Promise<any> {
  if (_session) return _session;
  if (_sessionLoading) return _sessionLoading;
  _sessionLoading = (async () => {
    const ort = await import('onnxruntime-node');
    _session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ['cuda', 'cpu'],
      graphOptimizationLevel: 'all',
    });
    return _session;
  })();
  return _sessionLoading;
}

async function getTokenizer(): Promise<any> {
  if (_tokenizer) return _tokenizer;
  if (_tokenizerLoading) return _tokenizerLoading;
  _tokenizerLoading = (async () => {
    const { AutoTokenizer, env } = await import('@huggingface/transformers');
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    _tokenizer = await AutoTokenizer.from_pretrained(TOKENIZER_DIR, {
      local_files_only: true,
    });
    return _tokenizer;
  })();
  return _tokenizerLoading;
}

/**
 * Embed a single text string using the local ONNX model.
 * Returns a 768-dim number[] or null on failure.
 */
export async function tryEmbedOnnx(text: string): Promise<number[] | null> {
  if (_unavailable) return null;
  if (!existsSync(MODEL_PATH)) return null;

  try {
    return await traceEmbedding(
      text,
      'embeddinggemma-onnx',
      async () => {
        const [session, tok] = await Promise.all([getSession(), getTokenizer()]);

        const encoded = tok(text, {
          return_tensors: 'np',
          padding: true,
          truncation: true,
          max_length: MAX_LENGTH,
        });

        const { Tensor } = await import('onnxruntime-node');
        const seq = encoded.input_ids.data.length;

        const inputIds = new Tensor(
          'int64',
          new BigInt64Array(Array.from(encoded.input_ids.data as number[], (v: number) => BigInt(v))),
          [1, seq],
        );
        const attentionMask = new Tensor(
          'int64',
          new BigInt64Array(
            Array.from(encoded.attention_mask.data as number[], (v: number) => BigInt(v)),
          ),
          [1, seq],
        );

        const feeds: Record<string, any> = { input_ids: inputIds, attention_mask: attentionMask };
        if (encoded.token_type_ids) {
          feeds.token_type_ids = new Tensor(
            'int64',
            new BigInt64Array(
              Array.from(encoded.token_type_ids.data as number[], (v: number) => BigInt(v)),
            ),
            [1, seq],
          );
        }

        const results = await session.run(feeds);
        const outputKey: string = results.last_hidden_state
          ? 'last_hidden_state'
          : results.token_embeddings
            ? 'token_embeddings'
            : (Object.keys(results)[0] as string);

        const outputData = results[outputKey].data as Float32Array;
        const maskData = encoded.attention_mask.data as number[];

        // Mean pool over non-padding tokens
        const pooled = new Float32Array(DIMS);
        let maskSum = 0;
        for (let t = 0; t < seq; t++) {
          if (maskData[t] === 0) continue;
          maskSum += 1;
          for (let d = 0; d < DIMS; d++) {
            pooled[d] += outputData[t * DIMS + d];
          }
        }
        if (maskSum > 0) {
          for (let d = 0; d < DIMS; d++) pooled[d] /= maskSum;
        }

        // L2 normalize
        let norm = 0;
        for (let d = 0; d < DIMS; d++) norm += pooled[d] * pooled[d];
        norm = Math.sqrt(norm);
        if (norm > 0) {
          for (let d = 0; d < DIMS; d++) pooled[d] /= norm;
        }

        return Array.from(pooled);
      },
      {
        provider: 'onnx-local',
        modelPath: MODEL_PATH,
        expectedDimensions: DIMS,
        maxLength: MAX_LENGTH,
      },
    );
  } catch (err) {
    // Mark unavailable only for hard failures (model load errors), not transient ones
    const msg = String(err);
    if (msg.includes('No such file') || msg.includes('cannot open') || msg.includes('ENOENT')) {
      _unavailable = true;
    }
    return null;
  }
}

/**
 * Batch embed — runs sequentially (ONNX session is not thread-safe across concurrent calls).
 * Returns null entries where inference failed.
 */
export async function batchEmbedOnnx(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (const text of texts) {
    results.push(await tryEmbedOnnx(text));
  }
  return results;
}
