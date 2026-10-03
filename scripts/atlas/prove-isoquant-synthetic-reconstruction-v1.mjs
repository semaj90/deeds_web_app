#!/usr/bin/env node
/**
 * IsoQuant-inspired synthetic reconstruction proof.
 *
 * Scope:
 * - Research-only Stage 1A for parent-atlas-kv-cache-adaptation-research.
 * - Reproduces the *shape* of IsoQuant's published stage-1 validation
 *   (synthetic normalized vectors, d={128,256,512}, bits={2,3,4}).
 * - Implements deterministic 4D quaternion rotations:
 *     fast: v' = qL * v
 *     full: v' = qL * v * conjugate(qR)
 * - Quantizes/dequantizes the rotated vectors and applies the exact inverse rotation.
 *
 * Non-claims:
 * - This is NOT the authors' CUDA kernel or exact quantizer.
 * - It does NOT touch llama-server, live KV state, Postgres, Qdrant, Valkey, or Neo4j.
 * - It does NOT close Stage 2, which requires fixed samples of REAL model KV tensors.
 * - It does NOT prove latency/VRAM/quality improvements for Ornith.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
  ?? 'docs/reports/isoquant-synthetic-reconstruction-v1.json';
const SAMPLES = Number(process.argv.find((a) => a.startsWith('--samples='))?.slice(10) ?? 256);
const SEED = Number(process.argv.find((a) => a.startsWith('--seed='))?.slice(7) ?? 0x51a0cafe);

const DIMS = [128, 256, 512];
const BITS = [2, 3, 4];
const VARIANTS = ['none', 'isoquant_fast', 'isoquant_full'];

function xorshift32(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return x / 0x100000000;
  };
}

function normalize(v) {
  let ss = 0;
  for (let i = 0; i < v.length; i++) ss += v[i] * v[i];
  const inv = ss > 0 ? 1 / Math.sqrt(ss) : 1;
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

function unitQuat(a, b, c, d) {
  const n = Math.hypot(a, b, c, d) || 1;
  return [a / n, b / n, c / n, d / n];
}

const QL = unitQuat(0.731, -0.413, 0.289, 0.459);
const QR = unitQuat(0.527, 0.611, -0.387, 0.441);

function qConj(q) { return [q[0], -q[1], -q[2], -q[3]]; }

function qMul(a, b) {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw*bw - ax*bx - ay*by - az*bz,
    aw*bx + ax*bw + ay*bz - az*by,
    aw*by - ax*bz + ay*bw + az*bx,
    aw*bz + ax*by - ay*bx + az*bw,
  ];
}

function rotate4(block, variant, inverse = false) {
  if (variant === 'none') return block.slice();
  if (variant === 'isoquant_fast') {
    return inverse ? qMul(qConj(QL), block) : qMul(QL, block);
  }
  if (variant === 'isoquant_full') {
    return inverse
      ? qMul(qMul(qConj(QL), block), QR)
      : qMul(qMul(QL, block), qConj(QR));
  }
  throw new Error(`unknown variant: ${variant}`);
}

function rotateVector(v, variant, inverse = false) {
  if (v.length % 4 !== 0) throw new Error(`dimension must be divisible by 4, got ${v.length}`);
  const out = new Float64Array(v.length);
  for (let i = 0; i < v.length; i += 4) {
    const r = rotate4([v[i], v[i+1], v[i+2], v[i+3]], variant, inverse);
    out[i] = r[0]; out[i+1] = r[1]; out[i+2] = r[2]; out[i+3] = r[3];
  }
  return out;
}

/**
 * Deterministic signed scalar quantizer used only as a baseline.
 * This is intentionally NOT claimed to reproduce IsoQuant's exact quantizer.
 */
function quantizeDequantize(v, bits) {
  const qmax = (1 << (bits - 1)) - 1;
  if (qmax < 1) throw new Error('bits must be >= 2');
  let maxAbs = 0;
  for (let i = 0; i < v.length; i++) maxAbs = Math.max(maxAbs, Math.abs(v[i]));
  const scale = maxAbs > 0 ? maxAbs / qmax : 1;
  const out = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) {
    const q = Math.max(-qmax, Math.min(qmax, Math.round(v[i] / scale)));
    out[i] = q * scale;
  }
  return { decoded: out, scale };
}

function metrics(a, b) {
  let mse = 0, maxAbs = 0, dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    const e = b[i] - a[i];
    mse += e * e;
    maxAbs = Math.max(maxAbs, Math.abs(e));
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  mse /= a.length;
  const cosine = (aa > 0 && bb > 0) ? dot / Math.sqrt(aa * bb) : 0;
  return { mse, maxAbsError: maxAbs, cosine };
}

const rand = xorshift32(SEED);
const rows = [];

for (const dim of DIMS) {
  for (const bits of BITS) {
    for (const variant of VARIANTS) {
      let mse = 0, maxAbsError = 0, cosine = 0;
      for (let s = 0; s < SAMPLES; s++) {
        const raw = new Float64Array(dim);
        for (let i = 0; i < dim; i++) raw[i] = (rand() * 2) - 1;
        normalize(raw);

        const rotated = rotateVector(raw, variant, false);
        const { decoded } = quantizeDequantize(rotated, bits);
        const reconstructed = rotateVector(decoded, variant, true);
        const m = metrics(raw, reconstructed);
        mse += m.mse;
        maxAbsError = Math.max(maxAbsError, m.maxAbsError);
        cosine += m.cosine;
      }

      rows.push({
        dim,
        bits,
        variant,
        samples: SAMPLES,
        blockSize: variant === 'none' ? null : 4,
        meanMse: mse / SAMPLES,
        worstAbsError: maxAbsError,
        meanCosine: cosine / SAMPLES,
        idealPackedBytesPerVector: Math.ceil(dim * bits / 8),
        fp16BytesPerVector: dim * 2,
        idealCompressionVsFp16: (dim * 2) / Math.ceil(dim * bits / 8),
      });
    }
  }
}

const report = {
  schema: 'atlas.isoquant-synthetic-reconstruction.v1',
  status: 'SYNTHETIC_RECONSTRUCTION_ONLY',
  createdAt: new Date().toISOString(),
  seed: SEED,
  samplesPerSetting: SAMPLES,
  dimensions: DIMS,
  bitWidths: BITS,
  variants: VARIANTS,
  rotation: {
    qL: QL,
    qR: QR,
    fast: "qL * v",
    full: "qL * v * conjugate(qR)",
    inverseFast: "conjugate(qL) * v",
    inverseFull: "conjugate(qL) * v * qR",
  },
  quantizer: {
    kind: 'deterministic_symmetric_scalar_baseline',
    exactIsoQuantPaperImplementation: false,
    note: 'Research baseline only; do not compare its absolute MSE directly with the paper as an implementation reproduction.',
  },
  safety: {
    writesCanonicalStores: false,
    touchesLiveLlamaServer: false,
    usesRealKvTensors: false,
    closesStage2: false,
  },
  results: rows,
};

const outPath = path.resolve(ROOT, OUT);
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  status: report.status,
  out: path.relative(ROOT, outPath).replaceAll('\\', '/'),
  settings: rows.length,
  samplesPerSetting: SAMPLES,
}, null, 2));
