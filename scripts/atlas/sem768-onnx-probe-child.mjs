#!/usr/bin/env node
/**
 * Isolated child process for the ONNX lane of sem768-executor-bench-01.mts.
 * Run in a separate process (not tsx/vite) so a native crash in
 * onnxruntime-node's InferenceSession.create() (found live 2026-09-02) kills
 * only this child, not the whole benchmark. Uses createRequire, not dynamic
 * import — onnxruntime-node is CJS and `await import()` from raw ESM leaves
 * InferenceSession undefined (found live 2026-09-02, distinct from the crash).
 *
 * stdin: {"texts": string[]}
 * stdout: {"ok": true, "embeddings": (number[]|null)[], "latencies": number[]} | {"ok": false, "error": string}
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);

function readStdin() {
  return new Promise((res) => {
    let data = '';
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => res(data));
  });
}

async function main() {
  const raw = await readStdin();
  const { texts } = JSON.parse(raw);

  const MODEL_PATH = resolve(process.cwd(), 'static/embeddinggemma_300m_onnx/model.onnx');
  const TOKENIZER_DIR = resolve(process.cwd(), 'static/embeddinggemma_300m_onnx');

  // require() resolves relative to THIS file's location (scripts/atlas/),
  // not process.cwd() — onnxruntime-node lives in sveltekit-frontend's own
  // node_modules, so resolve it explicitly rather than relying on Node's
  // module-resolution walk-up finding it by accident.
  const ort = require(resolve(process.cwd(), 'node_modules/onnxruntime-node'));
  const session = await ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
  });

  const { AutoTokenizer, env } = await import('@huggingface/transformers');
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  const tokenizer = await AutoTokenizer.from_pretrained(TOKENIZER_DIR, { local_files_only: true });

  const embeddings = [];
  const latencies = [];
  for (const text of texts) {
    const t0 = performance.now();
    try {
      const encoded = await tokenizer(text, { padding: true, truncation: true, max_length: 256 });
      const inputIds = new ort.Tensor('int64', BigInt64Array.from(encoded.input_ids.data.map((v) => BigInt(v))), encoded.input_ids.dims);
      const attentionMask = new ort.Tensor('int64', BigInt64Array.from(encoded.attention_mask.data.map((v) => BigInt(v))), encoded.attention_mask.dims);
      const feeds = {};
      for (const name of session.inputNames) {
        if (name.includes('input_ids')) feeds[name] = inputIds;
        else if (name.includes('attention_mask')) feeds[name] = attentionMask;
        else if (name.includes('token_type_ids')) {
          feeds[name] = new ort.Tensor('int64', new BigInt64Array(inputIds.data.length), inputIds.dims);
        }
      }
      const output = await session.run(feeds);
      const outName = session.outputNames[0];
      const raw768 = Array.from(output[outName].data);
      // Mean-pool if the output is [1, seqLen, 768] rather than already [1, 768]
      let vec;
      const dims = output[outName].dims;
      if (dims.length === 3) {
        const [, seqLen, hidden] = dims;
        vec = new Array(hidden).fill(0);
        for (let s = 0; s < seqLen; s++) {
          for (let h = 0; h < hidden; h++) vec[h] += raw768[s * hidden + h] / seqLen;
        }
      } else {
        vec = raw768;
      }
      let norm = 0;
      for (const v of vec) norm += v * v;
      norm = Math.sqrt(norm) || 1;
      embeddings.push(vec.map((v) => v / norm));
    } catch (err) {
      embeddings.push(null);
    }
    latencies.push(performance.now() - t0);
  }

  process.stdout.write(JSON.stringify({ ok: true, embeddings, latencies }));
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, error: err instanceof Error ? (err.stack ?? err.message) : String(err) }));
  process.exit(0);
});
