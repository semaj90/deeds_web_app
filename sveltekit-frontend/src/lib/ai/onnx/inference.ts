/**
 * ONNX Runtime Inference (Gemma 3 270M - Legacy Fallback)
 *
 * This module provides inference via ONNX Runtime for the Gemma 3 270M model.
 * This is a legacy fallback when E2B WebGPU and LiteRT are unavailable.
 *
 * Model: static/gemma3_270m_onnx/ (418MB, local-only)
 * Embedding: static/embeddinggemma_300m_onnx/ (768-dim)
 */

import { getOnnxSession } from './session.js';

type OrtTensorLike = {
  data: Float32Array | Int32Array | BigInt64Array | number[];
  dims: readonly number[];
};

const DEFAULT_MAX_INPUT_TOKENS = 256;
const DEFAULT_MAX_GENERATION_TOKENS = 64;
const EOS_TOKEN_ID = 2;

let cachedTokenizer: any = null;
let cachedTokenizerDecoder: any = null;

function encodeFallback(text: string, maxLen: number): number[] {
  const chars = Array.from(text.slice(0, maxLen * 4));
  const ids: number[] = [1];
  for (const ch of chars) {
    if (ids.length >= maxLen - 1) break;
    ids.push(ch.codePointAt(0) ?? 0);
  }
  ids.push(EOS_TOKEN_ID);
  return ids;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function softmax(logits: number[], temperature: number): number[] {
  const temp = Math.max(temperature, 1e-4);
  const scaled = logits.map((v) => v / temp);
  const maxLogit = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - maxLogit));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / Math.max(sum, 1e-12));
}

function topKTopPSample(logits: number[], topK: number, topP: number, temperature: number): number {
  const withIdx = logits.map((value, index) => ({ value, index }));
  withIdx.sort((a, b) => b.value - a.value);

  const k = clamp(Math.floor(topK), 1, withIdx.length);
  const topKSlice = withIdx.slice(0, k);
  const probs = softmax(
    topKSlice.map((x) => x.value),
    temperature
  );
  const ranked = topKSlice.map((token, i) => ({ tokenId: token.index, p: probs[i] }));

  const pThreshold = clamp(topP, 0.05, 1);
  let cumulative = 0;
  const nucleus: Array<{ tokenId: number; p: number }> = [];
  for (const item of ranked) {
    nucleus.push(item);
    cumulative += item.p;
    if (cumulative >= pThreshold) break;
  }

  const total = nucleus.reduce((acc, item) => acc + item.p, 0);
  let r = Math.random() * Math.max(total, 1e-12);
  for (const item of nucleus) {
    r -= item.p;
    if (r <= 0) return item.tokenId;
  }

  return nucleus[0]?.tokenId ?? ranked[0].tokenId;
}

function buildFeeds(ort: any, session: any, inputIds: number[]): Record<string, unknown> {
  const attentionMask = new Array(inputIds.length).fill(1);
  const feeds: Record<string, unknown> = {};

  if (session.inputNames.includes('input_ids')) {
    feeds['input_ids'] = new ort.Tensor(
      'int64',
      BigInt64Array.from(inputIds.map((n) => BigInt(n))),
      [1, inputIds.length]
    );
  }

  if (session.inputNames.includes('attention_mask')) {
    feeds['attention_mask'] = new ort.Tensor(
      'int64',
      BigInt64Array.from(attentionMask.map((n) => BigInt(n))),
      [1, attentionMask.length]
    );
  }

  if (session.inputNames.includes('token_type_ids')) {
    feeds['token_type_ids'] = new ort.Tensor('int64', new BigInt64Array(inputIds.length), [
      1,
      inputIds.length,
    ]);
  }

  return feeds;
}

function extractLastLogits(output: OrtTensorLike): number[] | null {
  const data = Array.from(output.data as any).map((v) => Number(v));
  const dims = output.dims.map((d) => Number(d));

  if (dims.length === 3) {
    const seqLen = dims[1];
    const vocabSize = dims[2];
    if (seqLen <= 0 || vocabSize <= 0) return null;
    const start = (seqLen - 1) * vocabSize;
    return data.slice(start, start + vocabSize);
  }

  if (dims.length === 2) {
    const vocabSize = dims[1];
    return data.slice(0, vocabSize);
  }

  if (dims.length === 1) return data;

  return null;
}

async function ensureTokenizer(): Promise<void> {
  if (cachedTokenizer && cachedTokenizerDecoder) return;

  try {
    const { AutoTokenizer } = await import('@huggingface/transformers');
    const tokenizer = await AutoTokenizer.from_pretrained('/gemma3_270m_onnx/', {
      local_files_only: true,
    });

    cachedTokenizer = tokenizer;
    cachedTokenizerDecoder = tokenizer.decode.bind(tokenizer);
  } catch {
    cachedTokenizer = null;
    cachedTokenizerDecoder = null;
  }
}

async function encodePrompt(prompt: string): Promise<number[]> {
  await ensureTokenizer();
  if (cachedTokenizer) {
    try {
      const encoded = await cachedTokenizer(prompt, {
        return_tensors: 'np',
        truncation: true,
        max_length: DEFAULT_MAX_INPUT_TOKENS,
      });
      const ids = Array.from(encoded.input_ids.data as Int32Array).map((n) => Number(n));
      return ids.length > 0 ? ids : encodeFallback(prompt, DEFAULT_MAX_INPUT_TOKENS);
    } catch {
      return encodeFallback(prompt, DEFAULT_MAX_INPUT_TOKENS);
    }
  }

  return encodeFallback(prompt, DEFAULT_MAX_INPUT_TOKENS);
}

function decodeTokens(tokens: number[]): string {
  if (cachedTokenizerDecoder) {
    try {
      return cachedTokenizerDecoder(tokens, { skip_special_tokens: true });
    } catch {
      // Fall through to ASCII-safe fallback.
    }
  }

  return tokens
    .map((id) => (id >= 32 && id <= 126 ? String.fromCharCode(id) : ''))
    .join('')
    .trim();
}

export interface OnnxInferenceOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
}

export interface OnnxInferenceResult {
  text: string;
  tokensGenerated: number;
  latencyMs: number;
}

/**
 * Run text generation inference using ONNX Runtime.
 * Returns null if ONNX session is not available.
 */
export async function runOnnxInference(
  prompt: string,
  options: OnnxInferenceOptions = {}
): Promise<string | null> {
  const { maxTokens = 200, temperature = 0.7, topP = 0.9, topK = 40 } = options;

  try {
    const ort = await import('onnxruntime-web');
    const session = await getOnnxSession('/gemma3_270m_onnx/gemma3_270m_w8a16.onnx');
    if (!session) {
      console.warn('[onnx-inference] ONNX session not available');
      return null;
    }

    if (!session.inputNames.includes('input_ids')) {
      console.warn('[onnx-inference] Model input_ids not found; cannot generate.');
      return null;
    }

    const promptIds = await encodePrompt(prompt);
    const generated: number[] = [];
    const generationLimit = clamp(maxTokens, 1, DEFAULT_MAX_GENERATION_TOKENS);
    let currentIds = promptIds.slice();

    for (let step = 0; step < generationLimit; step++) {
      const feeds = buildFeeds(ort, session, currentIds);
      const results = await session.run(feeds);

      const outputName =
        session.outputNames.find((name: string) => name.toLowerCase().includes('logits')) ??
        session.outputNames[0];
      const output = results[outputName] as OrtTensorLike | undefined;
      if (!output) break;

      const logits = extractLastLogits(output);
      if (!logits || logits.length === 0) break;

      const nextToken = topKTopPSample(logits, topK, topP, temperature);
      if (!Number.isFinite(nextToken)) break;

      generated.push(nextToken);
      currentIds.push(nextToken);

      if (nextToken === EOS_TOKEN_ID || currentIds.length >= DEFAULT_MAX_INPUT_TOKENS) {
        break;
      }
    }

    const text = decodeTokens(generated);
    return text.length > 0 ? text : null;
  } catch (error) {
    console.error('[onnx-inference] Error during inference:', error);
    return null;
  }
}

/**
 * Check if ONNX inference is available.
 * This is a lightweight check that doesn't load the full session.
 */
export async function isOnnxAvailable(): Promise<boolean> {
  try {
    const session = await getOnnxSession('/gemma3_270m_onnx/gemma3_270m_w8a16.onnx');
    return session !== null;
  } catch {
    return false;
  }
}
