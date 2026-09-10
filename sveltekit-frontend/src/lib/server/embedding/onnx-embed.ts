/**
 * Server-side CPU ONNX fallback for embeddinggemma 300M.
 *
 * This is the GPU-occupied fallback lane used by the generic embedding client.
 * It deliberately stays CPU-only so it cannot create another CUDA context next
 * to the :8090 synthesis model. Model weights are workstation-local and may
 * live either under the historical static/ export or repo-root models/.
 */

import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { cpus } from 'os';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';
import { validateSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';

const MODULE_FILE = fileURLToPath(import.meta.url);
const FRONTEND_ROOT = resolve(dirname(MODULE_FILE), '../../../../../..');
const REPO_ROOT = resolve(FRONTEND_ROOT, '..');
const MODEL_DIR_CANDIDATES = [
  resolve(FRONTEND_ROOT, 'static', 'embeddinggemma_300m_onnx'),
  resolve(FRONTEND_ROOT, 'static', 'models', 'embeddinggemma_300m_onnx'),
  resolve(REPO_ROOT, 'models', 'embeddinggemma_300m_onnx'),
] as const;

const DIMS = 768;
const MAX_LENGTH = 512;

function resolveLocalModel(): { modelPath: string; tokenizerDir: string } | null {
  for (const directory of MODEL_DIR_CANDIDATES) {
    const modelPath = resolve(directory, 'model.onnx');
    if (existsSync(modelPath) && existsSync(resolve(directory, 'tokenizer.json'))) {
      return { modelPath, tokenizerDir: directory };
    }
  }
  return null;
}

function positiveIntEnv(name: string, fallback: number): number {
  const logical = Math.max(1, cpus().length);
  const parsed = Number.parseInt(String(process.env[name] ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, logical) : fallback;
}

function cpuSessionOptions() {
  const logical = Math.max(1, cpus().length);
  return {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all' as const,
    executionMode: 'sequential' as const,
    intraOpNumThreads: positiveIntEnv('ONNX_CPU_INTRA_OP_THREADS', Math.min(4, logical)),
    interOpNumThreads: positiveIntEnv('ONNX_CPU_INTER_OP_THREADS', 1),
  };
}

// Module-level singletons — one model copy and one ORT worker pool per process.
let _session: any = null;
let _tokenizer: any = null;
let _sessionLoading: Promise<any> | null = null;
let _tokenizerLoading: Promise<any> | null = null;
let _resolvedModel: ReturnType<typeof resolveLocalModel> = null;
let _unavailable = false;
let _runQueue: Promise<void> = Promise.resolve();

function localModel() {
  if (_resolvedModel) return _resolvedModel;
  _resolvedModel = resolveLocalModel();
  return _resolvedModel;
}

export function getOnnxEmbedLocalModelPath(): string | null {
  return localModel()?.modelPath ?? null;
}

export function isOnnxEmbedAvailable(): boolean {
  if (_unavailable) return false;
  return localModel() !== null;
}

async function getSession(): Promise<any> {
  if (_session) return _session;
  if (_sessionLoading) return _sessionLoading;
  const model = localModel();
  if (!model) throw new Error('EMBEDDINGGEMMA_ONNX_MODEL_NOT_FOUND');
  _sessionLoading = (async () => {
    const ort = await import('onnxruntime-node');
    _session = await ort.InferenceSession.create(model.modelPath, cpuSessionOptions());
    return _session;
  })();
  try {
    return await _sessionLoading;
  } catch (error) {
    _sessionLoading = null;
    throw error;
  }
}

async function getTokenizer(): Promise<any> {
  if (_tokenizer) return _tokenizer;
  if (_tokenizerLoading) return _tokenizerLoading;
  const model = localModel();
  if (!model) throw new Error('EMBEDDINGGEMMA_ONNX_TOKENIZER_NOT_FOUND');
  _tokenizerLoading = (async () => {
    const { AutoTokenizer, env } = await import('@huggingface/transformers');
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    _tokenizer = await AutoTokenizer.from_pretrained(model.tokenizerDir, {
      local_files_only: true,
    });
    return _tokenizer;
  })();
  try {
    return await _tokenizerLoading;
  } catch (error) {
    _tokenizerLoading = null;
    throw error;
  }
}

/** Embed a single text string using the local CPU ONNX model. */
export async function tryEmbedOnnx(text: string): Promise<number[] | null> {
  if (_unavailable || !text?.trim()) return null;
  const model = localModel();
  if (!model) return null;

  try {
    return await traceEmbedding(
      text,
      'embeddinggemma-onnx-cpu',
      async () => {
        const [session, tok] = await Promise.all([getSession(), getTokenizer()]);
        const encoded = await tok(text, {
          return_tensors: 'np',
          padding: true,
          truncation: true,
          max_length: MAX_LENGTH,
        });

        const { Tensor } = await import('onnxruntime-node');
        const seq = encoded.input_ids.data.length;
        if (!Number.isInteger(seq) || seq <= 0 || seq > MAX_LENGTH) return null;

        const inputIds = new Tensor(
          'int64',
          new BigInt64Array(Array.from(encoded.input_ids.data as ArrayLike<number>, (v) => BigInt(Number(v)))),
          [1, seq],
        );
        const attentionMask = new Tensor(
          'int64',
          new BigInt64Array(Array.from(encoded.attention_mask.data as ArrayLike<number>, (v) => BigInt(Number(v)))),
          [1, seq],
        );

        const feeds: Record<string, any> = { input_ids: inputIds, attention_mask: attentionMask };
        if (encoded.token_type_ids) {
          feeds.token_type_ids = new Tensor(
            'int64',
            new BigInt64Array(Array.from(encoded.token_type_ids.data as ArrayLike<number>, (v) => BigInt(Number(v)))),
            [1, seq],
          );
        }

        // ORT may use several CPU kernel workers internally, but only one
        // session.run is admitted at a time to avoid multiplying model memory.
        const run = _runQueue.then(() => session.run(feeds));
        _runQueue = run.then(() => undefined, () => undefined);
        const results = await run;
        const outputKey: string = results.sentence_embedding
          ? 'sentence_embedding'
          : results.last_hidden_state
            ? 'last_hidden_state'
            : results.token_embeddings
              ? 'token_embeddings'
              : (Object.keys(results)[0] as string);
        const output = results[outputKey];
        if (!output) return null;

        const outputData = output.data as Float32Array;
        const dims = output.dims as readonly number[];
        if (dims.length === 2 && Number(dims[1]) === DIMS && outputData.length === DIMS) {
          return Array.from(validateSemantic768OutputV1(outputData));
        }

        if (dims.length !== 3 || Number(dims[2]) !== DIMS) return null;
        const seqLen = Number(dims[1]);
        const maskData = Array.from(encoded.attention_mask.data as ArrayLike<number>, Number);
        const pooled = new Float32Array(DIMS);
        let maskSum = 0;
        for (let t = 0; t < seqLen; t++) {
          if (maskData[t] === 0) continue;
          maskSum += 1;
          for (let d = 0; d < DIMS; d++) pooled[d] += outputData[t * DIMS + d];
        }
        if (maskSum === 0) return null;
        for (let d = 0; d < DIMS; d++) pooled[d] /= maskSum;

        let norm = 0;
        for (let d = 0; d < DIMS; d++) norm += pooled[d] * pooled[d];
        norm = Math.sqrt(norm);
        if (!(norm > 0) || !Number.isFinite(norm)) return null;
        for (let d = 0; d < DIMS; d++) pooled[d] /= norm;
        return Array.from(validateSemantic768OutputV1(pooled));
      },
      {
        provider: 'onnx-local-cpu',
        modelPath: model.modelPath,
        expectedDimensions: DIMS,
        maxLength: MAX_LENGTH,
        cpuThreads: cpuSessionOptions(),
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/No such file|cannot open|ENOENT|MODEL_NOT_FOUND|TOKENIZER_NOT_FOUND/i.test(msg)) {
      _unavailable = true;
    }
    return null;
  }
}

/** Batch embed sequentially through one shared session. */
export async function batchEmbedOnnx(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (const text of texts) results.push(await tryEmbedOnnx(text));
  return results;
}
