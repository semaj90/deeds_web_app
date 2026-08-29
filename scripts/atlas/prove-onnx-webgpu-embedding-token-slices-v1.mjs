/** Read-only exact token-slice WebGPU proof for the frozen 15-candidate plan. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..', '..');
const frontend = resolve(root, 'sveltekit-frontend');
const modelPath = resolve(frontend, 'static', 'embeddinggemma_300m_onnx', 'model.onnx');
const tokenizerPath = resolve(frontend, 'static', 'embeddinggemma_300m_onnx', 'tokenizer.json');
const planPath = resolve(root, 'docs', 'reports', 'embedding-tokenizer-candidate-tiles-v1.json');
const mapPath = resolve(root, '.tmp', 'atlas', 'lineage-qualified-candidate-map-v1.json');
const reportPath = resolve(root, 'docs', 'reports', 'onnx-webgpu-embedding-token-slices-v1.json');
const runtimeDir = process.env.ORT_NODE_PACKAGE_DIR ? resolve(process.env.ORT_NODE_PACKAGE_DIR) : resolve(root, 'services', 'embedding-onnx-webgpu', 'node_modules', 'onnxruntime-node');
const modelDigest = `sha256:${createHash('sha256').update(readFileSync(modelPath)).digest('hex')}`;
const tokenizerDigest = `sha256:${createHash('sha256').update(readFileSync(tokenizerPath)).digest('hex')}`;
const sha = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const req = createRequire(resolve(root, 'services', 'embedding-onnx-webgpu', 'package.json'));

function loadSourceText() {
  const script = `
const fs = require('fs'); const pg = require('pg');
const { loadRepoEnv, resolveDatabaseUrl } = require(process.cwd() + '/scripts/atlas/connection-config.mjs');
(async () => { const map = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); const env = loadRepoEnv(process.env); const pool = new pg.Pool({connectionString: resolveDatabaseUrl(env)});
try { const refs = map.candidates.slice(0, 15).map(x => x.sourceRef); const r = await pool.query('SELECT DISTINCT ON (source_ref) source_ref, content FROM public.codebase_chunk_index WHERE source_ref = ANY($1::text[]) ORDER BY source_ref, id', [refs]); process.stdout.write(JSON.stringify(Object.fromEntries(r.rows.map(x => [x.source_ref, String(x.content ?? '')])))); } finally { await pool.end(); }
})().catch(e => { console.error(e.stack || e); process.exit(1); });`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script, mapPath], { cwd: root, encoding: 'utf8' }));
}

function quality(vector) {
  let sum = 0;
  for (const value of vector) { if (!Number.isFinite(value)) return { finite: false, norm: null, normalized: false }; sum += value * value; }
  const norm = Math.sqrt(sum); return { finite: true, norm, normalized: Math.abs(norm - 1) <= 1e-3 };
}

function pool(output, mask) {
  const dims = output.dims.map(Number); const data = output.data;
  if (dims.length === 2 && dims[1] === 768) return Float32Array.from(data);
  if (dims.length !== 3 || dims[2] !== 768) throw new Error(`TOKEN_SLICE_OUTPUT_SHAPE:${dims.join('x')}`);
  const vector = new Float32Array(768); let count = 0;
  for (let t = 0; t < dims[1]; t++) { if (mask[t] !== 1) continue; count++; for (let d = 0; d < 768; d++) vector[d] += data[t * 768 + d]; }
  if (!count) throw new Error('TOKEN_SLICE_EMPTY_MASK');
  let norm = 0; for (let d = 0; d < 768; d++) { vector[d] /= count; norm += vector[d] * vector[d]; }
  norm = Math.sqrt(norm); for (let d = 0; d < 768; d++) vector[d] /= norm;
  return vector;
}

const report = { schema: 'atlas.onnx-webgpu-embedding-token-slices.v1', readOnly: true, requestedProvider: 'webgpu', cpuFallbackAllowed: false, sliceMode: 'EXACT_FULL_TOKEN_TENSOR_SLICE_PADDED_TO_512', modelChecksum: modelDigest, tokenizerChecksum: tokenizerDigest, candidateCount: 0, plannedTileCount: 0, executedTileCount: 0, session: { created: false, actualProvider: null }, tiles: [], status: 'BLOCKED', errors: [] };

try {
  if (!existsSync(planPath) || !existsSync(mapPath)) throw new Error('TOKEN_SLICE_INPUT_PLAN_MISSING');
  const plan = JSON.parse(readFileSync(planPath, 'utf8')); const sources = loadSourceText();
  if (plan.status !== 'CANDIDATE_TILE_TOKENIZER_PARITY_PROVEN') throw new Error(`TOKEN_SLICE_PLAN_NOT_PROVEN:${plan.status}`);
  report.candidateSnapshotRevision = plan.candidateSnapshotRevision ?? null;
  report.ordinalMapChecksum = plan.ordinalMapChecksum ?? null;
  const candidates = plan.candidates; report.candidateCount = candidates.length; report.plannedTileCount = candidates.reduce((n, c) => n + c.tileRanges.length, 0);
  const runtime = JSON.parse(readFileSync(resolve(runtimeDir, 'package.json'), 'utf8')); if (!/^1\.29\./.test(runtime.version)) throw new Error(`WEBGPU_RUNTIME_VERSION_UNSUPPORTED:${runtime.version}`);
  const ort = req(runtimeDir); const session = await ort.InferenceSession.create(modelPath, { executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }], graphOptimizationLevel: 'all' });
  report.session = { created: true, actualProvider: 'webgpu', inputNames: session.inputNames, outputNames: session.outputNames };
  const transformers = req('@huggingface/transformers'); transformers.env.localModelPath = resolve(frontend, 'static');
  const tokenizer = await transformers.AutoTokenizer.from_pretrained('embeddinggemma_300m_onnx', { local_files_only: true });
  const outputName = session.outputNames.find((name) => /sentence|embedding/i.test(name)) ?? session.outputNames[0];
  for (const candidate of candidates) {
    const content = sources[candidate.sourceRef]; if (content === undefined) throw new Error(`TOKEN_SLICE_SOURCE_MISSING:${candidate.sourceRef}`);
    const rendered = `title: none | text: ${content}`; const full = await tokenizer(rendered, { return_tensors: 'np', truncation: false });
    const fullIds = Array.from(full.input_ids.data, Number); const fullMask = Array.from(full.attention_mask.data, Number);
    for (const range of candidate.tileRanges) {
      const ids = fullIds.slice(range.tokenStart, range.tokenEnd); const mask = fullMask.slice(range.tokenStart, range.tokenEnd); if (ids.length > 512) throw new Error('TOKEN_SLICE_EXCEEDS_512');
      const idsPad = new BigInt64Array(512); const maskPad = new BigInt64Array(512); ids.forEach((v, i) => { idsPad[i] = BigInt(v); maskPad[i] = BigInt(mask[i] ?? 1); });
      const outputs = await session.run({ input_ids: new ort.Tensor('int64', idsPad, [1, 512]), attention_mask: new ort.Tensor('int64', maskPad, [1, 512]) });
      const vector = pool(outputs[outputName], Array.from(maskPad, Number)); const q = quality(vector); if (!q.finite || !q.normalized) throw new Error(`TOKEN_SLICE_VECTOR_INVALID:${candidate.candidateOrdinal}:${range.tileIndex}`);
      report.tiles.push({ candidateOrdinal: candidate.candidateOrdinal, sourceRef: candidate.sourceRef, tileIndex: range.tileIndex, tokenStart: range.tokenStart, tokenEnd: range.tokenEnd, tokenCount: range.tokenCount, byteStart: range.byteStart, byteEnd: range.byteEnd, fullTokenCount: fullIds.length, sourceTextChecksum: sha(Buffer.from(rendered, 'utf8')), tokenTensorSliceChecksum: sha(Buffer.from(new Uint32Array(ids).buffer)), vectorChecksum: sha(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)), vector: Array.from(vector), dimensions: vector.length, finite: q.finite, l2Norm: q.norm, normalized: q.normalized, canonicalAuthority: false });
    }
  }
  report.executedTileCount = report.tiles.length; report.status = 'WEBGPU_EXACT_TOKEN_SLICES_EXECUTION_PROVEN';
} catch (error) { report.errors.push(String(error?.message ?? error)); }
mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, candidateCount: report.candidateCount, plannedTileCount: report.plannedTileCount, executedTileCount: report.executedTileCount, errors: report.errors, reportPath }, null, 2));
if (report.status === 'BLOCKED') process.exitCode = 1;
