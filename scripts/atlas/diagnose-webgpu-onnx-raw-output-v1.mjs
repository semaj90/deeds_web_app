#!/usr/bin/env node
/**
 * DIAGNOSTIC ONLY (stage-10 follow-up, 2026-09-15) -- dumps the raw ONNX output tensor for one
 * fixed short string, to distinguish "wrong model weights loaded" (garbage/all-zero/all-same
 * output) from "correct model, wrong pooling/output-parsing" (structured but differently-shaped
 * output). Read-only: no Postgres/Qdrant/Ollama writes, no report file written by default.
 *
 * Usage: node scripts/atlas/diagnose-webgpu-onnx-raw-output-v1.mjs
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const isolated = resolve(root, 'services', 'embedding-onnx-webgpu');
const requireIsolated = createRequire(resolve(isolated, 'package.json'));
const ort = requireIsolated('onnxruntime-node');
const transformers = requireIsolated('@huggingface/transformers');

const modelPath = resolve(root, 'sveltekit-frontend/static/embeddinggemma_300m_onnx/model.onnx');
const TEXT = 'title: none | text: hello world';

const session = await ort.InferenceSession.create(modelPath);
console.log('Input names:', session.inputNames);
console.log('Output names:', session.outputNames);

const tokenizer = await transformers.AutoTokenizer.from_pretrained(resolve(root, 'sveltekit-frontend/static/embeddinggemma_300m_onnx'), {
  local_files_only: true,
});
const encoded = await tokenizer(TEXT, { return_tensors: 'np', truncation: true, max_length: 2048 });
console.log('Token count:', encoded.input_ids.dims[1]);
console.log('Token ids (first 10):', Array.from(encoded.input_ids.data).slice(0, 10));

const feeds = {};
for (const name of session.inputNames) {
  if (name === 'input_ids') feeds[name] = new ort.Tensor('int64', BigInt64Array.from(Array.from(encoded.input_ids.data).map(BigInt)), encoded.input_ids.dims);
  else if (name === 'attention_mask') feeds[name] = new ort.Tensor('int64', BigInt64Array.from(Array.from(encoded.attention_mask.data).map(BigInt)), encoded.attention_mask.dims);
  else if (name === 'token_type_ids') feeds[name] = new ort.Tensor('int64', new BigInt64Array(encoded.input_ids.data.length), encoded.input_ids.dims);
}
console.log('Feed keys provided:', Object.keys(feeds));

const results = await session.run(feeds);
for (const [name, tensor] of Object.entries(results)) {
  const data = Array.from(tensor.data);
  const sample = data.slice(0, 10);
  const allZero = data.every((v) => v === 0);
  const allSame = data.every((v) => v === data[0]);
  const nanCount = data.filter((v) => Number.isNaN(v)).length;
  const min = Math.min(...data);
  const max = Math.max(...data);
  console.log(`\nOutput "${name}": dims=${tensor.dims.join('x')}`);
  console.log(`  first10=${JSON.stringify(sample)}`);
  console.log(`  allZero=${allZero} allSame=${allSame} nanCount=${nanCount} min=${min} max=${max}`);
}
