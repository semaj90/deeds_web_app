/**
 * ONNX challenger parity probe (read-only, CPU-only). Compares the local ONNX embeddinggemma executor (`tryEmbedOnnx`) with the STORED
 * Ollama/raw-recipe vectors in `legal_chunks.embedding` (verified RAW by LEGAL-RECIPE-PROBE-01). Short chunks only (< 600 chars) so tokenizer
 * truncation does not confound the comparison. Not a promotion gate: a sample, no quality claim beyond vector agreement.
 * Run from sveltekit-frontend (module aliases): npx --no-install tsx ../scripts/atlas/onnx-parity-probe-v1.mts [--n 100]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { isOnnxEmbedAvailable, tryEmbedOnnx, getOnnxEmbedLocalModelPath } from '../../sveltekit-frontend/src/lib/server/embedding/onnx-embed.js';

const n = Number(process.argv[process.argv.indexOf('--n') + 1]) || 100;
const root = resolve(process.cwd().endsWith('sveltekit-frontend') ? '..' : '.');
let url = process.env.DATABASE_URL;
if (!url) {
  for (const f of [resolve(root, '.env'), resolve(root, 'sveltekit-frontend/.env.local')]) {
    try {
      const m = readFileSync(f, 'utf8').match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
      if (m) { url = m[1].trim().replace(/^["']|["']$/g, ''); break; }
    } catch { /* next */ }
  }
}
if (!url) throw new Error('DATABASE_URL not found');

const cos = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i]! * b[i]!; x += a[i]! * a[i]!; y += b[i]! * b[i]!; }
  return d / Math.sqrt(x * y);
};

const pool = new pg.Pool({ connectionString: url, max: 1, options: '-c default_transaction_read_only=on' });
const { rows } = await pool.query(
  `select id::text, chunk_text, embedding::text as emb from legal_chunks
   where embedding is not null and length(chunk_text) between 80 and 600 order by md5(id::text) limit $1`, [n]);
await pool.end();

const available = await isOnnxEmbedAvailable();
const out: any = { schema: 'atlas.onnx-parity-probe.v1', generatedAt: new Date().toISOString(), readOnly: true, writesPerformed: false, gpuUsed: false, canonicalAuthority: false,
  modelPath: getOnnxEmbedLocalModelPath(), onnxAvailable: available, sample: rows.length };
if (available) {
  const cs: number[] = [];
  let failed = 0;
  const t0 = Date.now();
  for (const r of rows) {
    const v = await tryEmbedOnnx(r.chunk_text);
    if (!v || v.length !== 768) { failed++; continue; }
    cs.push(cos(v, JSON.parse(r.emb)));
  }
  cs.sort((a, b) => a - b);
  const pct = (p: number) => cs.length ? +cs[Math.min(cs.length - 1, Math.floor(p * cs.length))]!.toFixed(4) : null;
  Object.assign(out, { embedded: cs.length, failed, seconds: +((Date.now() - t0) / 1000).toFixed(1),
    cosineVsStoredOllama: { mean: +(cs.reduce((s, x) => s + x, 0) / Math.max(cs.length, 1)).toFixed(4), min: pct(0), p10: pct(0.1), median: pct(0.5), max: pct(0.999),
      atLeast0_99: cs.filter((x) => x >= 0.99).length, atLeast0_95: cs.filter((x) => x >= 0.95).length, below0_90: cs.filter((x) => x < 0.9).length } });
}
out.caveats = ['sample of short legal chunks only', 'agreement with stored Ollama BF16 vectors, not a retrieval-quality result', 'task-prefix recipe NOT tested here',
  'high mean cosine does not make ONNX canonical; promotion needs its own gate'];
out.checksum = 'sha256:' + createHash('sha256').update(JSON.stringify(out)).digest('hex');
writeFileSync(resolve(root, 'docs/reports/onnx-parity-probe-v1.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
process.exit(0);
